'use strict';
// Faturamento: pedidos pagos que ainda não têm nota fiscal (com idade e prazo de postagem em risco),
// ritmo de emissão por dia e canal, e o checklist para ligar a emissão automática de NF-e no EcomBalance
// (hoje a nota sai pelo Bling; o monitor funciona com qualquer emissor).
(()=>{
Object.assign(paths,{receipt:paths.receipt||'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6'});
const ui={canal:'',dias:14};
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const menos=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toLocaleDateString('sv-SE')};
const idadeH=d=>(Date.now()-new Date(d+'T12:00:00'))/3600e3;
function view(){const ini=menos(ui.dias),l=db.orders.filter(o=>o.date>=ini&&(!ui.canal||o.platform===ui.canal));
 const semNf=l.filter(o=>!o.nf).sort((a,b)=>a.date.localeCompare(b.date)),atras=semNf.filter(o=>idadeH(o.date)>36),comNf=l.filter(o=>o.nf);
 const canais=[...new Set(db.orders.map(o=>o.platform))].sort();
 const dias=[...Array(ui.dias)].map((_,i)=>menos(ui.dias-1-i)),por=new Map(dias.map(d=>[d,{t:0,nf:0}]));for(const o of l){const x=por.get(o.date);if(x){x.t++;if(o.nf)x.nf++}}
 const max=Math.max(1,...[...por.values()].map(x=>x.t)),W=720,H=150,bw=W/dias.length;
 const pct=l.length?comNf.length/l.length*100:100;
 return `<div class="grid kpis4"><div class="card kpi"><span class="kpil">Pedidos sem nota</span><span class="kpiv ${semNf.length?'gold':''}">${semNf.length}</span><span class="kpis">${money(semNf.reduce((s,o)=>s+o.gross,0))}</span></div><div class="card kpi"><span class="kpil">Atrasados (+36 h)</span><span class="kpiv ${atras.length?'red':''}">${atras.length}</span><span class="kpis">Risco de atraso na postagem</span></div><div class="card kpi"><span class="kpil">Faturados no período</span><span class="kpiv green">${pct.toFixed(1).replace('.',',')}%</span><span class="kpis">${comNf.length.toLocaleString('pt-BR')} de ${l.length.toLocaleString('pt-BR')} pedidos</span></div><div class="card kpi"><span class="kpil">Emissor atual</span><span class="kpiv">Bling</span><span class="kpis">EcomBalance pronto para assumir</span></div></div>
 <div class="crmbar"><div class="segtabs">${[['','Todos'],...canais.map(c=>[c,c])].map(([k,t])=>`<button class="${ui.canal===k?'active':''}" data-fat-canal="${esc(k)}">${esc(t)}</button>`).join('')}</div><select data-fat-dias aria-label="Período">${[7,14,30,60].map(n=>`<option value="${n}" ${ui.dias===n?'selected':''}>Últimos ${n} dias</option>`).join('')}</select></div>
 <div class="grid central2"><section class="card"><div class="cardhead"><div><h2>Pedidos e notas por dia</h2><p class="caption">Barra cheia = pedidos; parte destacada = já faturados.</p></div></div>
  <svg viewBox="0 0 ${W} ${H+20}" class="fatchart" role="img" aria-label="Pedidos e notas por dia">${dias.map((d,i)=>{const x=por.get(d),h1=x.t/max*H,h2=x.nf/max*H;return `<rect x="${i*bw+bw*.15}" y="${H-h1}" width="${bw*.7}" height="${h1}" rx="3" class="fb"><title>${new Date(d+'T12:00:00').toLocaleDateString('pt-BR')}: ${x.t} pedidos, ${x.nf} com nota</title></rect><rect x="${i*bw+bw*.15}" y="${H-h2}" width="${bw*.7}" height="${h2}" rx="3" class="fn"/>${i%Math.ceil(dias.length/7)===0?`<text x="${i*bw+2}" y="${H+15}">${d.slice(8,10)}/${d.slice(5,7)}</text>`:''}`}).join('')}</svg></section>
 <section class="card"><div class="cardhead"><h2>Emissão automática de NF-e</h2><span class="badge warn">a configurar</span></div>
  <p class="caption" style="line-height:1.7">Para o EcomBalance emitir a nota sozinho quando o pedido é pago (e já anexar no marketplace), falta:</p>
  <div class="checklist">${[['Certificado digital A1 da Wolfach','arquivo .pfx e senha, cadastrado pelo dono no provedor fiscal'],['Conta num provedor homologado','Focus NFe, PlugNotas ou NFE.io — emite e transmite à SEFAZ'],['Regras fiscais revisadas com a Escoben','CFOP por UF, ICMS/DIFAL, PIS/COFINS, CST — hoje estão no Bling'],['NCM e origem em todos os produtos',`${(window.Estoque?.lista?.()||[]).length||'—'} produtos no cadastro`],['Série e numeração próprias','para não colidir com a numeração do Bling durante a transição']].map(([t,s])=>`<div class="chk"><span class="avico warn">${icon('alert')}</span><div><strong>${t}</strong><small>${s}</small></div></div>`).join('')}</div>
  <p class="caption">Enquanto isso, o monitor ao lado vale para as notas emitidas pelo Bling.</p></section></div>
 <div class="tablebox"><div class="tabletop"><div><h2>Aguardando nota fiscal</h2><p class="caption">Mais antigos primeiro. Pedido pago sem nota há mais de 36 h costuma estourar o prazo de postagem.</p></div></div><div class="tablewrap"><table><thead><tr><th>Pedido</th><th>Canal</th><th>Data</th><th>Há</th><th>Itens</th><th class="num">Valor</th></tr></thead><tbody>
 ${semNf.slice(0,300).map(o=>{const h=idadeH(o.date);return `<tr class="clickrow" data-order="${esc(o.id)}"><td class="mono">${esc(o.id)}</td><td>${esc(o.platform)}</td><td>${new Date(o.date+'T12:00:00').toLocaleDateString('pt-BR')}</td><td><span class="badge ${h>36?'bad':h>24?'warn':''}">${h<24?'hoje':Math.floor(h/24)+' d'}</span></td><td class="caption">${esc((o.items||[]).map(i=>`${i.qty}× ${i.title||i.sku}`).join(' · ').slice(0,90))}</td><td class="num">${money(o.gross)}</td></tr>`}).join('')||'<tr><td colspan="6" class="empty">Todos os pedidos do período já têm nota. ✓</td></tr>'}</tbody></table></div></div>`}
document.addEventListener('click',e=>{const b=e.target.closest('[data-fat-canal]');if(b){ui.canal=b.dataset.fatCanal;render()}});
function bind(){const s=$('[data-fat-dias]');if(s)s.onchange=()=>{ui.dias=Number(s.value);render()}}
addPage('faturamento','receipt','Faturamento',view,'Pedidos pagos sem nota fiscal, ritmo de emissão por dia e o caminho para a NF-e automática.','',bind);
window.Faturamento={avisos:()=>{const l=db.orders.filter(o=>!o.nf&&o.date>=menos(14)&&idadeH(o.date)>36);return l.length?[['bad','receipt',`${l.length} pedido(s) sem nota há mais de 36 h`,'Risco de atraso na postagem','faturamento']]:[]}};
})();
