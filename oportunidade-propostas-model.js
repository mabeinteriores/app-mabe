(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),idEqual=(a,b)=>String(a)===String(b);
function normalize(input){const o=copy(input);if(!Array.isArray(o.proposals)){o.proposals=[];if(o.forn&&o.forn.trim()&&o.forn!=='a definir'){const id='legacy-'+o.id;o.proposals.push({id,supplierId:null,name:o.forn,value:Number(o.val)||0,rt:Number(o.rt)||0,rtTipo:o.rtTipo||'pct',days:null,payment:o.payment||'',scope:o.obs||'',status:'Proposta recebida'});o.favoriteProposalId=id;if(o.et==='win')o.selectedProposalId=id;}}return o;}
function reference(o){return (o.proposals||[]).find(p=>idEqual(p.id,o.selectedProposalId||o.favoriteProposalId))||null;}
function project(o){const p=reference(o);if(p){o.forn=p.name;o.val=p.value;o.rt=p.rt;o.rtTipo=p.rtTipo;}else if(!o.proposals.length){o.forn=o.forn||'a definir';o.val=Number(o.val)||0;o.rt=Number(o.rt)||0;o.rtTipo=o.rtTipo||'pct';}return o;}
function commission(p){return p.rtTipo==='brl'?Number(p.rt)||0:(Number(p.value)||0)*(Number(p.rt)||0)/100;}
function validate(p){if(!p.name||!p.name.trim())throw Error('Selecione um fornecedor.');if(!Number.isFinite(p.value)||p.value<0||p.value>1e9)throw Error('Informe um valor válido.');if(!Number.isFinite(p.rt)||p.rt<0||(p.rtTipo==='pct'&&p.rt>100))throw Error('Confira a comissão.');if(p.days!==null&&(!Number.isInteger(p.days)||p.days<1||p.days>3650))throw Error('Informe o prazo em dias, entre 1 e 3650.');return p;}
function apply(input,action,payload){const o=normalize(input);let p;
 if(action==='proposal'){if(o.selectedProposalId)throw Error('Reabra a comparação antes de alterar propostas.');p=validate(copy(payload));if(o.proposals.some(x=>!idEqual(x.id,p.id)&&((p.supplierId&&idEqual(x.supplierId,p.supplierId))||x.name.trim().toLowerCase()===p.name.trim().toLowerCase())))throw Error('Este fornecedor já está nesta oportunidade. Edite a proposta existente.');const i=o.proposals.findIndex(x=>idEqual(x.id,p.id));if(i<0)o.proposals.push(p);else o.proposals[i]=p;if(!o.favoriteProposalId)o.favoriteProposalId=p.id;
 }else if(action==='favorite'||action==='choose'){if(o.selectedProposalId)throw Error('Reabra a comparação antes de mudar o fornecedor.');p=o.proposals.find(x=>idEqual(x.id,payload.id));if(!p)throw Error('Proposta não encontrada.');if(action==='choose'){if(p.value<=0)throw Error('Informe o valor do contrato antes de escolher.');o.selectedProposalId=p.id;o.et='win';o.prob=100;}o.favoriteProposalId=p.id;
 }else if(action==='reopen'){o.selectedProposalId=null;o.et='negoc';o.prob=50;
 }else if(action==='metadata'){if(!payload.serv?.trim())throw Error('Informe o serviço.');o.serv=payload.serv.trim();o.titulo=payload.titulo.trim();o.resp=payload.resp;o.prazo=payload.prazo;o.obs=payload.obs;
 }else throw Error('Ação inválida.');return project(o);
}
function analyze(list){const prices=list.filter(p=>Number.isFinite(p.value)&&p.value>0),deadlines=list.filter(p=>Number.isInteger(p.days)&&p.days>0);const minPrice=prices.length?Math.min(...prices.map(p=>p.value)):null,minDays=deadlines.length?Math.min(...deadlines.map(p=>p.days)):null;return {minPrice,minDays,cheap:prices.filter(p=>p.value===minPrice),fast:deadlines.filter(p=>p.days===minDays),missingPrice:list.filter(p=>!(p.value>0)),missingDays:list.filter(p=>!(p.days>0))};}
const api={normalize,reference,project,commission,validate,apply,analyze};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CamberProposals=api;
})(typeof window!=='undefined'?window:globalThis);
