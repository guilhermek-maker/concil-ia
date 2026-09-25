'use strict';
// Tesouraria: contas bancárias e carteiras, importação de extratos (OFX ou planilha) e conciliação bancária
// — cada movimento do banco é ligado a um título a pagar, a uma transferência entre contas, a um rendimento
// ou vira uma despesa lançada. Pagamentos confirmados pelo extrato dão baixa no título.
(()=>{
Object.assign(paths,{
 bank:'M3 10 12 4l9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18',
 swap:'M7 4 3 8l4 4 M3 8h14 M17 20l4-4-4-4 M21 16H7'
});
const A=()=>db.bankAccounts||(db.bankAccounts=[]);
const T=()=>db.bankTx||(db.bankTx=[]);
const dataBR=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const dias=(a,b)=>Math.abs(Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/864e5));
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const BANCOS={'001':'Banco do Brasil','033':'Santander','077':'Inter','104':'Caixa','208':'BTG Pactual','237':'Bradesco','260':'Nubank','323':'Mercado Pago','336':'C6 Bank','341':'Itaú','380':'PicPay','422':'Safra','748':'Sicredi','756':'Sicoob','0341':'Itaú'};
const TIPOS={corrente:'Conta corrente',aplicacao:'Aplicação',carteira:'Carteira de marketplace',caixa:'Caixa'};
const ui={conta:'',filtro:'pendentes',sel:null};

// ─────────────── Saldos ───────────────
// Saldo = saldo inicial (na data informada) + movimentos depois dela.
function saldoConta(a,ate){const ini=a.dataSaldoInicial||'0000-00-00';return round((a.saldoInicial||0)+T().filter(t=>t.contaId===a.id&&t.data>ini&&(!ate||t.data<=ate)).reduce((s,t)=>s+t.valor,0))}
function saldos(){const contas=A().filter(a=>a.ativo!==false).map(a=>({...a,saldo:saldoConta(a),pend:T().filter(t=>t.contaId===a.id&&t.status==='pendente').length}));return {contas,total:round(contas.reduce((s,a)=>s+a.saldo,0)),pendentes:contas.reduce((s,a)=>s+a.pend,0)}}

// ─────────────── Leitura de extratos ───────────────
function decodificar(buf){let s=new TextDecoder('utf-8').decode(buf);if(s.includes('�'))s=new TextDecoder('windows-1252').decode(buf);return s}
function numOFX(v){v=String(v||'').trim();if(v.includes(',')&&!v.includes('.'))v=v.replace(',','.');else if(v.includes(',')&&v.includes('.'))v=v.replace(/\./g,'').replace(',','.');return round(Number(v)||0)}
const dataOFX=v=>{const m=String(v||'').match(/^(\d{4})(\d{2})(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:''};
function parseOFX(txt){const tag=(s,t)=>{const m=s.match(new RegExp('<'+t+'>\\s*([^<\\r\\n]*)','i'));return m?m[1].trim():''};
 const lb=(txt.split(/<LEDGERBAL>/i)[1]||'').split(/<\/LEDGERBAL>/i)[0];
 const movs=txt.split(/<STMTTRN>/i).slice(1).map(b=>b.split(/<\/STMTTRN>/i)[0]).map(b=>({data:dataOFX(tag(b,'DTPOSTED')),valor:numOFX(tag(b,'TRNAMT')),fitid:tag(b,'FITID'),documento:tag(b,'CHECKNUM')||tag(b,'REFNUM'),descricao:[tag(b,'NAME'),tag(b,'MEMO')].filter((x,i,a)=>x&&a.indexOf(x)===i).join(' · ')||tag(b,'TRNTYPE')})).filter(m=>m.data&&m.valor);
 const banco=tag(txt,'BANKID').replace(/^0+(?=\d{3})/,''),conta=tag(txt,'ACCTID');
 return {banco,agencia:tag(txt,'BRANCHID'),conta,saldo:lb?numOFX(tag(lb,'BALAMT')):null,dataSaldo:lb?dataOFX(tag(lb,'DTASOF')):null,inicio:dataOFX(tag(txt,'DTSTART')),fim:dataOFX(tag(txt,'DTEND')),movs}}
const idMov=(conta,m)=>`${conta}-${m.fitid||`${m.data}-${m.valor}-${normalized(m.descricao).slice(0,40)}`}`.replace(/\s+/g,'_');
const soDig=s=>String(s||'').replace(/\D/g,'').replace(/^0+/,'');
function contaDoExtrato(x){return A().find(a=>soDig(a.conta)&&soDig(a.conta)===soDig(x.conta)&&(!a.banco||!x.banco||soDig(a.banco)===soDig(x.banco)))}

async function importarArquivos(files){files=[...files];if(!files.length)return;const lidos=[];
 for(const f of files){if(/\.(csv|xlsx?|ods|txt)$/i.test(f.name)&&!/\.ofx$/i.test(f.name)){planilha(f);return}
  try{const x=parseOFX(decodificar(await f.arrayBuffer()));x.arquivo=f.name;x.contaExistente=contaDoExtrato(x);lidos.push(x)}catch(e){lidos.push({arquivo:f.name,erro:e.message,movs:[]})}}
 modal('Extratos lidos',`<div class="notice">Cada arquivo entra na conta indicada. Movimentos que já estavam importados são ignorados (o banco identifica cada um).</div>
 ${lidos.map((x,i)=>x.erro||!x.movs.length?`<div class="listline"><span>${esc(x.arquivo)}</span><strong class="red">${esc(x.erro||'Nenhum movimento encontrado.')}</strong></div>`:`<div class="card" style="margin-bottom:10px"><div class="cardhead"><div><h2>${esc(x.arquivo)}</h2><p class="caption">${esc(BANCOS[x.banco]||('Banco '+x.banco))} · ag. ${esc(x.agencia||'—')} · conta ${esc(x.conta||'—')} · ${dataBR(x.inicio)} a ${dataBR(x.fim)} · ${x.movs.length} movimentos${x.saldo!=null?` · saldo do banco ${money(x.saldo)} em ${dataBR(x.dataSaldo)}`:''}</p></div></div>
  <label for="exConta${i}">Conta</label><select id="exConta${i}" data-ex-conta="${i}" style="width:100%">${A().map(a=>`<option value="${esc(a.id)}" ${x.contaExistente?.id===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}<option value="__nova" ${x.contaExistente?'':'selected'}>+ Criar conta: ${esc(BANCOS[x.banco]||'Banco '+x.banco)} ${esc(x.conta||'')}</option></select></div>`).join('')}
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" id="exOk" ${lidos.some(x=>x.movs.length)?'':'disabled'}>${icon('check')} Importar e conciliar</button></div>`);
 $('#exOk').onclick=()=>{let novos=0,dup=0;for(const [i,x] of lidos.entries()){if(!x.movs.length)continue;let id=$(`#exConta${i}`).value,a=A().find(c=>c.id===id);
   if(!a){a={id:uid(),nome:`${BANCOS[x.banco]||'Banco '+x.banco}${x.conta?' · '+x.conta:''}`,banco:x.banco,agencia:x.agencia,conta:x.conta,tipo:'corrente',saldoInicial:0,dataSaldoInicial:null,ativo:true};A().push(a)}
   const ids=new Set(T().map(t=>t.id));for(const m of x.movs){const tid=idMov(a.id,m);if(ids.has(tid)){dup++;continue}ids.add(tid);T().push({id:tid,contaId:a.id,data:m.data,descricao:m.descricao,documento:m.documento||'',valor:m.valor,fitid:m.fitid||null,origem:'ofx',status:'pendente',vinculo:null,categoria:'',arquivo:x.arquivo});novos++}
   if(x.saldo!=null){a.saldoExtrato=x.saldo;a.dataSaldoExtrato=x.dataSaldo;
    // Sem saldo inicial: calcula o de antes do primeiro movimento para o saldo bater com o banco.
    if(!a.dataSaldoInicial){const movs=T().filter(t=>t.contaId===a.id),primeiro=movs.reduce((m,t)=>t.data<m?t.data:m,'9999');const d=new Date(primeiro+'T12:00:00');d.setDate(d.getDate()-1);a.dataSaldoInicial=d.toLocaleDateString('sv-SE');a.saldoInicial=round(x.saldo-movs.filter(t=>t.data<=x.dataSaldo).reduce((s,t)=>s+t.valor,0))}}}
  audit('Extrato importado',`${lidos.map(x=>x.arquivo).join(', ')} · ${novos} movimentos novos${dup?` · ${dup} já existiam`:''}`);closeModal();ui.filtro='pendentes';navigate('concbanco');toast(`${novos} movimento(s) importado(s).${dup?` ${dup} já estavam no sistema.`:''}`)}}

function planilha(f){if(!A().length)return toast('Cadastre a conta bancária antes de importar uma planilha de extrato.');
 modal('Extrato em planilha',`<p>Para qual conta é este extrato?</p><select id="plConta" style="width:100%">${A().map(a=>`<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('')}</select><div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" id="plOk">Continuar</button></div>`);
 $('#plOk').onclick=()=>{const conta=$('#plConta').value;closeModal();TableImport.open({title:'Importar extrato',file:f,hint:'Uma linha por movimento. Use a coluna Valor (negativo = saída) ou as colunas Débito e Crédito.',
  fields:[{key:'data',label:'Data',required:true,aliases:['data','data lancamento','dt','data movimento']},{key:'descricao',label:'Descrição',required:true,aliases:['descricao','historico','lancamento','detalhe']},{key:'documento',label:'Documento',aliases:['documento','doc','numero']},{key:'valor',label:'Valor',aliases:['valor','valor r$','montante']},{key:'debito',label:'Débito',aliases:['debito','saida','saidas']},{key:'credito',label:'Crédito',aliases:['credito','entrada','entradas']}],
  confirmLabel:'Importar movimentos',onConfirm(rows,meta){const ids=new Set(T().map(t=>t.id));let n=0;for(const r of rows){const data=TableImport.date(r.data);let v=r.valor!=null&&r.valor!==''?TableImport.num(r.valor):TableImport.num(r.credito)-Math.abs(TableImport.num(r.debito));if(!data||!v)continue;const m={data,valor:round(v),descricao:String(r.descricao||'').trim(),documento:r.documento||''};const id=idMov(conta,m);if(ids.has(id))continue;ids.add(id);T().push({id,contaId:conta,...m,fitid:null,origem:'planilha',status:'pendente',vinculo:null,categoria:'',arquivo:meta.file});n++}
   audit('Extrato importado',`${meta.file}: ${n} movimentos`);ui.filtro='pendentes';navigate('concbanco');toast(`${n} movimento(s) importado(s).`)}})}}

// ─────────────── Sugestões de conciliação ───────────────
const palavras=s=>normalized(s).split(/[^a-z0-9]+/).filter(w=>w.length>=4&&!['ltda','comercio','industria','servicos','pagamento','pagto','boleto','enviado','recebido','transferencia','sispag','debito','credito','conta'].includes(w));
const usado=()=>new Set(T().filter(t=>t.vinculo?.tipo==='payable').map(t=>t.vinculo.id));
const REGRAS=[[/mercado\s?pago|mercadopago/,'transferencia','Mercado Pago'],[/shopee|airpay/,'transferencia','Shopee'],[/magalu|magazine luiza/,'transferencia','Magalu'],
 [/rend(imento)?|juros s\/ aplic|remuner/,'receita','Rendimentos de aplicações'],[/aplic|resgate|cdb|invest/,'aplicacao','Aplicação / resgate'],
 [/tarifa|\btar\b|cesta|pacote serv|manut conta|taxa/,'despesa','Tarifas bancárias'],[/\biof\b/,'despesa','Impostos e taxas'],[/darf|\bgps\b|\bdas\b|sefaz|icms|gnre|simples nac/,'despesa','Impostos e taxas'],[/folha|salario|pro.?labore/,'despesa','Salários e encargos']];
function sugerir(t,livres=usado()){const v=Math.abs(t.valor),ws=palavras(t.descricao);
 if(t.valor<0){const cands=(db.payables||[]).filter(p=>p.status!=='cancelado'&&!livres.has(p.id)).map(p=>{const aberto=round(Math.max(0,p.valor+(p.juros||0)-(p.desconto||0)-(p.valorPago||0)));const alvo=p.status==='pago'?p.valorPago:aberto;if(Math.abs(alvo-v)>=0.01)return null;
   const ref=p.status==='pago'&&p.pagoEm?p.pagoEm:p.vencimento,dd=dias(ref,t.data),nome=palavras(p.fornecedor+' '+(p.documento||'')).filter(w=>ws.includes(w)).length;if(dd>20&&!nome)return null;return {p,dd,nome,score:(nome?40:0)+(dd<=2?30:dd<=7?15:0)}}).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(cands.length){const c=cands[0],unico=cands.length===1||cands[1].score<c.score;return {tipo:'payable',id:c.p.id,conf:unico&&(c.nome||c.dd<=3)?'exata':'provavel',desc:`${c.p.fornecedor||c.p.descricao} · ${c.p.parcelas>1?`parcela ${c.p.parcela}/${c.p.parcelas} · `:''}venc. ${dataBR(c.p.vencimento)}${c.p.status==='pago'?' · já baixado':''}`}}}
 const d=normalized(t.descricao);for(const [re,tipo,cat] of REGRAS)if(re.test(d)&&!(tipo==='despesa'&&t.valor>0)){return {tipo,conf:'provavel',criar:tipo==='despesa',desc:tipo==='transferencia'?`Transferência ${t.valor>0?'de':'para'} ${cat}`:cat,categoria:cat}}
 return null}

// Aplica um vínculo ao movimento e, se for pagamento de título, dá a baixa com a data do banco.
function conciliar(t,s){const a=A().find(c=>c.id===t.contaId);
 if(s.tipo==='payable'){const p=(db.payables||[]).find(x=>x.id===s.id);if(!p)return;if(p.status!=='pago'){p.valorPago=round((p.valorPago||0)+Math.abs(t.valor));p.pagoEm=t.data;p.conta=a?.nome||p.conta;const sd=round(p.valor+(p.juros||0)-(p.desconto||0)-p.valorPago);if(sd<-0.009){p.juros=round((p.juros||0)-sd)}p.status=Math.max(0,sd)<0.01?'pago':'parcial'}}
 if(s.tipo==='despesa'&&s.criar){const id='EXT-'+t.id;(db.payables||(db.payables=[])).push({id,origem:'extrato',fornecedor:s.fornecedor||t.descricao,descricao:t.descricao,documento:t.documento||'',vencimento:t.data,emissao:t.data,valor:Math.abs(t.valor),juros:0,desconto:0,valorPago:Math.abs(t.valor),pagoEm:t.data,conta:a?.nome||'',status:'pago',categoria:s.categoria||'Outras despesas',parcela:1,parcelas:1,createdBy:'Conciliação bancária'});s={...s,id}}
 t.status='conciliado';t.vinculo={tipo:s.tipo,id:s.id||null,desc:s.desc||'',categoria:s.categoria||null};t.categoria=s.categoria||t.categoria||''}
function desfazer(t){if(t.vinculo?.tipo==='payable'){const p=(db.payables||[]).find(x=>x.id===t.vinculo.id);if(p&&p.pagoEm===t.data){p.valorPago=round(Math.max(0,(p.valorPago||0)-Math.abs(t.valor)));if(!p.valorPago){p.pagoEm=null}p.status=p.valorPago?'parcial':'aberto'}}
 if(t.vinculo?.tipo==='despesa'&&String(t.vinculo.id||'').startsWith('EXT-'))db.payables=(db.payables||[]).filter(p=>p.id!==t.vinculo.id);
 t.status='pendente';t.vinculo=null}

// ─────────────── Telas ───────────────
function contasView(){const s=saldos();const sel=ui.conta&&A().find(a=>a.id===ui.conta)?ui.conta:s.contas[0]?.id||'';ui.conta=sel;
 if(!A().length)return `<div class="hero"><div><div class="eyebrow">${icon('bank').replace('class="icon"','class="icon" style="vertical-align:middle;width:14px;height:14px"')} Tesouraria</div><h2>Traga o extrato do banco e o EcomBalance confere cada pagamento.</h2><p>Importe o arquivo OFX (no internet banking: Extrato → Exportar → OFX/Money) ou uma planilha. A conta é criada automaticamente pelo próprio arquivo.</p><div class="row"><label class="primary small upbtn" style="cursor:pointer">${icon('upload')} Importar extrato<input type="file" accept=".ofx,.OFX,.csv,.xlsx,.xls" multiple data-tes-arquivo hidden></label><button class="small" data-tes="nova-conta">${icon('plus')} Cadastrar conta</button></div></div></div>`;
 const conta=A().find(a=>a.id===sel),movs=T().filter(t=>t.contaId===sel).sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id));let run=conta.saldoInicial||0;const comSaldo=movs.map(t=>{if(t.data>(conta.dataSaldoInicial||'0000'))run=round(run+t.valor);return {...t,saldo:run}}).filter(t=>t.data.startsWith(month)).reverse();
 const ent=round(comSaldo.filter(t=>t.valor>0).reduce((a,t)=>a+t.valor,0)),sai=round(comSaldo.filter(t=>t.valor<0).reduce((a,t)=>a+t.valor,0));
 return `<div class="row wrap" style="justify-content:space-between;margin-bottom:16px"><div class="caption">Saldo total: <strong style="color:var(--text);font-size:15px">${money(s.total)}</strong> em ${s.contas.length} conta(s)</div><div class="row wrap"><button class="small" data-tes="nova-conta">${icon('plus')} Nova conta</button><label class="primary small upbtn" style="cursor:pointer">${icon('upload')} Importar extrato<input type="file" accept=".ofx,.OFX,.csv,.xlsx,.xls" multiple data-tes-arquivo hidden></label></div></div>
 <div class="grid bankgrid">${s.contas.map(a=>{const bate=a.saldoExtrato==null?null:Math.abs(saldoConta(a,a.dataSaldoExtrato)-a.saldoExtrato)<0.01;return `<button class="card bankcard ${a.id===sel?'on':''}" data-tes-conta="${esc(a.id)}"><div class="row" style="justify-content:space-between"><strong>${esc(a.nome)}</strong><span class="badge ${a.pend?'warn':'ok'}">${a.pend?a.pend+' a conciliar':'Em dia'}</span></div><div class="bankval">${money(a.saldo)}</div><div class="caption">${esc(TIPOS[a.tipo]||'')}${a.saldoExtrato!=null?` · banco ${money(a.saldoExtrato)} em ${dataBR(a.dataSaldoExtrato)} ${bate?'✓':'≠'}`:''}</div></button>`}).join('')}</div>
 <div class="tablebox" style="margin-top:18px"><div class="tabletop"><div><h2>${esc(conta.nome)} · ${new Date(month+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h2><p class="caption">Entradas <span class="green">${money(ent)}</span> · Saídas <span class="red">${money(sai)}</span></p></div><button class="small quiet" data-tes-editconta="${esc(conta.id)}">Editar conta</button></div>
 <div class="tablewrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Conciliação</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead><tbody>${comSaldo.map(t=>`<tr><td>${dataBR(t.data)}</td><td>${esc(t.descricao)}${t.documento?`<br><span class="caption">doc ${esc(t.documento)}</span>`:''}</td><td>${t.status==='conciliado'?`<span class="badge ok">${esc(t.vinculo?.desc||'Conciliado')}</span>`:t.status==='ignorado'?'<span class="badge">Ignorado</span>':'<button class="small quiet" data-nav="concbanco">A conciliar</button>'}</td><td class="num ${t.valor<0?'red':'green'}">${money(t.valor)}</td><td class="num">${money(t.saldo)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum movimento neste mês.</td></tr>'}</tbody></table></div></div>`}

function concView(){const livres=usado();let movs=T().filter(t=>!ui.conta||ui.conta==='todas'||t.contaId===ui.conta);const pend=movs.filter(t=>t.status==='pendente');
 movs=ui.filtro==='pendentes'?pend:ui.filtro==='conciliados'?movs.filter(t=>t.status==='conciliado'&&t.data.startsWith(month)):movs.filter(t=>t.status==='ignorado');
 movs.sort((a,b)=>b.data.localeCompare(a.data));const sug=new Map(pend.map(t=>[t.id,sugerir(t,livres)]));const exatas=pend.filter(t=>sug.get(t.id)?.conf==='exata');
 const marca=s=>!s?['?','bad']:s.conf==='exata'?['=','ok']:['≈','warn'];
 return `<div class="row wrap" style="justify-content:space-between;margin-bottom:16px"><div class="row wrap"><div class="segtabs">${[['pendentes',`A conciliar (${pend.length})`],['conciliados','Conciliados no mês'],['ignorados','Ignorados']].map(([k,t])=>`<button class="${ui.filtro===k?'on':''}" data-tes-filtro="${k}">${t}</button>`).join('')}</div><select id="tesConta" aria-label="Conta"><option value="todas">Todas as contas</option>${A().map(a=>`<option value="${esc(a.id)}" ${ui.conta===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}</select></div>
 <div class="row wrap"><label class="small upbtn" style="cursor:pointer">${icon('upload')} Importar extrato<input type="file" accept=".ofx,.OFX,.csv,.xlsx,.xls" multiple data-tes-arquivo hidden></label>${exatas.length&&ui.filtro==='pendentes'?`<button class="primary small" data-tes="aceitar-exatas">${icon('check')} Aceitar ${exatas.length} sugestão(ões) exata(s)</button>`:''}</div></div>
 ${!T().length?`<div class="empty">Nenhum extrato importado ainda. Use <strong>Importar extrato</strong> (arquivo OFX do internet banking ou planilha).</div>`:
 `<div class="concgrid"><div class="conchead"><span>Extrato do banco</span><span></span><span>No EcomBalance</span></div>
 ${movs.slice(0,300).map(t=>{const s=ui.filtro==='pendentes'?sug.get(t.id):t.vinculo;const [m,tom]=ui.filtro==='pendentes'?marca(s):t.status==='conciliado'?['✓','ok']:['–',''];const conta=A().find(a=>a.id===t.contaId);
  return `<div class="concrow ${tom}"><div class="concl"><span class="caption" style="width:74px">${dataBR(t.data).slice(0,5)}</span><div style="flex:1;min-width:0"><div class="ellipsis"><strong>${esc(t.descricao)}</strong></div><div class="caption">${esc(conta?.nome||'')}${t.documento?' · doc '+esc(t.documento):''}</div></div><strong class="num ${t.valor<0?'red':'green'}">${money(t.valor)}</strong></div>
  <div class="concm"><span class="concmark ${tom}">${m}</span></div>
  <div class="concr"><div style="flex:1;min-width:0">${s?`<div class="ellipsis"><strong>${esc(s.desc)}</strong></div><div class="caption">${{payable:'Título a pagar',transferencia:'Transferência entre contas',aplicacao:'Aplicação / resgate',receita:'Receita',despesa:'Despesa lançada'}[s.tipo]||''}${ui.filtro==='pendentes'?(s.conf==='exata'?' · valor e fornecedor conferem':' · confira antes de aceitar'):''}</div>`:`<div><strong>Sem par encontrado</strong></div><div class="caption">Escolha o que é este movimento</div>`}</div>
  <div class="row" style="gap:6px">${ui.filtro==='pendentes'?`${s?`<button class="small primary" data-tes-aceitar="${esc(t.id)}">Aceitar</button>`:''}<button class="small" data-tes-outro="${esc(t.id)}">${s?'Outro':'Classificar'}</button><button class="small quiet" data-tes-ignorar="${esc(t.id)}" aria-label="Ignorar">${icon('x')}</button>`:`<button class="small quiet" data-tes-desfazer="${esc(t.id)}">Desfazer</button>`}</div></div></div>`}).join('')||`<div class="empty">${ui.filtro==='pendentes'?'Tudo conciliado. ✓':'Nada neste filtro.'}</div>`}</div>`}`}

function classificar(id){const t=T().find(x=>x.id===id);if(!t)return;const livres=usado();const v=Math.abs(t.valor);
 const titulos=t.valor<0?(db.payables||[]).filter(p=>p.status!=='cancelado'&&!livres.has(p.id)).map(p=>({p,aberto:round(Math.max(0,p.valor+(p.juros||0)-(p.desconto||0)-(p.valorPago||0)))})).filter(x=>x.aberto>0).sort((a,b)=>Math.abs(a.aberto-v)-Math.abs(b.aberto-v)||dias(a.p.vencimento,t.data)-dias(b.p.vencimento,t.data)).slice(0,30):[];
 const cats=['Tarifas bancárias','Impostos e taxas','Fretes e logística','Marketing e anúncios','Salários e encargos','Pró-labore','Serviços de terceiros','Sistemas e softwares','Aluguel','Água, luz e internet','Compra de mercadorias','Embalagens','Empréstimos e juros','Outras despesas'];
 modal('O que é este movimento?',`<div class="notice"><strong>${esc(t.descricao)}</strong><br>${dataBR(t.data)} · <strong class="${t.valor<0?'red':'green'}">${money(t.valor)}</strong></div>
 ${t.valor<0?`<h3>Pagamento de um título</h3><input type="search" id="clBusca" placeholder="Filtrar por fornecedor ou documento…" style="width:100%;margin-bottom:8px"><div class="tablewrap" style="max-height:230px"><table><tbody id="clLista">${titulos.map(({p,aberto})=>`<tr data-cl-txt="${esc(normalized(p.fornecedor+' '+p.descricao+' '+p.documento))}"><td>${esc(p.fornecedor||p.descricao)}<br><span class="caption">venc. ${dataBR(p.vencimento)}${p.parcelas>1?` · ${p.parcela}/${p.parcelas}`:''}</span></td><td class="num ${Math.abs(aberto-v)<0.01?'green':''}">${money(aberto)}</td><td><button class="small primary" data-cl-titulo="${esc(p.id)}">Vincular</button></td></tr>`).join('')||'<tr><td class="empty">Nenhum título em aberto.</td></tr>'}</tbody></table></div><p class="caption">Valor diferente do saldo do título: a diferença vira pagamento parcial (menor) ou juros (maior).</p>
 <h3>Despesa sem título</h3><div class="row wrap"><input id="clForn" placeholder="Fornecedor (opcional)" style="flex:1"><select id="clCat">${cats.map(c=>`<option>${c}</option>`).join('')}</select><button class="small" data-cl-despesa="1">Lançar despesa paga</button></div>`:
 `<h3>Entrada</h3><div class="row wrap"><select id="clCat"><option>Rendimentos de aplicações</option><option>Outras receitas</option><option>Estorno / devolução</option><option>Aporte de sócios</option><option>Empréstimo recebido</option></select><button class="small" data-cl-receita="1">Registrar receita</button></div>`}
 <h3>Transferência entre contas</h3><div class="row wrap"><select id="clTransf">${A().filter(a=>a.id!==t.contaId).map(a=>`<option>${esc(a.nome)}</option>`).join('')}<option>Mercado Pago</option><option>Shopee</option><option>Magalu</option><option>Outra conta</option></select><button class="small" data-cl-transf="1">É transferência</button><button class="small quiet" data-cl-aplic="1">Aplicação / resgate</button></div>
 <div class="modalfoot"><button data-action="close">Fechar</button></div>`);
 const b=$('#clBusca');if(b)b.oninput=()=>{const q=normalized(b.value);$$('#clLista tr').forEach(tr=>tr.style.display=!q||tr.dataset.clTxt?.includes(q)?'':'none')};ui.sel=id}

addPage('tesouraria','bank','Contas bancárias',contasView,'Saldos de cada conta, extratos importados e movimentos com saldo dia a dia.','',bind);
addPage('concbanco','swap','Conciliação bancária',concView,'Extrato do banco lado a lado com o EcomBalance: aceite os pares e o pagamento é baixado com a data do banco.','',bind);
function bind(){$$('[data-tes-arquivo]').forEach(i=>i.onchange=e=>{importarArquivos(e.target.files);e.target.value=''});const c=$('#tesConta');if(c)c.onchange=e=>{ui.conta=e.target.value;render()}}

function formConta(a){a=a||{tipo:'corrente'};return `<div class="grid two" style="gap:0 16px"><div><label for="bcNome">Nome</label><input id="bcNome" value="${esc(a.nome||'')}" placeholder="Ex.: Itaú · conta corrente" style="width:100%"></div><div><label for="bcTipo">Tipo</label><select id="bcTipo" style="width:100%">${Object.entries(TIPOS).map(([k,l])=>`<option value="${k}" ${a.tipo===k?'selected':''}>${l}</option>`).join('')}</select></div>
 <div><label for="bcBanco">Banco (código)</label><input id="bcBanco" value="${esc(a.banco||'')}" placeholder="341" style="width:100%"></div><div class="row" style="gap:10px"><div style="flex:1"><label for="bcAg">Agência</label><input id="bcAg" value="${esc(a.agencia||'')}" style="width:100%"></div><div style="flex:1"><label for="bcConta">Conta</label><input id="bcConta" value="${esc(a.conta||'')}" style="width:100%"></div></div>
 <div><label for="bcSaldo">Saldo inicial</label><input id="bcSaldo" inputmode="decimal" value="${String(a.saldoInicial||0).replace('.',',')}" style="width:100%"></div><div><label for="bcData">Data do saldo inicial</label><input id="bcData" type="date" value="${a.dataSaldoInicial||''}" style="width:100%"></div></div><p class="caption">O saldo inicial é o saldo no fim do dia informado; os movimentos depois dele formam o saldo atual. Ao importar um OFX com saldo, ele é calculado sozinho.</p>`}
function lerConta(){return {nome:$('#bcNome').value.trim(),tipo:$('#bcTipo').value,banco:$('#bcBanco').value.trim(),agencia:$('#bcAg').value.trim(),conta:$('#bcConta').value.trim(),saldoInicial:round(TableImport.num($('#bcSaldo').value)),dataSaldoInicial:$('#bcData').value||null}}

document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.tesConta){ui.conta=d.tesConta;render();return}
 if(d.tesFiltro){ui.filtro=d.tesFiltro;render();return}
 if(d.tesAceitar){const t=T().find(x=>x.id===d.tesAceitar),s=sugerir(t);if(!s)return;conciliar(t,s);audit('Movimento conciliado',`${dataBR(t.data)} · ${t.descricao} · ${money(t.valor)} → ${s.desc}`);render();return}
 if(d.tesIgnorar){const t=T().find(x=>x.id===d.tesIgnorar);t.status='ignorado';audit('Movimento ignorado',`${dataBR(t.data)} · ${t.descricao} · ${money(t.valor)}`);render();return}
 if(d.tesDesfazer){const t=T().find(x=>x.id===d.tesDesfazer);audit('Conciliação desfeita',`${dataBR(t.data)} · ${t.descricao} · ${money(t.valor)}`);desfazer(t);render();return}
 if(d.tesOutro){classificar(d.tesOutro);return}
 if(d.tesEditconta){const a=A().find(x=>x.id===d.tesEditconta);modal('Editar conta',formConta(a)+`<div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-tes-salvaconta="${esc(a.id)}">Salvar</button></div>`);return}
 if(d.tesSalvaconta){const a=A().find(x=>x.id===d.tesSalvaconta);const f=lerConta();if(!f.nome)return toast('Informe o nome da conta.');Object.assign(a,f);audit('Conta bancária editada',a.nome);closeModal();render();return}
 const t=ui.sel&&T().find(x=>x.id===ui.sel);
 if(t&&d.clTitulo){const p=db.payables.find(x=>x.id===d.clTitulo);conciliar(t,{tipo:'payable',id:p.id,desc:`${p.fornecedor||p.descricao} · venc. ${dataBR(p.vencimento)}`});audit('Movimento conciliado',`${t.descricao} · ${money(t.valor)} → ${p.fornecedor||p.descricao}`);closeModal();render();return}
 if(t&&d.clDespesa){const cat=$('#clCat').value;conciliar(t,{tipo:'despesa',criar:true,categoria:cat,fornecedor:$('#clForn').value.trim(),desc:cat});audit('Despesa lançada pelo extrato',`${t.descricao} · ${money(t.valor)} · ${cat}`);closeModal();render();return}
 if(t&&d.clReceita){const cat=$('#clCat').value;conciliar(t,{tipo:'receita',categoria:cat,desc:cat});audit('Receita registrada pelo extrato',`${t.descricao} · ${money(t.valor)} · ${cat}`);closeModal();render();return}
 if(t&&d.clTransf){const c=$('#clTransf').value;conciliar(t,{tipo:'transferencia',desc:`Transferência ${t.valor>0?'de':'para'} ${c}`,categoria:'Transferência'});audit('Transferência conciliada',`${t.descricao} · ${money(t.valor)} · ${c}`);closeModal();render();return}
 if(t&&d.clAplic){conciliar(t,{tipo:'aplicacao',desc:'Aplicação / resgate',categoria:'Aplicação'});audit('Aplicação conciliada',`${t.descricao} · ${money(t.valor)}`);closeModal();render();return}
 switch(d.tes){case'nova-conta':modal('Nova conta',formConta()+`<div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-tes="salvar-conta">Cadastrar</button></div>`);break;
  case'salvar-conta':{const f=lerConta();if(!f.nome)return toast('Informe o nome da conta.');const a={id:uid(),...f,ativo:true};A().push(a);ui.conta=a.id;audit('Conta bancária cadastrada',a.nome);closeModal();navigate('tesouraria');break}
  case'aceitar-exatas':{const livres=usado();let n=0;for(const t of T().filter(x=>x.status==='pendente'&&(!ui.conta||ui.conta==='todas'||x.contaId===ui.conta))){const s=sugerir(t,livres);if(s?.conf!=='exata')continue;conciliar(t,s);if(s.tipo==='payable')livres.add(s.id);n++}audit('Conciliação bancária em lote',`${n} movimentos com sugestão exata aceitos`);render();toast(`${n} movimento(s) conciliado(s).`);break}}
});
window.Tesouraria={saldos,importarArquivos,sugerir};
})();
