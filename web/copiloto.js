'use strict';
// Copiloto do Início: os números que importam hoje, calculados dos módulos (margem, estoque, repasses,
// notas, atendimento, vendas), cada um levando à tela da ação — e perguntas prontas para a IA.
(()=>{
function insights(){const out=[];const add=(tom,titulo,valor,sub,nav)=>out.push({tom,titulo,valor,sub,nav});
 try{const m=window.Margem?.resumo?.();if(m&&m.pedidos)add(m.prejuizo?'warn':'ok','Pedidos com prejuízo (30 d)',String(m.prejuizo),`${money(m.perda)} de lucro perdido`,'margem')}catch{}
 try{const e=window.Estoque?.avisos?.()||[];const r=e.find(x=>/ruptura/.test(x[2]));if(r)add('bad','Ruptura de estoque',r[2].match(/\d+/)?.[0]||'—','vendendo sem saldo','estoque');const c=e.find(x=>/comprar/.test(x[2]));if(c)add('warn','Comprar agora',c[2].match(/\d+/)?.[0]||'—','abaixo do ponto de pedido','estcompras')}catch{}
 try{const h=new Date().toLocaleDateString('sv-SE'),atras=db.orders.filter(o=>o.due&&o.due<h&&status(o)==='A receber'),v=atras.reduce((s,o)=>s+net(o)-paid(o),0);if(atras.length)add('bad','Repasses atrasados',String(atras.length),`${money(v)} que já deviam ter caído`,'pending')}catch{}
 try{const sem=db.orders.filter(o=>!o.nf&&o.date>=new Date(Date.now()-14*864e5).toLocaleDateString('sv-SE')&&(Date.now()-new Date(o.date+'T12:00:00'))/36e5>36);if(sem.length)add('bad','Pedidos sem nota há +36 h',String(sem.length),'risco de atraso na postagem','faturamento')}catch{}
 try{const a=window.Atendimento?.abertos?.();if(a)add('warn','Atendimentos abertos',String(a),'reclamações, perguntas e mensagens','atendimento')}catch{}
 try{const ini=new Date(Date.now()-7*864e5).toLocaleDateString('sv-SE'),ant=new Date(Date.now()-14*864e5).toLocaleDateString('sv-SE'),v1=db.orders.filter(o=>o.date>=ini).reduce((s,o)=>s+o.gross,0),v0=db.orders.filter(o=>o.date>=ant&&o.date<ini).reduce((s,o)=>s+o.gross,0);if(v0)add(v1>=v0?'ok':'warn','Vendas 7 dias',money(v1),`${v1>=v0?'▲':'▼'} ${Math.abs((v1-v0)/v0*100).toFixed(1).replace('.',',')}% contra a semana anterior`,'dashboard')}catch{}
 return out}
const PERGUNTAS=['Qual foi o resultado do mês até agora e o que mais pesou?','Quais produtos devo comprar esta semana?','Por que a margem do Mercado Livre está menor que a da Shopee?','Quais pendências resolvo primeiro hoje?','Resuma as vendas da última semana por canal.'];
window.Copiloto={html(){const l=insights();if(!l.length)return '';return `<section class="card copiloto"><div class="cardhead"><div><h2>${icon('spark')} Copiloto do dia</h2><p class="caption">O que mais importa agora, calculado dos dados de hoje. Clique para agir.</p></div></div>
 <div class="insights">${l.map(i=>`<button class="card insight" data-nav="${i.nav}"><small>${i.titulo}</small><strong class="${i.tom==='bad'?'red':i.tom==='warn'?'gold':'green'}">${esc(i.valor)}</strong><small>${i.sub}</small></button>`).join('')}</div>
 <div class="chips">${PERGUNTAS.map(p=>`<button class="small" data-copiloto="${esc(p)}">${icon('spark')} ${esc(p)}</button>`).join('')}</div></section>`}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-copiloto]');if(b)window.Assistant?.open?.(b.dataset.copiloto)});
})();
