'use strict';
// Modo nuvem (Supabase): login, carregamento do workspace e gravação incremental.
// Sem config.js preenchido, o Fechaí continua no modo local (dados neste navegador).
(()=>{
const cfg=window.CONCILIA_CONFIG||{};
const Cloud=window.Cloud={workspaces:[],enabled:!!(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase),client:null,session:null,ws:null,wsName:'',role:'',state:'idle',error:'',localBackup:null};
document.body.classList.remove('booting');
if(!Cloud.enabled){Cloud.state='local';return}

const sb=Cloud.client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
// Dados que já estavam neste navegador (modo local) podem ser enviados para a nuvem depois do login.
if(db.orders.length||db.receipts.length)Cloud.localBackup=JSON.parse(JSON.stringify(db));

// ───────── Mapeamento entre o formato da tela e as tabelas ─────────
const n=v=>v==null?0:Number(v);
const maps={
 orders:{table:'orders',key:'id',
  toRow:o=>({id:o.id,platform:o.platform,date:o.date,gross:o.gross,fee:o.fee,nf:o.nf||null,due:o.due||null,transit:!!o.transit,note:o.note||'',source:o.source||'Importado',customer:o.customer||null,state:o.state||null,items:o.items||null,shipping:o.shipping??null,fee_source:o.feeSource||null,external:o.external||null}),
  fromRow:r=>({id:r.id,platform:r.platform,date:r.date,gross:n(r.gross),fee:n(r.fee),nf:r.nf||'',due:r.due||'',transit:!!r.transit,note:r.note||'',source:r.source,customer:r.customer||null,state:r.state||'',items:r.items||[],shipping:r.shipping==null?null:n(r.shipping),feeSource:r.fee_source||'',external:r.external||null})},
 receipts:{table:'receipts',key:'id',
  toRow:r=>({id:r.id,order_id:r.orderId||null,platform:r.platform,account:r.account,date:r.date,amount:r.amount,linked_order:r.linkedOrder||null,source:r.source||'Importado',kind:r.kind||'liberacao',description:r.description||null}),
  fromRow:r=>({id:r.id,orderId:r.order_id||'',platform:r.platform,account:r.account,date:r.date,amount:n(r.amount),linkedOrder:r.linked_order||null,source:r.source,kind:r.kind,description:r.description||''})},
 ledger:{table:'ledger',key:'id',
  toRow:l=>({id:l.id,kind:l.kind,due:l.due||null,paid_date:l.paidDate||null,amount:l.amount,status:l.status||null,category:l.category||null,contact:l.contact||null,description:l.description||null,source:l.source||'Importado'}),
  fromRow:r=>({id:r.id,kind:r.kind,due:r.due||'',paidDate:r.paid_date||'',amount:n(r.amount),status:r.status||'',category:r.category||'',contact:r.contact||'',description:r.description||'',source:r.source})},
 imports:{table:'imports',key:'id',
  toRow:i=>({id:i.id,file:i.file,type:i.type,count:i.count,format:i.format||null,time:i.time}),
  fromRow:r=>({id:r.id,file:r.file,type:r.type,count:r.count,format:r.format,time:r.time})},
 accLines:{table:'accounting_lines',key:'id',
  toRow:l=>({id:l.id,month:l.month,kind:l.kind,conta:l.conta,descricao:l.descricao||null,data:l.data||null,historico:l.historico||null,debito:l.debito||0,credito:l.credito||0,saldo_anterior:l.saldoAnterior??null,saldo:l.saldo??null}),
  fromRow:r=>({id:r.id,month:r.month,kind:r.kind,conta:r.conta,descricao:r.descricao||'',data:r.data||null,historico:r.historico||'',debito:n(r.debito),credito:n(r.credito),saldoAnterior:r.saldo_anterior==null?null:n(r.saldo_anterior),saldo:r.saldo==null?null:n(r.saldo)})},
 accDocs:{table:'accounting_docs',key:'id',
  toRow:d=>({id:d.id,month:d.month,tipo:d.tipo,nome:d.nome,path:d.path||null,size:d.size||null,time:d.time}),
  fromRow:r=>({id:r.id,month:r.month,tipo:r.tipo,nome:r.nome,path:r.path,size:r.size,time:r.time})},
 products:{table:'pricing_products',key:'id',
  toRow:p=>({id:p.id,nome:p.nome||null,categoria:p.categoria||null,custo:p.custo||0,embalagem:p.embalagem||0,peso:p.peso??null,precos:p.precos||{},extra:p.extra||{}}),
  fromRow:r=>({id:r.id,nome:r.nome||'',categoria:r.categoria||'',custo:n(r.custo),embalagem:n(r.embalagem),peso:r.peso==null?null:n(r.peso),precos:r.precos||{},extra:r.extra||{}})},
 scenarios:{table:'pricing_scenarios',key:'id',
  toRow:s=>({id:s.id,nome:s.nome,data:s.data,time:s.time}),
  fromRow:r=>({id:r.id,nome:r.nome,data:r.data,time:r.time})},
 audit:{table:'audit_log',key:'id',insertOnly:true,
  toRow:a=>({id:a.id,time:a.time,action:a.action,detail:a.detail||'',actor:a.actor||Cloud.session?.user?.email||null}),
  fromRow:r=>({id:r.id,time:r.time,action:r.action,detail:r.detail,actor:r.actor})},
};
const listOf={orders:()=>db.orders,receipts:()=>db.receipts,ledger:()=>db.ledger,imports:()=>db.imports,audit:()=>db.audit,accLines:()=>db.accLines||[],accDocs:()=>db.accDocs||[],products:()=>db.products||[],scenarios:()=>db.scenarios||[]};
let snap={};           // último estado gravado: coleção → Map(id → JSON)
let flushTimer=null,flushing=null,dirty=false;

function ensureIds(){for(const i of db.imports)i.id=i.id||uid();for(const a of db.audit)a.id=a.id||uid()}
function snapshot(){ensureIds();snap={};for(const [k,m] of Object.entries(maps))snap[k]=new Map(listOf[k]().map(x=>[x[m.key],JSON.stringify(m.toRow(x))]));
 snap.crm=new Map(Object.entries(db.crm||{}).map(([id,c])=>[id,JSON.stringify(c)]));snap.accMap=new Map(Object.entries(db.accMap||{}).map(([id,c])=>[id,JSON.stringify(c)]));snap.closures=new Map(Object.entries(db.closures||{}).map(([m,c])=>[m,JSON.stringify(c)]));snap.settings=JSON.stringify(settingsOf())}
function settingsOf(){return {theme:db.theme,pricing:db.pricing||null}}

async function pageAll(table){let out=[],from=0;for(;;){const {data,error}=await sb.from(table).select('*').eq('workspace_id',Cloud.ws).range(from,from+999);if(error)throw error;out.push(...data);if(data.length<1000)return out;from+=1000}}

async function load(){
 Cloud.state='loading';
 const [orders,receipts,ledger,imports,audit,crm,closures,settings,accLines,accMap,accDocs,products,scenarios]=await Promise.all(['orders','receipts','ledger','imports','audit_log','crm_contacts','closures','workspace_settings','accounting_lines','account_map','accounting_docs','pricing_products','pricing_scenarios'].map(pageAll));
 const next={orders:orders.map(maps.orders.fromRow),receipts:receipts.map(maps.receipts.fromRow),ledger:ledger.map(maps.ledger.fromRow),
  imports:imports.map(maps.imports.fromRow).sort((a,b)=>b.time.localeCompare(a.time)),audit:audit.map(maps.audit.fromRow).sort((a,b)=>b.time.localeCompare(a.time)),
  crm:Object.fromEntries(crm.map(c=>[c.id,{stage:c.stage,tags:c.tags||[],notes:c.notes||'',interactions:c.interactions||[]}])),
  closures:Object.fromEntries(closures.map(c=>[c.month,c.data])),theme:settings[0]?.data?.theme||db.theme||'dark',schemaVersion:2,
  accLines:accLines.map(maps.accLines.fromRow),accMap:Object.fromEntries(accMap.map(a=>[a.conta,{linha:a.linha,descricao:a.descricao||''}])),accDocs:accDocs.map(maps.accDocs.fromRow),
  products:products.map(maps.products.fromRow),scenarios:scenarios.map(maps.scenarios.fromRow),pricing:settings[0]?.data?.pricing||undefined};
 db=next;paymentIndex=null;snapshot();Cloud.state='saved';
 document.body.classList.toggle('light',db.theme==='light');
 const months=[...new Set(db.orders.map(o=>o.date.slice(0,7)))].sort();
 if(months.length&&!months.includes(month))month=months.at(-1);
}
Cloud.reload=async()=>{await flush();await load();render()};
Cloud.switchWs=async id=>{const w=Cloud.workspaces.find(x=>x.id===id);if(!w||id===Cloud.ws)return;await flush();Cloud.ws=w.id;Cloud.wsName=w.name;Cloud.role=w.role;try{localStorage.setItem('concilia-ws',id)}catch{}await load();window.Integrations&&(Integrations.state.loaded=false);render();toast('Workspace: '+w.name)};
Cloud.renameWs=async name=>{const {error}=await sb.from('workspaces').update({name}).eq('id',Cloud.ws);if(error)throw error;Cloud.wsName=name;const w=Cloud.workspaces.find(x=>x.id===Cloud.ws);if(w)w.name=name};

async function flush(){
 if(flushing){dirty=true;return flushing}
 clearTimeout(flushTimer);
 flushing=(async()=>{
  try{
   Cloud.state='saving';paintStatus();ensureIds();const ws=Cloud.ws;
   for(const [k,m] of Object.entries(maps)){
    const cur=new Map(listOf[k]().map(x=>[x[m.key],JSON.stringify(m.toRow(x))])),old=snap[k]||new Map();
    const changed=[...cur].filter(([id,j])=>old.get(id)!==j).map(([,j])=>({workspace_id:ws,...JSON.parse(j)}));
    for(let i=0;i<changed.length;i+=500){const q=m.insertOnly?sb.from(m.table).upsert(changed.slice(i,i+500),{onConflict:'workspace_id,id',ignoreDuplicates:true}):sb.from(m.table).upsert(changed.slice(i,i+500),{onConflict:'workspace_id,id'});const {error}=await q;if(error)throw error}
    if(!m.insertOnly){const removed=[...old.keys()].filter(id=>!cur.has(id));for(let i=0;i<removed.length;i+=200){const {error}=await sb.from(m.table).delete().eq('workspace_id',ws).in('id',removed.slice(i,i+200));if(error)throw error}}
    snap[k]=cur;
   }
   const crmNow=new Map(Object.entries(db.crm||{}).map(([id,c])=>[id,JSON.stringify(c)]));
   const crmRows=[...crmNow].filter(([id,j])=>snap.crm.get(id)!==j).map(([id,j])=>{const c=JSON.parse(j);return {workspace_id:ws,id,stage:c.stage||'Novo',tags:c.tags||[],notes:c.notes||'',interactions:c.interactions||[],updated_at:new Date().toISOString()}});
   if(crmRows.length){const {error}=await sb.from('crm_contacts').upsert(crmRows,{onConflict:'workspace_id,id'});if(error)throw error}
   snap.crm=crmNow;
   const amNow=new Map(Object.entries(db.accMap||{}).map(([id,c])=>[id,JSON.stringify(c)]));
   const amRows=[...amNow].filter(([id,j])=>snap.accMap?.get(id)!==j).map(([conta,j])=>{const c=JSON.parse(j);return {workspace_id:ws,conta,linha:c.linha,descricao:c.descricao||null}});
   if(amRows.length){const {error}=await sb.from('account_map').upsert(amRows,{onConflict:'workspace_id,conta'});if(error)throw error}
   snap.accMap=amNow;
   const clNow=new Map(Object.entries(db.closures||{}).map(([m,c])=>[m,JSON.stringify(c)]));
   const clRows=[...clNow].filter(([m,j])=>snap.closures.get(m)!==j).map(([m,j])=>({workspace_id:ws,month:m,data:JSON.parse(j)}));
   if(clRows.length){const {error}=await sb.from('closures').upsert(clRows,{onConflict:'workspace_id,month'});if(error)throw error}
   const clGone=[...snap.closures.keys()].filter(m=>!clNow.has(m));
   if(clGone.length){const {error}=await sb.from('closures').delete().eq('workspace_id',ws).in('month',clGone);if(error)throw error}
   snap.closures=clNow;
   const st=JSON.stringify(settingsOf());
   if(st!==snap.settings){const {error}=await sb.from('workspace_settings').upsert({workspace_id:ws,data:settingsOf()});if(error)throw error;snap.settings=st}
   Cloud.state='saved';Cloud.error='';
  }catch(e){Cloud.state='error';Cloud.error=e.message||String(e);console.error(e);toast('Não foi possível salvar na nuvem: '+Cloud.error)}
  finally{flushing=null;paintStatus();if(dirty){dirty=false;schedule()}}
 })();
 return flushing;
}
function schedule(){if(!Cloud.ws)return;Cloud.state='pending';paintStatus();clearTimeout(flushTimer);flushTimer=setTimeout(flush,700)}
Cloud.flush=flush;

// Em modo nuvem, save() agenda a gravação incremental em vez de usar o localStorage.
save=function(){if(!Cloud.ws)return false;schedule();return true};
window.addEventListener('beforeunload',e=>{if(Cloud.state==='pending'||Cloud.state==='saving'){flush();e.preventDefault();e.returnValue=''}});

function paintStatus(){const el=document.getElementById('cloudStatus');if(!el)return;const t={pending:['Alterações pendentes','warn'],saving:['Salvando…','info'],saved:['Salvo na nuvem','ok'],error:['Erro ao salvar','bad'],loading:['Carregando…','info']}[Cloud.state]||['Nuvem','info'];el.className='badge '+t[1];el.textContent=t[0];el.title=Cloud.error||''}
Cloud.paintStatus=paintStatus;

// ───────── Tela de acesso ─────────
function loginView(msg=''){window.Assistant?.sync();
 $('#app').innerHTML=`<div class="auth"><div class="authcard"><div class="complogo login"><img src="brand/comprastore.png" alt="Compra Store"></div><div class="brand" style="padding:0;margin-bottom:26px"><span class="mark">${icon('fechai')}</span><div>Fechaí<small>CONCILIAÇÃO E RESULTADO</small></div></div>
 <h1 style="font-size:24px">Entre na sua operação</h1><p>Seus dados ficam protegidos na nuvem e sincronizam entre computadores.</p>
 <form id="authForm" autocomplete="on"><label for="authEmail">E-mail</label><input id="authEmail" type="email" required autocomplete="email" style="width:100%">
 <label for="authPass">Senha</label><input id="authPass" type="password" minlength="8" autocomplete="current-password" style="width:100%" placeholder="Mínimo de 8 caracteres">
 <div class="row wrap" style="margin-top:18px"><button class="primary" type="submit" data-auth="login">Entrar</button><button type="submit" data-auth="signup">Criar conta</button><button type="submit" class="quiet small" data-auth="magic">Receber link por e-mail</button></div></form>
 <div id="authMsg" class="caption" style="margin-top:16px;min-height:20px">${esc(msg)}</div></div></div>`;
 let mode='login';
 $('#authForm').addEventListener('click',e=>{const b=e.target.closest('button[data-auth]');if(b)mode=b.dataset.auth},true);
 $('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPass').value,out=$('#authMsg');out.textContent='Aguarde…';
  try{let r;const redirect=location.origin+location.pathname;
   if(mode==='magic')r=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});
   else{if(password.length<8)throw Error('Informe uma senha com pelo menos 8 caracteres.');r=mode==='signup'?await sb.auth.signUp({email,password,options:{emailRedirectTo:redirect}}):await sb.auth.signInWithPassword({email,password})}
   if(r.error)throw r.error;
   if(mode==='magic')out.textContent='Enviamos um link de acesso para '+email+'.';
   else if(mode==='signup'&&!r.data.session)out.textContent='Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.';
  }catch(err){out.textContent=({'Invalid login credentials':'E-mail ou senha incorretos.','Signups not allowed for this instance':'Novos cadastros estão fechados. Peça ao dono do workspace para liberar seu acesso.','Signups not allowed for otp':'Novos cadastros estão fechados. Use um e-mail que já tenha conta.'})[err.message]||err.message}};
}

async function start(session){
 Cloud.session=session;
 if(!session){Cloud.ws=null;loginView();return}
 try{
  $('#app').innerHTML='<div class="auth"><div class="authcard"><p>Carregando seus dados…</p></div></div>';
  const {data:ws,error}=await sb.rpc('ensure_workspace');if(error)throw error;
  // Quem foi adicionado a uma equipe abre o workspace da equipe; a escolha fica lembrada neste navegador.
  const {data:mems,error:me}=await sb.from('workspace_members').select('workspace_id,role,created_at,workspaces(name)').eq('user_id',session.user.id).order('created_at');if(me)throw me;
  Cloud.workspaces=(mems||[]).map(m=>({id:m.workspace_id,role:m.role,name:m.workspaces?.name||'Minha operação'}));
  let pref=null;try{pref=localStorage.getItem('concilia-ws')}catch{}
  const chosen=Cloud.workspaces.find(w=>w.id===pref)||Cloud.workspaces.find(w=>w.role==='member')||Cloud.workspaces.find(w=>w.id===ws)||{id:ws,role:'owner',name:'Minha operação'};
  Cloud.ws=chosen.id;Cloud.wsName=chosen.name;Cloud.role=chosen.role;
  await load();
  const h=location.hash.slice(1).split('?')[0];if(h)page=decodeURIComponent(h);
  render();
  if(Cloud.localBackup&&!db.orders.length&&!db.receipts.length)offerMigration();
 }catch(e){console.error(e);loginView('Não foi possível abrir o workspace: '+(e.message||e)+'. Verifique se as migrações do banco foram aplicadas.')}
}

function offerMigration(){const b=Cloud.localBackup;modal('Levar dados deste navegador para a nuvem',`<div class="notice">Encontramos ${b.orders.length} pedidos e ${b.receipts.length} liberações salvos apenas neste navegador. Deseja copiá-los para o seu workspace na nuvem?</div><div class="modalfoot"><button data-action="close">Agora não</button><button class="primary" data-cloud="migrate">${icon('upload')} Copiar para a nuvem</button></div>`)}

document.addEventListener('click',async e=>{const b=e.target.closest('button[data-cloud]');if(!b)return;
 const a=b.dataset.cloud;
 if(a==='migrate'){const src=Cloud.localBackup;db.orders=src.orders;db.receipts=src.receipts;db.imports=src.imports||[];db.closures=src.closures||{};db.ledger=src.ledger||[];db.crm=src.crm||{};db.audit=[...(src.audit||[]),...db.audit];Cloud.localBackup=null;audit('Dados locais enviados à nuvem',`${src.orders.length} pedidos e ${src.receipts.length} liberações copiados deste navegador.`);closeModal();render();await flush();toast('Dados copiados para a nuvem.')}
 if(a==='logout'){await flush();await sb.auth.signOut();db=seed();snap={};render()}
 if(a==='reload'){b.disabled=true;await Cloud.reload();toast('Dados atualizados.')}
});

const renderSignedIn=render;
render=function(){if(!Cloud.ws){loginView();return}renderSignedIn()};

let started=false;
sb.auth.onAuthStateChange((event,session)=>{
 if(event==='INITIAL_SESSION'){started=true;start(session);return}
 if(event==='SIGNED_IN'&&(!Cloud.session||Cloud.session.user.id!==session.user.id)){start(session);return}
 if(event==='SIGNED_OUT'){start(null);return}
 if(session)Cloud.session=session;
});
setTimeout(()=>{if(!started)sb.auth.getSession().then(({data})=>start(data.session))},3000);
// Enquanto não há login, a tela do app não deve aparecer com dados locais.
loginView('Verificando sessão…');
})();
