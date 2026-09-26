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
  return { produtos: uniq.length, paginas, com_saldo: uniq.filter((r) => Number(r.saldo) > 0).length };
}
