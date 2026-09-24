export type Platform = "Mercado Livre" | "Shopee" | "Magalu";

export interface Customer {
  id?: string; name?: string; doc?: string; email?: string; phone?: string; city?: string; state?: string;
}

export interface Item { sku: string; title: string; qty: number; price: number }

/** Linha de pedido como gravada em public.orders (sem workspace_id). */
export interface OrderRow {
  id: string;
  platform: Platform;
  date: string;
  gross: number;
  fee: number;
  nf?: string | null;
  due?: string | null;
  source: string;
  customer?: Customer | null;
  state?: string | null;
  items?: Item[] | null;
  shipping?: number | null;
  fee_source?: string | null;
  external?: Record<string, unknown> | null;
}

export interface ReceiptRow {
  id: string; order_id: string | null; platform: Platform; account: string; date: string;
  amount: number; source: string; kind: string; description?: string | null;
}

export interface LedgerRow {
  id: string; kind: "entrada" | "saida"; due: string | null; paid_date: string | null; amount: number;
  status: string | null; category: string | null; contact: string | null; description: string | null; source: string;
}

export interface Tokens {
  access_token: string; refresh_token?: string | null; expires_in?: number | null;
  extra?: Record<string, unknown>; account_name?: string | null;
}

export interface Secret {
  access_token: string; refresh_token: string | null; expires_at: string | null; extra: Record<string, any>;
}

export interface SyncContext {
  token: string;
  extra: Record<string, any>;
  settings: Record<string, any>;
  from: string;   // AAAA-MM-DD
  to: string;     // AAAA-MM-DD
  cursor: any;    // continuação de uma execução anterior
  deadline: number; // Date.now() limite para parar e devolver "next"
}

export interface SyncResult {
  /** Pedidos com origem fiscal (Bling). */
  fiscalOrders: OrderRow[];
  /** Pedidos vindos do marketplace: completam taxa, cliente, UF e itens. */
  marketOrders: OrderRow[];
  receipts: ReceiptRow[];
  ledger: LedgerRow[];
  next: any | null;
  notes: string[];
  unmapped?: Record<string, { count: number; sample: string; name?: string }>;
  sample?: unknown;
}

export interface Provider {
  id: "bling" | "mercadolivre" | "shopee" | "magalu";
  label: string;
  authorizeUrl(state: string): Promise<string>;
  exchange(query: URLSearchParams): Promise<Tokens>;
  refresh(secret: Secret): Promise<Tokens>;
  sync(ctx: SyncContext): Promise<SyncResult>;
}

export const emptyResult = (): SyncResult => ({ fiscalOrders: [], marketOrders: [], receipts: [], ledger: [], next: null, notes: [] });
