-- Acesso por solicitação: quem cria conta pede acesso ao workspace e o dono libera (ou recusa).
-- Vale para workspaces com recebe_solicitacoes = true; nos demais, a conta nova continua ganhando um workspace próprio.
alter table public.workspaces add column if not exists recebe_solicitacoes boolean not null default false;

create table if not exists public.access_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  role text check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  primary key (workspace_id, user_id)
);
alter table public.access_requests enable row level security;
drop policy if exists "solicitante vê a própria" on public.access_requests;
create policy "solicitante vê a própria" on public.access_requests for select using (user_id = auth.uid());
drop policy if exists "dono vê as do workspace" on public.access_requests;
create policy "dono vê as do workspace" on public.access_requests for select using (public.is_owner(workspace_id));

-- Sem vínculo: se existe workspace que recebe solicitações, registra o pedido e devolve null (aguardando liberação).
create or replace function public.ensure_workspace() returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare ws uuid; alvo uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select workspace_id into ws from public.workspace_members where user_id = auth.uid() order by created_at limit 1;
  if ws is not null then return ws; end if;
  select id into alvo from public.workspaces where recebe_solicitacoes order by created_at limit 1;
  if alvo is not null then
    insert into public.access_requests(workspace_id, user_id, email)
    select alvo, auth.uid(), coalesce(u.email, '') from auth.users u where u.id = auth.uid()
    on conflict do nothing;
    return null;
  end if;
  insert into public.workspaces default values returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end $$;

-- Dono aprova (com o papel) ou recusa. Fica registrado na auditoria do workspace.
create or replace function public.decide_access(ws uuid, uid uuid, aprovar boolean, papel text default 'member') returns text
language plpgsql security definer set search_path = public, auth as $$
declare quem text; alvo text;
begin
  if not public.is_owner(ws) then raise exception 'apenas o dono do workspace pode liberar acessos'; end if;
  if papel not in ('owner','member') then raise exception 'papel inválido'; end if;
  select email into quem from auth.users where id = auth.uid();
  update public.access_requests set status = case when aprovar then 'aprovado' else 'recusado' end, role = case when aprovar then papel end, decided_at = now(), decided_by = quem
   where workspace_id = ws and user_id = uid returning email into alvo;
  if alvo is null then raise exception 'solicitação não encontrada'; end if;
  if aprovar then
    insert into public.workspace_members(workspace_id, user_id, role) values (ws, uid, papel)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  end if;
  insert into public.audit_log(workspace_id, id, action, detail, actor)
  values (ws, 'acesso-' || gen_random_uuid(), case when aprovar then 'Acesso liberado' else 'Acesso recusado' end,
          alvo || case when aprovar then ' · ' || case papel when 'owner' then 'administrador' else 'membro' end else '' end, quem);
  return case when aprovar then 'Acesso liberado para ' || alvo || '.' else 'Solicitação de ' || alvo || ' recusada.' end;
end $$;

-- Dono remove alguém da equipe (não pode remover a si mesmo).
create or replace function public.remove_member(ws uuid, uid uuid) returns text
language plpgsql security definer set search_path = public, auth as $$
declare quem text; alvo text;
begin
  if not public.is_owner(ws) then raise exception 'apenas o dono do workspace pode remover membros'; end if;
  if uid = auth.uid() then raise exception 'você não pode remover o próprio acesso'; end if;
  select email into alvo from auth.users where id = uid;
  select email into quem from auth.users where id = auth.uid();
  delete from public.workspace_members where workspace_id = ws and user_id = uid;
  update public.access_requests set status = 'recusado', decided_at = now(), decided_by = quem where workspace_id = ws and user_id = uid;
  insert into public.audit_log(workspace_id, id, action, detail, actor) values (ws, 'acesso-' || gen_random_uuid(), 'Acesso removido', alvo, quem);
  return 'Acesso de ' || coalesce(alvo, 'usuário') || ' removido.';
end $$;

-- Equipe com e-mail (auth.users não é legível pelo navegador).
create or replace function public.list_team(ws uuid) returns table(user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.role, m.created_at from public.workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = ws and public.is_member(ws) order by m.created_at;
$$;

grant execute on function public.decide_access(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.list_team(uuid) to authenticated;
