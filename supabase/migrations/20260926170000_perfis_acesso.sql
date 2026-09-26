-- Perfis de acesso com permissão aplicada no banco (RLS), não só na tela.
-- owner (Administrador) e member (Equipe completa, perfil antigo) continuam com acesso total.
-- financeiro · contador (Contabilidade) · atendimento · estoque veem e alteram só as suas áreas.
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('owner','member','financeiro','contador','atendimento','estoque'));
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='access_requests' and column_name='role') then
    execute 'alter table public.access_requests drop constraint if exists access_requests_role_check';
  end if;
end $$;

create or replace function public.papel(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.workspace_members where workspace_id = ws and user_id = auth.uid()
$$;

-- Matriz de permissões: área × perfil → leitura (false) ou gravação (true).
create or replace function public.pode(ws uuid, area text, gravar boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.papel(ws)
    when 'owner' then true
    when 'member' then true
    when 'financeiro' then area in ('financeiro','contabil','vendas','precos','config') or (area = 'estoque' and not gravar)
    when 'contador' then area in ('contabil','config') or (area in ('financeiro','vendas','precos','estoque') and not gravar)
    when 'atendimento' then area = 'vendas' or (area in ('estoque','precos','config') and not gravar)
    when 'estoque' then area = 'estoque' or (area in ('vendas','precos','config') and not gravar)
    else false end
$$;
grant execute on function public.papel(uuid) to authenticated;
grant execute on function public.pode(uuid, text, boolean) to authenticated;

-- Troca as políticas "membros operam X" (tudo liberado) por leitura/gravação conforme a área.
do $$
declare r record; area text;
begin
  for r in select * from (values
    ('payables','financeiro'),('bank_accounts','financeiro'),('bank_transactions','financeiro'),('ledger','financeiro'),('receipts','financeiro'),
    ('purchase_invoices','financeiro'),('compras_marketplace','financeiro'),('imports','financeiro'),
    ('closures','contabil'),('account_map','contabil'),('accounting_docs','contabil'),('accounting_lines','contabil'),
    ('orders','vendas'),('crm_contacts','vendas'),
    ('pricing_products','precos'),('pricing_scenarios','precos'),
    ('estoque_movimentos','estoque'),
    ('cadastros','config')) as t(tabela, area)
  loop
    execute format('drop policy if exists %I on public.%I', 'membros operam ' || r.tabela, r.tabela);
    execute format('drop policy if exists estoque_mov_all on public.%I', r.tabela);
    execute format('drop policy if exists %I on public.%I', 'ler_' || r.tabela, r.tabela);
    execute format('drop policy if exists %I on public.%I', 'incluir_' || r.tabela, r.tabela);
    execute format('drop policy if exists %I on public.%I', 'alterar_' || r.tabela, r.tabela);
    execute format('drop policy if exists %I on public.%I', 'excluir_' || r.tabela, r.tabela);
    execute format('create policy %I on public.%I for select using (public.pode(workspace_id, %L, false))', 'ler_' || r.tabela, r.tabela, r.area);
    execute format('create policy %I on public.%I for insert with check (public.pode(workspace_id, %L, true))', 'incluir_' || r.tabela, r.tabela, r.area);
    execute format('create policy %I on public.%I for update using (public.pode(workspace_id, %L, true)) with check (public.pode(workspace_id, %L, true))', 'alterar_' || r.tabela, r.tabela, r.area, r.area);
    execute format('create policy %I on public.%I for delete using (public.pode(workspace_id, %L, true))', 'excluir_' || r.tabela, r.tabela, r.area);
  end loop;
end $$;

-- Tabelas com políticas próprias: ajusta às áreas.
drop policy if exists atend_select on public.atendimentos;
create policy atend_select on public.atendimentos for select using (public.pode(workspace_id, 'vendas', false));
drop policy if exists atend_update on public.atendimentos;
create policy atend_update on public.atendimentos for update using (public.pode(workspace_id, 'vendas', true)) with check (public.pode(workspace_id, 'vendas', true));
drop policy if exists produtos_select on public.produtos;
create policy produtos_select on public.produtos for select using (public.pode(workspace_id, 'estoque', false));
drop policy if exists produtos_update on public.produtos;
create policy produtos_update on public.produtos for update using (public.pode(workspace_id, 'estoque', true)) with check (public.pode(workspace_id, 'estoque', true));
drop policy if exists nf_select on public.notas_fiscais;
create policy nf_select on public.notas_fiscais for select using (public.pode(workspace_id, 'vendas', false) or public.pode(workspace_id, 'contabil', false));
-- Configurações (tema, preços, fiscal): todos leem e gravam (o tema de cada um vai para lá); a tela fiscal é que fica restrita.

-- Liberação e troca de perfil pelo administrador.
create or replace function public.decide_access(ws uuid, uid uuid, aprovar boolean, papel text default 'member') returns text
language plpgsql security definer set search_path = public, auth as $$
declare quem text; alvo text;
begin
  if not public.is_owner(ws) then raise exception 'apenas o administrador pode liberar acessos'; end if;
  if papel not in ('owner','member','financeiro','contador','atendimento','estoque') then raise exception 'perfil inválido'; end if;
  select email into quem from auth.users where id = auth.uid();
  update public.access_requests set status = case when aprovar then 'aprovado' else 'recusado' end, role = case when aprovar then papel end, decided_at = now(), decided_by = quem
   where workspace_id = ws and user_id = uid returning email into alvo;
  if alvo is null then raise exception 'solicitação não encontrada'; end if;
  if aprovar then
    insert into public.workspace_members(workspace_id, user_id, role) values (ws, uid, papel)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
  end if;
  insert into public.audit_log(workspace_id, id, action, detail, actor)
  values (ws, 'acesso-' || gen_random_uuid(), case when aprovar then 'Acesso liberado' else 'Acesso recusado' end, alvo || case when aprovar then ' · ' || papel else '' end, quem);
  return case when aprovar then 'Acesso liberado para ' || alvo || '.' else 'Solicitação de ' || alvo || ' recusada.' end;
end $$;

create or replace function public.set_role(ws uuid, uid uuid, papel text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare quem text; alvo text;
begin
  if not public.is_owner(ws) then raise exception 'apenas o administrador pode trocar perfis'; end if;
  if papel not in ('owner','member','financeiro','contador','atendimento','estoque') then raise exception 'perfil inválido'; end if;
  if uid = auth.uid() then raise exception 'você não pode trocar o seu próprio perfil'; end if;
  update public.workspace_members set role = papel where workspace_id = ws and user_id = uid;
  select email into alvo from auth.users where id = uid;
  select email into quem from auth.users where id = auth.uid();
  insert into public.audit_log(workspace_id, id, action, detail, actor) values (ws, 'perfil-' || gen_random_uuid(), 'Perfil alterado', coalesce(alvo, uid::text) || ' → ' || papel, quem);
  return 'Perfil de ' || coalesce(alvo, 'usuário') || ' alterado para ' || papel || '.';
end $$;
grant execute on function public.set_role(uuid, uuid, text) to authenticated;
