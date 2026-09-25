-- Conciliação automática das correspondências exatas (autorizada pelo usuário em 25/09/2026).
-- Só vincula liberação positiva do mesmo pedido/plataforma cuja soma bate ao centavo com o saldo previsto,
-- em competência aberta. Tudo o mais continua exigindo confirmação humana.
alter table public.workspaces add column if not exists auto_link boolean not null default false;

create or replace function public.auto_link_exatos(ws uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.workspaces w where w.id = ws and w.auto_link) then return 0; end if;
  with c as (select * from public.v_candidatos_exatos where workspace_id = ws),
  u as (
    update public.receipts r set linked_order = c.pedido, updated_at = now()
    from c where r.workspace_id = c.workspace_id and r.id = any(c.liberacoes) and r.linked_order is null
    returning r.workspace_id, r.id, r.linked_order, r.amount
  ),
  a as (
    insert into public.audit_log(workspace_id, id, time, action, detail, actor)
    select workspace_id, gen_random_uuid()::text, now(), 'Vínculo confirmado',
      id || ' → ' || linked_order || ' · R$ ' || amount || ' · correspondência exata (valor ao centavo)',
      'Conciliação automática (regra autorizada pelo dono)'
    from u returning 1
  )
  select count(*) into n from a;
  return n;
end $$;

revoke all on function public.auto_link_exatos(uuid) from public, anon, authenticated;
