// Estoque: lê do Bling o cadastro de produtos com preço, custo e saldo (virtual total) e grava em
// public.produtos, sem tocar nos campos da equipe (mínimo, prazo de reposição, fornecedor, localização).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchJson, num, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";

export async function sincronizarEstoqueBling(db: SupabaseClient, ws: string, deadline = Date.now() + 100_000) {
  const sec = await validSecret(db, ws, "bling");
  const get = async (path: string) => {
    await sleep(350); // limite do Bling: 3 requisições por segundo
    return fetchJson(`${API()}${path}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } });
  };
  const agora = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let paginas = 0;
  for (let pagina = 1; pagina <= 60 && Date.now() < deadline; pagina++) {
    const j = await get(`/produtos?pagina=${pagina}&limite=100&criterio=2&tipo=P`);
    const lista: any[] = j?.data ?? [];
    paginas++;
    for (const p of lista) {
      const sku = String(p.codigo ?? "").trim();
      rows.push({
        workspace_id: ws, id: sku || `bling-${p.id}`, bling_id: String(p.id), pai: p.idProdutoPai ? String(p.idProdutoPai) : null,
        nome: String(p.nome ?? sku ?? p.id).slice(0, 300), formato: p.formato ?? null, situacao: p.situacao ?? null,
        preco: p.preco != null ? num(p.preco) : null, custo: p.precoCusto != null ? num(p.precoCusto) : null,
        saldo: p.estoque?.saldoVirtualTotal != null ? num(p.estoque.saldoVirtualTotal) : null,
        imagem: p.imagemURL || null, sincronizado_em: agora, updated_at: agora,
      });
    }
    if (lista.length < 100) break;
  }
  const uniq = [...new Map(rows.map((r) => [r.id as string, r])).values()];
  for (let k = 0; k < uniq.length; k += 200) {
    const { error } = await db.from("produtos").upsert(uniq.slice(k, k + 200), { onConflict: "workspace_id,id" });
    if (error) throw error;
  }
  // Foto do dia (histórico de saldo e custo por SKU): uma por dia, a última leitura do dia vale.
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const fotos = uniq.filter((r) => r.saldo != null).map((r) => ({ workspace_id: ws, data: hoje, sku: r.id, saldo: r.saldo, custo: r.custo }));
  for (let k = 0; k < fotos.length; k += 300) await db.from("estoque_fotos").upsert(fotos.slice(k, k + 300), { onConflict: "workspace_id,data,sku" });
  return { produtos: uniq.length, paginas, com_saldo: uniq.filter((r) => Number(r.saldo) > 0).length };
}

/** Dados fiscais (NCM, CEST, origem, GTIN) de cada produto, pelo detalhe do Bling. Poucos por rodada. */
export async function detalhesFiscaisBling(db: SupabaseClient, ws: string, limite = 40) {
  const sec = await validSecret(db, ws, "bling");
  const antigo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await db.from("produtos").select("id,bling_id,fiscal_em").eq("workspace_id", ws).not("bling_id", "is", null)
    .or(`fiscal_em.is.null,fiscal_em.lt.${antigo}`).order("fiscal_em", { ascending: true, nullsFirst: true }).limit(limite);
  let lidos = 0;
  for (const p of data ?? []) {
    await sleep(350);
    const j = await fetchJson(`${API()}/produtos/${p.bling_id}`, { headers: { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" } }).catch(() => null);
    const d = j?.data;
    if (!d) continue;
    const t = d.tributacao ?? {};
    await db.from("produtos").update({
      ncm: String(t.ncm ?? "").replace(/\D/g, "") || null, cest: String(t.cest ?? "").replace(/\D/g, "") || null,
      origem: t.origem != null && t.origem !== "" ? Number(t.origem) : null, gtin: d.gtin || d.gtinEmbalagem || null,
      fiscal_em: new Date().toISOString(),
    }).eq("workspace_id", ws).eq("id", p.id);
    lidos++;
  }
  return { fiscais: lidos };
}
