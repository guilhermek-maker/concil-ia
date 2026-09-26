-- Verificação em duas etapas aplicada no banco: quem cadastrou um autenticador (TOTP) só acessa os dados
-- depois de informar o código na sessão (JWT com aal2). Quem ainda não cadastrou segue como antes.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;
grant execute on function public.mfa_ok() to authenticated;

create or replace function public.pode(ws uuid, area text, gravar boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and case public.papel(ws)
    when 'owner' then true
    when 'member' then true
    when 'financeiro' then area in ('financeiro','contabil','vendas','precos','config') or (area = 'estoque' and not gravar)
    when 'contador' then area in ('contabil','config') or (area in ('financeiro','vendas','precos','estoque') and not gravar)
    when 'atendimento' then area = 'vendas' or (area in ('estoque','precos','config') and not gravar)
    when 'estoque' then area = 'estoque' or (area in ('vendas','precos','config') and not gravar)
    else false end
$$;
