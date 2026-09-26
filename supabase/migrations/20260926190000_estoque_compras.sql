-- Estoque próprio e compras.
-- estoque_fotos: saldo diário de cada SKU (foto do Bling enquanto ele for o sistema de estoque) → histórico,
-- base do kardex e conferência. inventarios: contagens físicas (leitor de código de barras). pedidos_compra:
-- do pedido ao fornecedor até o recebimento pela nota de entrada (mede o prazo real de reposição).
create table if not exists public.estoque_fotos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data date not null,
  sku text not null,
  saldo numeric(14,3),
  custo numeric(14,4),
  primary key (workspace_id, data, sku)
);
alter table public.estoque_fotos enable row level security;
drop policy if exists ler_estoque_fotos on public.estoque_fotos;
create policy ler_estoque_fotos on public.estoque_fotos for select using (public.pode(workspace_id, 'estoque', false));

create table if not exists public.inventarios (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  nome text not null,
  status text not null default 'aberto' check (status in ('aberto','concluido','cancelado')),
  local text,
  contagens jsonb not null default '{}'::jsonb,   -- {sku: {qtd, por, em}}
  sistema jsonb,                                  -- saldo do sistema no momento do fechamento
  criado_por text, concluido_por text, concluido_em timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table public.inventarios enable row level security;

create table if not exists public.pedidos_compra (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  numero int,
  fornecedor text not null,
  fornecedor_doc text,
  status text not null default 'rascunho' check (status in ('rascunho','enviado','parcial','recebido','cancelado')),
  itens jsonb not null default '[]'::jsonb,       -- [{sku, nome, qtd, custo, recebido}]
  previsto date,
  enviado_em timestamptz, recebido_em timestamptz,
  notas jsonb not null default '[]'::jsonb,       -- notas de entrada vinculadas [{id, numero, emissao}]
  observacao text, criado_por text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table public.pedidos_compra enable row level security;

do $$
declare t text;
begin
  foreach t in array array['inventarios','pedidos_compra'] loop
    execute format('drop policy if exists %I on public.%I', 'ler_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'gravar_' || t, t);
    execute format('create policy %I on public.%I for select using (public.pode(workspace_id, %L, false))', 'ler_' || t, t, case t when 'pedidos_compra' then 'estoque' else 'estoque' end);
    execute format('create policy %I on public.%I for all using (public.pode(workspace_id, %L, true)) with check (public.pode(workspace_id, %L, true))', 'gravar_' || t, t, 'estoque', 'estoque');
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
  end loop;
end $$;
-- Financeiro também cria pedidos de compra.
drop policy if exists gravar_pc_financeiro on public.pedidos_compra;
create policy gravar_pc_financeiro on public.pedidos_compra for all using (public.pode(workspace_id, 'financeiro', true)) with check (public.pode(workspace_id, 'financeiro', true));
