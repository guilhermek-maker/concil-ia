// Conectar, sincronizar e desconectar Bling, Mercado Livre, Shopee e Magalu.
// A sincronização é um "job" guardado em integrations.settings.job: cada chamada avança até ~110 s e
// grava o ponto de parada. Quem avança o job é o navegador (enquanto aberto) ou o pg_cron a cada 2 min,
// então fechar a página não interrompe nada.
import { admin, authorize, env, handler, HttpError, json, signState } from "../_shared/common.ts";
import { persist, provider, providers, validSecret } from "../_shared/store.ts";

const required: Record<string, string[]> = {
  bling: ["BLING_CLIENT_ID", "BLING_CLIENT_SECRET"],
  mercadolivre: ["ML_CLIENT_ID", "ML_CLIENT_SECRET"],
  shopee: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY"],
  magalu: ["MAGALU_CLIENT_ID", "MAGALU_CLIENT_SECRET"],
};
const BUDGET_MS = 110_000; // Edge Functions encerram em ~150 s; paramos antes e gravamos o cursor.
const LOCK_MS = 140_000;
const HOURLY_MS = 60 * 60_000;

type Db = ReturnType<typeof admin>;
interface Job { from: string; to: string; cursor: unknown; locked_until?: number | null; started_at?: string; saved?: Record<string, number> }

const readSettings = async (db: Db, ws: string, id: string) =>
  ((await db.from("integrations").select("settings").eq("workspace_id", ws).eq("provider", id).maybeSingle()).data?.settings ?? {}) as Record<string, any>;

async function writeSettings(db: Db, ws: string, id: string, change: (s: Record<string, any>) => void, extra: Record<string, unknown> = {}) {
  const settings = await readSettings(db, ws, id);
  change(settings);
  await db.from("integrations").update({ settings, updated_at: new Date().toISOString(), ...extra }).eq("workspace_id", ws).eq("provider", id);
}

/** Uma rodada de sincronização a partir do cursor informado. */
async function runRound(db: Db, ws: string, id: string, job: Job, deadline: number) {
  const settings = await readSettings(db, ws, id);
  const secret = await validSecret(db, ws, id);
  const res = await provider(id).sync({ token: secret.access_token, extra: secret.extra ?? {}, settings, from: job.from, to: job.to, cursor: job.cursor, deadline });
  const saved = await persist(db, ws, res);
  return { res, saved };
}

/** Avança o job de sincronização (se não houver outro processo avançando o mesmo job agora). */
async function advanceJob(db: Db, ws: string, id: string, deadline: number) {
  const settings = await readSettings(db, ws, id);
  const job = settings.job as Job | undefined;
  if (!job) return { done: true, saved: {}, notes: [] as string[] };
  if (job.locked_until && job.locked_until > Date.now()) return { busy: true, done: false, saved: job.saved ?? {}, notes: [] as string[] };
  await writeSettings(db, ws, id, (s) => { s.job = { ...job, locked_until: Date.now() + LOCK_MS }; });
  try {
    const { res, saved } = await runRound(db, ws, id, job, deadline);
    const total = { ...(job.saved ?? {}) };
    for (const [k, v] of Object.entries(saved)) total[k] = (total[k] ?? 0) + v;
    const done = !res.next;
    await writeSettings(db, ws, id, (s) => {
      if (res.unmapped && Object.keys(res.unmapped).length) s.lojasPendentes = { ...(s.lojasPendentes ?? {}), ...res.unmapped };
      if (res.sample) s.amostra = res.sample;
      if (done) { delete s.job; s.ultimoJob = { from: job.from, to: job.to, saved: total, fim: new Date().toISOString() }; }
      else s.job = { ...job, cursor: res.next, locked_until: null, saved: total };
    }, { status: "conectado", last_error: null, ...(done ? { last_sync: new Date().toISOString() } : {}) });
    return { done, saved: total, notes: res.notes, unmapped: res.unmapped ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeSettings(db, ws, id, (s) => { if (s.job) s.job.locked_until = null; }, { status: "erro", last_error: msg });
    throw e;
  }
}

async function startJob(db: Db, ws: string, id: string, from: string, to: string) {
  await writeSettings(db, ws, id, (s) => {
    const j = s.job as Job | undefined;
    if (j && j.from === from && j.to === to) return; // mesmo período: continua de onde parou
    if (j?.locked_until && j.locked_until > Date.now()) throw new HttpError(409, "Já existe uma sincronização em andamento. Aguarde terminar.");
    s.job = { from, to, cursor: null, locked_until: null, started_at: new Date().toISOString(), saved: {} };
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // pg_cron: avança jobs pendentes e, de hora em hora, sincroniza os últimos 7 dias de cada integração.
  if (action === "cron") {
    if (!Deno.env.get("CRON_SECRET") || req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) throw new HttpError(401, "não autorizado");
    const db = admin();
    const deadline = Date.now() + BUDGET_MS;
    const { data } = await db.from("integrations").select("workspace_id,provider,settings,last_sync").in("status", ["conectado", "erro"]);
    const report = [];
    for (const i of data ?? []) {
      if (Date.now() > deadline - 15_000) break;
      try {
        if (!i.settings?.job) {
          if (i.last_sync && Date.now() - new Date(i.last_sync).getTime() < HOURLY_MS) continue;
          await startJob(db, i.workspace_id, i.provider, iso(new Date(Date.now() - 7 * 86400_000)), iso(new Date()));
        }
        report.push({ ...i, settings: undefined, ...(await advanceJob(db, i.workspace_id, i.provider, deadline)) });
      } catch (e) { report.push({ workspace_id: i.workspace_id, provider: i.provider, error: String(e) }); }
    }
    return json({ report });
  }

  const ws = String(body.workspace_id ?? "");
  const { db } = await authorize(req, ws);

  switch (action) {
    case "status": {
      const available = Object.fromEntries(Object.keys(providers).map((k) => [k, required[k].every((n) => Deno.env.get(n))]));
      const ai = !!Deno.env.get("ANTHROPIC_API_KEY");
      return json({ available, ai, callback: `${env("SUPABASE_URL")}/functions/v1/oauth-callback` });
    }
    case "authorize": {
      const id = String(body.provider);
      const p = provider(id);
      if (!required[id].every((n) => Deno.env.get(n))) throw new HttpError(400, `Credenciais do aplicativo ${p.label} ainda não foram cadastradas no Supabase (veja docs/INTEGRACOES.md).`);
      const ret = String(body.return_url ?? "");
      const state = await signState({ ws, provider: id, ret });
      return json({ url: await p.authorizeUrl(state) });
    }
    case "sync": {
      // Inicia (ou retoma) o job do período e avança uma rodada. O navegador chama de novo enquanto next = true.
      const id = String(body.provider);
      provider(id);
      const from = String(body.from), to = String(body.to);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new HttpError(400, "Período inválido.");
      await startJob(db, ws, id, from, to);
      const r = await advanceJob(db, ws, id, Date.now() + BUDGET_MS);
      return json({ ...r, next: !r.done });
    }
    case "job": {
      const id = String(body.provider);
      provider(id);
      const s = await readSettings(db, ws, id);
      return json({ job: s.job ? { ...s.job, cursor: undefined } : null, ultimo: s.ultimoJob ?? null });
    }
    case "cancel": {
      const id = String(body.provider);
      provider(id);
      await writeSettings(db, ws, id, (s) => { delete s.job; });
      return json({ ok: true });
    }
    case "disconnect": {
      const id = String(body.provider);
      provider(id);
      await db.from("integration_secrets").delete().eq("workspace_id", ws).eq("provider", id);
      await writeSettings(db, ws, id, (s) => { delete s.job; }, { status: "desconectado", account_name: null });
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, "Ação desconhecida.");
  }
}));
