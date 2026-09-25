// Gera o SQL de importação da "Minha Renda" da Central do Vendedor Shopee (coletada pelo Claude Code).
// Linhas: "L|P,order_sn,data(AAAA-MM-DD ou MMDD),renda_centavos,ajuste_centavos". Idempotente.
// Uso: node ops/shopee-renda-sql.mjs <workspace_id> <arquivo.txt> [...] > saida.sql
import fs from 'node:fs';
const [ws, ...files] = process.argv.slice(2);
const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => l.trim().split(',')));
const dt = d => !d ? 'null' : /^\d{4}-\d{2}-\d{2}$/.test(d) ? `'${d}'` : `'2026-${d.slice(0, 2)}-${d.slice(2)}'`;
const vals = rows.map(([t, sn, d, r, a]) => `('${t}','${sn.replace(/[^0-9A-Z]/g, '')}',${dt(d)},${Number(r)},${Number(a)})`);
let sql = `create temp table shp(tipo text, sn text, dt date, renda int, ajuste int);\n`;
for (let i = 0; i < vals.length; i += 1000) sql += `insert into shp values ${vals.slice(i, i + 1000).join(',')};\n`;
sql += `
insert into receipts(workspace_id,id,order_id,platform,account,date,amount,source,kind,description,details,updated_at)
select '${ws}','SHP-'||sn, sn,'Shopee','Shopee',dt,(renda+ajuste)/100.0,'Shopee Central','liberacao','Repasse do pedido (Minha Renda)',
  jsonb_build_object('renda',renda/100.0,'ajuste',ajuste/100.0),now() from (select distinct on (sn) * from shp where tipo='L' order by sn, dt desc) x
on conflict (workspace_id,id) do update set amount=excluded.amount, date=excluded.date, details=excluded.details, updated_at=now();
update orders o set fee = round(o.gross - s.renda/100.0, 2), fee_source='Shopee',
  external = coalesce(o.external,'{}'::jsonb) || jsonb_build_object('repasse_previsto', s.renda/100.0, 'ajuste_shopee', s.ajuste/100.0, 'fonte_repasse','Minha Renda', 'diferenca_nf', null),
  updated_at = now()
from (select distinct on (sn) * from shp order by sn, tipo) s where o.workspace_id='${ws}' and o.id=s.sn;
select (select count(*) from shp where tipo='L')::int liberados, (select count(*) from shp where tipo='P')::int pendentes,
  (select count(*) from shp s where exists (select 1 from orders o where o.id=s.sn))::int com_pedido_bling;
`;
process.stdout.write(sql);
