'use strict';
// Gestão: "Contabilidade e Resultado" (razão, balancete, documentos do escritório e DRE gerencial) e
// "Preços e Simulador" (tabela de preços, regras por canal, simulador e cenários).
(()=>{
Object.assign(paths,{
 book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
 tag:'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01',
 sliders:'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
 trash:'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
 save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8',
});
const CANAIS=['Mercado Livre','Shopee','Magalu','Site próprio'];
const pctf=n=>(Number.isFinite(n)?n:0).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const n2=v=>Number(v)||0;
const monthLabel=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
const tabs=(id,cur,list)=>`<div class="segtabs" role="tablist">${list.map(([k,l])=>`<button role="tab" class="${cur===k?'active':''}" data-g-tab="${id}:${k}">${l}</button>`).join('')}</div>`;
const ui={cont:'resultado',prec:'tabela',mapFilter:'pendentes',search:''};
function ensure(){db.accLines=db.accLines||[];db.accMap=db.accMap||{};db.accDocs=db.accDocs||[];db.products=db.products||[];db.scenarios=db.scenarios||[];db.pricing=db.pricing||defaultsPricing()}

// ═════════════════════════ CONTABILIDADE E RESULTADO ═════════════════════════
const LINHAS=[
 ['receita','Receita bruta de vendas'],['devolucoes','(−) Devoluções e cancelamentos'],['impostos','(−) Impostos sobre vendas'],
 ['cmv','(−) CMV · custo das mercadorias'],['tarifas','(−) Comissões e tarifas de marketplace'],['fretes','(−) Fretes e logística'],
 ['marketing','(−) Marketing e anúncios'],['pessoal','(−) Pessoal'],['administrativas','(−) Administrativas e ocupação'],
 ['tecnologia','(−) Tecnologia e sistemas'],['outras','(±) Outras operacionais'],['financeiro','(±) Resultado financeiro'],
 ['ir','(−) IRPJ e CSLL'],['ignorar','Não entra na DRE (patrimonial/transitória)']];
const LNAME=Object.fromEntries(LINHAS);
const DRE=[ // [chave, rótulo, tipo] — tipo "linha" soma contas; "total" soma o que veio antes
 ['receita','Receita bruta de vendas','linha'],['devolucoes','(−) Devoluções e cancelamentos','linha'],['impostos','(−) Impostos sobre vendas','linha'],
 ['=rl','Receita líquida','total',['receita','devolucoes','impostos']],
 ['cmv','(−) CMV','linha'],['=lb','Lucro bruto','total',['=rl','cmv']],
 ['tarifas','(−) Comissões e tarifas de marketplace','linha'],['fretes','(−) Fretes e logística','linha'],['marketing','(−) Marketing e anúncios','linha'],
 ['=mc','Margem de contribuição','total',['=lb','tarifas','fretes','marketing']],
 ['pessoal','(−) Pessoal','linha'],['administrativas','(−) Administrativas e ocupação','linha'],['tecnologia','(−) Tecnologia e sistemas','linha'],['outras','(±) Outras operacionais','linha'],
 ['=ebitda','EBITDA','total',['=mc','pessoal','administrativas','tecnologia','outras']],
 ['financeiro','(±) Resultado financeiro','linha'],['=lair','Resultado antes do IR/CSLL','total',['=ebitda','financeiro']],
 ['ir','(−) IRPJ e CSLL','linha'],['=ll','Lucro líquido','total',['=lair','ir']]];
const KW=[['financeiro',/juro|financeir|banc[aá]ri|iof|rendiment|desconto (obtido|concedido)|antecipa|varia[cç][aã]o cambial/],['ir',/irpj|csll|imposto de renda|contribui[cç][aã]o social/],
 ['devolucoes',/devolu|cancelament|abatiment/],['cmv',/\bcmv\b|custo d[ao]s? (mercadoria|produto)|custo das vendas|custo dos produtos vendidos/],
 ['impostos',/icms|\bpis\b|cofins|simples nacional|guia das|^das\b|\bdas (simples|mensal)|\biss\b|difal|impostos? sobre (vendas|faturamento)|dedu[cç]/],['receita',/receita|venda de (mercadoria|produto)|faturamento/],
 ['tarifas',/comiss|tarifa|mercado ?livre|shopee|magalu|marketplace|intermedia/],['fretes',/frete|transporte|correios|log[ií]stic|envio|entrega/],
 ['marketing',/marketing|propaganda|publicidade|an[uú]ncio|\bads\b|patroc[ií]n|influenc/],['pessoal',/sal[aá]rio|pr[oó].?labore|inss|fgts|f[eé]rias|13[ºo°]?|vale.?(transp|refei|alim)|benef[ií]c|encargos? soc|rescis/],
 ['tecnologia',/software|sistema|licen[cç]a|internet|hospedagem|tecnologia|\bbling\b|assinatura/],
 ['administrativas',/aluguel|energia|[aá]gua|telefon|contab|honor[aá]rio|limpeza|material|manuten|seguro|condom[ií]n|despesas? (gera|admin)|correspond|cart[oó]rio/]];
function suggest(conta,desc){const d=normalized(desc);for(const [l,re] of KW)if(re.test(d))return l;const c=String(conta).replace(/\D/g,'');if(/^[12]/.test(c))return 'ignorar';return 'outras'}

// Contas analíticas (folhas): exclui as sintéticas para não somar duas vezes.
function leaves(lines){const codes=[...new Set(lines.map(l=>String(l.conta)))];const norm=c=>c.replace(/[^0-9A-Za-z]/g,'');const all=codes.map(norm);return new Set(codes.filter(c=>{const n=norm(c);return !all.some(o=>o!==n&&o.startsWith(n))}))}
// Movimento de resultado por conta no mês: crédito − débito (receitas positivas, despesas negativas).
function movimentos(m){const bal=db.accLines.filter(l=>l.month===m&&l.kind==='balancete'),src=bal.length?bal:db.accLines.filter(l=>l.month===m&&l.kind==='razao');const lv=leaves(src);const out={};
 for(const l of src){if(!lv.has(String(l.conta)))continue;const o=out[l.conta]||(out[l.conta]={conta:l.conta,descricao:l.descricao||'',valor:0});o.valor+=n2(l.credito)-n2(l.debito);if(!o.descricao&&l.descricao)o.descricao=l.descricao}
 for(const o of Object.values(out))o.valor=round(o.valor);return {fonte:bal.length?'balancete':src.length?'razão':'',contas:Object.values(out)}}
function dreMes(m){const {fonte,contas}=movimentos(m);const v=Object.fromEntries(LINHAS.map(([k])=>[k,0]));let pend=0;
 for(const c of contas){const map=db.accMap[c.conta];const linha=map?.linha||suggest(c.conta,c.descricao);if(!map)pend++;v[linha]+=c.valor}
 for(const [k,,t,parts] of DRE)if(t==='total')v[k]=round(parts.reduce((a,p)=>a+v[p],0));return {fonte,v,pend,contas:contas.length}}
// DRE estimada pela operação (sem contabilidade do mês): NFs, tarifas das plataformas, custo da tabela de preços, impostos e ads das premissas.
function dreOperacao(m){const rows=db.orders.filter(o=>o.date.startsWith(m)),v=Object.fromEntries(LINHAS.map(([k])=>[k,0]));const P=db.pricing,cost=custoMap();let comCusto=0,itens=0;
 v.receita=round(rows.reduce((a,o)=>a+o.gross,0));v.tarifas=-round(rows.reduce((a,o)=>a+(o.feeSource&&o.feeSource!=='Bling'?o.fee:0),0));v.impostos=-round(v.receita*n2(P.impostos)/100);v.marketing=-round(v.receita*n2(P.ads)/100);
 let cmv=0;for(const o of rows)for(const it of o.items||[]){itens++;const c=cost.get(normalized(it.sku));if(c){comCusto++;cmv+=n2(it.qty)*(c.custo+c.embalagem)}}v.cmv=-round(cmv);
 for(const [k,,t,parts] of DRE)if(t==='total')v[k]=round(parts.reduce((a,p)=>a+v[p],0));return {fonte:'operação',v,cobertura:itens?comCusto/itens*100:0}}
const custoMap=()=>new Map(db.products.map(p=>[normalized(p.id),{custo:n2(p.custo),embalagem:n2(p.embalagem)}]));
const mesesContabeis=()=>[...new Set(db.accLines.map(l=>l.month))].sort();

function contabilView(){ensure();return `${tabs('cont',ui.cont,[['resultado','Resultado gerencial'],['documentos','Documentos do mês'],['plano','Contas → DRE']])}${ui.cont==='documentos'?docsView():ui.cont==='plano'?planoView():resultadoView()}`}

function resultadoView(){const cont=dreMes(month),usaCont=!!cont.fonte,d=usaCont?cont:dreOperacao(month),v=d.v,rl=v['=rl']||v.receita||1;
 const meses=[...new Set([...mesesContabeis(),month])].sort().slice(-6);const series=meses.map(m=>{const c=dreMes(m);return [m,c.fonte?c:dreOperacao(m)]});
 const ops=db.orders.filter(o=>o.date.startsWith(month)),nfs=round(ops.reduce((a,o)=>a+o.gross,0)),tarOp=round(ops.reduce((a,o)=>a+(o.feeSource&&o.feeSource!=='Bling'?o.fee:0),0)),rec=round(db.receipts.filter(r=>r.date.startsWith(month)).reduce((a,r)=>a+r.amount,0));
 const kp=(l,val,cap,tone='')=>`<div class="card metric"><div class="label">${l}${icon('chart')}</div><div class="value ${tone}">${val}</div><small>${cap}</small></div>`;
 const cell=(x,tot)=>`<td class="num ${x<0?'red':''}">${x<0?'('+money(-x).replace('R$','').trim()+')':money(x).replace('R$','').trim()}</td>`;
 return `<div class="notice">${usaCont?`<strong>Fonte: contabilidade (${cont.fonte}) de ${monthLabel(month)}.</strong> ${cont.pend?`${cont.pend} contas ainda sem classificação confirmada — veja <button class="quiet small" data-g-tab="cont:plano">Contas → DRE</button>.`:'Todas as contas classificadas.'}`:`<strong>Sem contabilidade importada para ${monthLabel(month)}.</strong> Mostrando a DRE <em>estimada pela operação</em>: NFs do Bling, tarifas das plataformas, custo da tabela de preços (${pctf(d.cobertura)} dos itens com custo) e impostos/anúncios das premissas de Preços. Importe o balancete ou o razão em <button class="quiet small" data-g-tab="cont:documentos">Documentos do mês</button>.`}</div>
 <div class="grid metrics">${kp('Receita bruta',money(v.receita),usaCont?'Contábil':'NFs emitidas no Bling')}${kp('Receita líquida',money(v['=rl']),pctf(v['=rl']/(v.receita||1)*100)+' da bruta')}${kp('Margem de contribuição',pctf(v['=mc']/rl*100),money(v['=mc']),v['=mc']<0?'red':'green')}${kp('Lucro líquido',money(v['=ll']),pctf(v['=ll']/rl*100)+' da receita líquida',v['=ll']<0?'red':'green')}</div>
 <div class="grid charts"><div class="tablebox"><div class="tabletop"><h2>DRE gerencial do e-commerce</h2><button class="small" data-g="export-dre">${icon('download')} Exportar</button></div><div class="tablewrap"><table class="dre"><thead><tr><th>Linha</th>${series.map(([m])=>`<th class="num ${m===month?'purple':''}">${monthLabel(m)}</th>`).join('')}<th class="num">% RL</th></tr></thead><tbody>${DRE.map(([k,l,t])=>`<tr class="${t==='total'?'total':''}"><td>${l}</td>${series.map(([,x])=>cell(x.v[k]||0)).join('')}<td class="num caption">${pctf((v[k]||0)/rl*100)}</td></tr>`).join('')}</tbody></table></div></div>
 <div class="stack"><div class="card"><div class="cardhead"><h2>Contabilidade × operação</h2>${icon('link')}</div>
 ${[['Receita contábil',usaCont?cont.v.receita:null,'NFs no Bling',nfs],['Tarifas contábeis',usaCont?-(cont.v.tarifas):null,'Tarifas das plataformas',tarOp]].map(([a,av,b,bv])=>`<div class="listline"><span>${a}</span><strong>${av==null?'—':money(av)}</strong></div><div class="listline"><span>${b}</span><strong>${money(bv)}</strong></div>${av!=null?`<div class="listline"><span>Diferença</span><strong class="${Math.abs(av-bv)>1?'gold':'green'}">${money(av-bv)}</strong></div>`:''}`).join('<div style="height:8px"></div>')}
 <div class="listline"><span>Repasses recebidos no mês</span><strong>${money(rec)}</strong></div><p class="caption">Diferenças costumam vir de competência (NF × lançamento), devoluções e tarifas lançadas por extrato.</p></div>
 <div class="card"><div class="cardhead"><h2>Evolução</h2>${icon('chart')}</div>${bars(series.map(([m,x])=>[monthLabel(m),x.v['=rl'],x.v['=ll']]))}</div></div></div>`}
function bars(rows){const max=Math.max(1,...rows.flatMap(r=>[Math.abs(r[1]),Math.abs(r[2])]));return `<div class="colchart">${rows.map(([l,a,b])=>`<div class="col"><div class="colbars"><i style="height:${Math.abs(a)/max*100}%;background:var(--accent)" title="Receita líquida ${money(a)}"></i><i style="height:${Math.abs(b)/max*100}%;background:${b<0?'var(--red)':'var(--green)'}" title="Lucro líquido ${money(b)}"></i></div><span>${l}</span></div>`).join('')}</div><div class="legend"><span><i style="background:var(--accent)"></i>Receita líquida</span><span><i style="background:var(--green)"></i>Lucro líquido</span></div>`}

const DOCS=[['razao','Razão de todas as contas','Planilha ou PDF',true],['balancete','Balancete','Planilha ou PDF (importável)',true],['dre','DRE do escritório','PDF',false],['outros','Outros (apurações, guias, folha…)','Qualquer arquivo',false]];
function docsView(){const docs=db.accDocs.filter(d=>d.month===month),linhas=k=>db.accLines.filter(l=>l.month===month&&l.kind===k).length,cloud=window.Cloud?.ws;
 return `<div class="notice"><strong>Fechamento contábil de ${monthLabel(month)}.</strong> Importe o razão e/ou o balancete para montar a DRE; anexe os PDFs para ficar tudo guardado junto da competência.${cloud?'':' <strong>Modo local:</strong> anexos ficam só registrados (arquivos exigem o modo nuvem).'}</div>
 <div class="grid two">${DOCS.map(([k,t,d,imp])=>{const anex=docs.filter(x=>x.tipo===k),n=imp?linhas(k):0,ok=n||anex.length;return `<div class="card"><div class="cardhead"><div><h2>${t}</h2><p class="caption">${d}</p></div><span class="badge ${ok?'ok':'warn'}">${ok?'Recebido':'Pendente'}</span></div>
 ${imp?`<div class="listline"><span>Linhas importadas</span><strong>${n.toLocaleString('pt-BR')}</strong></div>`:''}
 ${anex.map(x=>`<div class="listline"><span>${icon('file')} ${esc(x.nome)}<br><span class="caption">${new Date(x.time).toLocaleString('pt-BR')}${x.size?' · '+Math.ceil(x.size/1024)+' KB':''}</span></span><div class="row">${x.path?`<button class="small quiet" data-g-open="${esc(x.id)}">Abrir</button>`:''}<button class="small quiet" data-g-deldoc="${esc(x.id)}" aria-label="Remover">${icon('trash')}</button></div></div>`).join('')}
 <div class="row wrap" style="margin-top:14px">${imp?`<button class="primary small" data-g-import="${k}">${icon('upload')} Importar ${k==='razao'?'razão':'balancete'}</button>${n?`<button class="small quiet" data-g-clear="${k}">Limpar importação</button>`:''}`:''}<label class="small upbtn">${icon('file')} Anexar arquivo<input type="file" data-g-attach="${k}" hidden></label></div></div>`}).join('')}</div>`}

function planoView(){const {contas}=movimentos(month);const q=normalized(ui.search);let list=contas.map(c=>({...c,map:db.accMap[c.conta],sug:suggest(c.conta,c.descricao)})).filter(c=>!q||normalized(c.conta+' '+c.descricao).includes(q));if(ui.mapFilter==='pendentes')list=list.filter(c=>!c.map);
 if(!contas.length)return `<div class="empty">Nenhuma conta importada em ${monthLabel(month)}. Importe o balancete ou o razão em <button class="quiet small" data-g-tab="cont:documentos">Documentos do mês</button>.</div>`;
 return `<div class="notice">Cada conta de resultado vai para uma linha da DRE gerencial. A sugestão vem do nome da conta; confirme ou troque. A classificação vale para todos os meses.</div>
 <div class="filters"><input type="search" id="gSearch" placeholder="Buscar conta…" value="${esc(ui.search)}"><select id="gMapFilter"><option value="pendentes" ${ui.mapFilter==='pendentes'?'selected':''}>Só não confirmadas</option><option value="todas" ${ui.mapFilter==='todas'?'selected':''}>Todas as contas</option></select><button class="primary" data-g="accept-all">${icon('check')} Confirmar todas as sugestões</button></div>
 <div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Conta</th><th>Descrição</th><th class="num">Movimento no mês</th><th>Linha da DRE</th></tr></thead><tbody>${list.slice(0,600).map(c=>`<tr><td>${esc(c.conta)}</td><td>${esc(c.descricao)}</td><td class="num ${c.valor<0?'red':''}">${money(c.valor)}</td><td><select data-g-map="${esc(c.conta)}" data-desc="${esc(c.descricao)}">${LINHAS.map(([k,l])=>`<option value="${k}" ${(c.map?.linha||c.sug)===k?'selected':''}>${l}${!c.map&&c.sug===k?' (sugerida)':''}</option>`).join('')}</select></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Todas as contas estão classificadas.</td></tr>'}</tbody></table></div></div>`}

function importAccounting(kind){const razao=kind==='razao';TableImport.open({title:razao?`Importar razão · ${monthLabel(month)}`:`Importar balancete · ${monthLabel(month)}`,
 hint:razao?'Uma linha por lançamento. Se o razão vier agrupado por conta (a conta aparece só no título do bloco), escolha a coluna de conta mesmo assim: linhas sem conta herdam a conta anterior.':'Uma linha por conta. Contas sintéticas (totalizadoras) são ignoradas automaticamente no cálculo.',
 fields:razao?[{key:'conta',label:'Conta',required:true,aliases:['codigo','cod conta','conta contabil','classificacao']},{key:'descricao',label:'Descrição da conta',aliases:['nome da conta','descricao','nome']},{key:'data',label:'Data',aliases:['data lancamento','dt']},{key:'historico',label:'Histórico',aliases:['historico','complemento']},{key:'debito',label:'Débito',required:true,aliases:['debito','valor debito','deb']},{key:'credito',label:'Crédito',required:true,aliases:['credito','valor credito','cred']},{key:'saldo',label:'Saldo',aliases:['saldo','saldo atual']}]
  :[{key:'conta',label:'Conta',required:true,aliases:['codigo','cod conta','conta contabil','classificacao']},{key:'descricao',label:'Descrição',required:true,aliases:['nome da conta','descricao','nome']},{key:'saldo_anterior',label:'Saldo anterior',aliases:['saldo anterior','sld anterior']},{key:'debito',label:'Débito',required:true,aliases:['debito','debitos']},{key:'credito',label:'Crédito',required:true,aliases:['credito','creditos']},{key:'saldo',label:'Saldo atual',aliases:['saldo atual','saldo final','sld atual']}],
 confirmLabel:'Importar para a competência',
 onConfirm(rows,meta){let conta='',desc='';const out=[];rows.forEach((r,i)=>{if(r.conta){conta=r.conta;desc=r.descricao||desc}else if(!razao)return;if(!conta)return;const deb=Math.abs(TableImport.num(r.debito)),cred=Math.abs(TableImport.num(r.credito));if(!deb&&!cred&&razao)return;
   out.push({id:`${kind}-${month}-${i}`,month,kind,conta:String(conta).trim(),descricao:r.descricao||desc,data:TableImport.date(r.data)||null,historico:r.historico||'',debito:round(deb),credito:round(cred),saldoAnterior:r.saldo_anterior?TableImport.num(r.saldo_anterior):null,saldo:r.saldo?TableImport.num(r.saldo):null})});
  if(!out.length)return toast('Nenhuma linha válida encontrada. Confira o mapeamento das colunas.');
  db.accLines=db.accLines.filter(l=>!(l.month===month&&l.kind===kind)).concat(out);audit(`${razao?'Razão':'Balancete'} importado`,`${meta.file}: ${out.length} linhas · ${month}`);render();toast(`${out.length} linhas importadas.`)}})}

async function attach(tipo,file){if(!file)return;const id=uid(),doc={id,month,tipo,nome:file.name,size:file.size,time:new Date().toISOString(),path:null};
 if(window.Cloud?.ws){const path=`${Cloud.ws}/${month}/${id}-${file.name.replace(/[^\w.\-]+/g,'_')}`;const {error}=await Cloud.client.storage.from('contabil').upload(path,file,{upsert:false});if(error)return toast('Falha ao enviar: '+error.message);doc.path=path}
 db.accDocs.push(doc);audit('Documento contábil anexado',`${month} · ${tipo} · ${file.name}`);render();toast('Arquivo anexado.')}

// ═════════════════════════ PREÇOS E SIMULADOR ═════════════════════════
function defaultsPricing(){return {impostos:8,ads:3,fixos:5,juros:0,margemAlvo:15,
 canais:{'Mercado Livre':{comissao:14,fixa:0,servico:0,frete:0,cupom:0,faixaAte:79,faixaValor:6.75,ativo:true},'Shopee':{comissao:14,fixa:4,servico:6,frete:0,cupom:0,faixaAte:0,faixaValor:0,ativo:true},
  'Magalu':{comissao:16,fixa:5,servico:0,frete:0,cupom:0,faixaAte:0,faixaValor:0,ativo:true},'Site próprio':{comissao:0,fixa:0,servico:4,frete:0,cupom:0,faixaAte:0,faixaValor:0,ativo:false}}}}
// Resultado unitário de um preço num canal. Tudo em R$ por unidade.
function calc(P,c,{custo=0,embalagem=0}={},g=db.pricing){P=n2(P);const q={preco:P,comissao:P*n2(c.comissao)/100,fixa:n2(c.fixa)+(n2(c.faixaAte)&&P<n2(c.faixaAte)?n2(c.faixaValor):0),servico:P*n2(c.servico)/100,frete:n2(c.frete),cupom:P*n2(c.cupom)/100,
 impostos:P*n2(g.impostos)/100,ads:P*n2(g.ads)/100,juros:P*n2(g.juros)/100,fixos:P*n2(g.fixos)/100,custo:n2(custo),embalagem:n2(embalagem)};
 q.canal=q.comissao+q.fixa+q.servico+q.frete+q.cupom;q.total=q.canal+q.impostos+q.ads+q.juros+q.fixos+q.custo+q.embalagem;q.lucro=P-q.total;q.margem=P?q.lucro/P*100:0;q.repasse=P-q.canal;return q}
// Preço para uma margem alvo (busca binária: lida com tarifas por faixa de preço).
function precoPara(margem,c,prod,g){let lo=0,hi=Math.max(10,(n2(prod.custo)+n2(prod.embalagem))*20+200);for(let i=0;i<60;i++){const mid=(lo+hi)/2;calc(mid,c,prod,g).margem<margem?lo=mid:hi=mid}return Math.round(hi*100)/100}
function vendidos(){const ref=new Date(Date.now()-90*864e5).toLocaleDateString('sv-SE'),m=new Map();for(const o of db.orders){if(o.date<ref)continue;for(const it of o.items||[]){const k=normalized(it.sku||it.title);const x=m.get(k)||{sku:it.sku,nome:it.title,qtd:0,receita:0,canais:{}};x.qtd+=n2(it.qty);x.receita+=n2(it.qty)*n2(it.price);const cc=x.canais[o.platform]||(x.canais[o.platform]={qtd:0,receita:0});cc.qtd+=n2(it.qty);cc.receita+=n2(it.qty)*n2(it.price);m.set(k,x)}}return m}
function taxaEfetiva(canal){const ref=new Date(Date.now()-90*864e5).toLocaleDateString('sv-SE'),rows=db.orders.filter(o=>o.platform===canal&&o.date>=ref&&o.feeSource&&o.feeSource!=='Bling');const g=rows.reduce((a,o)=>a+o.gross,0);return g?rows.reduce((a,o)=>a+o.fee,0)/g*100:null}

function precosView(){ensure();return `${tabs('prec',ui.prec,[['tabela','Tabela de preços'],['simulador','Simulador'],['regras','Regras dos canais'],['cenarios','Cenários salvos']])}${ui.prec==='simulador'?simView():ui.prec==='regras'?regrasView():ui.prec==='cenarios'?cenariosView():tabelaView()}`}

function tabelaView(){const P=db.pricing,ch=CANAIS.filter(c=>P.canais[c]?.ativo),vend=vendidos(),q=normalized(ui.search);
 const semCusto=[...vend.values()].filter(v=>!db.products.some(p=>normalized(p.id)===normalized(v.sku))).length;
 const list=db.products.filter(p=>!q||normalized(p.id+' '+p.nome).includes(q)).map(p=>({p,v:vend.get(normalized(p.id))})).sort((a,b)=>(b.v?.receita||0)-(a.v?.receita||0));
 return `<div class="notice">Preço atual × custo × regras de cada canal. <strong>Mínimo</strong> = margem zero; <strong>sugerido</strong> = margem alvo de ${pctf(P.margemAlvo)} (ajuste em Regras). Clique num produto para simular.${semCusto?` <strong>${semCusto} SKUs vendidos nos últimos 90 dias ainda sem custo cadastrado.</strong>`:''}</div>
 <div class="filters"><input type="search" id="gSearch" placeholder="Buscar SKU ou produto…" value="${esc(ui.search)}"><button class="primary" data-g="import-precos">${icon('upload')} Importar planilha de preços</button>${semCusto?`<button data-g="add-vendidos">${icon('box')} Trazer ${semCusto} SKUs vendidos</button>`:''}<button data-g="export-precos">${icon('download')} Exportar</button></div>
 ${!db.products.length?`<div class="empty">Nenhum produto na tabela. Importe sua planilha (SKU, nome, custo e preços por canal) ou traga os SKUs vendidos para completar os custos.</div>`:`<div class="tablebox"><div class="tablewrap"><table class="pricetable"><thead><tr><th>Produto</th><th class="num">Custo</th><th class="num">Vendas 90d</th>${ch.map(c=>`<th class="num" colspan="3">${c}<br><span class="caption">atual · margem · mín/sug.</span></th>`).join('')}</tr></thead><tbody>${list.slice(0,400).map(({p,v})=>`<tr data-g-sim="${esc(p.id)}"><td><strong>${esc(p.nome||p.id)}</strong><br><span class="caption">${esc(p.id)}</span></td><td class="num">${p.custo?money(p.custo):'<span class="badge warn">sem custo</span>'}</td><td class="num">${v?v.qtd.toLocaleString('pt-BR'):'—'}</td>${ch.map(c=>{const pr=n2(p.precos?.[c])||(v?.canais[c]?round(v.canais[c].receita/v.canais[c].qtd):0),cc=P.canais[c];if(!pr)return '<td class="num caption" colspan="3">—</td>';const r=calc(pr,cc,p),mn=precoPara(0,cc,p),sg=precoPara(P.margemAlvo,cc,p);return `<td class="num">${money(pr)}${p.precos?.[c]?'':'<br><span class="caption">média vendida</span>'}</td><td class="num"><span class="badge ${r.margem<0?'bad':r.margem<P.margemAlvo?'warn':'ok'}">${pctf(r.margem)}</span></td><td class="num caption">${money(mn)}<br>${money(sg)}</td>`}).join('')}</tr>`).join('')}</tbody></table></div></div>`}`}

function regrasView(){const P=db.pricing,f=(path,val,suf,step=0.1)=>`<div class="inp"><input type="number" step="${step}" data-g-rule="${path}" value="${val}"><span>${suf}</span></div>`;
 return `<div class="notice">Valores iniciais aproximados — <strong>ajuste com as condições da sua conta</strong> (categoria, reputação, programa de frete). A taxa efetiva real dos últimos 90 dias aparece ao lado como referência.</div>
 <div class="grid two"><div class="card"><div class="cardhead"><h2>Premissas gerais</h2>${icon('sliders')}</div>
 <div class="rulegrid"><label>Impostos sobre venda</label>${f('impostos',P.impostos,'%')}<label>Anúncios / marketing</label>${f('ads',P.ads,'%')}<label>Custos fixos rateados</label>${f('fixos',P.fixos,'%')}<label>Juros de parcelamento (vendedor)</label>${f('juros',P.juros,'%')}<label>Margem alvo</label>${f('margemAlvo',P.margemAlvo,'%')}</div></div>
 ${CANAIS.map(c=>{const r=P.canais[c],te=taxaEfetiva(c);return `<div class="card"><div class="cardhead"><h2>${c}</h2><label class="row caption"><input type="checkbox" class="check" data-g-rule="canais.${c}.ativo" ${r.ativo?'checked':''}> usar na tabela</label></div>
 ${te!=null?`<p class="caption" style="margin-bottom:10px">Taxa efetiva observada (90 dias, sobre a NF): <strong>${pctf(te)}</strong></p>`:''}
 <div class="rulegrid"><label>Comissão</label>${f(`canais.${c}.comissao`,r.comissao,'%')}<label>Tarifa fixa por venda</label>${f(`canais.${c}.fixa`,r.fixa,'R$',0.01)}<label>Taxa de serviço / transação</label>${f(`canais.${c}.servico`,r.servico,'%')}<label>Frete pago pelo vendedor</label>${f(`canais.${c}.frete`,r.frete,'R$',0.01)}<label>Cupom / desconto médio</label>${f(`canais.${c}.cupom`,r.cupom,'%')}<label>Tarifa extra abaixo de</label>${f(`canais.${c}.faixaAte`,r.faixaAte,'R$',0.01)}<label>Valor da tarifa extra</label>${f(`canais.${c}.faixaValor`,r.faixaValor,'R$',0.01)}</div></div>`}).join('')}</div>`}

// ── Simulador ──
const sim={sku:'',canal:'Shopee',preco:0,custo:0,embalagem:0,volume:100,fixoMensal:0,over:{}};
function simProd(){const p=db.products.find(x=>x.id===sim.sku);return p||{custo:sim.custo,embalagem:sim.embalagem}}
function simCanal(){return {...db.pricing.canais[sim.canal],...sim.over}}
function simView(){const P=db.pricing,p=db.products.find(x=>x.id===sim.sku);if(p&&!sim.preco){sim.preco=n2(p.precos?.[sim.canal])||precoPara(P.margemAlvo,P.canais[sim.canal],p);sim.custo=n2(p.custo);sim.embalagem=n2(p.embalagem)}if(!sim.preco)sim.preco=100;
 const c=simCanal(),g=db.pricing,slider=(k,label,val,min,max,step,suf)=>`<div class="sl"><div class="row" style="justify-content:space-between"><label for="s-${k}">${label}</label><span class="slv"><input type="number" step="${step}" data-s="${k}" value="${val}" aria-label="${label}"> ${suf}</span></div><input type="range" id="s-${k}" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
 return `<div class="grid simgrid"><div class="card"><div class="cardhead"><h2>Parâmetros</h2>${icon('sliders')}</div>
 <label for="sSku">Produto (opcional)</label><select id="sSku" style="width:100%"><option value="">Simulação livre</option>${db.products.map(x=>`<option value="${esc(x.id)}" ${x.id===sim.sku?'selected':''}>${esc((x.nome||x.id).slice(0,60))}</option>`).join('')}</select>
 <label for="sCanal">Canal</label><select id="sCanal" style="width:100%">${CANAIS.map(x=>`<option ${x===sim.canal?'selected':''}>${x}</option>`).join('')}</select>
 ${slider('preco','Preço de venda',sim.preco,1,Math.max(500,Math.ceil(sim.preco*2.5)),0.1,'R$')}
 ${slider('custo','Custo do produto',p?n2(p.custo):sim.custo,0,Math.max(300,Math.ceil(sim.preco*1.5)),0.1,'R$')}
 ${slider('embalagem','Embalagem',p?n2(p.embalagem):sim.embalagem,0,50,0.1,'R$')}
 ${slider('comissao','Comissão do canal',c.comissao,0,40,0.1,'%')}
 ${slider('fixa','Tarifa fixa',c.fixa,0,30,0.01,'R$')}
 ${slider('servico','Taxa de serviço',c.servico,0,20,0.1,'%')}
 ${slider('frete','Frete pago pelo vendedor',c.frete,0,120,0.1,'R$')}
 ${slider('cupom','Cupom / desconto',c.cupom,0,50,0.5,'%')}
 ${slider('g.impostos','Impostos',g.impostos,0,30,0.1,'%')}
 ${slider('g.ads','Anúncios',g.ads,0,30,0.1,'%')}
 ${slider('g.fixos','Custos fixos rateados',g.fixos,0,30,0.1,'%')}
 ${slider('volume','Volume por mês',sim.volume,0,5000,10,'un.')}
 <div class="row wrap" style="margin-top:14px"><button class="small" data-g="sim-reset">Voltar às regras do canal</button><button class="primary small" data-g="sim-save">${icon('save')} Salvar cenário</button></div></div>
 <div id="simOut">${simOut()}</div></div>`}
function simOut(){const p=simProd(),c=simCanal(),g=db.pricing,r=calc(sim.preco,c,p,g),alvo=g.margemAlvo,mn=precoPara(0,c,p,g),sg=precoPara(alvo,c,p,g);
 const parts=[['Custo do produto',r.custo,'#8b93a8'],['Embalagem',r.embalagem,'#a3abc0'],['Comissão',r.comissao,'#ff9274'],['Tarifa fixa',r.fixa,'#ffb199'],['Taxa de serviço',r.servico,'#ffc7b5'],['Frete',r.frete,'#6bb5ff'],['Cupom',r.cupom,'#f4d66d'],['Impostos',r.impostos,'#edc47b'],['Anúncios',r.ads,'#a88aff'],['Juros',r.juros,'#c4b0ff'],['Fixos rateados',r.fixos,'#d6caff']].filter(x=>x[1]>0.004);
 const grid=[-20,-10,-5,0,5,10,20],costs=[-10,0,10];
 return `<div class="grid metrics" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div class="card metric"><div class="label">Lucro por unidade</div><div class="value ${r.lucro<0?'red':'green'}">${money(r.lucro)}</div><small>Margem ${pctf(r.margem)}</small></div><div class="card metric"><div class="label">Repasse do canal</div><div class="value">${money(r.repasse)}</div><small>Preço − custos do canal</small></div><div class="card metric"><div class="label">Preço mínimo</div><div class="value">${money(mn)}</div><small>Margem zero</small></div><div class="card metric"><div class="label">Preço p/ ${pctf(alvo)}</div><div class="value purple">${money(sg)}</div><small><button class="quiet small" data-g="sim-apply" data-v="${sg}">Usar este preço</button></small></div></div>
 <div class="card" style="margin-bottom:16px"><div class="cardhead"><h2>Para onde vai o preço de ${money(r.preco)}</h2></div><div class="stackbar">${parts.map(([l,v,col])=>`<i style="width:${v/Math.max(r.preco,r.total)*100}%;background:${col}" title="${l}: ${money(v)}"></i>`).join('')}${r.lucro>0?`<i style="width:${r.lucro/r.preco*100}%;background:var(--green)" title="Lucro: ${money(r.lucro)}"></i>`:''}</div>
 <div class="waterfall">${[['Preço de venda',r.preco,'']].concat(parts.map(([l,v])=>[l,-v,''])).concat([['Lucro',r.lucro,'total']]).map(([l,v,t])=>`<div class="listline ${t}"><span>${l}</span><strong class="${v<0&&t!=='total'?'':v<0?'red':t?'green':''}">${money(v)} <span class="caption">${pctf(r.preco?v/r.preco*100:0)}</span></strong></div>`).join('')}</div></div>
 <div class="grid two"><div class="card"><div class="cardhead"><h2>Mesmo produto em cada canal</h2></div><div class="tablewrap"><table><thead><tr><th>Canal</th><th class="num">Neste preço</th><th class="num">Mínimo</th><th class="num">Sugerido</th></tr></thead><tbody>${CANAIS.map(ch=>{const cc=db.pricing.canais[ch],x=calc(sim.preco,cc,p,g);return `<tr><td>${ch}</td><td class="num"><span class="badge ${x.margem<0?'bad':x.margem<alvo?'warn':'ok'}">${pctf(x.margem)}</span><br><span class="caption">${money(x.lucro)}</span></td><td class="num">${money(precoPara(0,cc,p,g))}</td><td class="num">${money(precoPara(alvo,cc,p,g))}</td></tr>`}).join('')}</tbody></table></div></div>
 <div class="card"><div class="cardhead"><h2>Projeção mensal</h2></div><div class="listline"><span>Faturamento (${sim.volume} un.)</span><strong>${money(r.preco*sim.volume)}</strong></div><div class="listline"><span>Custos do canal</span><strong>${money(r.canal*sim.volume)}</strong></div><div class="listline"><span>Lucro no mês</span><strong class="${r.lucro<0?'red':'green'}">${money(r.lucro*sim.volume)}</strong></div><div class="listline"><span>Custo fixo mensal extra (opcional)</span><span class="slv"><input type="number" step="100" data-s="fixoMensal" value="${sim.fixoMensal}"> R$</span></div><div class="listline"><span>Ponto de equilíbrio</span><strong>${r.lucro>0?Math.ceil(sim.fixoMensal/r.lucro).toLocaleString('pt-BR')+' un./mês':'—'}</strong></div></div></div>
 <div class="card" style="margin-top:16px"><div class="cardhead"><h2>Sensibilidade · margem por preço e custo</h2></div><div class="tablewrap"><table class="sens"><thead><tr><th>Custo \\ Preço</th>${grid.map(d=>`<th class="num">${money(sim.preco*(1+d/100))}<br><span class="caption">${d>0?'+':''}${d}%</span></th>`).join('')}</tr></thead><tbody>${costs.map(dc=>{const pp={custo:n2(p.custo)*(1+dc/100),embalagem:p.embalagem};return `<tr><td>${money(pp.custo)} <span class="caption">${dc>0?'+':''}${dc}%</span></td>${grid.map(d=>{const x=calc(sim.preco*(1+d/100),c,pp,g);return `<td class="num"><span class="heat ${x.margem<0?'bad':x.margem<alvo?'warn':'ok'}">${pctf(x.margem)}</span></td>`}).join('')}</tr>`}).join('')}</tbody></table></div></div>`}
function onSim(el){const k=el.dataset.s,val=n2(el.value);if(k==='preco')sim.preco=val;else if(k==='custo'||k==='embalagem'){const p=db.products.find(x=>x.id===sim.sku);if(p){sim.custo=n2(p.custo);sim.embalagem=n2(p.embalagem);sim.sku=''}sim[k]=val}else if(k==='volume'||k==='fixoMensal')sim[k]=val;else if(k.startsWith('g.'))db.pricing[k.slice(2)]=val,save();else sim.over[k]=val;
 $$(`[data-s="${k}"]`).forEach(x=>{if(x!==el)x.value=val});const o=$('#simOut');if(o)o.innerHTML=simOut()}

function cenariosView(){return `<div class="notice">Cenários guardam o preço, o custo, o canal e todos os parâmetros do simulador. Carregue para continuar testando.</div>${db.scenarios.length?`<div class="tablebox"><div class="tablewrap"><table><thead><tr><th>Cenário</th><th>Canal</th><th class="num">Preço</th><th class="num">Custo</th><th class="num">Margem</th><th>Salvo em</th><th></th></tr></thead><tbody>${db.scenarios.slice().sort((a,b)=>b.time.localeCompare(a.time)).map(s=>{const d=s.data,r=calc(d.preco,{...db.pricing.canais[d.canal],...d.over},{custo:d.custo,embalagem:d.embalagem},{...db.pricing,...(d.g||{})});return `<tr><td><strong>${esc(s.nome)}</strong></td><td>${esc(d.canal)}</td><td class="num">${money(d.preco)}</td><td class="num">${money(d.custo)}</td><td class="num"><span class="badge ${r.margem<0?'bad':'ok'}">${pctf(r.margem)}</span></td><td>${new Date(s.time).toLocaleString('pt-BR')}</td><td><div class="row"><button class="small" data-g-load="${esc(s.id)}">Carregar</button><button class="small quiet" data-g-delsc="${esc(s.id)}" aria-label="Excluir">${icon('trash')}</button></div></td></tr>`}).join('')}</tbody></table></div></div>`:'<div class="empty">Nenhum cenário salvo. No simulador, clique em “Salvar cenário”.</div>'}`}

function importPrecos(){TableImport.open({title:'Importar planilha de preços e custos',hint:'Uma linha por produto. Colunas de preço por canal são opcionais; SKUs já cadastrados são atualizados.',
 fields:[{key:'sku',label:'SKU',required:true,aliases:['codigo','cod','referencia','sku']},{key:'nome',label:'Produto',aliases:['descricao','nome','produto','titulo']},{key:'custo',label:'Custo',required:true,aliases:['custo','custo unitario','preco de custo','cmv','custo medio']},{key:'embalagem',label:'Embalagem',aliases:['embalagem','custo embalagem']},{key:'categoria',label:'Categoria',aliases:['categoria','linha','familia']},
  {key:'Mercado Livre',label:'Preço Mercado Livre',aliases:['mercado livre','ml','preco ml','preco mercado livre']},{key:'Shopee',label:'Preço Shopee',aliases:['shopee','preco shopee']},{key:'Magalu',label:'Preço Magalu',aliases:['magalu','preco magalu']},{key:'Site próprio',label:'Preço site',aliases:['site','loja','preco site','preco venda','preco']}],
 onConfirm(rows,meta){let n=0;for(const r of rows){if(!r.sku)continue;const p=db.products.find(x=>normalized(x.id)===normalized(r.sku))||(db.products.push({id:r.sku.trim(),precos:{}}),db.products.at(-1));p.nome=r.nome||p.nome||'';p.categoria=r.categoria||p.categoria||'';p.custo=round(Math.abs(TableImport.num(r.custo)));if(r.embalagem)p.embalagem=round(Math.abs(TableImport.num(r.embalagem)));p.precos={...(p.precos||{})};for(const c of CANAIS)if(r[c])p.precos[c]=round(Math.abs(TableImport.num(r[c])));n++}
  audit('Tabela de preços importada',`${meta.file}: ${n} produtos`);render();toast(`${n} produtos importados.`)}})}

function exportCsv(name,rows){download(`${name}.csv`,csv(rows));toast('Arquivo CSV gerado.')}
function setPath(obj,path,val){const k=path.split('.');let o=obj;while(k.length>1){const x=k.shift();o=o[x]=o[x]||{}}o[k[0]]=val}

// ═════════════════════════ Registro das páginas e eventos ═════════════════════════
addPage('contabil','book','Contabilidade e Resultado',contabilView,'Razão, balancete e PDFs do escritório viram a DRE gerencial do e-commerce.','produtos',bindGestao);
addPage('precos','tag','Preços e Simulador',precosView,'Custos, regras de cada canal e margem de cada produto — e um simulador para testar.','produtos',bindGestao);
function bindGestao(){const s=$('#gSearch');if(s)s.oninput=e=>{ui.search=e.target.value;const pos=e.target.selectionStart;render();const a=$('#gSearch');a.focus();try{a.setSelectionRange(pos,pos)}catch{}};
 const mf=$('#gMapFilter');if(mf)mf.onchange=e=>{ui.mapFilter=e.target.value;render()};
 $$('[data-g-map]').forEach(x=>x.onchange=()=>{db.accMap[x.dataset.gMap]={linha:x.value,descricao:x.dataset.desc};save();if(ui.mapFilter==='pendentes')render()});
 $$('[data-g-attach]').forEach(x=>x.onchange=e=>attach(x.dataset.gAttach,e.target.files[0]));
 $$('[data-g-rule]').forEach(x=>x.onchange=()=>{setPath(db.pricing,x.dataset.gRule,x.type==='checkbox'?x.checked:n2(x.value));save()});
 $$('[data-s]').forEach(x=>x.oninput=()=>onSim(x));
 const sk=$('#sSku');if(sk)sk.onchange=e=>{sim.sku=e.target.value;sim.preco=0;sim.over={};render()};
 const sc=$('#sCanal');if(sc)sc.onchange=e=>{sim.canal=e.target.value;sim.over={};if(sim.sku)sim.preco=0;render()};
 $$('tr[data-g-sim]').forEach(tr=>tr.onclick=()=>{sim.sku=tr.dataset.gSim;sim.preco=0;sim.over={};ui.prec='simulador';render()})}

document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.gTab){const [g,k]=d.gTab.split(':');ui[g]=k;ui.search='';closeModal();if(g==='cont'&&page!=='contabil')navigate('contabil');render();return}
 if(d.gImport){importAccounting(d.gImport);return}
 if(d.gClear){modal('Limpar importação',`<p>Remover as linhas de ${d.gClear==='razao'?'razão':'balancete'} de ${monthLabel(month)}? Você pode importar de novo depois.</p><div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-g-clearok="${d.gClear}">Remover</button></div>`);return}
 if(d.gClearok){db.accLines=db.accLines.filter(l=>!(l.month===month&&l.kind===d.gClearok));audit('Importação contábil removida',`${d.gClearok} · ${month}`);closeModal();render();return}
 if(d.gOpen){const doc=db.accDocs.find(x=>x.id===d.gOpen);if(!doc?.path||!window.Cloud?.client)return;const {data,error}=await Cloud.client.storage.from('contabil').createSignedUrl(doc.path,300);if(error)return toast(error.message);window.open(data.signedUrl,'_blank','noopener');return}
 if(d.gDeldoc){const doc=db.accDocs.find(x=>x.id===d.gDeldoc);if(!doc)return;if(doc.path&&window.Cloud?.client)await Cloud.client.storage.from('contabil').remove([doc.path]);db.accDocs=db.accDocs.filter(x=>x.id!==doc.id);audit('Documento contábil removido',`${doc.month} · ${doc.nome}`);render();return}
 if(d.gLoad){const s=db.scenarios.find(x=>x.id===d.gLoad);Object.assign(sim,JSON.parse(JSON.stringify(s.data)));if(s.data.g)Object.assign(db.pricing,{impostos:s.data.g.impostos,ads:s.data.g.ads,fixos:s.data.g.fixos});ui.prec='simulador';render();toast('Cenário carregado.');return}
 if(d.gDelsc){db.scenarios=db.scenarios.filter(x=>x.id!==d.gDelsc);save();render();return}
 switch(d.g){
  case'accept-all':{const {contas}=movimentos(month);let n=0;for(const c of contas)if(!db.accMap[c.conta]){db.accMap[c.conta]={linha:suggest(c.conta,c.descricao),descricao:c.descricao};n++}audit('Classificação contábil confirmada',`${n} contas · ${month}`);render();toast(`${n} contas classificadas.`);break}
  case'export-dre':{const meses=[...new Set([...mesesContabeis(),month])].sort().slice(-12),ss=meses.map(m=>{const c=dreMes(m);return c.fonte?c:dreOperacao(m)});exportCsv(`DRE_gerencial_${month}`,[['linha',...meses.map(m=>m+(dreMes(m).fonte?'':' (estimada)'))],...DRE.map(([k,l])=>[l,...ss.map(x=>x.v[k]||0)])]);break}
  case'import-precos':importPrecos();break;
  case'add-vendidos':{let n=0;for(const v of vendidos().values()){if(!v.sku||db.products.some(p=>normalized(p.id)===normalized(v.sku)))continue;db.products.push({id:v.sku,nome:v.nome,custo:0,embalagem:0,precos:Object.fromEntries(Object.entries(v.canais).map(([c,x])=>[c,round(x.receita/x.qtd)]))});n++}audit('SKUs vendidos adicionados à tabela de preços',`${n} produtos (preço = média vendida; custo a preencher)`);render();toast(`${n} SKUs adicionados. Preencha os custos importando sua planilha.`);break}
  case'export-precos':{const ch=CANAIS.filter(c=>db.pricing.canais[c]?.ativo);exportCsv('tabela_de_precos',[['sku','produto','custo','embalagem',...ch.flatMap(c=>[`${c} preço`,`${c} margem %`,`${c} mínimo`,`${c} sugerido`])],...db.products.map(p=>[p.id,p.nome,p.custo,p.embalagem,...ch.flatMap(c=>{const cc=db.pricing.canais[c],pr=n2(p.precos?.[c]),r=calc(pr,cc,p);return [pr||'',pr?round(r.margem):'',precoPara(0,cc,p),precoPara(db.pricing.margemAlvo,cc,p)]})])]);break}
  case'sim-reset':sim.over={};render();break;
  case'sim-apply':sim.preco=n2(d.v);render();break;
  case'sim-save':{modal('Salvar cenário',`<label for="scName">Nome do cenário</label><input id="scName" style="width:100%" value="${esc((db.products.find(x=>x.id===sim.sku)?.nome||'Simulação')+' · '+sim.canal+' · '+money(sim.preco))}"><div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-g="sim-save-ok">${icon('save')} Salvar</button></div>`);break}
  case'sim-save-ok':{const p=simProd();db.scenarios.push({id:uid(),nome:$('#scName').value.trim()||'Cenário',time:new Date().toISOString(),data:{...JSON.parse(JSON.stringify(sim)),custo:n2(p.custo),embalagem:n2(p.embalagem),g:{impostos:db.pricing.impostos,ads:db.pricing.ads,fixos:db.pricing.fixos}}});save();closeModal();toast('Cenário salvo.');break}
 }});
ensure();
window.Gestao={calc,precoPara,dreMes,dreOperacao};
})();
