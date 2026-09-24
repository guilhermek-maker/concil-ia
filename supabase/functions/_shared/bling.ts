// Bling API v3 — https://developer.bling.com.br
// Pedidos de venda (origem fiscal), itens, cliente/UF, taxas e contas a receber / a pagar.
import { day, env, fetchJson, num, round, sleep } from "./common.ts";
import { emptyResult, type OrderRow, type Platform, type Provider, type SyncContext } from "./types.ts";

const AUTH = "https://www.bling.com.br/Api/v3/oauth";
const api = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";
const basic = () => "Basic " + btoa(`${env("BLING_CLIENT_ID")}:${env("BLING_CLIENT_SECRET")}`);

async function token(body: Record<string, string>) {
  const r = await fetchJson(`${AUTH}/token`, {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded", Accept: "1.0" },
    body: new URLSearchParams(body),
  });
  return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in };
}

async function get(ctx: SyncContext, path: string) {
  await sleep(350); // limite do Bling: 3 requisições por segundo
  return fetchJson(`${api()}${path}`, { headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/json" } });
}

/** Identifica o marketplace do pedido: 1) mapeamento salvo por loja; 2) padrão do número do pedido na loja. */
function platformOf(p: any, settings: Record<string, any>): Platform | "ignorar" | null {
  const lojaId = String(p.loja?.id ?? "0");
  const mapped = settings.lojas?.[lojaId];
  if (mapped) return mapped === "Ignorar" ? "ignorar" : mapped;
  const n = String(p.numeroLoja ?? "").trim();
  if (/^2\d{9,15}$/.test(n)) return "Mercado Livre";
  if (/^\d{6}[0-9A-Z]{6,10}$/.test(n)) return "Shopee";
  return null;
}

export const bling: Provider = {
  id: "bling",
  label: "Bling",
  async authorizeUrl(state) {
    const q = new URLSearchParams({ response_type: "code", client_id: env("BLING_CLIENT_ID"), state });
    return `${AUTH}/authorize?${q}`;
  },
  async exchange(query) {
    const t = await token({ grant_type: "authorization_code", code: query.get("code") ?? "" });
    return { ...t, account_name: "Bling" };
  },
  async refresh(secret) {
    return token({ grant_type: "refresh_token", refresh_token: secret.refresh_token ?? "" });
  },
  async sync(ctx) {
    const out = emptyResult();
    out.unmapped = {};
    let cur = ctx.cursor ?? { phase: "pedidos", page: 1, idx: 0 };
    const cancelled = new Set((ctx.settings.situacoesIgnoradas ?? [12]).map(String));

    while (cur && Date.now() < ctx.deadline) {
      if (cur.phase === "pedidos") {
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", dataInicial: ctx.from, dataFinal: ctx.to });
        const list = (await get(ctx, `/pedidos/vendas?${q}`))?.data ?? [];
        for (let i = cur.idx; i < list.length; i++) {
          if (Date.now() > ctx.deadline) { out.next = { ...cur, idx: i }; return out; }
          const head = list[i];
          if (cancelled.has(String(head.situacao?.id))) continue;
          const p = (await get(ctx, `/pedidos/vendas/${head.id}`))?.data ?? head;
          if (!out.sample) out.sample = p;
          const platform = platformOf(p, ctx.settings);
          if (platform === "ignorar") continue;
          if (!platform) {
            const k = String(p.loja?.id ?? "0");
            const u = out.unmapped[k] ??= { count: 0, sample: String(p.numeroLoja ?? p.numero), name: p.intermediador?.nomeUsuario };
            u.count++;
            continue;
          }
          const etiqueta = p.transporte?.etiqueta ?? {};
          const contato = p.contato ?? {};
          const row: OrderRow = {
            id: String(p.numeroLoja || `BLING-${p.numero}`),
            platform,
            date: day(p.data)!,
            gross: round(num(p.total)),
            fee: round(num(p.taxas?.taxaComissao)),
            fee_source: num(p.taxas?.taxaComissao) ? "Bling" : null,
            nf: p.notaFiscal?.id ? String(p.notaFiscal.numero ?? p.notaFiscal.id) : null,
            due: null,
            source: "Bling API",
            shipping: round(num(p.transporte?.frete ?? p.taxas?.custoFrete)),
            state: (etiqueta.uf || contato.endereco?.uf || null)?.toUpperCase?.() ?? null,
            customer: {
              id: String(contato.id ?? ""), name: contato.nome, doc: contato.numeroDocumento,
              city: etiqueta.municipio || contato.endereco?.municipio, state: etiqueta.uf || contato.endereco?.uf,
            },
            items: (p.itens ?? []).map((it: any) => ({
              sku: String(it.codigo || it.produto?.id || ""), title: String(it.descricao ?? ""),
              qty: num(it.quantidade), price: round(num(it.valor)),
            })),
            external: { bling_id: p.id, bling_numero: p.numero, loja_id: p.loja?.id, situacao: p.situacao?.id },
          };
          out.fiscalOrders.push(row);
        }
        cur = list.length === 100 ? { phase: "pedidos", page: cur.page + 1, idx: 0 } : { phase: "receber", page: 1 };
      } else if (cur.phase === "receber") {
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", dataInicial: ctx.from, dataFinal: ctx.to, tipoFiltroData: "V" });
        const list = (await get(ctx, `/contas/receber?${q}`))?.data ?? [];
        for (const c of list) out.ledger.push(ledgerRow(c, "entrada"));
        cur = list.length === 100 ? { phase: "receber", page: cur.page + 1 } : { phase: "pagar", page: 1 };
      } else if (cur.phase === "pagar") {
        const q = new URLSearchParams({ pagina: String(cur.page), limite: "100", dataVencimentoInicial: ctx.from, dataVencimentoFinal: ctx.to });
        const list = (await get(ctx, `/contas/pagar?${q}`))?.data ?? [];
        for (const c of list) out.ledger.push(ledgerRow(c, "saida"));
        cur = list.length === 100 ? { phase: "pagar", page: cur.page + 1 } : null;
      }
    }
    out.next = cur;
    const miss = Object.values(out.unmapped).reduce((a, u) => a + u.count, 0);
    if (miss) out.notes.push(`${miss} pedidos do Bling sem marketplace identificado. Associe as lojas em Integrações.`);
    return out;
  },
};

const situacoes: Record<string, string> = { "1": "Em aberto", "2": "Liquidada", "3": "Parcial", "4": "Devolvida", "5": "Cancelada" };

function ledgerRow(c: any, kind: "entrada" | "saida") {
  return {
    id: `BLING-${kind === "entrada" ? "CR" : "CP"}-${c.id}`,
    kind,
    due: day(c.vencimento),
    paid_date: day(c.dataPagamento ?? c.dataRecebimento ?? null),
    amount: round(num(c.valor)),
    status: situacoes[String(c.situacao)] ?? String(c.situacao ?? ""),
    category: c.categoria?.descricao ?? (c.categoria?.id ? String(c.categoria.id) : null),
    contact: c.contato?.nome ?? (c.contato?.id ? `Contato ${c.contato.id}` : null),
    description: c.historico ?? c.numeroDocumento ?? null,
    source: "Bling API",
  };
}
