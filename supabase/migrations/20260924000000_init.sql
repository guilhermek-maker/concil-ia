-- CONCIL-IA · esquema inicial
-- Cada empresa é um "workspace". Usuários só enxergam os workspaces dos quais são membros (RLS).
-- Tokens das integrações ficam em integration_secrets, sem acesso pelo navegador (apenas service_role).

create extension if not exists pgcrypto;

-- ───────────────────────── Workspaces e membros ─────────────────────────
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha operação',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.is_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- Garante que o usuário logado tenha um workspace; devolve o id.
create or replace function public.ensure_workspace() returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select workspace_id into ws from public.workspace_members where user_id = auth.uid() order by created_at limit 1;
  if ws is null then
    insert into public.workspaces default values returning id into ws;
    insert into public.workspace_members(workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  end if;
  return ws;
end $$;

-- Dono adiciona um colega que já criou conta (por e-mail).
create or replace function public.add_member(ws uuid, member_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.is_owner(ws) then raise exception 'apenas o dono do workspace pode adicionar membros'; end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then return 'Usuário não encontrado. Peça para ele criar a conta no CONCIL-IA primeiro.'; end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, uid, 'member') on conflict do nothing;
  return 'Membro adicionado.';
end $$;

-- ───────────────────────── Dados operacionais ─────────────────────────
-- Pedidos / notas fiscais (origem: Bling ou importação). Chave: identificador do pedido no marketplace.
create table public.orders (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  platform text not null,
  date date not null,
  gross numeric(14,2) not null default 0,
  fee numeric(14,2) not null default 0,
  nf text,
  due date,
  transit boolean not null default false,
  note text not null default '',
  source text not null default 'Importado',
  customer jsonb,              -- {id, name, doc, email, phone, city, state}
  state text,                  -- UF de entrega
  items jsonb,                 -- [{sku, title, qty, price}]
  shipping numeric(14,2),
  fee_source text,             -- 'Bling', 'Mercado Livre', ... (quem informou a taxa)
  external jsonb,              -- ids e status nas plataformas
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index on public.orders (workspace_id, date);

-- Liberações / repasses recebidos das plataformas.
create table public.receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  order_id text,
  platform text not null,
  account text not null,
  date date not null,
  amount numeric(14,2) not null,
  linked_order text,
  source text not null default 'Importado',
  kind text not null default 'liberacao',
  description text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index on public.receipts (workspace_id, date);

-- Entradas e saídas do ERP (contas a receber / a pagar do Bling).
create table public.ledger (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('entrada','saida')),
  due date,
  paid_date date,
  amount numeric(14,2) not null,
  status text,
  category text,
  contact text,
  description text,
  source text not null default 'Bling',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index on public.ledger (workspace_id, due);

-- CRM: dados editáveis do cliente (os números de compra são calculados dos pedidos).
create table public.crm_contacts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,             -- chave do cliente (documento ou nome normalizado)
  stage text not null default 'Novo',
  tags text[] not null default '{}',
  notes text not null default '',
  interactions jsonb not null default '[]',   -- [{time, type, text, due, done}]
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.audit_log (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  time timestamptz not null default now(),
  action text not null,
  detail text,
  actor text,
  primary key (workspace_id, id)
);
create index on public.audit_log (workspace_id, time desc);

create table public.imports (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  file text not null,
  type text not null,
  count int not null,
  format text,
  time timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table public.closures (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month text not null,
  data jsonb not null,
  primary key (workspace_id, month)
);

-- Preferências gerais do workspace (tema, mapeamento de lojas do Bling etc.).
create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  data jsonb not null default '{}'
);

-- ───────────────────────── Integrações ─────────────────────────
create table public.integrations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('bling','mercadolivre','shopee','magalu')),
  status text not null default 'desconectado',
  account_name text,
  last_sync timestamptz,
  last_error text,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);

-- Sem políticas: só a service_role (Edge Functions) lê e grava.
create table public.integration_secrets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  extra jsonb not null default '{}',     -- ex.: shop_id (Shopee), user_id (Mercado Livre)
  updated_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);

-- Consumo do assistente de IA (controle de custo).
create table public.ai_usage (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.orders enable row level security;
alter table public.receipts enable row level security;
alter table public.ledger enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.audit_log enable row level security;
alter table public.imports enable row level security;
alter table public.closures enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.ai_usage enable row level security;

create policy "membros leem workspace" on public.workspaces for select using (public.is_member(id));
create policy "dono renomeia workspace" on public.workspaces for update using (public.is_owner(id));
create policy "membros veem membros" on public.workspace_members for select using (public.is_member(workspace_id));
create policy "dono remove membros" on public.workspace_members for delete using (public.is_owner(workspace_id) and user_id <> auth.uid());

do $$
declare t text;
begin
  foreach t in array array['orders','receipts','ledger','crm_contacts','audit_log','imports','closures','workspace_settings'] loop
    execute format('create policy "membros operam %1$s" on public.%1$I for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;

-- Auditoria é somente inclusão para o navegador.
drop policy "membros operam audit_log" on public.audit_log;
create policy "membros leem auditoria" on public.audit_log for select using (public.is_member(workspace_id));
create policy "membros registram auditoria" on public.audit_log for insert with check (public.is_member(workspace_id));

create policy "membros veem integrações" on public.integrations for select using (public.is_member(workspace_id));
create policy "membros ajustam integrações" on public.integrations for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
create policy "membros veem consumo IA" on public.ai_usage for select using (public.is_member(workspace_id));

grant execute on function public.ensure_workspace() to authenticated;
grant execute on function public.add_member(uuid, text) to authenticated;
