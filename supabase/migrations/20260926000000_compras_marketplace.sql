-- Compras feitas pela própria conta nos marketplaces (Mercado Livre / Mercado Pago como comprador):
-- embalagens, etiquetas, materiais… Servem para identificar os pagamentos ao Mercado Pago no extrato.
create table if not exists public.compras_marketplace (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  origem text not null,              -- 'ml_pedido' | 'mp_pagamento'
  data timestamptz, valor numeric(14,2), status text,
  vendedor text, descricao text,
  itens jsonb, pagamentos jsonb, raw jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table public.compras_marketplace enable row level security;
drop policy if exists "membros operam compras_marketplace" on public.compras_marketplace;
create policy "membros operam compras_marketplace" on public.compras_marketplace for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
