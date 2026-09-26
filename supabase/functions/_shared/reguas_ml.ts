// Réguas de relacionamento no Mercado Livre (mensagens pós-venda). Só roda para as réguas que a equipe
// ligou no portal (workspace_settings.data.gerencial.reguas.<id>.ativo) e registra cada envio em
// public.regua_envios — uma mensagem por régua e pacote, nunca repete. Máximo de envios por rodada.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = "https://api.mercadolibre.com";
const MAX_ENVIOS = 40;
const PADRAO: Record<string, { texto: string; min: number; max: number; base: "entrega" | "compra" }> = {
  posentrega: { texto: "Olá! O seu {produto} chegou direitinho? Se precisar de qualquer ajuda com a montagem ou uso, é só responder aqui. Boas brincadeiras! Equipe Compra Store", min: 3, max: 6, base: "entrega" },
  dicas: { texto: "Olá! Esperamos que a criança esteja amando o {produto}. Queremos muito saber sua opinião sobre o brinquedo — conte pra gente aqui mesmo o que achou. Sua resposta ajuda a gente a melhorar!", min: 10, max: 14, base: "compra" },
};
const dias = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400_000;

export async function executarReguasML(db: SupabaseClient, ws: string) {
  const { data: st } = await db.from("workspace_settings").select("data").eq("workspace_id", ws).maybeSingle();
  const cfg = (st?.data?.gerencial?.reguas ?? {}) as Record<string, { ativo?: boolean; texto?: string }>;
  const ativas = Object.keys(PADRAO).filter((k) => cfg[k]?.ativo);
  if (!ativas.length) return { ativas: 0, enviados: 0 };
  const sec = await validSecret(db, ws, "mercadolivre");
  const seller = String(sec.extra?.user_id ?? "");
  const call = async (method: string, path: string, body?: unknown) => {
    await sleep(150);
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${sec.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${j?.message ?? j?.error ?? ""}`.trim());
    return j;
  };
  const desde = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);
  const pedidos: any[] = [];
  for (let off = 0; off < 400; off += 50) {
    const j = await call("GET", `/orders/search?seller=${seller}&order.status=paid&order.date_created.from=${desde}T00:00:00.000-03:00&sort=date_desc&limit=50&offset=${off}`);
    pedidos.push(...(j.results ?? []));
    if ((j.results ?? []).length < 50) break;
  }
  const { data: feitos } = await db.from("regua_envios").select("regua,pack").eq("workspace_id", ws);
  const ja = new Set((feitos ?? []).map((f) => `${f.regua}|${f.pack}`));
  const envios: Record<string, unknown>[] = [];
  const entregas = new Map<string, string | null>();
  for (const o of pedidos) {
    if (envios.length >= MAX_ENVIOS) break;
    const pack = String(o.pack_id ?? o.id);
    for (const r of ativas) {
      if (ja.has(`${r}|${pack}`) || envios.length >= MAX_ENVIOS) continue;
      const p = PADRAO[r];
      let base = o.date_created as string;
      if (p.base === "entrega" || r === "dicas") {
        const sid = o.shipping?.id;
        if (!sid) continue;
        if (!entregas.has(String(sid))) {
          const s = await call("GET", `/shipments/${sid}`).catch(() => null);
          entregas.set(String(sid), s?.status === "delivered" ? (s.status_history?.date_delivered ?? s.last_updated ?? null) : null);
        }
        const entregue = entregas.get(String(sid));
        if (!entregue) continue; // só fala com quem já recebeu
        if (p.base === "entrega") base = entregue;
      }
      const d = dias(base);
      if (d < p.min || d > p.max) continue;
      const produto = String(o.order_items?.[0]?.item?.title ?? "brinquedo").replace(/\s*-\s*(caixa|colorid[oa]).*$/i, "").slice(0, 60);
      const texto = (cfg[r]?.texto || p.texto).replace(/\{produto\}/g, produto).slice(0, 350);
      const comprador = String(o.buyer?.id ?? "");
      const reg: Record<string, unknown> = { workspace_id: ws, regua: r, pack, pedido: String(o.id), comprador: o.buyer?.nickname ?? comprador, produto, texto };
      try {
        await call("POST", `/messages/packs/${pack}/sellers/${seller}?tag=post_sale`, { from: { user_id: seller }, to: { user_id: comprador }, text: texto });
        reg.status = "enviado";
      } catch (e) {
        // Conversa ainda não iniciada: o Mercado Livre exige o "guia de ação" com motivo para o vendedor iniciar.
        try { await call("POST", `/messages/action_guide/packs/${pack}/option`, { option_id: "OTHER", text: texto }); reg.status = "enviado"; }
        catch (e2) {
          const msg = `${String((e as Error).message)} | ${String((e2 as Error).message)}`;
          // Sem permissão de mensagens no app: para a rodada sem registrar, para tentar de novo depois da liberação.
          if (/(401|403)|UNAUTHORIZED|forbidden/i.test(msg)) throw new Error(`Mercado Livre sem permissão de mensagens: ${msg.slice(0, 200)}`);
          reg.status = "erro"; reg.erro = msg.slice(0, 300);
        }
      }
      envios.push(reg);
      ja.add(`${r}|${pack}`);
    }
  }
  if (envios.length) await db.from("regua_envios").upsert(envios, { onConflict: "workspace_id,regua,pack" });
  return { ativas: ativas.length, pedidos: pedidos.length, enviados: envios.filter((e) => e.status === "enviado").length, erros: envios.filter((e) => e.status === "erro").length };
}
