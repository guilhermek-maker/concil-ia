// Mercado Livre + Mercado Pago — https://developers.mercadolivre.com.br
// Pedidos (taxa de venda, frete do vendedor, comprador, UF, itens) e liberações do Mercado Pago.
import { callbackUrl, day, env, fetchJson, num, round, sleep } from "./common.ts";
import { emptyResult, type Provider, type SyncContext } from "./types.ts";

const API = "https://api.mercadolibre.com";

async function token(body: Record<string, string>) {
  const r = await fetchJson(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: env("ML_CLIENT_ID"), client_secret: env("ML_CLIENT_SECRET"), ...body }),
  });
  return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in, extra: { user_id: r.user_id } };
}

const get = async (ctx: SyncContext, url: string, headers: Record<string, string> = {}) => {
  await sleep(120);
  return fetchJson(url.startsWith("http") ? url : API + url, { headers: { Authorization: `Bearer ${ctx.token}`, ...headers } });
};
const soft = async <T>(p: Promise<T>) => { try { return await p; } catch { return null; } };

export const mercadolivre: Provider = {
  id: "mercadolivre",
  label: "Mercado Livre",
  async authorizeUrl(state) {
    const q = new URLSearchParams({ response_type: "code", client_id: env("ML_CLIENT_ID"), redirect_uri: callbackUrl(), state });
    return `https://auth.mercadolivre.com.br/authorization?${q}`;
  },
  async exchange(query) {
    const t = await token({ grant_type: "authorization_code", code: query.get("code") ?? "", redirect_uri: callbackUrl() });
    const me = await soft(fetchJson(`${API}/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` } }));
    return { ...t, account_name: me?.nickname ?? `Usuário ${t.extra.user_id}` };
  },
  async refresh(secret) {
    return token({ grant_type: "refresh_token", refresh_token: secret.refresh_token ?? "" });
  },
  async sync(ctx) {
    const out = emptyResult();
    const seller = ctx.extra.user_id;
    let cur = ctx.cursor ?? { offset: 0, idx: 0 };
    while (cur && Date.now() < ctx.deadline) {
      const q = new URLSearchParams({
        seller: String(seller), sort: "date_asc", offset: String(cur.offset), limit: "50",
        "order.date_created.from": `${ctx.from}T00:00:00.000-03:00`, "order.date_created.to": `${ctx.to}T23:59:59.999-03:00`,
      });
      const page = await get(ctx, `/orders/search?${q}`);
      const list: any[] = page?.results ?? [];
      for (let i = cur.idx; i < list.length; i++) {
        if (Date.now() > ctx.deadline) { out.next = { ...cur, idx: i }; return out; }
        const o = list[i];
        if (!out.sample) out.sample = o;
        if (o.status === "cancelled" || o.status === "invalid") continue;
        const items = (o.order_items ?? []).map((it: any) => ({
          sku: String(it.item?.seller_sku || it.item?.seller_custom_field || it.item?.id || ""),
          title: String(it.item?.title ?? ""), qty: num(it.quantity), price: round(num(it.unit_price)),
        }));
        const saleFee = (o.order_items ?? []).reduce((a: number, it: any) => a + num(it.sale_fee) * num(it.quantity || 1), 0);
        let state: string | null = null, city: string | null = null, shipCost = 0;
        if (o.shipping?.id) {
          const sh = await soft(get(ctx, `/shipments/${o.shipping.id}`, { "x-format-new": "true" }));
          const addr = sh?.destination?.shipping_address ?? sh?.receiver_address;
          state = String(addr?.state?.id ?? "").replace(/^BR-/, "") || null;
          city = addr?.city?.name ?? null;
          const costs = await soft(get(ctx, `/shipments/${o.shipping.id}/costs`));
          shipCost = num(costs?.senders?.[0]?.cost);
        }
        const id = String(o.id);
        let due: string | null = null;
        for (const p of o.payments ?? []) {
          if (p.status !== "approved") continue;
          const mp = await soft(get(ctx, `https://api.mercadopago.com/v1/payments/${p.id}`));
          due = day(mp?.money_release_date) ?? due;
          if (mp?.money_release_status === "released") {
            out.receipts.push({
              id: `MP-${p.id}`, order_id: id, platform: "Mercado Livre", account: "Mercado Pago",
              date: day(mp.money_release_date)!, amount: round(num(mp.transaction_details?.net_received_amount)),
              source: "Mercado Pago API", kind: "liberacao", description: `Pagamento ${p.id}`,
            });
          }
        }
        out.marketOrders.push({
          id, platform: "Mercado Livre", date: day(o.date_closed ?? o.date_created)!,
          gross: round(num(o.total_amount)), fee: round(saleFee + shipCost), fee_source: "Mercado Livre",
          shipping: round(shipCost), due, source: "Mercado Livre API", state, items,
          customer: {
            id: `ML-${o.buyer?.id}`, name: [o.buyer?.first_name, o.buyer?.last_name].filter(Boolean).join(" ") || o.buyer?.nickname,
            city: city ?? undefined, state: state ?? undefined,
          },
          external: { ml_order_id: o.id, pack_id: o.pack_id, status: o.status, buyer_nickname: o.buyer?.nickname },
        });
      }
      const total = num(page?.paging?.total);
      cur = cur.offset + 50 < total ? { offset: cur.offset + 50, idx: 0 } : null;
    }
    out.next = cur;
    return out;
  },
};
