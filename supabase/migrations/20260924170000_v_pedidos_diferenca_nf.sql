-- v_pedidos: expõe o que a plataforma calcula e a diferença entre a NF e a venda na plataforma.
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
  o.source as origem, o.note as anotacao, (c.month is not null) as competencia_fechada,
  (o.external ->> 'venda_plataforma')::numeric as venda_plataforma,
  (o.external ->> 'tarifas_plataforma')::numeric as tarifas_plataforma,
  (o.external ->> 'diferenca_nf')::numeric as diferenca_nf
from public.orders o
left join (
  select workspace_id, linked_order, round(sum(amount), 2) as recebido
  from public.receipts where linked_order is not null group by workspace_id, linked_order
) r on r.workspace_id = o.workspace_id and r.linked_order = o.id
left join public.closures c on c.workspace_id = o.workspace_id and c.month = to_char(o.date, 'YYYY-MM');
