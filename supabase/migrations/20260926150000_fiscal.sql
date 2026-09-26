-- Fiscal: dados tributários dos produtos (lidos do Bling) e notas fiscais emitidas pelo EcomBalance
-- (via provedor Focus NFe). Emissão só por clique de alguém da equipe; produção exige ambiente ligado.
alter table public.produtos add column if not exists ncm text;
alter table public.produtos add column if not exists cest text;
alter table public.produtos add column if not exists origem int;         -- 0 nacional, 1 importação direta, 2 adquirida no mercado interno…
alter table public.produtos add column if not exists gtin text;
alter table public.produtos add column if not exists fiscal_em timestamptz; -- quando os dados fiscais foram lidos do Bling

create table if not exists public.notas_fiscais (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ref text not null,                  -- referência única enviada ao provedor
  pedido text not null,
  ambiente text not null check (ambiente in ('homologacao','producao')),
  status text not null,               -- processando | autorizado | erro_autorizacao | cancelado | denegado | erro
  numero text, serie text, chave text,
  danfe_url text, xml_url text,
  mensagem text,
  valor numeric(14,2),
  payload jsonb, resposta jsonb,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, ref)
);
create index if not exists notas_fiscais_pedido on public.notas_fiscais (workspace_id, pedido);
alter table public.notas_fiscais enable row level security;
drop policy if exists nf_select on public.notas_fiscais;
create policy nf_select on public.notas_fiscais for select using (public.is_member(workspace_id));
drop trigger if exists auditar on public.notas_fiscais;
create trigger auditar after insert or update or delete on public.notas_fiscais for each row execute function public.auditar();
