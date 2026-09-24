// Optional browser agent interface. Financial mutations remain in the confirmation UI.
(()=>{
 const context=document.modelContext;
 if(!context?.registerTool)return;
 const lifecycle=new AbortController();
 const tools=[{
  name:'read_reconciliation_summary',title:'Ler resumo da conciliação',
  description:'Lê os indicadores da competência selecionada. Não altera dados. Valores dos documentos importados localmente.',
  inputSchema:{type:'object',properties:{},additionalProperties:false},
  annotations:{readOnlyHint:true,untrustedContentHint:true},
  execute(input){if(!input||Object.keys(input).length)throw Error('Informe um objeto vazio.');return {competence:month,environment:'Dados importados; armazenamento neste navegador',...stats()}}
 },{
  name:'start_order_review',title:'Abrir revisão de pedido',
  description:'Abre os detalhes de um pedido e suas sugestões. Não confirma vínculos nem altera saldos; a confirmação permanece na interface.',
  inputSchema:{type:'object',properties:{order_id:{type:'string'}},required:['order_id'],additionalProperties:false},
  annotations:{readOnlyHint:false,untrustedContentHint:true},
  execute(input){if(!input||typeof input.order_id!=='string'||Object.keys(input).some(k=>k!=='order_id'))throw Error('Informe apenas order_id.');const order=db.orders.find(o=>o.id===input.order_id);if(!order)throw Error('Pedido não encontrado.');detail(order.id);return {order_id:order.id,status:status(order),review_open:true,link_confirmed:false}}
 }];
 for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
})();
