-- Views de análise: mesmas regras da tela (web/app.js), para consultas do Claude Code e relatórios.
-- security_invoker = true: quem consulta pelo site continua limitado ao próprio workspace (RLS).

create or replace view public.v_pedidos with (security_invoker = true) as
select
  o.workspace_id, o.id as pedido, o.platform as plataforma, o.date as data, to_char(o.date, 'YYYY-MM') as competencia,
  o.nf, o.gross as bruto, o.fee as taxa, round(o.gross - o.fee, 2) as liquido,
  coalesce(r.recebido, 0) as recebido, round(o.gross - o.fee - coalesce(r.recebido, 0), 2) as saldo,
  case
    when coalesce(r.recebido, 0) > 0 and abs(coalesce(r.recebido, 0) - (o.gross - o.fee)) < 0.01 then 'Conciliado'
    when coalesce(r.recebido, 0) > 0 then 'Divergência'
    when o.transit then 'Em trânsito'
    else 'A receber'
  end as status,
  o.due as previsao, o.state as uf, o.customer ->> 'name' as cliente, o.fee_source as origem_taxa, o.shipping as frete,
  o.source as origem, o.note as anotacao, (c.month is not null) as competencia_fechada
from public.orders o
left join (
  select workspace_id, linked_order, round(sum(amount), 2) as recebido
  from public.receipts where linked_order is not null group by workspace_id, linked_order
) r on r.workspace_id = o.workspace_id and r.linked_order = o.id
left join public.closures c on c.workspace_id = o.workspace_id and c.month = to_char(o.date, 'YYYY-MM');

create or replace view public.v_liberacoes with (security_invoker = true) as
select
  r.workspace_id, r.id as liberacao, r.order_id as pedido_informado, r.linked_order as pedido_vinculado,
  r.platform as plataforma, r.account as conta, r.date as data, to_char(r.date, 'YYYY-MM') as competencia,
  r.amount as valor, r.kind as tipo, r.description as descricao, r.source as origem,
  (r.linked_order is null) as sem_vinculo
from public.receipts r;

-- Candidatos exatos: liberação sem vínculo, mesmo pedido e plataforma, soma igual ao saldo do pedido.
create or replace view public.v_candidatos_exatos with (security_invoker = true) as
with livres as (
  select workspace_id, order_id, platform, round(sum(amount), 2) as soma, array_agg(id order by date) as liberacoes
  from public.receipts
  where linked_order is null and order_id is not null
  group by workspace_id, order_id, platform
)
select p.workspace_id, p.pedido, p.plataforma, p.competencia, p.saldo, l.soma, l.liberacoes
from public.v_pedidos p
join livres l on l.workspace_id = p.workspace_id and l.order_id = p.pedido and l.platform = p.plataforma
where p.status <> 'Conciliado' and not p.competencia_fechada and abs(l.soma - p.saldo) < 0.01;

create or replace view public.v_resumo_competencia with (security_invoker = true) as
select workspace_id, competencia, plataforma,
  count(*) as pedidos, round(sum(bruto), 2) as bruto, round(sum(taxa), 2) as taxas, round(sum(liquido), 2) as liquido,
  round(sum(recebido), 2) as recebido, round(sum(case when status <> 'Em trânsito' then greatest(saldo, 0) else 0 end), 2) as a_receber,
  count(*) filter (where status = 'Conciliado') as conciliados, count(*) filter (where status = 'Divergência') as divergencias,
  round(sum(case when status = 'Divergência' then abs(saldo) else 0 end), 2) as valor_divergente
from public.v_pedidos group by workspace_id, competencia, plataforma;

grant select on public.v_pedidos, public.v_liberacoes, public.v_candidatos_exatos, public.v_resumo_competencia to authenticated;
