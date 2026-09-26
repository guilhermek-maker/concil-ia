-- Atendimento pós-venda (reclamações, devoluções, mediações, perguntas e mensagens dos marketplaces)
-- e trilha de auditoria completa (cada inclusão, alteração e exclusão, com quem fez e o antes/depois).

-- ─────────────── Atendimento ───────────────
-- Colunas "do marketplace" são regravadas a cada sincronização; as "da equipe" (responsavel, etapa_interna,
-- notas, resolvido_por) nunca são tocadas pela sincronização.
create table if not exists public.atendimentos (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,                         -- ML-R-<claim>, ML-P-<pergunta>, ML-M-<pack>
  canal text not null,                      -- mercadolivre | shopee | magalu
  tipo text not null,                       -- reclamacao | devolucao | mediacao | cancelamento | pergunta | mensagem
  status text not null,                     -- aberto | fechado (situação no marketplace)
  etapa text,                               -- claim | dispute | ... (etapa no marketplace)
  pedido text, pack text,
  produto text, item_id text, valor numeric(14,2),
  comprador text,
  motivo_codigo text, motivo text,
  prazo timestamptz,                        -- próximo prazo para agir (definido pelo marketplace)
  acoes jsonb,                              -- ações disponíveis para o vendedor, com prazos
  mensagens jsonb,                          -- conversa (mais recentes por último)
  devolucao jsonb,                          -- status da devolução/envio de volta
  sugestao jsonb,                           -- última sugestão da IA (diagnóstico, solução, mensagem)
  dados jsonb,                              -- resumo do registro original
  aberto_em timestamptz, atualizado_em timestamptz, fechado_em timestamptz,
  -- equipe
  responsavel text, etapa_interna text not null default 'novo', notas text, resolvido_por text, resolvido_em timestamptz,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists atendimentos_abertos on public.atendimentos (workspace_id, status, prazo);
alter table public.atendimentos enable row level security;
drop policy if exists atend_select on public.atendimentos;
create policy atend_select on public.atendimentos for select using (public.is_member(workspace_id));
drop policy if exists atend_update on public.atendimentos;
create policy atend_update on public.atendimentos for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- ─────────────── Trilha de auditoria ───────────────
create table if not exists public.audit_trail (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  em timestamptz not null default now(),
  tabela text not null,
  registro text,
  operacao text not null check (operacao in ('inclusao','alteracao','exclusao')),
  campos jsonb,                             -- alteração: {campo: [antes, depois]}; inclusão/exclusão: o registro
  usuario uuid,
  email text,
  origem text not null default 'usuario'    -- usuario | sistema (sincronização, rotinas automáticas)
);
create index if not exists audit_trail_ws_em on public.audit_trail (workspace_id, em desc);
create index if not exists audit_trail_registro on public.audit_trail (workspace_id, tabela, registro);
alter table public.audit_trail enable row level security;
drop policy if exists audit_trail_select on public.audit_trail;
create policy audit_trail_select on public.audit_trail for select using (public.is_member(workspace_id));
-- Ninguém grava, altera ou apaga pela API: só os gatilhos abaixo (trilha inviolável para os usuários).

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  novo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  velho jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  reg jsonb := coalesce(novo, velho);
  uid uuid := auth.uid();
  mail text := nullif(auth.jwt() ->> 'email', '');
  so_usuario boolean := coalesce(tg_argv[0], '') = 'so_usuario';
  dif jsonb := '{}'::jsonb;
  k text;
  chave text;
begin
  -- Tabelas alimentadas em massa pela sincronização (pedidos, liberações): só registra ações de pessoas.
  if so_usuario and uid is null then return null; end if;
  if (reg ->> 'workspace_id') is null then return null; end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(novo) loop
      if k in ('updated_at', 'workspace_id') then continue; end if;
      if (novo -> k) is distinct from (velho -> k) then dif := dif || jsonb_build_object(k, jsonb_build_array(velho -> k, novo -> k)); end if;
    end loop;
    if dif = '{}'::jsonb then return null; end if;
  end if;
  chave := coalesce(reg ->> 'id', reg ->> 'month', reg ->> 'provider', reg ->> 'conta', reg ->> 'user_id', reg ->> 'email');
  insert into public.audit_trail (workspace_id, tabela, registro, operacao, campos, usuario, email, origem)
  values (
    (reg ->> 'workspace_id')::uuid, tg_table_name, chave,
    case tg_op when 'INSERT' then 'inclusao' when 'UPDATE' then 'alteracao' else 'exclusao' end,
    case tg_op when 'UPDATE' then dif else reg - 'workspace_id' - 'raw' - 'dados' end,
    uid, mail, case when uid is null then 'sistema' else 'usuario' end
  );
  return null;
end $$;
revoke all on function public.auditar() from public, anon, authenticated;

do $$
declare t text;
begin
  -- Tudo que a equipe cadastra ou altera.
  foreach t in array array['payables','bank_accounts','bank_transactions','cadastros','closures','workspace_settings',
    'crm_contacts','workspace_members','access_requests','accounting_lines','account_map','accounting_docs',
    'pricing_products','pricing_scenarios','imports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists auditar on public.%I', t);
      execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
    end if;
  end loop;
  -- Pedidos, liberações e vínculos: a sincronização grava milhares de linhas; registramos só as ações de pessoas.
  foreach t in array array['orders','receipts','ledger','integrations','purchase_invoices','atendimentos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists auditar on public.%I', t);
      execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar(%L)', t, 'so_usuario');
    end if;
  end loop;
end $$;
