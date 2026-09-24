// Conectar, sincronizar e desconectar Bling, Mercado Livre, Shopee e Magalu.
import { admin, authorize, env, handler, HttpError, json, signState } from "../_shared/common.ts";
import { persist, provider, providers, validSecret } from "../_shared/store.ts";

const required: Record<string, string[]> = {
  bling: ["BLING_CLIENT_ID", "BLING_CLIENT_SECRET"],
  mercadolivre: ["ML_CLIENT_ID", "ML_CLIENT_SECRET"],
  shopee: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY"],
  magalu: ["MAGALU_CLIENT_ID", "MAGALU_CLIENT_SECRET"],
};
const BUDGET_MS = 110_000; // Edge Functions encerram em ~150 s; paramos antes e devolvemos "next".

async function runSync(db: ReturnType<typeof admin>, ws: string, id: string, from: string, to: string, cursor: unknown, deadline: number) {
  const p = provider(id);
  const { data: integ } = await db.from("integrations").select("settings").eq("workspace_id", ws).eq("provider", id).maybeSingle();
  try {
    const secret = await validSecret(db, ws, id);
    const res = await p.sync({ token: secret.access_token, extra: secret.extra ?? {}, settings: integ?.settings ?? {}, from, to, cursor, deadline });
    const saved = await persist(db, ws, res);
    const patch: Record<string, unknown> = { status: "conectado", last_error: null, updated_at: new Date().toISOString() };
    if (!res.next) patch.last_sync = new Date().toISOString();
    const settings = { ...(integ?.settings ?? {}) };
    if (res.unmapped && Object.keys(res.unmapped).length) settings.lojasPendentes = { ...(settings.lojasPendentes ?? {}), ...res.unmapped };
    if (res.sample) settings.amostra = res.sample;
    patch.settings = settings;
    await db.from("integrations").update(patch).eq("workspace_id", ws).eq("provider", id);
    return { saved, next: res.next, notes: res.notes, unmapped: res.unmapped ?? {} };
  } catch (e) {
    await db.from("integrations").update({ status: "erro", last_error: e instanceof Error ? e.message : String(e) })
      .eq("workspace_id", ws).eq("provider", id);
    throw e;
  }
}

Deno.serve(handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  // Sincronização agendada (pg_cron): últimos 7 dias de todos os workspaces conectados.
  if (action === "cron") {
    if (!Deno.env.get("CRON_SECRET") || req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) throw new HttpError(401, "não autorizado");
    const db = admin();
    const deadline = Date.now() + BUDGET_MS;
    const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const { data } = await db.from("integrations").select("workspace_id,provider").eq("status", "conectado");
    const report = [];
    for (const i of data ?? []) {
      if (Date.now() > deadline) break;
      try { report.push({ ...i, ...(await runSync(db, i.workspace_id, i.provider, from, to, null, deadline)) }); }
      catch (e) { report.push({ ...i, error: String(e) }); }
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
      const id = String(body.provider);
      const from = String(body.from), to = String(body.to);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new HttpError(400, "Período inválido.");
      return json(await runSync(db, ws, id, from, to, body.cursor ?? null, Date.now() + BUDGET_MS));
    }
    case "disconnect": {
      const id = String(body.provider);
      provider(id);
      await db.from("integration_secrets").delete().eq("workspace_id", ws).eq("provider", id);
      await db.from("integrations").update({ status: "desconectado", account_name: null }).eq("workspace_id", ws).eq("provider", id);
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, "Ação desconhecida.");
  }
}));
