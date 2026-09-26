-- Réguas de relacionamento: registro de cada mensagem automática (uma por régua e pacote, nunca repete).
create table if not exists public.regua_envios (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  regua text not null,              -- posentrega | dicas
  pack text not null,               -- pacote/pedido do marketplace
  canal text not null default 'mercadolivre',
  pedido text, comprador text, produto text,
  texto text,
  status text not null,             -- enviado | erro | ignorado
  erro text,
  enviado_em timestamptz not null default now(),
  primary key (workspace_id, regua, pack)
);
create index if not exists regua_envios_data on public.regua_envios (workspace_id, enviado_em desc);
alter table public.regua_envios enable row level security;
drop policy if exists regua_envios_select on public.regua_envios;
create policy regua_envios_select on public.regua_envios for select using (public.is_member(workspace_id));
drop trigger if exists auditar on public.regua_envios;
create trigger auditar after insert or update or delete on public.regua_envios for each row execute function public.auditar();
