'use strict';
// Vendas · Visão geral no formato ERP: números do mês contra o mesmo período do mês anterior, vendas por dia
// e canal, resultado por canal (bruto, tarifas, líquido, recebido, a receber) e o que pede ação agora.
(()=>{
const CORES={'Mercado Livre':'#f5c518','Shopee':'#ee4d2d','Magalu':'#0086ff','Mercado Pago':'#00b1ea'};
const cor=p=>CORES[p]||platforms?.[p]?.color||'#8a93a9';
const dias=m=>{const [y,mm]=m.split('-').map(Number);return new Date(y,mm,0).getDate()};
const mesAnt=m=>{const d=new Date(m+'-15T12:00:00');d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7)};
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const pct=(a,b)=>b?((a-b)/Math.abs(b)*100):null;
const delta=(a,b,inv)=>{const p=pct(a,b);if(p==null||!isFinite(p))return '<span class="caption">sem base</span>';const bom=inv?p<0:p>0;return `<span class="${bom?'green':'red'}">${p>0?'▲':'▼'} ${Math.abs(p).toFixed(1).replace('.',',')}%</span> <span class="caption">vs ${mesBR(mesAnt(month)).split(' ')[0]}</span>`};
const mesBR=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const nf=v=>Number(v||0).toLocaleString('pt-BR');
function resumo(l){const g=l.reduce((s,o)=>s+o.gross,0),fee=l.reduce((s,o)=>s+o.fee,0),rec=l.reduce((s,o)=>s+Math.min(paid(o),net(o)),0);return {n:l.length,g,fee,liq:g-fee,rec,aberto:Math.max(0,g-fee-rec),ticket:l.length?g/l.length:0}}
function view(){const m=month,ant=mesAnt(m),corrente=m===hoje().slice(0,7),corte=corrente?Number(hoje().slice(8,10)):dias(m);
 const doMes=db.orders.filter(o=>o.date.startsWith(m)),doAnt=db.orders.filter(o=>o.date.startsWith(ant)&&Number(o.date.slice(8,10))<=corte);
 const A=resumo(doMes),B=resumo(doAnt),canais=[...new Set(doMes.map(o=>o.platform))].sort((a,b)=>resumo(doMes.filter(o=>o.platform===b)).g-resumo(doMes.filter(o=>o.platform===a)).g);
 const h=hoje(),vencidos=doMes.concat(db.orders.filter(o=>o.date<m+'-01'&&o.date>=mesAnt(ant)+'-01')).filter(o=>o.due&&o.due<h&&status(o)==='A receber'),valVenc=vencidos.reduce((s,o)=>s+net(o)-paid(o),0);
 const semNf=doMes.filter(o=>!o.nf).length,div=doMes.filter(o=>status(o)==='Divergência'),valDiv=div.reduce((s,o)=>s+(paid(o)-net(o)),0);
 const soltas=(db.receipts||[]).filter(r=>!r.linkedOrder&&r.amount>0&&(r.date||'').startsWith(m));
 // Vendas por dia empilhadas por canal.
 const D=dias(m),porDia=[...Array(D)].map(()=>({})),recDia=new Array(D).fill(0);for(const o of doMes){const i=Number(o.date.slice(8,10))-1;porDia[i][o.platform]=(porDia[i][o.platform]||0)+o.gross}
 for(const r of db.receipts||[])if((r.date||'').startsWith(m)&&r.amount>0)recDia[Number(r.date.slice(8,10))-1]+=r.amount;
 const max=Math.max(1,...porDia.map(x=>Object.values(x).reduce((s,v)=>s+v,0))),W=900,H=220,bw=W/D;
 const barras=porDia.map((x,i)=>{let y=H;return canais.map(c=>{const v=x[c]||0,hh=v/max*(H-20);y-=hh;return v?`<rect x="${i*bw+bw*.14}" y="${y}" width="${bw*.72}" height="${hh}" fill="${cor(c)}" rx="2"><title>${String(i+1).padStart(2,'0')}/${m.slice(5)} · ${c}: ${money(v)}</title></rect>`:''}).join('')}).join('');
 const kpi=(t,v,s,nav)=>`<button class="card kpi" ${nav?`data-nav="${nav}"`:''}><span class="kpil">${t}</span><span class="kpiv">${v}</span><span class="kpis">${s}</span></button>`;
 const acoes=[semNf&&['warn','receipt',`${nf(semNf)} pedido(s) sem nota fiscal`,'Veja quais e há quanto tempo','faturamento'],vencidos.length&&['bad','alert',`${nf(vencidos.length)} repasse(s) atrasado(s)`,`${money(valVenc)} deveriam ter caído`,'pending'],div.length&&['warn','alert',`${nf(div.length)} pedido(s) com divergência`,`${money(valDiv)} de diferença entre previsto e recebido`,'pending'],soltas.length&&['info','link',`${nf(soltas.length)} liberação(ões) sem pedido`,`${money(soltas.reduce((s,r)=>s+r.amount,0))} para vincular`,'reconcile']].filter(Boolean);
 return `<div class="grid kpis4">${kpi('Vendas brutas',money(A.g),delta(A.g,B.g),'reconcile')}${kpi('Pedidos',nf(A.n),`ticket médio ${money(A.ticket)} · ${delta(A.n,B.n)}`)}${kpi('Tarifas dos marketplaces',money(A.fee),`${(A.g?A.fee/A.g*100:0).toFixed(1).replace('.',',')}% da venda · ${delta(A.fee/(A.g||1),B.fee/(B.g||1),true)}`)}${kpi('Líquido a receber',money(A.liq),`${money(A.rec)} já recebido · ${money(A.aberto)} em aberto`,'reconcile')}</div>
 ${corrente?`<p class="caption" style="margin:-8px 0 14px">Comparação com os primeiros ${corte} dias de ${mesBR(ant)}.</p>`:''}
 <div class="grid central2"><section class="card"><div class="cardhead"><div><h2>Vendas por dia</h2><p class="caption">Valor bruto por canal · ${mesBR(m)}</p></div><div class="legend">${canais.map(c=>`<span><i style="background:${cor(c)}"></i>${esc(c)}</span>`).join('')}</div></div>
  <svg viewBox="0 0 ${W} ${H+18}" class="vdchart" role="img" aria-label="Vendas por dia">${[0,1,2,3].map(i=>`<line x1="0" x2="${W}" y1="${H-i*(H-20)/3}" y2="${H-i*(H-20)/3}" class="grid"/>`).join('')}${barras}${porDia.map((_,i)=>i%5===0?`<text x="${i*bw+2}" y="${H+14}">${String(i+1).padStart(2,'0')}</text>`:'').join('')}</svg></section>
 <section class="card"><div class="cardhead"><h2>Pede ação</h2><span class="badge ${acoes.length?'warn':'ok'}">${acoes.length||'Tudo em dia'}</span></div>
  ${acoes.map(([tom,ic,t,s,nav])=>`<div class="tarefa"><span class="avico ${tom}">${icon(ic)}</span><div><strong>${t}</strong><small>${s}</small></div><button class="small" data-nav="${nav}">Abrir</button></div>`).join('')||'<p class="caption">Nenhuma pendência de vendas. ✓</p>'}</section></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Resultado por canal</h2><p class="caption">${mesBR(m)} · clique no canal para ver os pedidos</p></div></div><div class="tablewrap"><table><thead><tr><th>Canal</th><th class="num">Pedidos</th><th class="num">Bruto</th><th class="num">Participação</th><th class="num">Ticket médio</th><th class="num">Tarifas</th><th class="num">% tarifa</th><th class="num">Líquido</th><th class="num">Recebido</th><th class="num">A receber</th><th class="num">vs mês anterior</th></tr></thead><tbody>
 ${canais.map(c=>{const x=resumo(doMes.filter(o=>o.platform===c)),y=resumo(doAnt.filter(o=>o.platform===c));return `<tr class="clickrow" data-nav="${esc(c)}"><td><span class="platdot" style="background:${cor(c)}"></span> <strong>${esc(c)}</strong></td><td class="num">${nf(x.n)}</td><td class="num">${money(x.g)}</td><td class="num">${(A.g?x.g/A.g*100:0).toFixed(1).replace('.',',')}%</td><td class="num">${money(x.ticket)}</td><td class="num">${money(x.fee)}</td><td class="num">${(x.g?x.fee/x.g*100:0).toFixed(1).replace('.',',')}%</td><td class="num">${money(x.liq)}</td><td class="num">${money(x.rec)}</td><td class="num">${money(x.aberto)}</td><td class="num">${delta(x.g,y.g)}</td></tr>`}).join('')}
 <tr class="ctbgrupo"><td>Total</td><td class="num">${nf(A.n)}</td><td class="num">${money(A.g)}</td><td class="num">100%</td><td class="num">${money(A.ticket)}</td><td class="num">${money(A.fee)}</td><td class="num">${(A.g?A.fee/A.g*100:0).toFixed(1).replace('.',',')}%</td><td class="num">${money(A.liq)}</td><td class="num">${money(A.rec)}</td><td class="num">${money(A.aberto)}</td><td class="num">${delta(A.g,B.g)}</td></tr></tbody></table></div></div>
 <div class="grid two">${topProdutos(doMes)}${topEstados(doMes)}</div>`}
function topProdutos(l){const m=new Map();for(const o of l)for(const it of o.items||[]){const k=it.title||it.sku;const x=m.get(k)||{q:0,v:0};x.q+=Number(it.qty)||0;x.v+=(Number(it.qty)||0)*(Number(it.price)||0);m.set(k,x)}
 const t=[...m].sort((a,b)=>b[1].v-a[1].v).slice(0,6),max=t[0]?.[1].v||1;
 return `<section class="card"><div class="cardhead"><h2>Mais vendidos</h2><button class="small quiet" data-nav="crmprodutos">Ver ranking</button></div>${t.map(([n,x])=>`<div class="barline"><span class="ellipsis">${esc(n)}</span><span class="bartrack"><i style="width:${x.v/max*100}%"></i></span><strong class="num">${money(x.v)}</strong><small class="caption">${nf(x.q)} un.</small></div>`).join('')||'<p class="caption">Sem itens no período.</p>'}</section>`}
function topEstados(l){const m=new Map();for(const o of l)if(o.state)m.set(o.state,(m.get(o.state)||0)+o.gross);const t=[...m].sort((a,b)=>b[1]-a[1]).slice(0,6),max=t[0]?.[1]||1,tot=l.reduce((s,o)=>s+o.gross,0)||1;
 return `<section class="card"><div class="cardhead"><h2>Principais estados</h2><button class="small quiet" data-nav="crmgeo">Ver mapa</button></div>${t.map(([uf,v])=>`<div class="barline"><span><strong>${esc(uf)}</strong></span><span class="bartrack"><i style="width:${v/max*100}%"></i></span><strong class="num">${money(v)}</strong><small class="caption">${(v/tot*100).toFixed(1).replace('.',',')}%</small></div>`).join('')||'<p class="caption">Sem UF nos pedidos.</p>'}</section>`}
// Substitui a tela antiga: addPage registra a nova e remove a entrada duplicada que ele acrescenta ao menu.
addPage('dashboard','grid','Visão geral',view,'Vendas do mês por canal, comparadas ao mesmo período do mês anterior — e o que pede ação.','',()=>{});
if(navItems.filter(n=>n[0]==='dashboard').length>1)navItems.splice(navItems.map(n=>n[0]).lastIndexOf('dashboard'),1);
})();
