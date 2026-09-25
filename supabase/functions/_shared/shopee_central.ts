// Importação da "Minha Renda" da Central do Vendedor Shopee (enquanto a Open API não está aprovada).
// Linhas: [order_sn, order_id, liberado_em(epoch), previsao(epoch), renda, ajuste, liquido, status, meio, parcelas, itens]
// Valores da Shopee vêm multiplicados por 100000.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.0";
import { round } from "./common.ts";

type Row = [string, string, number, number, number, number, number, number, string, number, number];
const money = (v: number) => round(Number(v || 0) / 100000);
const brDate = (s: number) => (s ? new Date((s - 3 * 3600) * 1000).toISOString().slice(0, 10) : null);

export async function importShopeeIncome(db: SupabaseClient, ws: string, done: Row[], pend: Row[]) {
  const now = new Date().toISOString();
  // 1) Repasses liberados viram liberações.
  const receipts = done.map((r) => ({
    workspace_id: ws, id: `SHP-${r[0]}`, order_id: r[0], platform: "Shopee", account: "Shopee",
    date: brDate(r[2]), amount: money(r[6]), source: "Shopee Central", kind: "liberacao",
    description: "Repasse do pedido (Minha Renda)", updated_at: now,
    details: { renda: money(r[4]), ajuste: money(r[5]), liquido: money(r[6]), meio: r[8], parcelas: r[9], itens: r[10] },
  }));
  for (let i = 0; i < receipts.length; i += 500) {
    const { error } = await db.from("receipts").upsert(receipts.slice(i, i + 500), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  // 2) Pedidos: repasse previsto pela Shopee define a taxa (bruto da NF − repasse previsto) e a previsão.
  const info = new Map<string, { previsto: number; ajuste: number; due: string | null; liberado: boolean }>();
  for (const r of done) info.set(r[0], { previsto: money(r[4]), ajuste: money(r[5]), due: brDate(r[2]), liberado: true });
  for (const r of pend) if (!info.has(r[0])) info.set(r[0], { previsto: money(r[4]), ajuste: money(r[5]), due: brDate(r[3]), liberado: false });
  const ids = [...info.keys()];
  let updated = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from("orders").select("id,gross,due,external").eq("workspace_id", ws).in("id", ids.slice(i, i + 300));
    if (error) throw error;
    for (const o of data ?? []) {
      const x = info.get(o.id)!;
      const { error: e2 } = await db.from("orders").update({
        fee: round(Number(o.gross) - x.previsto), fee_source: "Shopee", due: x.due ?? o.due, updated_at: now,
        external: { ...(o.external ?? {}), repasse_previsto: x.previsto, ajuste_shopee: x.ajuste, diferenca_nf: null, fonte_repasse: "Minha Renda" },
      }).eq("workspace_id", ws).eq("id", o.id);
      if (e2) throw e2;
      updated++;
    }
  }
  return { liberacoes: receipts.length, pedidos_atualizados: updated, sem_pedido_no_bling: ids.length - updated };
}
