import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.0";
import { HttpError } from "./common.ts";
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
    merged.set(m.id, !e ? m : fiscal ? {
      ...e,
      fee: m.fee_source ? m.fee : e.fee, fee_source: m.fee_source ?? e.fee_source,
      due: m.due ?? e.due, shipping: m.shipping ?? e.shipping, state: e.state ?? m.state,
      customer: fill(e.customer, m.customer), items: e.items?.length ? e.items : m.items,
      external: { ...(e.external ?? {}), ...(m.external ?? {}) },
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
  return { orders: orders.length, receipts: receipts.length, ledger: ledger.length };
}
