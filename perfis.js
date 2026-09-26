'use strict';
// Perfis de acesso: o banco já bloqueia leitura/gravação por área (RLS); aqui o menu mostra só o que cada
// perfil usa, e a troca de perfil de quem já está na equipe (só o administrador).
(()=>{
window.PERFIS=[['member','Equipe completa'],['owner','Administrador'],['financeiro','Financeiro'],['contador','Contabilidade (escritório)'],['atendimento','Atendimento e CRM'],['estoque','Estoque e expedição']];
const MODULOS={owner:null,member:null,
 financeiro:['ini','ven','est','fin','crm','cad','res','pre','rel'],
 contador:['ini','fin','cad','res','rel'],
 atendimento:['ini','ven','crm','est'],
 estoque:['ini','est','ven']};
const INICIO={contador:'parametros',atendimento:'atendimento',estoque:'estoque'};
const papel=()=>window.Cloud?.role||'owner';
window.Perfis={moduloVisivel:id=>{const l=MODULOS[papel()];return !l||l.includes(id)},inicio:()=>INICIO[papel()]||'central',nome:()=>window.PERFIS.find(p=>p[0]===papel())?.[1]||papel()};
document.addEventListener('change',async e=>{const s=e.target.closest('[data-acc-perfil]');if(!s)return;const uid=s.dataset.accPerfil;
 if(!confirm(`Trocar o perfil para "${s.selectedOptions[0].textContent}"?`)){render();return}
 const {data,error}=await Cloud.client.rpc('set_role',{ws:Cloud.ws,uid,papel:s.value});toast(error?error.message:data);render()});
})();
