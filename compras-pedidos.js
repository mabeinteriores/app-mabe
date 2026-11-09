(function(){
'use strict';
const Q=CamberQuotes,E=Q.esc;
const total=p=>p.order_total??p.order_content?.total??p.response.total;
const tracking={
 orderState:['Situação do pedido',{PENDING_APPROVAL:'Aguardando aprovação',APPROVED:'Aprovado',REJECTED:'Reprovado'},'state'],
 paymentState:['Pagamento',{PENDING:'Pendente',PARTIAL:'Parcialmente pago',PAID:'Pago'},'payment_state'],
 deliveryState:['Entrega',{PENDING:'Pendente',SCHEDULED:'Agendada',IN_TRANSIT:'Em transporte',DELIVERED:'Entregue'},'delivery_state'],
 installationState:['Montagem',{PENDING:'Pendente',SCHEDULED:'Agendada',IN_PROGRESS:'Em andamento',COMPLETED:'Concluída',NOT_REQUIRED:'Não se aplica'},'installation_state']
};
const dateOnly=value=>value?value.split('-').reverse().join('/'):'Não informada';
const status=p=>p.deleted_at?'Na lixeira':tracking.orderState[1][p.state]||p.state;
const decisions={approve:['APPROVED','Aprovar'],reject:['REJECTED','Reprovar']};
function decisionButtons(p){
 if(p.deleted_at)return '';
 return '<div class="purchase-decisions" role="group" aria-label="Decisão do pedido '+E(p.code)+'">'+Object.entries(decisions).map(([op,[state,label]])=>
  '<button type="button" data-decision="'+op+'" data-id="'+E(p.id)+'" '+(p.state===state?'disabled':'')+'>'+label+'</button>'
 ).join('')+'</div>';
}
const decisionField=p=>'<span>'+E(status(p))+'</span>'+decisionButtons(p);
const actions=p=>p.deleted_at?[['restore','Restaurar']]:[['edit','Editar'],['trash','Excluir']];
const buttons=p=>actions(p).map(([op,label])=>'<button type="button" data-order-action="'+op+'" data-id="'+E(p.id)+'">'+label+'</button>').join('');
Q.mountPurchases=async function(root,initialId,docs){
 const P=await import('./supabase/cotacoes/payment.mjs?v=payment1');
 const {purchaseContent}=await import('./supabase/cotacoes/purchase-content.mjs?v=pedidos1');
 let orders=[],trash=false,sequence=0;
 root.innerHTML='<header class="page-h"><div><h1>Compras</h1><p>Pedidos gerados a partir da proposta selecionada. A emissão não autoriza pagamento ao fornecedor.</p></div><button data-refresh>Atualizar</button></header><div class="cq-actions cq-tabs"><button data-scope="current">Pedidos</button><button data-scope="trash">Lixeira</button></div><p data-status role="status"></p><section class="cq-panel" data-orders></section>';
 const feedback=root.querySelector('[data-status]');
 function render(){
  root.querySelectorAll('[data-scope]').forEach(b=>{
   const active=(b.dataset.scope==='trash')===trash;
   b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  });
  const visible=orders.filter(p=>Boolean(p.deleted_at)===trash);
  root.querySelector('[data-orders]').innerHTML=visible.length?'<div class="cq-table"><table><thead><tr>'+['Pedido','Projeto / oportunidade','Fornecedor','Valor','Entrega prevista','Situação','Ações'].map(s=>'<th>'+s+'</th>').join('')+'</tr></thead><tbody>'+visible.map(p=>
   '<tr><td data-label="Pedido">'+E(p.code)+'</td><td data-label="Projeto / oportunidade">'+E(p.project_name)+'<small>'+E(p.service)+'</small></td><td data-label="Fornecedor">'+E(p.supplier_name)+'</td><td data-label="Valor">'+Q.money(total(p))+'</td><td data-label="Entrega prevista">'+E(dateOnly(p.expected_delivery))+'</td><td data-label="Situação">'+decisionField(p)+'</td><td><div class="cq-actions"><button data-open="'+E(p.id)+'">Abrir pedido</button>'+buttons(p)+'</div></td></tr>'
  ).join('')+'</tbody></table></div>':'<p>'+(trash?'A Lixeira de compras está vazia.':'Nenhum pedido de compra.')+'</p>';
 }
 async function load(){
  const current=++sequence;
  const data=await Q.api('purchases',{scope:'all'});
  if(current!==sequence)return;
  orders=data;render();
 }
 async function decide(p,button,dialog){
  const group=button.closest('.purchase-decisions');
  const message=dialog?dialog.querySelector('[role="status"]'):feedback;
  if(button.disabled||p.deleted_at)return;
  group.querySelectorAll('button').forEach(b=>b.disabled=true);
  message.textContent='Salvando decisão…';
  const op=button.dataset.decision,state=decisions[op][0];
  try{
   const mutationId=button.dataset.mutation||(button.dataset.mutation=Q.uuid());
   const result=await Q.api('purchase_change',{id:p.id,operation:op,expectedVersion:p.edit_version??0,mutationId});
   p.state=state;p.edit_version=result.version;
   const current=orders.find(o=>o.id===p.id);
   if(current&&p.edit_version>=(current.edit_version??0))Object.assign(current,{state,edit_version:p.edit_version});
   render();
   if(dialog)dialog.querySelector('[data-detail-decision]').innerHTML=decisionField(p);
   message.textContent='Pedido '+p.code+' '+status(p).toLowerCase()+'.';
   try{await load();}catch{message.textContent+=' Clique em Atualizar para recarregar a lista.';}
  }catch(err){
   message.textContent=err.message;
   group.querySelectorAll('button').forEach(b=>b.disabled=p.state===decisions[b.dataset.decision][0]);
  }
 }
 function detail(p){
  const pay=p.order_payment_terms?P.paymentLabel(p.order_payment_terms):p.response.payment;
  const d=Q.dialog('<div class="cq-row"><h2>'+E(p.code)+'</h2><button data-close class="cq-x" aria-label="Fechar">×</button></div><p>'+E(p.project_name)+' · '+E(p.service)+'<br><b>'+E(p.supplier_name)+'</b></p><div data-detail-decision>'+decisionField(p)+'</div><p role="status"></p><p><b>Valor do pedido</b> '+Q.money(total(p))+'</p><p><b>Pagamento</b> '+E(pay||'Não informado')+'</p><p><b>Entrega prevista</b> '+E(dateOnly(p.expected_delivery))+'</p>'+(p.order_notes?'<p style="white-space:pre-wrap"><b>Observações do pedido</b><br>'+E(p.order_notes)+'</p>':'')+'<details><summary>Proposta original do fornecedor</summary>'+Q.responseHTML(p.response)+'</details><div class="cq-actions"><a href="cotacoes.html?id='+encodeURIComponent(p.quotation_id)+'">Cotação de origem</a><button data-docs>Documentos</button><button data-print>Imprimir / salvar PDF</button>'+buttons(p)+'</div><p class="cq-error" role="alert"></p>');
  const c=p.order_content||p.response;
  const lines=(c.items||[]).map(i=>'<tr>'+[i.room,i.title,i.quantity+' '+i.unit,Q.money(i.unitPrice),Q.money(i.value),i.days?i.days+' dias':'—'].map(v=>'<td>'+E(v||'—')+'</td>').join('')+'</tr>').join('');
  const info=[['Subtotal',Q.money(c.subtotal)],['Desconto',Q.money(c.discount)],['Frete',Q.money(c.freight)],['Montagem',Q.money(c.assembly)],['Total calculado',Q.money(c.total)],
   ['Entrega confirmada',dateOnly(p.confirmed_delivery)],['Início da montagem',dateOnly(c.start)],['Fim da montagem',dateOnly(c.end)],
   ['Prazo total',c.days?c.days+' dias':null],['Contagem do prazo',c.basis],['Validade',dateOnly(c.validity)],
   ...Object.values(tracking).filter(([, ,key])=>key!=='state').map(([title,labels,key])=>['Situação · '+title,labels[p[key]]||p[key]]),
   ['Escopo',c.scope],['Garantia',c.warranty],['Exclusões',c.exclusions]];
  d.querySelector('details').insertAdjacentHTML('beforebegin','<h3>Itens do pedido</h3><div class="cq-table"><table><thead><tr><th>Cômodo</th><th>Descrição</th><th>Quantidade</th><th>Unitário</th><th>Total</th><th>Prazo</th></tr></thead><tbody>'+lines+'</tbody></table></div>'+info.filter(([,v])=>v).map(([l,v])=>'<p><b>'+E(l)+'</b> '+E(v)+'</p>').join(''));
  d.querySelector('[data-docs]').onclick=()=>docs(p.request_id).catch(e=>d.querySelector('.cq-error').textContent=e.message);
  d.querySelector('[data-print]').onclick=()=>window.print();
  d.querySelector('[data-detail-decision]').onclick=e=>{
   const b=e.target.closest('[data-decision]');if(b)decide(p,b,d);
  };
  d.querySelectorAll('[data-order-action]').forEach(b=>b.onclick=()=>{d.close();manage(p,b.dataset.orderAction)});
 }
 function itemRow(item={}){
  const field=(name,label,value,type='text',attr='')=>'<label>'+label+'<input data-item="'+name+'" type="'+type+'" '+attr+' value="'+E(value??'')+'"></label>';
  return '<div data-line class="cq-room"><div class="cq-two">'+field('room','Cômodo',item.room,'text','maxlength="100"')+field('title','Descrição',item.title,'text','required maxlength="200"')+
   field('quantity','Quantidade',item.quantity??1,'number','required min=".01" max="100000" step=".01"')+field('unit','Unidade',item.unit||'un','text','required maxlength="30"')+
   field('unitPrice','Preço unitário (R$)',item.unitPrice??(item.quantity?item.value/item.quantity:null),'number','required min="0" max="1000000000" step=".01"')+field('days','Prazo do item (dias)',item.days,'number','min="1" max="3650" step="1"')+'</div><button type="button" data-remove-line aria-label="Remover item">Remover item</button></div>';
 }
 function lineValues(form){
  return Array.from(form.querySelectorAll('[data-line]'),row=>Object.fromEntries(Array.from(row.querySelectorAll('[data-item]'),el=>[el.dataset.item,el.value])));
 }
 function editor(p){
  const options=(values,selected)=>values.map(n=>'<option value="'+n+'" '+(n===selected?'selected':'')+'>'+n+'</option>').join('');
  const terms=p.order_payment_terms||p.response.paymentTerms;
  const c=p.order_content||p.response,hasItems=c.items?.length>0;
  const items=hasItems?c.items:[{title:p.service,quantity:1,unit:'serviço',unitPrice:c.total}];
  const cost=(name,label,value,max=1e9)=>'<label>'+label+'<input name="'+name+'" type="number" min="0" max="'+max+'" step=".01" value="'+E(value??0)+'"></label>';
  const date=(name,label,value)=>'<label>'+label+'<input name="'+name+'" type="date" value="'+E(value||'')+'"></label>';
  const states=Object.entries(tracking).map(([field,[label,labels,key]])=>{
   const current=p[key]||'PENDING',choices={...labels};
   if(!Object.hasOwn(choices,current))choices[current]=current;
   const select='<label>'+label+'<select name="'+field+'">'+Object.entries(choices).map(([v,l])=>'<option value="'+E(v)+'" '+(v===current?'selected':'')+'>'+E(l)+'</option>').join('')+'</select></label>';
   return field==='orderState'?'<div>'+select+decisionButtons(p)+'</div>':select;
  }).join('');
  return '<h3>Itens do pedido</h3><div data-lines>'+items.map(itemRow).join('')+'</div><button type="button" data-add-line>+ Adicionar item</button><div class="cq-two">'+
   cost('discountPercent','Desconto (%)',hasItems?c.discountPercent:0,100)+cost('freight','Frete (R$)',hasItems?c.freight:0)+cost('assembly','Montagem (R$)',hasItems?c.assembly:0)+'</div><p>Total calculado <b data-calculated></b></p>'+
   '<label>Valor final negociado (R$, opcional)<input name="total" type="number" min="0.01" max="1000000000" step=".01" placeholder="Usar total calculado" value="'+E(p.order_total??'')+'"></label>'+
   '<label>Condição de pagamento<select name="payment"><option value="original">Usar a condição da proposta'+(p.response.payment?' · '+E(p.response.payment):'')+'</option>'+P.paymentTypes.map(([v,l])=>'<option value="'+v+'" '+(p.order_payment_terms?.type===v?'selected':'')+'>'+E(l)+'</option>').join('')+'</select></label>'+
   '<div class="cq-two"><label data-deposit>Entrada (%)<select name="deposit">'+options(P.deposits,terms?.depositPercent||30)+'</select></label><label data-installments>Parcelas<select name="installments">'+options(P.installments,terms?.installments||1)+'</select></label></div>'+
   '<h3>Prazos e acompanhamento</h3><div class="cq-two">'+date('delivery','Entrega prevista',p.expected_delivery)+date('confirmed','Entrega confirmada',p.confirmed_delivery)+date('start','Início da montagem',c.start)+date('end','Fim da montagem',c.end)+date('validity','Validade das condições',c.validity)+'<label>Prazo total (dias)<input name="days" type="number" min="1" max="3650" value="'+E(c.days??'')+'"></label><label>O prazo conta a partir de<input name="basis" maxlength="300" value="'+E(c.basis||'')+'"></label>'+states+'</div>'+
   [['scope','Escopo e materiais',c.scope,2000],['warranty','Garantia',c.warranty,200],['exclusions','Exclusões',c.exclusions,2000],['notes','Observações do pedido',p.order_notes,2000]].map(([n,l,v,max])=>'<label>'+l+'<textarea name="'+n+'" maxlength="'+max+'" rows="2">'+E(v||'')+'</textarea></label>').join('');
 }
 function manage(p,op){
  const titles={edit:'Editar pedido',trash:'Excluir pedido',restore:'Restaurar pedido'};
  const text=op==='edit'?editor(p):'<p>'+(op==='trash'?'Mover este pedido para a Lixeira? A cotação e a proposta do fornecedor serão preservadas.':'Devolver este pedido à lista de Compras com o mesmo número?')+'</p>';
  const d=Q.dialog('<form><div class="cq-row"><h2>'+titles[op]+'</h2><button type="button" data-close class="cq-x" aria-label="Fechar">×</button></div><p><b>'+E(p.code)+'</b> · '+E(p.supplier_name)+'<br>'+E(p.project_name)+' · '+E(p.service)+'</p>'+text+'<p class="cq-error" role="alert"></p><div class="cq-actions"><button type="button" data-close>Voltar</button><button class="primary" type="submit">'+(op==='edit'?'Salvar alterações':titles[op])+'</button></div></form>');
  const form=d.querySelector('form'),f=form.elements;
  const content=()=>purchaseContent({items:lineValues(form),discountPercent:f.discountPercent.value||0,freight:f.freight.value||0,assembly:f.assembly.value||0,start:f.start.value,end:f.end.value,days:f.days.value,basis:f.basis.value,validity:f.validity.value,scope:f.scope.value,warranty:f.warranty.value,exclusions:f.exclusions.value},f.delivery.value);
  if(op==='edit'){
   f.orderState.onchange=()=>form.querySelectorAll('[data-decision]').forEach(b=>b.disabled=decisions[b.dataset.decision][0]===f.orderState.value);
   const updateTotal=()=>{try{d.querySelector('[data-calculated]').textContent=Q.money(content().total)}catch{d.querySelector('[data-calculated]').textContent='Confira os itens e as datas.'}};
   form.oninput=updateTotal;
   form.addEventListener('click',e=>{
    const decision=e.target.closest('[data-decision]');
    if(decision){
     f.orderState.value=decisions[decision.dataset.decision][0];f.orderState.onchange();
    }else if(e.target.closest('[data-add-line]')){
     if(form.querySelectorAll('[data-line]').length>=100){d.querySelector('.cq-error').textContent='Limite de 100 itens.';return}
     d.querySelector('[data-lines]').insertAdjacentHTML('beforeend',itemRow());updateTotal();
    }else if(e.target.closest('[data-remove-line]')){e.target.closest('[data-line]').remove();updateTotal();}
   });
   updateTotal();
   const paymentOptions=()=>{
    d.querySelector('[data-deposit]').hidden=!f.payment.value.startsWith('deposit_');
    d.querySelector('[data-installments]').hidden=!['deposit_installments','card'].includes(f.payment.value);
   };
   f.payment.onchange=paymentOptions;paymentOptions();
  }
  let busy=false,lastBody='',mutationId;
  d.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
  form.onsubmit=async e=>{
   e.preventDefault();if(busy)return;
   const error=d.querySelector('.cq-error');
   try{
    const payload={id:p.id,operation:op,expectedVersion:p.edit_version??0};
    if(op==='edit'){
     const revised=content(),amount=f.total.value===''?null:Number(f.total.value);
     if((amount??revised.total)<=0)throw Error('O total do pedido deve ser maior que zero.');
     Object.assign(payload,{total:amount,content:revised,
      expectedDelivery:f.delivery.value||null,confirmedDelivery:f.confirmed.value||null,
      orderState:f.orderState.value,paymentState:f.paymentState.value,deliveryState:f.deliveryState.value,installationState:f.installationState.value,notes:f.notes.value,
      paymentTerms:f.payment.value==='original'?null:P.normalizePayment({type:f.payment.value,depositPercent:f.deposit.value,installments:f.installments.value})});
    }
    const body=JSON.stringify(payload);
    if(lastBody!==body){mutationId=Q.uuid();lastBody=body}
    busy=true;form.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);
    error.textContent='';
    await Q.api('purchase_change',{...payload,mutationId});
    d.close();
    try{await load();feedback.textContent=op==='trash'?'Pedido movido para a Lixeira.':op==='restore'?'Pedido restaurado.':'Alterações salvas.';}
    catch(refreshError){feedback.textContent='Alteração salva. Clique em Atualizar para recarregar a lista. '+refreshError.message;}
   }catch(err){error.textContent=err.message;}
   finally{busy=false;form.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);if(op==='edit')f.orderState.onchange();}
  };
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
   feedback.textContent='';
   if(b.hasAttribute('data-refresh')){await load();return}
   if(b.dataset.scope){trash=b.dataset.scope==='trash';render();return}
   const p=orders.find(p=>p.id===(b.dataset.open||b.dataset.id));
   if(p){if(b.dataset.decision)await decide(p,b);else if(b.dataset.open)detail(p);else if(b.dataset.orderAction)manage(p,b.dataset.orderAction);}
  }catch(err){feedback.textContent=err.message;}
 });
 await load();
 if(initialId){
  const p=orders.find(o=>o.id===initialId);
  if(p){trash=Boolean(p.deleted_at);render();detail(p);}
  else feedback.textContent='Pedido de compra não encontrado.';
 }
};
})();
