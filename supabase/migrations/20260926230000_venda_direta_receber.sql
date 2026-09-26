-- Venda direta (B2B / atacado / fora dos marketplaces) e contas a receber.
create table if not exists public.vendas_diretas (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  numero int,
  cliente jsonb not null default '{}'::jsonb,   -- {doc, nome, fantasia, ie, email, telefone, endereco:{logradouro, numero, complemento, bairro, municipio, uf, cep}}
  itens jsonb not null default '[]'::jsonb,     -- [{sku, nome, qtd, preco}]
  frete numeric(14,2) not null default 0,
  desconto numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  condicao text,                                -- à vista | 30 | 30/60 | 30/60/90 | personalizado
  parcelas jsonb not null default '[]'::jsonb,  -- [{n, vencimento, valor}]
  forma_pagamento text default '15',            -- tPag da NF-e (15 boleto, 17 PIX, 03 cartão…)
  status text not null default 'rascunho' check (status in ('rascunho','faturado','cancelado')),
  emissao date, nfe_ref text,
  observacao text, criado_por text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create table if not exists public.recebiveis (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  origem text not null default 'manual',        -- venda_direta | manual
  referencia text,                              -- id da venda direta
  cliente text, cliente_doc text,
  descricao text, documento text,
  parcela int default 1, parcelas int default 1,
  emissao date, vencimento date not null,
  valor numeric(14,2) not null,
  valor_recebido numeric(14,2) not null default 0,
  recebido_em date,
  status text not null default 'aberto' check (status in ('aberto','parcial','recebido','cancelado')),
  categoria text default 'Venda direta', conta text, observacao text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
alter table public.vendas_diretas enable row level security;
alter table public.recebiveis enable row level security;
do $$
declare r record;
begin
  for r in select * from (values ('vendas_diretas','vendas'),('recebiveis','financeiro')) as t(tabela, area) loop
    execute format('drop policy if exists %I on public.%I', 'ler_' || r.tabela, r.tabela);
    execute format('drop policy if exists %I on public.%I', 'gravar_' || r.tabela, r.tabela);
    execute format('create policy %I on public.%I for select using (public.pode(workspace_id, %L, false))', 'ler_' || r.tabela, r.tabela, r.area);
    execute format('create policy %I on public.%I for all using (public.pode(workspace_id, %L, true)) with check (public.pode(workspace_id, %L, true))', 'gravar_' || r.tabela, r.tabela, r.area, r.area);
    execute format('drop trigger if exists auditar on public.%I', r.tabela);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar()', r.tabela);
  end loop;
end $$;
-- Quem vende também lança o título a receber da própria venda.
drop policy if exists gravar_recebiveis_vendas on public.recebiveis;
create policy gravar_recebiveis_vendas on public.recebiveis for insert with check (public.pode(workspace_id, 'vendas', true));
