-- Correspondência exata só com repasse positivo: repasses negativos (ex.: taxa cobrada em pedido cancelado)
-- exigem revisão humana e não entram na conciliação em lote.
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
where p.status <> 'Conciliado' and not p.competencia_fechada and l.soma > 0 and abs(l.soma - p.saldo) < 0.01;
