-- Contabilidade (razão, balancete, documentos do escritório) e formação de preço.

-- Linhas importadas do razão ou do balancete, por competência.
create table public.accounting_lines (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  month text not null,                 -- AAAA-MM
  kind text not null check (kind in ('razao','balancete')),
  conta text not null,
  descricao text,
  data date,
  historico text,
  debito numeric(16,2) not null default 0,
  credito numeric(16,2) not null default 0,
  saldo_anterior numeric(16,2),
  saldo numeric(16,2),
  primary key (workspace_id, id)
);
create index on public.accounting_lines (workspace_id, month, kind);

-- Associação conta contábil → linha da DRE gerencial (vale para todas as competências).
create table public.account_map (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conta text not null,
  descricao text,
  linha text not null,
  primary key (workspace_id, conta)
);

-- Documentos recebidos do escritório (arquivo no Storage, bucket "contabil").
create table public.accounting_docs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  month text not null,
  tipo text not null,
  nome text not null,
  path text,
  size int,
  time timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- Tabela de preços / cadastro de custos por produto.
create table public.pricing_products (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,                    -- SKU
  nome text,
  categoria text,
  custo numeric(14,2) not null default 0,
  embalagem numeric(14,2) not null default 0,
  peso numeric(10,3),
  precos jsonb not null default '{}',  -- {"Mercado Livre": 199.9, "Shopee": 189.9, ...}
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- Cenários salvos do simulador.
create table public.pricing_scenarios (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  nome text not null,
  data jsonb not null,
  time timestamptz not null default now(),
  primary key (workspace_id, id)
);

alter table public.accounting_lines enable row level security;
alter table public.account_map enable row level security;
alter table public.accounting_docs enable row level security;
alter table public.pricing_products enable row level security;
alter table public.pricing_scenarios enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounting_lines','account_map','accounting_docs','pricing_products','pricing_scenarios'] loop
    execute format('create policy "membros operam %1$s" on public.%1$I for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;

-- Arquivos: bucket privado; a primeira pasta do caminho é o workspace_id.
insert into storage.buckets (id, name, public) values ('contabil', 'contabil', false) on conflict (id) do nothing;

create policy "membros leem arquivos contábeis" on storage.objects for select to authenticated
  using (bucket_id = 'contabil' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "membros enviam arquivos contábeis" on storage.objects for insert to authenticated
  with check (bucket_id = 'contabil' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "membros removem arquivos contábeis" on storage.objects for delete to authenticated
  using (bucket_id = 'contabil' and public.is_member(((storage.foldername(name))[1])::uuid));
