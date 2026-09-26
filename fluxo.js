'use strict';
// Fluxo de caixa de verdade: REALIZADO mês a mês a partir do extrato bancário já classificado (entradas e
// saídas por grupo e categoria, saldo inicial e final batendo com o banco) e PROJETADO para as próximas
// 12 semanas (repasses a receber dos marketplaces × títulos a pagar), com o saldo semana a semana.
(()=>{
const ui={aba:'realizado',meses:6,abertos:new Set(),futuras:true};
const GRUPOS=[
 ['e','Repasses dos marketplaces',t=>t.valor>0&&t.vinculo?.tipo==='transferencia'&&/shopee|maree|mercado pago|wolfach|magalu/.test(normalized((t.vinculo.desc||'')+' '+t.descricao)),t=>/shopee|maree/.test(normalized((t.vinculo.desc||'')+' '+t.descricao))?'Shopee':/magalu/.test(normalized(t.vinculo.desc||''))?'Magalu':'Mercado Livre / Mercado Pago'],
 ['e','Resgates de aplicações',t=>t.valor>0&&t.vinculo?.tipo==='aplicacao',()=>'Resgates'],
 ['e','Aportes e outras entradas',t=>t.valor>0,t=>t.vinculo?.categoria||t.categoria||(t.vinculo?.tipo==='transferencia'?'Transferências recebidas':t.status==='pendente'?'A classificar':'Outras entradas')],
 ['s','Fornecedores (títulos)',t=>t.vinculo?.tipo==='payable',t=>t.vinculo?.desc?.split(' · ')[0]||'Fornecedores'],
 ['s','Tributos sobre vendas',t=>/icms|difal|gnre|pis|cofins/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Pessoal',t=>/salario|pro-labore|pró-labore/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Ocupação e utilidades',t=>/aluguel|agua|água|luz|internet/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Embalagens e insumos',t=>/embalage|material/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Investimentos (imobilizado)',t=>/imobilizado|maquina|máquina|movei|móvei/i.test(t.vinculo?.categoria||t.categoria||''),t=>t.vinculo?.categoria||t.categoria],
 ['s','Aplicações financeiras',t=>t.vinculo?.tipo==='aplicacao',()=>'Aplicações'],
 ['s','Transferências e saques',t=>t.vinculo?.tipo==='transferencia',t=>t.vinculo?.desc||'Transferências'],
 ['s','Administrativas e outras',t=>true,t=>t.vinculo?.categoria||t.categoria||(t.status==='pendente'?'A classificar':'Outras saídas')]];
const mesBR=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
const addMes=(m,n)=>{const d=new Date(m+'-15T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const k=v=>Math.abs(v)<0.005?'—':money(v);
function realizado(){const contas=(db.bankAccounts||[]).filter(a=>a.tipo!=='aplicacao'&&a.ativo!==false),ids=new Set(contas.map(a=>a.id));
 const meses=[...Array(ui.meses)].map((_,i)=>addMes(month,i-ui.meses+1)),txs=(db.bankTx||[]).filter(t=>ids.has(t.contaId)&&t.status!=='ignorado'&&t.origem!=='espelho');
 const saldoAte=d=>contas.reduce((s,a)=>s+Number(a.saldoInicial||0)+txs.filter(t=>t.contaId===a.id&&t.data>(a.dataSaldoInicial||'0000')&&t.data<=d).reduce((x,t)=>x+t.valor,0),0);
 const cel=new Map();const add=(g,c,m,v)=>{const key=g+'|'+c;const x=cel.get(key)||{};x[m]=(x[m]||0)+v;cel.set(key,x)};
 for(const t of txs){const m=t.data.slice(0,7);if(!meses.includes(m))continue;const lado=t.valor>0?'e':'s';const g=GRUPOS.find(([l,,f])=>l===lado&&f(t));add(g[1],g[3](t)||'Outros',m,t.valor)}
 const soma=(g,m)=>[...cel].filter(([key])=>key.startsWith(g+'|')).reduce((s,[,x])=>s+(x[m]||0),0);
 const fimMes=m=>{const [y,mm]=m.split('-').map(Number);return new Date(y,mm,0).toLocaleDateString('sv-SE')};
 const ini=meses.map(m=>saldoAte(fimMes(addMes(m,-1)))),fim=meses.map(m=>saldoAte(fimMes(m)));
 const linhaG=(lado,g)=>{const cats=[...cel.keys()].filter(key=>key.startsWith(g+'|')).map(key=>key.split('|')[1]);if(!cats.length)return '';const aberto=ui.abertos.has(g);
  return `<tr class="clickrow fxg" data-fx-grupo="${esc(g)}"><td>${aberto?'▾':'▸'} ${esc(g)}</td>${meses.map(m=>`<td class="num ${lado==='s'?'red':'green'}">${k(soma(g,m))}</td>`).join('')}<td class="num"><strong>${k(meses.reduce((s,m)=>s+soma(g,m),0))}</strong></td></tr>
  ${aberto?cats.sort().map(c=>{const x=cel.get(g+'|'+c);return `<tr class="fxc"><td>${esc(c)}</td>${meses.map(m=>`<td class="num caption">${k(x[m]||0)}</td>`).join('')}<td class="num caption">${k(meses.reduce((s,m)=>s+(x[m]||0),0))}</td></tr>`}).join(''):''}`};
 const tot=lado=>meses.map(m=>GRUPOS.filter(g=>g[0]===lado).reduce((s,g)=>s+soma(g[1],m),0));const te=tot('e'),ts=tot('s');
 return `<div class="notice">Movimento real das contas correntes (${contas.map(a=>esc(a.nome)).join(', ')}) pelo extrato classificado. Aplicações e resgates aparecem como saída e entrada — o dinheiro continua da empresa, só muda de conta. Clique num grupo para abrir as categorias.</div>
 <div class="tablebox"><div class="tabletop"><h2>Fluxo de caixa realizado</h2><select data-fx-meses aria-label="Meses">${[3,6,9,12].map(n=>`<option value="${n}" ${ui.meses===n?'selected':''}>Últimos ${n} meses</option>`).join('')}</select></div><div class="tablewrap"><table class="fxtable"><thead><tr><th>Grupo</th>${meses.map(m=>`<th class="num">${mesBR(m)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
 <tr class="ctbgrupo"><td>Saldo inicial</td>${ini.map(v=>`<td class="num">${money(v)}</td>`).join('')}<td></td></tr>
 <tr class="fxsec"><td colspan="${meses.length+2}">Entradas</td></tr>${GRUPOS.filter(g=>g[0]==='e').map(g=>linhaG('e',g[1])).join('')}
 <tr class="ctbgrupo"><td>Total de entradas</td>${te.map(v=>`<td class="num green">${money(v)}</td>`).join('')}<td class="num green">${money(te.reduce((a,b)=>a+b,0))}</td></tr>
 <tr class="fxsec"><td colspan="${meses.length+2}">Saídas</td></tr>${GRUPOS.filter(g=>g[0]==='s').map(g=>linhaG('s',g[1])).join('')}
 <tr class="ctbgrupo"><td>Total de saídas</td>${ts.map(v=>`<td class="num red">${money(v)}</td>`).join('')}<td class="num red">${money(ts.reduce((a,b)=>a+b,0))}</td></tr>
 <tr class="ctbgrupo"><td>Geração de caixa do mês</td>${meses.map((_,i)=>`<td class="num ${te[i]+ts[i]<0?'red':'green'}">${money(te[i]+ts[i])}</td>`).join('')}<td class="num">${money(te.reduce((a,b)=>a+b,0)+ts.reduce((a,b)=>a+b,0))}</td></tr>
 <tr class="ctbgrupo ctbfinal"><td>Saldo final</td>${fim.map(v=>`<td class="num">${money(v)}</td>`).join('')}<td></td></tr></tbody></table></div></div>`}
// Prazo real de repasse de cada canal: mediana (data da liberação − data do pedido) nos últimos 90 dias.
function prazos(){const lim=new Date(Date.now()-90*864e5).toLocaleDateString('sv-SE'),ped=new Map(db.orders.map(o=>[o.id,o])),d=new Map();
 for(const r of db.receipts||[]){if(!r.linkedOrder||!(r.amount>0)||(r.date||'')<lim)continue;const o=ped.get(r.linkedOrder);if(!o)continue;const n=Math.round((new Date(r.date+'T12:00:00')-new Date(o.date+'T12:00:00'))/864e5);if(n<0||n>90)continue;(d.get(o.platform)||d.set(o.platform,[]).get(o.platform)).push(n)}
 const out={};for(const [p,l] of d){l.sort((a,b)=>a-b);out[p]=l[Math.floor(l.length/2)]}return out}
const somaDias=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toLocaleDateString('sv-SE')};
function projetado(){const h=new Date().toLocaleDateString('sv-SE'),semanas=[...Array(12)].map((_,i)=>{const d=new Date(h+'T12:00:00');d.setDate(d.getDate()+i*7);const f=new Date(d);f.setDate(f.getDate()+6);return {ini:d.toLocaleDateString('sv-SE'),fim:f.toLocaleDateString('sv-SE'),en:{},sa:{}}});
 const semDe=d=>{if(d<h)return 0;const i=semanas.findIndex(s=>d>=s.ini&&d<=s.fim);return i};const put=(o,k,v)=>o[k]=(o[k]||0)+v;
 const pz=prazos();
 for(const o of db.orders){const st=status(o);if(!['A receber','Em trânsito'].includes(st))continue;const f=round(net(o)-paid(o));if(f<=0)continue;const d=o.due||(pz[o.platform]!=null?somaDias(o.date,pz[o.platform]):'');if(!d||d<new Date(Date.now()-60*864e5).toLocaleDateString('sv-SE'))continue;const i=semDe(d);if(i<0)continue;put(semanas[i].en,d<h?`${o.platform} (atrasado)`:o.platform,f)}
 // Vendas futuras: líquido médio diário dos últimos 28 dias por canal, recebido após o prazo de repasse do canal.
 if(ui.futuras){const ini28=somaDias(h,-28),med={};for(const o of db.orders)if(o.date>=ini28&&o.date<h)med[o.platform]=(med[o.platform]||0)+net(o)/28;
  for(let i=0;i<84;i++){const dv=somaDias(h,i);for(const [p,v] of Object.entries(med)){const dr=somaDias(dv,pz[p]??15),j=semDe(dr);if(j>0||(j===0&&dr>=h))put(semanas[j].en,`${p} (vendas futuras)`,v)}}
  // Tributos pagos por venda (GNRE/DIFAL): média diária paga nos últimos 28 dias, mantida no horizonte.
  const trib=(db.bankTx||[]).filter(t=>t.data>=ini28&&t.data<h&&t.valor<0&&/icms|difal|gnre/i.test(t.vinculo?.categoria||t.categoria||'')).reduce((x,t)=>x-t.valor,0)/28;
  if(trib>0)for(let i=0;i<84;i++){const j=semDe(somaDias(h,i));if(j>=0)put(semanas[j].sa,'Tributos sobre vendas (estimativa)',trib)}}
 for(const p of db.payables||[]){if(['pago','cancelado'].includes(p.status))continue;const f=round(Math.max(0,p.valor+(p.juros||0)-(p.desconto||0)-(p.valorPago||0)));if(!f)continue;const i=semDe(p.vencimento);if(i<0)continue;put(semanas[i].sa,p.categoria||'Outros',f)}
 const inicial=window.Tesouraria?.saldos().contas.filter(c=>c.tipo!=='aplicacao').reduce((s,c)=>s+c.saldo,0)||0,aplic=window.Tesouraria?.saldos().contas.filter(c=>c.tipo==='aplicacao').reduce((s,c)=>s+c.saldo,0)||0;let saldo=inicial;
 const lin=semanas.map(s=>{const e=Object.values(s.en).reduce((a,b)=>a+b,0),x=Object.values(s.sa).reduce((a,b)=>a+b,0);saldo+=e-x;return {...s,e,x,saldo}});const minimo=lin.reduce((m,s)=>s.saldo<m.saldo?s:m,lin[0]);
 const d2=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
 return `<label class="check-l" style="margin:0 0 12px"><input type="checkbox" class="check" id="fxFut" ${ui.futuras?'checked':''}> Incluir vendas futuras (média dos últimos 28 dias por canal) · prazo de repasse: ${Object.entries(pz).map(([p,n])=>`${esc(p)} ${n} d`).join(', ')||'sem histórico'}</label>
 <div class="grid kpis4"><div class="card kpi"><span class="kpil">Saldo em conta corrente</span><span class="kpiv">${money(inicial)}</span><span class="kpis">+ ${money(aplic)} em aplicações</span></div><div class="card kpi"><span class="kpil">Entradas previstas (12 sem.)</span><span class="kpiv green">${money(lin.reduce((s,x)=>s+x.e,0))}</span><span class="kpis">Repasses a receber${ui.futuras?' + vendas futuras':''}</span></div><div class="card kpi"><span class="kpil">Saídas previstas (12 sem.)</span><span class="kpiv red">${money(lin.reduce((s,x)=>s+x.x,0))}</span><span class="kpis">Títulos em aberto${ui.futuras?' + tributos estimados':''}</span></div><div class="card kpi"><span class="kpil">Menor saldo projetado</span><span class="kpiv ${minimo.saldo<0?'red':''}">${money(minimo.saldo)}</span><span class="kpis">semana de ${d2(minimo.ini)}${minimo.saldo<0?' — resgatar aplicação antes':''}</span></div></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Projeção semanal</h2><p class="caption">Atrasados (repasse ou título vencido) entram na primeira semana.</p></div></div><div class="tablewrap"><table><thead><tr><th>Semana</th><th class="num">Entradas</th><th>Principais entradas</th><th class="num">Saídas</th><th>Principais saídas</th><th class="num">Saldo projetado</th></tr></thead><tbody>
 ${lin.map(s=>`<tr><td>${d2(s.ini)} a ${d2(s.fim)}</td><td class="num green">${k(s.e)}</td><td class="caption">${Object.entries(s.en).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,v])=>`${esc(n)} ${money(v)}`).join(' · ')}</td><td class="num red">${k(s.x)}</td><td class="caption">${Object.entries(s.sa).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,v])=>`${esc(n)} ${money(v)}`).join(' · ')}</td><td class="num"><strong class="${s.saldo<0?'red':''}">${money(s.saldo)}</strong></td></tr>`).join('')}</tbody></table></div></div>`}
function view(){return `<div class="crmbar"><div class="segtabs">${[['realizado','Realizado (extrato)'],['projetado','Projetado (12 semanas)']].map(([a,t])=>`<button class="${ui.aba===a?'active':''}" data-fx-aba="${a}">${t}</button>`).join('')}</div></div>${ui.aba==='realizado'?realizado():projetado()}`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-fx-aba],[data-fx-grupo]');if(!b)return;if(b.dataset.fxAba){ui.aba=b.dataset.fxAba;render()}if(b.dataset.fxGrupo){const g=b.dataset.fxGrupo;ui.abertos.has(g)?ui.abertos.delete(g):ui.abertos.add(g);render()}});
function bind(){const f=$('#fxFut');if(f)f.onchange=()=>{ui.futuras=f.checked;render()};const s=$('[data-fx-meses]');if(s)s.onchange=()=>{ui.meses=Number(s.value);render()}}
addPage('fluxo','cash','Fluxo de caixa',view,'Realizado mês a mês pelo extrato e projetado para 12 semanas: de onde vem e para onde vai o dinheiro.','',bind);
if(navItems.filter(n=>n[0]==='fluxo').length>1)navItems.splice(navItems.map(n=>n[0]).lastIndexOf('fluxo'),1);
})();
