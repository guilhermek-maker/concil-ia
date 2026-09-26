'use strict';
// Contabilidade automática (partidas dobradas) gerada a partir do que já existe no EcomBalance:
// vendas, tarifas e fretes (pedidos), custo das mercadorias vendidas (itens × custo), notas e títulos
// (competência), extrato bancário (caixa), aplicações e transferências. Saídas: diário, razão, balancete,
// DRE e balanço — por competência — com exportação para o escritório contábil.
// É uma contabilidade GERENCIAL: o escritório continua responsável pela escrituração oficial (ECD/ECF).
(()=>{
Object.assign(paths,{ledger:'M4 4h12l4 4v12H4z M8 10h8 M8 14h8 M8 18h5 M16 4v4h4'});
// ─────────────── Plano de contas ───────────────
const PLANO=[
 ['1','ATIVO','A'],['1.1','Ativo circulante','A'],['1.1.01','Caixa e bancos','A'],['1.1.01.90','Caixa (fundo fixo)','A'],['1.1.01.99','Outras contas próprias','A'],
 ['1.1.02','Aplicações financeiras','A'],['1.1.02.99','Aplicações a identificar','A'],
 ['1.1.03','Marketplaces a receber e carteiras','A'],['1.1.03.01','Mercado Livre / Mercado Pago','A'],['1.1.03.02','Shopee','A'],['1.1.03.03','Magalu','A'],['1.1.03.09','Outros canais','A'],
 ['1.1.04','Estoque de mercadorias','A'],['1.1.09','Pagamentos por outro meio (a identificar)','A'],
 ['1.2','Ativo não circulante — imobilizado','A'],['1.2.01','Veículos','A'],['1.2.02','Máquinas e equipamentos','A'],['1.2.03','Móveis e utensílios','A'],
 ['2','PASSIVO','P'],['2.1','Passivo circulante','P'],['2.1.01','Fornecedores e contas a pagar','P'],['2.1.02','Tributos sobre vendas a recolher','P'],
 ['3','PATRIMÔNIO LÍQUIDO','P'],['3.1','Capital social','P'],['3.1.01','Capital integralizado','P'],['3.9','Saldos de abertura','P'],['3.9.01','Saldos de abertura (implantação)','P'],['3.8','Resultado do período','P'],
 ['4','RECEITAS','R'],['4.1','Receita bruta de vendas','R'],['4.1.01','Vendas Mercado Livre','R'],['4.1.02','Vendas Shopee','R'],['4.1.03','Vendas Magalu','R'],['4.1.09','Vendas outros canais','R'],
 ['4.2','(−) Deduções da receita','R'],['4.2.01','PIS e COFINS','R'],['4.2.02','ICMS e DIFAL (GNRE/DARE)','R'],['4.2.03','Devoluções de vendas','R'],['4.2.04','Tributos sobre vendas (provisão)','R'],
 ['4.3','Receitas financeiras e outras','R'],['4.3.01','Rendimentos de aplicações','R'],['4.3.02','Outras receitas','R'],
 ['5','CUSTOS','D'],['5.1','Custo das vendas','D'],['5.1.01','Custo das mercadorias vendidas (CMV)','D'],['5.1.02','Embalagens','D'],
 ['6','DESPESAS','D'],['6.1','Despesas de venda','D'],['6.1.01','Tarifas de marketplace','D'],['6.1.02','Fretes e logística','D'],['6.1.03','Marketing e anúncios','D'],
 ['6.2','Pessoal','D'],['6.2.01','Salários e encargos','D'],['6.2.02','Pró-labore','D'],
 ['6.3','Administrativas','D'],['6.3.01','Aluguel','D'],['6.3.02','Água, luz e internet','D'],['6.3.03','Contabilidade','D'],['6.3.04','Serviços de terceiros','D'],['6.3.05','Material de uso e consumo','D'],['6.3.06','Sistemas e softwares','D'],['6.3.07','Seguros','D'],['6.3.08','Reembolsos de despesas','D'],
 ['6.4','Impostos e taxas','D'],['6.4.01','Impostos e taxas','D'],['6.5','Despesas financeiras','D'],['6.5.01','Tarifas bancárias','D'],['6.5.02','Juros e multas','D'],['6.8','Tributos sobre o lucro','D'],['6.8.01','IRPJ, CSLL e outros DARF federais','D'],['6.9','Outras despesas','D'],['6.9.01','Outras despesas','D'],
 ['9','CONTAS TRANSITÓRIAS','A'],['9.1','Transitórias','A'],['9.1.01','Movimentos bancários a classificar','A']];
const CAT={'Compra de mercadorias':'1.1.04','Embalagens':'5.1.02','ICMS DIFAL / GNRE':'4.2.02','PIS e COFINS':'4.2.01','Impostos e taxas':'6.4.01','Imobilizado · veículos':'1.2.01','Máquinas e equipamentos':'1.2.02','Móveis e utensílios':'1.2.03',
 'Aluguel':'6.3.01','Pró-labore':'6.2.02','Salários e encargos':'6.2.01','Contabilidade':'6.3.03','Serviços de terceiros':'6.3.04','Material de uso e consumo':'6.3.05','Sistemas e softwares':'6.3.06','Água, luz e internet':'6.3.02','Seguros':'6.3.07',
 'Reembolso de despesas':'6.3.08','Tarifas bancárias':'6.5.01','Empréstimos e juros':'6.5.02','Fretes e logística':'6.1.02','Marketing e anúncios':'6.1.03','Tarifas de marketplace':'6.1.01','Outras despesas':'6.9.01',
 'Aporte de capital':'3.1.01','Aporte de sócios':'3.1.01','Outras receitas':'4.3.02','Rendimentos de aplicações':'4.3.01','Estorno / devolução':'4.3.02','Empréstimo recebido':'2.1.01'};
const contaCat=c=>db.gerencial?.contabil?.mapa?.[c]||CAT[c]||(/icms|difal|gnre/i.test(c||'')?'4.2.02':/tarifa/i.test(c||'')?'6.1.01':/frete/i.test(c||'')?'6.1.02':'6.9.01');
const PLAT={'Mercado Livre':'01','Shopee':'02','Magalu':'03'};const pl=p=>PLAT[p]||'09';

// ─────────────── Tributos sobre vendas (competência) ───────────────
// Provisiona ICMS/DIFAL/PIS/COFINS pela alíquota efetiva do escritório (tributos ÷ receita do balancete do mês);
// sem balancete no mês, usa a última alíquota conhecida. Os pagamentos (GNRE/DARE/DARF de PIS-COFINS) baixam a provisão.
const cfg={provisao:true};try{Object.assign(cfg,JSON.parse(localStorage.getItem('eb_contab')||'{}'))}catch{}
function aliquotas(meses){const out=new Map();let ult=null;for(const m of meses){let r=null;try{const d=window.Gestao?.dreMes?.(m);if(d?.fonte==='balancete'&&d.v?.receita>0)r=-(d.v.impostos||0)/d.v.receita}catch{}if(r!=null&&r>0&&r<0.6){ult={r,m,fonte:'balancete'};out.set(m,ult)}else if(ult)out.set(m,{r:ult.r,m:ult.m,fonte:'estimada'})}return out}
const TRIB=new Set(['ICMS DIFAL / GNRE','PIS e COFINS']);
const provisaoOn=()=>db.gerencial?.contabil?.provisao??cfg.provisao;
const contaTrib=c=>provisaoOn()&&TRIB.has(c)?'2.1.02':contaCat(c);

// ─────────────── Geração do diário ───────────────
let cache=null;let aliqCache=new Map();
function contas(){const m=new Map(PLANO.map(([c,n,t])=>[c,{c,n,t}]));let i=1,j=1;
 for(const a of db.bankAccounts||[]){const cod=a.tipo==='aplicacao'?`1.1.02.${String(j++).padStart(2,'0')}`:`1.1.01.${String(i++).padStart(2,'0')}`;m.set(cod,{c:cod,n:a.nome,t:'A',banco:a.id})}return m}
function diario(){const k=[provisaoOn(),db.gerencial?.contabil?.aliq_efetiva,JSON.stringify(db.gerencial?.contabil?.mapa||{}),db.orders.length,(db.bankTx||[]).length,(db.payables||[]).length,(db.purchases||[]).length,(db.bankAccounts||[]).length,(window.Estoque?.lista?.()||[]).length].join('|');if(cache?.k===k)return cache.v;
 const plano=contas(),banco=new Map([...plano.values()].filter(x=>x.banco).map(x=>[x.banco,x.c])),L=[];
 const lanc=(d,hist,orig,linhas)=>{linhas=linhas.filter(([,v])=>Math.abs(v)>=0.005);if(linhas.length)L.push({d,hist,orig,l:linhas})}; // l: [conta, valor>0 débito / <0 crédito]
 const par=(d,hist,orig,deb,cred,v)=>{v=Math.round(v*100)/100;if(!v)return;if(v<0){[deb,cred]=[cred,deb];v=-v}lanc(d,hist,orig,[[deb,v],[cred,-v]])};
 // Saldos de abertura das contas bancárias e aplicações (na data do saldo inicial).
 const invConta=a=>banco.get(a.id);
 for(const a of db.bankAccounts||[]){if(!a.dataSaldoInicial)continue;const c=banco.get(a.id);
  if(a.tipo==='aplicacao'){// Aplicação: o saldo do extrato já inclui aplicações e rendimentos até a data; separamos o que veio da conta corrente.
   const aplicado=(db.bankTx||[]).filter(t=>t.status==='conciliado'&&t.vinculo?.tipo==='aplicacao'&&t.origem!=='espelho'&&t.data<=a.dataSaldoInicial&&destinoAplic(t,a)).reduce((s,t)=>s-t.valor,0);
   // Tudo que foi aplicado saiu da conta corrente (lançado abaixo); a diferença até o extrato são os rendimentos acumulados.
   par(a.dataSaldoInicial,`Rendimentos acumulados até ${new Date(a.dataSaldoInicial+'T12:00:00').toLocaleDateString('pt-BR')} · ${a.nome} (diferença do extrato)`,{tipo:'rendimento',id:a.id},c,'4.3.01',a.saldoInicial-aplicado)}
  else par(a.dataSaldoInicial,`Saldo de abertura · ${a.nome}`,{tipo:'abertura',id:a.id},c,'3.9.01',a.saldoInicial||0)}
 function destinoAplic(t,a){const d=normalized(t.descricao);if(/cdb/.test(d))return /cdb/.test(normalized(a.nome));if(/mapfre|frerffi|fundo|kinea|actv|^int (aplicacao|resgate)/.test(d))return /fundo|mapfre/.test(normalized(a.nome));return false}
 const aplicDe=t=>{const a=(db.bankAccounts||[]).find(x=>x.tipo==='aplicacao'&&destinoAplic(t,x));return a?banco.get(a.id):'1.1.02.99'};
 // Extrato bancário (regime de caixa das contas bancárias).
 const pagosPeloBanco=new Set();
 for(const t of db.bankTx||[]){if(t.origem==='espelho'||t.status==='ignorado')continue;const c=banco.get(t.contaId);if(!c)continue;const v=t.vinculo||{},h=`${t.descricao}`,o={tipo:'extrato',id:t.id};
  if(t.status!=='conciliado'){par(t.data,h+' (a classificar)',o,c,'9.1.01',t.valor);continue}
  if(v.tipo==='payable'){for(const id of v.ids||[v.id])pagosPeloBanco.add(id);par(t.data,`Pagamento · ${v.desc||h}`,o,c,'2.1.01',t.valor);continue}
  if(v.tipo==='aplicacao'){par(t.data,`${t.valor<0?'Aplicação':'Resgate'} · ${h}`,o,c,aplicDe(t),t.valor);continue}
  if(v.tipo==='transferencia'){const d=normalized((v.desc||'')+' '+h);const outra=/mercado pago|wolfach/.test(d)?'1.1.03.01':/shopee|maree/.test(d)?'1.1.03.02':/magalu/.test(d)?'1.1.03.03':/saque|caixa/.test(d)?'1.1.01.90':'1.1.01.99';par(t.data,v.desc||h,o,c,outra,t.valor);continue}
  // Despesa ou receita direto no extrato.
  if(v.tipo==='despesa'&&String(v.id||'').startsWith('EXT-'))pagosPeloBanco.add(v.id);
  const darf=/darf|receita federal/i.test(h+' '+(v.desc||''))&&/impostos e taxas/i.test(v.categoria||t.categoria||'');
  par(t.data,v.desc||h,o,c,darf?'6.8.01':contaTrib(v.categoria||t.categoria),t.valor)}
 // Títulos (competência): notas de entrada e recorrentes/lançamentos entram em Fornecedores; os criados pelo extrato já estão acima.
 for(const p of db.payables||[]){if(p.status==='cancelado'||p.origem==='extrato')continue;// Recorrentes (aluguel, pró-labore, contador…) são da competência do vencimento, não da data em que foram criados.
  const d=p.origem==='recorrente'?p.vencimento:(p.emissao||p.vencimento);if(!d)continue;const o={tipo:'titulo',id:p.id};
  par(d,`${p.fornecedor||p.descricao}${p.documento?' · doc '+p.documento:''}${p.parcelas>1?` · ${p.parcela}/${p.parcelas}`:''}`,o,contaTrib(p.categoria),'2.1.01',p.valor+(p.juros||0)-(p.desconto||0));
  if(p.status==='pago'&&!pagosPeloBanco.has(p.id)&&p.pagoEm)par(p.pagoEm,`Pagamento sem extrato · ${p.fornecedor||p.descricao}${p.conta?' · '+p.conta:''}`,o,'2.1.01','1.1.09',p.valorPago||p.valor)}
 // Devoluções de clientes (notas de entrada de devolução).
 for(const n of db.purchases||[])if(n.tipo==='devolucao'&&n.emissao&&!/rejeit|cancel|denegad/i.test(n.situacao||''))par(n.emissao,`Devolução de venda · NF ${n.numero||''} · ${n.fornecedor||''}`,{tipo:'nota',id:n.id},'4.2.03','1.1.03.09',n.valor);
 // Vendas: receita bruta, tarifa e frete do vendedor por canal; CMV pelos itens × custo.
 const custo=new Map((db.products||[]).map(p=>[p.id,Number(p.custo)||0]));for(const p of window.Estoque?.lista?.()||[])if(Number(p.custo))custo.set(p.id,Number(p.custo));
 let semCusto=0;
 for(const o of db.orders){const a=`1.1.03.${pl(o.platform)}`,r=`4.1.${pl(o.platform)}`,orig={tipo:'pedido',id:o.id};
  const linhas=[[a,o.gross],[r,-o.gross]];if(o.fee){linhas.push(['6.1.01',o.fee],[a,-o.fee])}// Frete só é custo do vendedor quando vem da API do marketplace; no pedido do Bling é o frete da nota (pago pelo comprador).
  if(o.shipping&&/API/.test(o.source||'')&&!/Bling/.test(o.source||'')){linhas.push(['6.1.02',o.shipping],[a,-o.shipping])}
  lanc(o.date,`Venda ${o.platform} · pedido ${o.id}`,orig,linhas);
  let cmv=0;for(const it of o.items||[]){const c=custo.get(String(it.sku||'').trim());if(c)cmv+=c*(Number(it.qty)||0);else semCusto++}
  if(cmv)par(o.date,`CMV · pedido ${o.id}`,orig,'5.1.01','1.1.04',cmv)}
 if(provisaoOn()){const rec=new Map();for(const o of db.orders){const m=o.date.slice(0,7);rec.set(m,(rec.get(m)||0)+o.gross)}const meses=[...rec.keys()].sort();aliqCache=aliquotas(meses);const fixa=Number(db.gerencial?.contabil?.aliq_efetiva);if(fixa>0)for(const m of meses)aliqCache.set(m,{r:fixa/100,m,fonte:'parametrização'});
  for(const m of meses){const a=aliqCache.get(m);if(!a)continue;par(fim(m),`Tributos sobre vendas de ${m.slice(5)}/${m.slice(0,4)} · ${(a.r*100).toFixed(1).replace('.',',')}% (${a.fonte==='balancete'?'balancete do escritório':'alíquota de '+a.m.slice(5)+'/'+a.m.slice(0,4)})`,{tipo:'provisao',id:m},'4.2.04','2.1.02',rec.get(m)*a.r)}}
 L.sort((a,b)=>a.d.localeCompare(b.d));cache={k,v:{L,plano,semCusto}};return cache.v}

// ─────────────── Saldos ───────────────
function saldos(ate,desde){const {L,plano}=diario(),s=new Map();const add=(c,campo,v)=>{const parts=c.split('.');for(let i=1;i<=parts.length;i++){const k=parts.slice(0,i).join('.');const x=s.get(k)||{ant:0,deb:0,cred:0};x[campo]+=v;s.set(k,x)}};
 for(const e of L){if(e.d>ate)break;for(const [c,v] of e.l){if(desde&&e.d<desde)add(c,'ant',v);else{add(c,v>0?'deb':'cred',Math.abs(v))}}}
 return {s,plano}}
const mesBR=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const natDev=c=>['1','5','6','9'].includes(c[0]);
const fim=m=>{const [y,mm]=m.split('-').map(Number);return new Date(y,mm,0).toLocaleDateString('sv-SE')};
const ui={aba:'balancete',acumulado:false,conta:null,busca:''};
const periodo=()=>{const ini=ui.acumulado?month.slice(0,4)+'-01-01':month+'-01';return {ini,fim:fim(month)}};
const valorNat=(c,x)=>natDev(c)?x:-x;
const mf=v=>{v=Math.abs(v)<0.005?0:v;return `<span class="${v<0?'red':''}">${money(v)}</span>`};

function balancete(){const {ini,fim:f}=periodo(),{s,plano}=saldos(f,ini);
 const cods=[...s.keys()].filter(c=>plano.has(c)||c.split('.').length<=2).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const tot={deb:0,cred:0};for(const [c,x] of s)if(!c.includes('.')){tot.deb+=x.deb;tot.cred+=x.cred}
 return `<div class="tablebox"><div class="tabletop"><div><h2>Balancete · ${ui.acumulado?'acumulado de '+month.slice(0,4):mesBR(month)}</h2><p class="caption">Débitos ${money(tot.deb)} = créditos ${money(tot.cred)} ${Math.abs(tot.deb-tot.cred)<0.05?'<span class="badge ok">fechado</span>':'<span class="badge bad">diferença '+money(tot.deb-tot.cred)+'</span>'}</p></div><button class="small" data-ct-csv="balancete">${icon('download')} Exportar</button></div>
 <div class="tablewrap"><table class="ctb"><thead><tr><th>Conta</th><th class="num">Saldo anterior</th><th class="num">Débitos</th><th class="num">Créditos</th><th class="num">Saldo atual</th></tr></thead><tbody>
 ${cods.map(c=>{const x=s.get(c),n=plano.get(c)?.n||c,nivel=c.split('.').length,ant=valorNat(c,x.ant),atual=valorNat(c,x.ant+x.deb-x.cred);if(!x.ant&&!x.deb&&!x.cred)return '';
  return `<tr class="${nivel<=2?'ctbgrupo':'clickrow'} n${nivel}" ${nivel>2?`data-ct-conta="${c}"`:''}><td><span class="mono caption">${c}</span> ${esc(n)}</td><td class="num">${mf(ant)}</td><td class="num">${money(x.deb)}</td><td class="num">${money(x.cred)}</td><td class="num"><strong>${mf(atual)}</strong></td></tr>`}).join('')}</tbody></table></div></div>`}

function dre(){const {ini,fim:f}=periodo(),{s}=saldos(f,ini),mov=c=>{const x=s.get(c);return x?x.deb-x.cred:0};
 const rb=-mov('4.1'),ded=mov('4.2'),rl=rb-ded,cmv=mov('5.1'),lb=rl-cmv,dv=mov('6.1'),pes=mov('6.2'),adm=mov('6.3'),imp=mov('6.4'),out=mov('6.9'),ebitda=lb-dv-pes-adm-imp-out,fin=-mov('4.3')-mov('6.5'),ir=mov('6.8'),res=ebitda+fin-ir;
 const pc=v=>rb?`<span class="caption">${(v/rb*100).toFixed(1).replace('.',',')}%</span>`:'';
 const l=(t,v,cls='',c='')=>`<tr class="${cls}" ${c?`data-ct-conta="${c}"`:''}><td>${t}</td><td class="num">${mf(v)}</td><td class="num">${pc(v)}</td></tr>`;
 return `<div class="grid two"><div class="tablebox"><div class="tabletop"><div><h2>DRE · ${ui.acumulado?'acumulado de '+month.slice(0,4):mesBR(month)}</h2><p class="caption">Gerada pelos lançamentos automáticos. Clique numa linha para ver o razão.</p></div></div><div class="tablewrap"><table class="ctb"><tbody>
 ${l('Receita bruta de vendas',rb,'ctbgrupo')}${l('Mercado Livre',-mov('4.1.01'),'n3 clickrow','4.1.01')}${l('Shopee',-mov('4.1.02'),'n3 clickrow','4.1.02')}${l('Magalu',-mov('4.1.03'),'n3 clickrow','4.1.03')}${l('Outros canais',-mov('4.1.09'),'n3 clickrow','4.1.09')}
 ${l('(−) Deduções (ICMS/DIFAL, PIS/COFINS, devoluções)',-ded,'n3')}${l('Receita líquida',rl,'ctbgrupo')}
 ${l('(−) CMV',-mov('5.1.01'),'n3 clickrow','5.1.01')}${l('(−) Embalagens',-mov('5.1.02'),'n3 clickrow','5.1.02')}${l('Lucro bruto',lb,'ctbgrupo')}
 ${l('(−) Tarifas de marketplace',-mov('6.1.01'),'n3 clickrow','6.1.01')}${l('(−) Fretes',-mov('6.1.02'),'n3 clickrow','6.1.02')}${l('(−) Marketing',-mov('6.1.03'),'n3 clickrow','6.1.03')}${l('(−) Pessoal',-pes,'n3')}${l('(−) Administrativas',-adm,'n3')}${l('(−) Impostos e taxas',-imp,'n3')}${l('(−) Outras',-out,'n3')}
 ${l('Resultado operacional',ebitda,'ctbgrupo')}${l('Resultado financeiro',fin,'n3')}${l('(−) IRPJ, CSLL e DARF federais',-ir,'n3 clickrow','6.8.01')}${l('Resultado do período',res,'ctbgrupo ctbfinal')}</tbody></table></div></div>
 <div class="card"><h2>Como ler</h2><label class="check-l"><input type="checkbox" class="check" id="ctProv" ${cfg.provisao?'checked':''}> Tributos sobre vendas por competência (provisão pela alíquota efetiva do escritório${aliqCache.get(month)?': '+(aliqCache.get(month).r*100).toFixed(1).replace('.',',')+'%':''})</label><p class="caption">Desligado, os tributos entram só quando são pagos (GNRE/DARE).</p><p class="caption" style="line-height:1.8">A DRE sai direto do diário: vendas e tarifas pelos pedidos, CMV pelos itens vendidos × custo do produto (Bling/Tabela de preços), notas e títulos pela data de emissão, e o que foi pago direto no banco (GNRE, aluguel, pró-labore…) pela data do extrato.<br><br>Compare com a <button class="small quiet" data-nav="contabil">DRE do escritório</button> para achar diferenças de classificação ou de data.${diario().semCusto?`<br><br><span class="gold">${diario().semCusto} item(ns) vendido(s) sem custo cadastrado — o CMV fica subestimado. Cadastre o custo em Estoque ou na Tabela de preços.</span>`:''}</p></div></div>`}

function balanco(){const {fim:f}=periodo(),{s}=saldos(f),sal=c=>{const x=s.get(c);return x?x.deb-x.cred:0};
 const res=-(sal('4')+sal('5')+sal('6'));const ativo=sal('1')+sal('9'),passivo=-sal('2'),pl=-sal('3')+res;
 const l=(t,v,cls='',c='')=>`<tr class="${cls}" ${c?`data-ct-conta="${c}"`:''}><td>${t}</td><td class="num">${mf(v)}</td></tr>`;
 const {plano}=diario(),filhos=p=>[...plano.keys()].filter(c=>c.startsWith(p+'.')&&c.split('.').length===p.split('.').length+1&&Math.abs(sal(c))>=0.01);
 const bloco=(p,sinal=1)=>filhos(p).map(c=>{const sub=filhos(c);return l(`<span class="mono caption">${c}</span> ${esc(plano.get(c)?.n||c)}`,sinal*sal(c),sub.length?'n2':'n3 clickrow',sub.length?'':c)+sub.map(x=>l(`<span class="mono caption">${x}</span> ${esc(plano.get(x)?.n||x)}`,sinal*sal(x),'n3 clickrow',x)).join('')}).join('');
 return `<div class="grid two"><div class="tablebox"><div class="tabletop"><h2>Ativo em ${new Date(f+'T12:00:00').toLocaleDateString('pt-BR')}</h2></div><div class="tablewrap"><table class="ctb"><tbody>${bloco('1')}${Math.abs(sal('9'))>=0.01?bloco('9'):''}${l('Total do ativo',ativo,'ctbgrupo ctbfinal')}</tbody></table></div></div>
 <div class="tablebox"><div class="tabletop"><h2>Passivo e patrimônio líquido</h2></div><div class="tablewrap"><table class="ctb"><tbody>${bloco('2',-1)}${l('Total do passivo',passivo,'ctbgrupo')}${bloco('3',-1)}${l('Resultado acumulado (não distribuído)',res,'n3')}${l('Total do patrimônio líquido',pl,'ctbgrupo')}${l('Passivo + PL',passivo+pl,'ctbgrupo ctbfinal')}</tbody></table></div>
 <p class="caption" style="padding:0 18px 16px">${Math.abs(ativo-passivo-pl)<0.05?'✓ Ativo = Passivo + PL':`<span class="red">Diferença ${money(ativo-passivo-pl)}</span>`}</p></div></div>`}

function diarioView(){const {ini,fim:f}=periodo(),{L,plano}=diario(),q=normalized(ui.busca);const l=L.filter(e=>e.d>=ini&&e.d<=f&&(!q||normalized(e.hist).includes(q)));
 return `<div class="crmbar"><div class="searchin">${icon('search')}<input type="search" id="ctBusca" placeholder="Histórico, pedido, fornecedor…" value="${esc(ui.busca)}"></div><button class="small" data-ct-csv="diario">${icon('download')} Exportar diário (CSV para o escritório)</button></div>
 <div class="tablebox"><div class="tabletop"><h2>${l.length.toLocaleString('pt-BR')} lançamento(s)</h2></div><div class="tablewrap"><table><thead><tr><th>Data</th><th>Histórico</th><th>Conta</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead><tbody>
 ${l.slice(0,400).map(e=>e.l.map(([c,v],i)=>`<tr class="${i?'':'ctbnovo'}"><td>${i?'':new Date(e.d+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>${i?'':esc(e.hist)}</td><td><span class="mono caption">${c}</span> ${esc(plano.get(c)?.n||'')}</td><td class="num">${v>0?money(v):''}</td><td class="num">${v<0?money(-v):''}</td></tr>`).join('')).join('')}</tbody></table></div>${l.length>400?'<p class="caption" style="padding:10px 18px">Mostrando os 400 primeiros — use a busca ou exporte.</p>':''}</div>`}

function razao(c){const {L,plano}=diario(),{ini,fim:f}=periodo();let saldo=0;const linhas=[];
 for(const e of L){if(e.d>f)break;for(const [cc,v] of e.l){if(cc!==c&&!cc.startsWith(c+'.'))continue;if(e.d<ini){saldo+=v;continue}linhas.push({e,v})}}
 const ant=saldo;const rows=linhas.map(({e,v})=>{saldo+=v;return `<tr><td>${new Date(e.d+'T12:00:00').toLocaleDateString('pt-BR')}</td><td>${esc(e.hist)}</td><td class="num">${v>0?money(v):''}</td><td class="num">${v<0?money(-v):''}</td><td class="num">${mf(valorNat(c,saldo))}</td></tr>`});
 modal(`Razão · ${c} ${plano.get(c)?.n||''}`,`<p class="caption">${ui.acumulado?'Acumulado de '+month.slice(0,4):mesBR(month)} · saldo anterior ${money(valorNat(c,ant))} · saldo final ${money(valorNat(c,saldo))} · ${linhas.length} lançamento(s)</p>
 <div class="tablewrap" style="max-height:60vh"><table><thead><tr><th>Data</th><th>Histórico</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead><tbody>${rows.slice(-1500).join('')||'<tr><td colspan="5" class="empty">Sem lançamentos no período.</td></tr>'}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Fechar</button></div>`)}

// Conferência: DRE automática × DRE do balancete do escritório, mês a mês, com a diferença de cada linha.
function conferencia(){const meses=[...new Set(db.orders.map(o=>o.date.slice(0,7)))].sort().slice(-7).filter(m=>m<=new Date().toISOString().slice(0,7));
 const aut=m=>{const [y,mm]=m.split('-').map(Number),{s}=saldos(new Date(y,mm,0).toLocaleDateString('sv-SE'),m+'-01'),mv=c=>{const x=s.get(c);return x?x.deb-x.cred:0};const rb=-mv('4.1'),ded=mv('4.2'),cmv=mv('5.1'),com=mv('6.1'),out=mv('6.2')+mv('6.3')+mv('6.4')+mv('6.9');return {rb,ded,cmv,com,out,op:rb-ded-cmv-com-out}};
 const esc_=m=>{try{const d=window.Gestao?.dreMes?.(m);if(d?.fonte!=='balancete')return null;const v=d.v;return {rb:v.receita||0,ded:-(v.impostos||0)-(v.devolucoes||0),cmv:-(v.cmv||0),com:-(v.comerciais||0),out:-(v.trabalhistas||0)-(v.administrativas||0)-(v.outras||0),op:v['=ebitda']||0}}catch{return null}};
 const L=[['rb','Receita bruta'],['ded','Deduções e tributos'],['cmv','CMV'],['com','Despesas comerciais (tarifas, fretes, marketing)'],['out','Demais despesas operacionais'],['op','Resultado operacional (EBITDA)']];
 const cols=meses.map(m=>({m,a:aut(m),e:esc_(m)}));
 return `<div class="notice">Mesma operação, duas visões: a <strong>automática</strong> (pedido a pedido, tarifa real de cada venda, CMV pelo custo do produto) e a do <strong>escritório</strong> (balancete importado em Resultado › DRE do escritório). Diferenças grandes indicam lançamento em outro mês, tarifa contabilizada por nota de serviço, custo médio diferente ou conta classificada em outra linha — bons temas para a conversa com a Escoben.</div>
 <div class="tablebox"><div class="tablewrap"><table class="ctb"><thead><tr><th>Linha</th>${cols.map(c=>`<th class="num">${new Date(c.m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})}</th>`).join('')}</tr></thead><tbody>
 ${L.map(([k,t])=>`<tr class="ctbgrupo"><td>${t}</td>${cols.map(()=>'<td></td>').join('')}</tr>
  <tr class="n3"><td>Automática</td>${cols.map(c=>`<td class="num">${money(c.a[k])}</td>`).join('')}</tr>
  <tr class="n3"><td>Escritório</td>${cols.map(c=>`<td class="num">${c.e?money(c.e[k]):'<span class="caption">sem balancete</span>'}</td>`).join('')}</tr>
  <tr class="n3"><td>Diferença</td>${cols.map(c=>{if(!c.e)return '<td></td>';const d=c.a[k]-c.e[k],rel=Math.abs(c.e[k])>1?Math.abs(d/c.e[k]):0;return `<td class="num"><span class="${rel>0.1?'red':rel>0.03?'gold':'green'}">${money(d)}</span>${Math.abs(c.e[k])>1?`<br><span class="caption">${(d/c.e[k]*100).toFixed(1).replace('.',',')}%</span>`:''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div></div>`}
function view(){const abas=[['balancete','Balancete'],['dre','DRE'],['balanco','Balanço'],['conferencia','Conferência com o escritório'],['diario','Diário'],['plano','Plano de contas']];
 const {L}=diario();
 return `<div class="notice"><strong>Contabilidade automática.</strong> ${L.length.toLocaleString('pt-BR')} lançamentos em partidas dobradas gerados a partir de vendas, tarifas, CMV, notas, títulos e extrato — sem digitação. É a visão gerencial do EcomBalance; a escrituração oficial continua com o escritório (exporte o diário para ele).</div>
 <div class="crmbar"><div class="segtabs">${abas.map(([k,t])=>`<button class="${ui.aba===k?'active':''}" data-ct-aba="${k}">${t}</button>`).join('')}</div><label class="check-l" style="margin:0"><input type="checkbox" class="check" id="ctAcum" ${ui.acumulado?'checked':''}> Acumulado no ano</label></div>
 ${ui.aba==='balancete'?balancete():ui.aba==='dre'?dre():ui.aba==='balanco'?balanco():ui.aba==='conferencia'?conferencia():ui.aba==='diario'?diarioView():planoView()}`}
function planoView(){const {plano}=diario(),inv={};for(const [k,c] of Object.entries(CAT))(inv[c]=inv[c]||[]).push(k);
 return `<div class="tablebox"><div class="tabletop"><div><h2>Plano de contas</h2><p class="caption">Estruturado para e-commerce. As categorias do financeiro caem nas contas indicadas.</p></div></div><div class="tablewrap"><table><thead><tr><th>Código</th><th>Conta</th><th>Categorias do EcomBalance</th></tr></thead><tbody>
 ${[...plano.values()].sort((a,b)=>a.c.localeCompare(b.c,undefined,{numeric:true})).map(x=>`<tr class="${x.c.split('.').length<=2?'ctbgrupo':''}"><td class="mono">${x.c}</td><td>${esc(x.n)}</td><td class="caption">${esc((inv[x.c]||[]).join(', '))}</td></tr>`).join('')}</tbody></table></div></div>`}
function csv(tipo){const {ini,fim:f}=periodo();let cab,linhas;
 if(tipo==='diario'){const {L,plano}=diario();cab=['data','lote','historico','conta','nome_conta','debito','credito'];linhas=[];let n=0;for(const e of L){if(e.d<ini||e.d>f)continue;n++;for(const [c,v] of e.l)linhas.push([e.d,n,e.hist,c,plano.get(c)?.n||'',v>0?v.toFixed(2).replace('.',','):'',v<0?(-v).toFixed(2).replace('.',','):''])}}
 else{const {s,plano}=saldos(f,ini);cab=['conta','nome','saldo_anterior','debitos','creditos','saldo_atual'];linhas=[...s.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(c=>{const x=s.get(c);return [c,plano.get(c)?.n||c,valorNat(c,x.ant).toFixed(2).replace('.',','),x.deb.toFixed(2).replace('.',','),x.cred.toFixed(2).replace('.',','),valorNat(c,x.ant+x.deb-x.cred).toFixed(2).replace('.',',')]})}
 const txt=[cab,...linhas].map(l=>l.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+txt],{type:'text/csv'}));a.download=`${tipo}-${ini}-a-${f}.csv`;a.click()}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ct-aba],[data-ct-conta],[data-ct-csv]');if(!b)return;const d=b.dataset;if(d.ctAba){ui.aba=d.ctAba;render()}if(d.ctConta)razao(d.ctConta);if(d.ctCsv)csv(d.ctCsv)});
function bind(){const pv=$('#ctProv');if(pv)pv.onchange=()=>{cfg.provisao=pv.checked;try{localStorage.setItem('eb_contab',JSON.stringify(cfg))}catch{}cache=null;render()};const a=$('#ctAcum');if(a)a.onchange=()=>{ui.acumulado=a.checked;render()};const i=$('#ctBusca');if(i)i.oninput=e=>{ui.busca=e.target.value;const pos=e.target.selectionStart;render();const n=$('#ctBusca');n.focus();n.setSelectionRange(pos,pos)}}
addPage('contabauto','ledger','Contabilidade automática',view,'Diário, razão, balancete, DRE e balanço em partidas dobradas, gerados sozinhos a partir da operação.','',bind);
window.Contab={diario,saldos,plano:()=>[...contas().values()],mapaCategorias:()=>({...CAT})};
})();
