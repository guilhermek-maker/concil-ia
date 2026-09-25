-- Cadastros do ERP (fornecedores, plano financeiro, centros de custo…): um registro por item, dados em jsonb.
create table if not exists public.cadastros (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tipo text not null,
  id text not null,
  dados jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)            -- id já carrega o tipo (ex.: forn-…, cat-…)
);
alter table public.cadastros enable row level security;
drop policy if exists "membros operam cadastros" on public.cadastros;
create policy "membros operam cadastros" on public.cadastros for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
