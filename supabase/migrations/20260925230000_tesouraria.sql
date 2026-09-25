-- Tesouraria: contas bancárias (e carteiras dos marketplaces) e os movimentos dos extratos (OFX/planilha),
-- conciliados com os títulos a pagar, transferências entre contas, rendimentos e tarifas.

create table if not exists public.bank_accounts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  nome text not null,
  banco text, agencia text, conta text,
  tipo text not null default 'corrente' check (tipo in ('corrente','aplicacao','carteira','caixa')),
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date,
  saldo_extrato numeric(14,2), data_saldo_extrato date,  -- último saldo informado pelo banco no extrato
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists public.bank_transactions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id text not null,
  conta_id text not null,
  data date not null,
  descricao text, documento text,
  valor numeric(14,2) not null,       -- positivo = entrada, negativo = saída
  fitid text,
  origem text not null default 'ofx',
  status text not null default 'pendente' check (status in ('pendente','conciliado','ignorado')),
  vinculo jsonb,                       -- {tipo:'payable'|'transferencia'|'aplicacao'|'receita'|'despesa', id, desc, categoria}
  categoria text, observacao text, arquivo text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists bank_tx_conta on public.bank_transactions (workspace_id, conta_id, data);

-- Despesas lançadas a partir do extrato (tarifa, imposto, pix sem título) viram títulos já pagos.
alter table public.payables drop constraint if exists payables_origem_check;
alter table public.payables add constraint payables_origem_check check (origem in ('nfe','manual','recorrente','extrato'));

do $$ declare t text; begin
  foreach t in array array['bank_accounts','bank_transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros operam %1$s" on public.%1$I', t);
    execute format('create policy "membros operam %1$s" on public.%1$I for all using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;
