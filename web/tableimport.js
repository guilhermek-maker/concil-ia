'use strict';
// Importador genérico com mapeamento de colunas (planilhas, CSV e PDF com texto), usado por
// Contabilidade (razão e balancete) e Preços (tabela de produtos). Reaproveita os leitores de importer.js.
(()=>{
let st=null;
const TI=window.TableImport={
 // Número em formato brasileiro ou internacional. "1.234,56D" → 1234.56; "1.234,56C" ou "(1.234,56)" → -1234.56.
 num(v){if(typeof v==='number')return v;let s=String(v??'').trim();if(!s)return 0;let sign=1;if(/^\(.*\)$/.test(s)){sign=-1;s=s.slice(1,-1)}const dc=s.match(/\s*([DC])$/i);if(dc){if(dc[1].toUpperCase()==='C')sign*=-1;s=s.slice(0,-1).trim()}if(s.endsWith('-')){sign*=-1;s=s.slice(0,-1)}s=s.replace(/R\$|\s/g,'');if(/^-/.test(s)){sign*=-1;s=s.slice(1)}if(/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)||/^\d+,\d+$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,'');const n=Number(s);return Number.isFinite(n)?sign*n:0},
 date(v){const s=dateValue(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''},
 open(opts){st={...opts,rows:null,header:0,workbook:null,sheet:'',file:'',map:{},msg:''};paint()},
};

function paint(){if(!st)return;const f=st.fields,h=st.rows?st.rows[st.header]||[]:[];
 const auto=k=>{const fl=f.find(x=>x.key===k);const al=(fl.aliases||[]).map(normalized).concat(normalized(fl.label));return h.findIndex(v=>al.includes(normalized(v)))};
 if(st.rows)for(const x of f)if(st.map[x.key]===undefined)st.map[x.key]=auto(x.key);
 const preview=st.rows?mapped().slice(0,6):[];
 modal(st.title,`${st.hint?`<div class="notice">${st.hint}</div>`:''}
 <label class="dropzone" for="tiFile" style="margin:8px 0 14px;padding:22px">${icon('upload')}<h3>${st.file?esc(st.file):'Selecione o arquivo'}</h3><p class="caption">.xlsx · .xls · .ods · .csv · .txt · .pdf com texto</p><input type="file" id="tiFile" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,.pdf" style="margin-top:12px;width:100%"></label>
 ${st.msg?`<p class="caption">${esc(st.msg)}</p>`:''}
 ${st.rows?`${st.workbook?`<label for="tiSheet">Aba</label><select id="tiSheet" style="width:100%">${st.workbook.SheetNames.map(n=>`<option ${n===st.sheet?'selected':''}>${esc(n)}</option>`).join('')}</select>`:''}
 <label for="tiHeader">Linha com os nomes das colunas</label><select id="tiHeader" style="width:100%">${st.rows.slice(0,40).map((r,i)=>`<option value="${i}" ${i===st.header?'selected':''}>Linha ${i+1} — ${esc(r.join(' | ').slice(0,120))}</option>`).join('')}</select>
 <div class="grid three" style="margin-top:12px">${f.map(x=>`<div><label for="ti-${x.key}">${esc(x.label)}${x.required?' *':''}</label><select id="ti-${x.key}" data-ti-map="${x.key}" style="width:100%"><option value="-1">${x.required?'Selecione…':'Não informado'}</option>${h.map((v,i)=>`<option value="${i}" ${st.map[x.key]===i?'selected':''}>${i+1}. ${esc(String(v||'Sem nome').slice(0,40))}</option>`).join('')}</select></div>`).join('')}</div>
 <h3 style="margin-top:18px">Prévia (${mapped().length} linhas)</h3><div class="tablewrap"><table><thead><tr>${f.map(x=>`<th>${esc(x.label)}</th>`).join('')}</tr></thead><tbody>${preview.map(r=>`<tr>${f.map(x=>`<td>${esc(String(r[x.key]??'').slice(0,40))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
 <div class="modalfoot"><button data-action="close">Cancelar</button><button class="primary" data-ti="ok">${icon('check')} ${st.confirmLabel||'Importar'}</button></div>`:''}`);
 const fi=$('#tiFile');if(fi)fi.onchange=e=>read(e.target.files[0]);
 const sh=$('#tiSheet');if(sh)sh.onchange=e=>{st.sheet=e.target.value;st.rows=sheetRows();st.header=0;st.map={};paint()};
 const hd=$('#tiHeader');if(hd)hd.onchange=e=>{st.header=Number(e.target.value);st.map={};paint()};
 $$('[data-ti-map]').forEach(s=>s.onchange=e=>{st.map[s.dataset.tiMap]=Number(e.target.value);paint()});
}
function mapped(){const h=st.header;return st.rows.slice(h+1).filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(st.fields.map(x=>[x.key,st.map[x.key]>=0?String(r[st.map[x.key]]??'').trim():''])))}
function sheetRows(){const s=st.workbook.Sheets[st.sheet];return XLSX.utils.sheet_to_json(s,{header:1,raw:false,defval:'',blankrows:false})}
async function read(file){if(!file)return;st.file=file.name;st.msg='Lendo arquivo…';st.rows=null;st.workbook=null;paint();
 try{if(file.size>25*1024*1024)throw Error('Arquivo acima de 25 MB.');const ext=file.name.split('.').pop().toLowerCase();
  if(['xlsx','xls','ods'].includes(ext)){st.workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,sheetRows:60002});st.sheet=st.workbook.SheetNames[0];st.rows=sheetRows()}
  else if(ext==='pdf'){const txt=await extractPDF(await file.arrayBuffer(),(n,t)=>{st.msg=`Lendo PDF: página ${n} de ${t}…`});st.rows=parseDelimited(txt,';')}
  else{const b=await file.arrayBuffer();let t=new TextDecoder('utf-8').decode(b);if(t.includes('�'))t=new TextDecoder('windows-1252').decode(b);
   // Relatórios contábeis costumam ter título na 1ª linha: o separador é o mais frequente nas primeiras linhas.
   const head=t.split(/\r?\n/).slice(0,15).join('\n'),sep=ext==='tsv'?'\t':[';','\t',','].sort((a,z)=>head.split(z).length-head.split(a).length)[0];st.rows=parseDelimited(t,sep)}
  // Cabeçalho: primeira linha que contém o nome de algum campo obrigatório.
  const req=st.fields.filter(x=>x.required).flatMap(x=>[x.label,...(x.aliases||[])]).map(normalized);
  const hi=st.rows.slice(0,40).findIndex(r=>r.some(v=>req.includes(normalized(v))));st.header=hi>=0?hi:0;st.map={};
  st.msg=`${st.rows.length} linhas lidas${ext==='pdf'?' · PDF: confira as colunas com atenção':''}.`;
 }catch(e){st.msg='Não foi possível ler: '+(e.message||e)}
 paint()}

document.addEventListener('click',e=>{const b=e.target.closest('button[data-ti]');if(!b||!st)return;
 const miss=st.fields.filter(x=>x.required&&!(st.map[x.key]>=0));if(miss.length)return toast('Relacione: '+miss.map(x=>x.label).join(', '));
 const rows=mapped(),cb=st.onConfirm,meta={file:st.file};st=null;closeModal();cb(rows,meta)});
})();
