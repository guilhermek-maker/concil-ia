-- ERP financeiro do EcomBalance: notas de entrada (lidas do Bling, que fica com o fiscal e o estoque)
-- e títulos a pagar (gerados pelas duplicatas das notas ou lançados à mão). O EcomBalance é o dono do financeiro.

create table if not exists public.purchase_invoices (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,                    -- BLING-NFE-<id do Bling>
  numero text, serie text, chave text,
  emissao date,
  fornecedor text, fornecedor_doc text,
  valor numeric(14,2) not null default 0,
  cfop text, natureza text,
  tipo text not null default 'compra' check (tipo in ('compra','devolucao','outros')),
  situacao text,
  itens jsonb, parcelas jsonb, raw jsonb,
  source text not null default 'Bling API',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists public.payables (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  origem text not null default 'manual' check (origem in ('nfe','manual','recorrente')),
  invoice_id text,                     -- nota de entrada que gerou o título (quando houver)
  fornecedor text, fornecedor_doc text,
  descricao text, documento text,
  parcela int, parcelas int,
  emissao date, vencimento date not null,
  valor numeric(14,2) not null,
  juros numeric(14,2) not null default 0,
  desconto numeric(14,2) not null default 0,
  valor_pago numeric(14,2) not null default 0,
  pago_em date,
  status text not null default 'aberto' check (status in ('aberto','parcial','pago','cancelado')),
  categoria text, centro_custo text, conta text,
  observacao text, anexos jsonb,
  aprovado_por text, aprovado_em timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists payables_venc on public.payables (workspace_id, vencimento);

do $$ declare t text; begin
  foreach t in array array['purchase_invoices','payables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros operam %1$s" on public.%1$I', t);
    execute format('create policy "membros operam %1$s" on public.%1$I for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;
