import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.0";
import { HttpError, round } from "./common.ts";
import { bling } from "./bling.ts";
import { magalu } from "./magalu.ts";
import { mercadolivre } from "./mercadolivre.ts";
import { shopee } from "./shopee.ts";
import type { OrderRow, Provider, Secret, SyncResult } from "./types.ts";

export const providers: Record<string, Provider> = { bling, mercadolivre, shopee, magalu };

export function provider(id: string) {
  const p = providers[id];
  if (!p) throw new HttpError(400, `Integração desconhecida: ${id}`);
  return p;
}

export async function saveTokens(db: SupabaseClient, ws: string, id: string, t: Awaited<ReturnType<Provider["exchange"]>>, prev?: Secret) {
  const expires_at = t.expires_in ? new Date(Date.now() + Number(t.expires_in) * 1000).toISOString() : null;
  const { error } = await db.from("integration_secrets").upsert({
    workspace_id: ws, provider: id, access_token: t.access_token, refresh_token: t.refresh_token ?? prev?.refresh_token ?? null,
    expires_at, extra: { ...(prev?.extra ?? {}), ...(t.extra ?? {}) }, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Devolve um token válido, renovando quando faltam menos de 5 minutos. */
export async function validSecret(db: SupabaseClient, ws: string, id: string): Promise<Secret> {
  const { data } = await db.from("integration_secrets").select("*").eq("workspace_id", ws).eq("provider", id).maybeSingle();
  if (!data?.access_token) throw new HttpError(400, `${provider(id).label} não está conectado.`);
  if (data.expires_at && new Date(data.expires_at).getTime() - Date.now() < 5 * 60_000) {
    const t = await provider(id).refresh(data as Secret);
    await saveTokens(db, ws, id, t, data as Secret);
    return { ...(data as Secret), access_token: t.access_token, extra: { ...data.extra, ...(t.extra ?? {}) } };
  }
  return data as Secret;
}

const ORDER_COLS = ["id", "platform", "date", "gross", "fee", "nf", "due", "source", "customer", "state", "items", "shipping", "fee_source", "external"] as const;
const pick = (o: Partial<OrderRow>) => Object.fromEntries(ORDER_COLS.map((k) => [k, (o as any)[k] ?? null]));
const fill = <T extends Record<string, any>>(base: T | null | undefined, add: T | null | undefined) => {
  const out: Record<string, any> = { ...(add ?? {}) };
  for (const [k, v] of Object.entries(base ?? {})) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out as T;
};

/**
 * Grava o resultado da sincronização preservando o trabalho humano:
 * anotações, "em trânsito" e vínculos (linked_order) nunca são sobrescritos.
 * Bling é a origem fiscal (bruto, data, NF); o marketplace informa taxa, previsão e dados do comprador.
 */
export async function persist(db: SupabaseClient, ws: string, res: SyncResult) {
  const incoming = [...res.fiscalOrders, ...res.marketOrders];
  const ids = [...new Set(incoming.map((o) => o.id))];
  const existing = new Map<string, OrderRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("orders").select(ORDER_COLS.join(",")).eq("workspace_id", ws).in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as unknown as OrderRow[]) existing.set(r.id, r);
  }
  const merged = new Map<string, OrderRow>();
  const current = (id: string) => merged.get(id) ?? existing.get(id);
  for (const f of res.fiscalOrders) {
    const e = current(f.id);
    const marketFee = e?.fee_source && e.fee_source !== "Bling";
    merged.set(f.id, e ? {
      ...e, ...f,
      fee: marketFee ? e.fee : f.fee, fee_source: marketFee ? e.fee_source : f.fee_source,
      due: e.due ?? f.due, customer: fill(f.customer, e.customer), state: f.state ?? e.state,
      external: { ...(e.external ?? {}), ...(f.external ?? {}) },
    } : f);
  }
  for (const m of res.marketOrders) {
    const e = current(m.id);
    // Pedido já existente vindo do Bling ou de importação manual é a referência fiscal.
    const fiscal = e && (e.source === "Bling API" || !e.source.endsWith(" API"));
    // O repasse esperado é o que a plataforma calcula (venda − tarifas − frete do vendedor). Quando a NF do
    // Bling tem valor diferente da venda na plataforma (frete cobrado do cliente, juros etc.), a diferença entra
    // na "taxa" para que bruto − taxa = repasse esperado, e fica registrada em external.diferenca_nf.
    const expected = m.fee_source ? round(m.gross - m.fee) : null;
    merged.set(m.id, !e ? m : fiscal ? {
      ...e,
      fee: expected !== null ? round(e.gross - expected) : e.fee, fee_source: m.fee_source ?? e.fee_source,
      due: m.due ?? e.due, shipping: m.shipping ?? e.shipping, state: e.state ?? m.state,
      customer: fill(e.customer, m.customer), items: e.items?.length ? e.items : m.items,
      external: {
        ...(e.external ?? {}), ...(m.external ?? {}),
        venda_plataforma: m.gross, tarifas_plataforma: m.fee, repasse_previsto: expected, diferenca_nf: round(e.gross - m.gross),
      },
    } : { ...e, ...m, external: { ...(e.external ?? {}), ...(m.external ?? {}) } });
  }
  const now = new Date().toISOString();
  const orders = [...merged.values()].map((o) => ({ workspace_id: ws, ...pick(o), updated_at: now }));
  for (let i = 0; i < orders.length; i += 500) {
    const { error } = await db.from("orders").upsert(orders.slice(i, i + 500), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  const receipts = res.receipts.map((r) => ({ workspace_id: ws, ...r, updated_at: now }));
  for (let i = 0; i < receipts.length; i += 500) {
    const { error } = await db.from("receipts").upsert(receipts.slice(i, i + 500), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  const ledger = res.ledger.map((r) => ({ workspace_id: ws, ...r, updated_at: now }));
  for (let i = 0; i < ledger.length; i += 500) {
    const { error } = await db.from("ledger").upsert(ledger.slice(i, i + 500), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  const entradas = await persistEntradas(db, ws, res.purchases ?? [], now);
  return { orders: orders.length, receipts: receipts.length, ledger: ledger.length, ...entradas };
}

/**
 * Notas de entrada e contas a pagar. A nota é dado do Bling (sempre atualizada); o título a pagar é do EcomBalance:
 * criado uma única vez a partir das parcelas (duplicatas) e nunca sobrescrito — pagamentos e edições ficam preservados.
 * Nota cancelada cancela os títulos que ainda não tiveram pagamento.
 */
async function persistEntradas(db: SupabaseClient, ws: string, notas: import("./types.ts").PurchaseRow[], now: string) {
  if (!notas.length) return { entradas: 0, titulos: 0 };
  // A lista do Bling pode repetir uma nota entre páginas (notas novas empurram a paginação): uma por id.
  notas = [...new Map(notas.map((n) => [n.id, n])).values()];
  const rows = notas.map((n) => ({ workspace_id: ws, ...n, updated_at: now }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("purchase_invoices").upsert(rows.slice(i, i + 200), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  const cancelada = (n: { situacao: string | null }) => /cancel|denegad|rejeitad/i.test(n.situacao ?? "");
  const titulos: Record<string, unknown>[] = [];
  for (const n of notas) {
    if (n.tipo !== "compra" || cancelada(n) || n.valor <= 0) continue;
    const parc = n.parcelas.filter((p) => p.valor > 0);
    const lista = parc.length ? parc : [{ data: n.emissao, valor: n.valor, forma: null, obs: "Nota sem duplicatas: confirme o vencimento" }];
    lista.forEach((p, i) => titulos.push({
      workspace_id: ws, id: `${n.id}-${i + 1}`, origem: "nfe", invoice_id: n.id, fornecedor: n.fornecedor, fornecedor_doc: n.fornecedor_doc,
      descricao: `NF ${n.numero ?? ""}${n.serie ? "/" + n.serie : ""} · ${n.fornecedor ?? "fornecedor"}`, documento: n.numero,
      parcela: i + 1, parcelas: lista.length, emissao: n.emissao, vencimento: p.data ?? n.emissao ?? now.slice(0, 10), valor: p.valor,
      observacao: p.obs ?? (p.forma ? `Forma: ${p.forma}` : null), categoria: "Compra de mercadorias", created_by: "Bling (nota de entrada)",
    }));
  }
  let criados = 0;
  for (let i = 0; i < titulos.length; i += 200) {
    const { data, error } = await db.from("payables").upsert(titulos.slice(i, i + 200), { onConflict: "workspace_id,id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    criados += data?.length ?? 0;
  }
  const canceladas = notas.filter(cancelada).map((n) => n.id);
  if (canceladas.length) {
    const { error } = await db.from("payables").update({ status: "cancelado", observacao: "Nota fiscal cancelada no Bling", updated_at: now })
      .eq("workspace_id", ws).in("invoice_id", canceladas).eq("valor_pago", 0).neq("status", "cancelado");
    if (error) throw error;
  }
  return { entradas: notas.length, titulos: criados };
}
