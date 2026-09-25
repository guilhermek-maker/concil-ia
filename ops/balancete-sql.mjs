// Gera o SQL de importação dos balancetes do escritório (Excel "Código | Classificação | Descrição | Saldo anterior | Débito | Crédito | Saldo atual").
// Uso: node ops/balancete-sql.mjs <workspace_id> <dre_modelo.xlsx|-> <AAAA-MM=arquivo.xlsx> [...] > saida.sql
// - Grava o movimento do mês de cada conta em accounting_lines (kind = balancete), substituindo o mês.
// - Para o primeiro mês, grava também o "saldo anterior" das contas de resultado como competência anterior (período antes do balancete).
// - Com o modelo de DRE (aba DRE do Resultado.xlsx), grava a classificação conta → linha da DRE em account_map.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require(process.env.XLSX_PATH || 'xlsx');
const [ws, modelo, ...pares] = process.argv.slice(2);
const q = s => `'${String(s ?? '').replace(/'/g, "''")}'`;
const num = v => (typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0);

function lerBalancete(file) {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const h = rows.findIndex(r => r.some(c => String(c).trim() === 'Classificação'));
  const head = rows[h].map(c => String(c).trim());
  const col = n => head.indexOf(n);
  const [cCod, cCla, cDes, cAnt, cDeb, cCre, cAtu] = ['Código', 'Classificação', 'Descrição da conta', 'Saldo Anterior', 'Débito', 'Crédito', 'Saldo Atual'].map(col);
  return rows.slice(h + 1).filter(r => r[cCla] !== '' && /^\d/.test(String(r[cCla]))).map(r => ({
    cod: String(r[cCod]).trim(), conta: String(r[cCla]).trim(), desc: String(r[cDes]).trim(),
    ant: num(r[cAnt]), deb: num(r[cDeb]), cre: num(r[cCre]), atu: num(r[cAtu]),
  }));
}

const meses = pares.map(p => p.split('=')).sort((a, b) => a[0].localeCompare(b[0]));
let sql = 'begin;\n';
const codToConta = new Map();
meses.forEach(([mes, file], idx) => {
  const linhas = lerBalancete(file);
  for (const l of linhas) codToConta.set(l.cod, { conta: l.conta, desc: l.desc });
  sql += `delete from accounting_lines where workspace_id=${q(ws)} and month=${q(mes)} and kind='balancete';\n`;
  const vals = linhas.map(l => `(${q(ws)},${q(`bal-${mes}-${l.cod}`)},${q(mes)},'balancete',${q(l.conta)},${q(l.desc)},${l.deb.toFixed(2)},${l.cre.toFixed(2)},${l.ant.toFixed(2)},${l.atu.toFixed(2)})`);
  for (let i = 0; i < vals.length; i += 500) sql += `insert into accounting_lines(workspace_id,id,month,kind,conta,descricao,debito,credito,saldo_anterior,saldo) values ${vals.slice(i, i + 500).join(',')};\n`;
  if (idx === 0) {
    // Resultado acumulado antes do primeiro balancete (ex.: fevereiro–março), vira a competência anterior.
    const [y, m] = mes.split('-').map(Number), prev = new Date(y, m - 2, 15).toISOString().slice(0, 7);
    const res = linhas.filter(l => /^[34]/.test(l.conta) && Math.abs(l.ant) > 0.004);
    sql += `delete from accounting_lines where workspace_id=${q(ws)} and month=${q(prev)} and kind='balancete' and id like 'ant-%';\n`;
    if (res.length) sql += `insert into accounting_lines(workspace_id,id,month,kind,conta,descricao,debito,credito,saldo) values ${res.map(l => `(${q(ws)},${q(`ant-${prev}-${l.cod}`)},${q(prev)},'balancete',${q(l.conta)},${q(l.desc)},${Math.max(0, l.ant).toFixed(2)},${Math.max(0, -l.ant).toFixed(2)},${l.ant.toFixed(2)})`).join(',')};\n`;
  }
});

if (modelo && modelo !== '-') {
  const GRUPOS = { 'RECEITA BRUTA COM VENDAS': 'receita', '(-) DEVOLUÇÕES, DESCONTOS E ABATIMENTOS': 'devolucoes', '(-) TRIBUTOS E CONTRIBUIÇÕES S/ VENDAS': 'impostos',
    'CUSTOS DAS MERCADORIAS VENDIDAS': 'cmv', 'DESPESAS GERAIS COMERCIAIS': 'comerciais', 'DESPESAS TRABALHISTAS': 'trabalhistas', 'DESPESAS GERAIS ADMINISTRATIVAS': 'administrativas',
    'DESPESAS OPERACIONAIS TRIBUTÁRIAS': 'outras', 'EBITDA': 'depreciacao', 'RECEITAS FINANCEIRAS': 'rec_fin', 'DESPESAS OPERACIONAIS FINANCEIRAS': 'desp_fin', 'LUCRO ANTES DO IRPJ/CSLL': 'ir' };
  const s = XLSX.readFile(modelo).Sheets['DRE'], r = XLSX.utils.decode_range(s['!ref']);
  let grupo = '';
  const maps = [];
  for (let R = 3; R <= r.e.r; R++) {
    const a = s['A' + (R + 1)], b = s['B' + (R + 1)];
    if (!b) continue;
    if (!a || a.v === '') { grupo = String(b.v).trim(); continue; }
    const linha = GRUPOS[grupo], c = codToConta.get(String(Math.round(a.v)));
    if (linha && c) maps.push(`(${q(ws)},${q(c.conta)},${q(c.desc)},${q(linha)})`);
  }
  if (maps.length) sql += `insert into account_map(workspace_id,conta,descricao,linha) values ${maps.join(',')} on conflict (workspace_id,conta) do update set linha=excluded.linha, descricao=excluded.descricao;\n`;
  sql += `select ${maps.length} as contas_classificadas;\n`;
}
sql += `commit;\nselect month, count(*)::int linhas from accounting_lines where workspace_id=${q(ws)} group by 1 order by 1;\n`;
process.stdout.write(sql);
