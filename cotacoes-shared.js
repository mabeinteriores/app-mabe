(function(){
'use strict';
const endpoint='https://vlvadvlfsbgwcldaxhah.supabase.co/functions/v1/camber-quotes';
const key='sb_publishable_le8I7BGWpHrvdWqxjQKwdg_YUEyZJL-';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function uuid(){
 const source=globalThis.crypto;
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw Error('Não foi possível gerar o identificador. Abra o aplicativo em um navegador atualizado e tente novamente.');
 // UUID v4 com a mesma fonte criptográfica, inclusive em navegadores sem randomUUID.
 const bytes=new Uint8Array(16);source.getRandomValues(bytes);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
async function api(action,payload={},file){
 const isPublic=['lookup','submit','draft','revise','decline','supplier_upload'].includes(action);let jwt='';
 if(!isPublic){const sb=window.CamberCloud?.client();if(!sb)throw Error('Abra o aplicativo online para salvar solicitações.');await CamberCloud.flush();const {data,error}=await sb.auth.getSession();if(error||!data.session)throw Error('Entre no sistema novamente.');jwt=data.session.access_token;}
 const headers={apikey:key};if(jwt)headers.Authorization='Bearer '+jwt;
 let body;if(file){body=new FormData();body.append('payload',JSON.stringify({action,payload}));body.append('file',file);}else{headers['Content-Type']='application/json';body=JSON.stringify({action,payload});}
 const res=await fetch(endpoint,{method:'POST',headers,body});let data;try{data=await res.json()}catch{throw Error('Servidor indisponível. Tente novamente.')}if(!res.ok||data.error)throw Error(data.error||'Não foi possível salvar.');return data;
}
function details(p,title='Proposta recebida'){
 const d=document.createElement('dialog');d.className='cq-dialog';d.innerHTML='<div class="cq-row"><h2>'+esc(title)+'</h2><button class="cq-x" aria-label="Fechar">×</button></div>'+responseHTML(p);document.body.append(d);d.querySelector('button').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();
}
function responseHTML(p){return '<div class="cq-table"><table><thead><tr><th>Cômodo / item</th><th>Quantidade</th><th>Unitário</th><th>Valor total</th><th>Prazo</th></tr></thead><tbody>'+(p.items||[]).map(x=>'<tr><td>'+esc((x.room?x.room+' — ':'')+x.title)+'</td><td>'+esc(x.quantity+' '+x.unit)+'</td><td>'+money(x.unitPrice)+'</td><td>'+money(x.value)+'</td><td>'+esc(x.days?x.days+' dias':'—')+'</td></tr>').join('')+'</tbody></table></div>'+[['Subtotal',p.subtotal],['Frete',p.freight],['Montagem',p.assembly],['Desconto',-p.discount],['Total',p.total]].map(([label,v])=>'<div class="cq-row cq-sum"><span>'+label+'</span><b>'+money(v)+'</b></div>').join('')+[['Entrega em dias',p.days],['Entrega prevista',p.delivery],['Início da montagem',p.start],['Fim da montagem',p.end],['Contagem do prazo',p.basis],['Pagamento',p.payment],['Validade',p.validity],['Garantia',p.warranty],['Materiais e itens incluídos',p.scope],['Exclusões e observações',p.exclusions]].map(([label,v])=>'<p><b>'+label+'</b><br><span style="white-space:pre-wrap">'+esc(v||'Não informado')+'</span></p>').join('');}
async function ready(){if(location.hostname==='127.0.0.1'||location.hostname==='localhost')throw Error('Use o aplicativo online para trabalhar com as cotações reais. A prévia local não grava dados do escritório.');for(let i=0;i<120;i++){if(window.CamberCloud?.client()&&window.__camberUser&&window.__camberProfile)return;await new Promise(r=>setTimeout(r,250));}throw Error('Faça login e tente novamente.');}
window.CamberQuotes={api,esc,money,details,responseHTML,ready,uuid};
})();
