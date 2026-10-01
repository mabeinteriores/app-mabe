(function(){
'use strict';const Q=CamberQuotes,E=Q.esc,M=CamberQuoteModel;
Q.dialog=function(html){const d=document.createElement('dialog');d.className='cq-dialog';d.innerHTML=html;document.body.append(d);d.onclose=()=>d.remove();d.addEventListener('click',e=>{if(e.target.closest('[data-close]'))d.close()});d.showModal();return d;};
const item=()=>'<div class="cq-item"><label>Item<input data-title required maxlength="200"></label><label>Quantidade<input data-qty type="number" required value="1" min="0.01" max="100000" step="0.01"></label><label>Unidade<input data-unit required value="un" maxlength="30"></label><button type="button" class="cq-x" data-remove-item aria-label="Remover item">×</button></div>';
const room=()=>'<div class="cq-room"><div class="cq-row"><label>Cômodo / grupo<input data-room required maxlength="100" placeholder="Ex.: Cozinha"></label><button type="button" class="cq-x" data-remove-room aria-label="Remover cômodo">×</button></div><div data-items>'+item()+'</div><button type="button" data-add-item>+ Item</button></div>';
Q.wizard=async function({projectId='',opportunityId='',newOpportunity=false,lockContext=false,checkExisting=false,projectIds}={}){
 const services=newOpportunity?Array.from(new Set((window.CamberDB?.loadServicos?.()||[]).map(n=>String(n).trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR')):[];
 const c=await Q.api('catalog'),qid=Q.uuid(),oid=String(window.CamberDB?.newId?.()||Date.now());if(projectIds){const allowed=new Set(projectIds.map(String));c.projects=c.projects.filter(p=>allowed.has(String(p.id)));c.opportunities=c.opportunities.filter(o=>allowed.has(String(o.projectId)))}let step=0,working=false,result=null,uploads=new Set(),checkedContext=null;
 const order=newOpportunity?[0,2,1,3]:[0,1,2,3],phase=()=>order[step];
 if(projectId&&!c.projects.some(p=>String(p.id)===String(projectId)))throw Error('Projeto não encontrado. Atualize a página e tente novamente.');
 const d=Q.dialog(`<div class="cq-row"><h2>${newOpportunity?'Nova oportunidade':'Nova cotação'}</h2><button class="cq-x" data-close aria-label="Fechar">×</button></div><div data-progress></div><form novalidate><fieldset data-step><label>Projeto<select name="project" required><option value="">Selecione</option>${c.projects.map(p=>`<option value="${E(p.id)}">${E(p.nome)}</option>`).join('')}</select></label>${newOpportunity?'<label>Serviço / oportunidade<select name="service" required><option value="">Selecione o serviço</option>'+services.map(n=>'<option value="'+E(n)+'">'+E(n)+'</option>').join('')+'</select></label><small>'+(services.length?services.length+' opções do cadastro de Tipos de Serviço.':'Nenhum serviço cadastrado. Cadastre os tipos de serviço para continuar.')+' <a href="configuracao.html" target="_blank" rel="noopener">Abrir Configuração</a></small><label>Responsável<select name="responsible">'+c.responsibles.map(n=>'<option>'+E(n)+'</option>').join('')+'</select></label>':'<label>Oportunidade<select name="opportunity" required></select></label>'}<p data-context-help class="cq-muted"></p><div class="cq-two"><label>Prazo para responder<input type="date" name="deadline" required min="${M.day(Date.now())}" max="${M.day(Date.now()+89*86400000)}" value="${M.day(Date.now()+14*86400000)}"></label><label>Valor estimado (R$)<input type="number" name="estimate" min="0" max="1000000000" step="0.01" value="0" required></label></div><div data-existing></div></fieldset><fieldset data-step hidden><label>Como definir o pedido<select name="mode"><option value="standard">Modelo padrão</option><option value="custom">Escrever meu pedido</option></select></label><label>Título do pedido<input name="title" required maxlength="150"></label><label>O que deve ser orçado<textarea name="description" required maxlength="3000"></textarea></label><div data-rooms>${room()}</div><button type="button" data-add-room>+ Adicionar cômodo</button><label>Anexar o projeto<input type="file" name="files" multiple accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.zip"></label><small>Disponível nos dois modelos. Até 10 arquivos de 25 MB cada.</small></fieldset><fieldset data-step hidden><h3>Selecionar fornecedores participantes</h3><p class="cq-muted">Escolha os fornecedores que receberão a solicitação de cotação para esta oportunidade.</p><label>Buscar fornecedor<input name="search" placeholder="Nome, cidade ou estado"></label><div data-suppliers></div><a href="fornecedor.html" target="_blank" rel="noopener">+ Cadastrar fornecedor</a> <button type="button" data-refresh>Atualizar cadastro</button></fieldset><fieldset data-step hidden><h3>Revisar e criar</h3><div data-review></div><p>Será criado um link individual para cada fornecedor. Compartilhe os links manualmente. Nenhum e-mail será enviado.</p></fieldset><p class="cq-error" role="alert"></p><p data-saving role="status"></p><div class="cq-row"><button type="button" data-prev>Voltar</button><button type="button" class="primary" data-next>Continuar</button></div></form>`);
 const form=d.querySelector('form'),f=form.elements,sets=[...d.querySelectorAll('[data-step]')];
 if(newOpportunity){
  sets[1].before(sets[2]);
  sets[1].prepend(sets[0].querySelector('.cq-two'));
  sets[2].querySelector('.cq-muted').textContent='Selecione os participantes. O mesmo pedido será vinculado a uma única cotação deste projeto.';
  sets[3].querySelector('h3').textContent='Revisar e solicitar';
 }
 function opps(){
  if(newOpportunity)return;
  const options=c.opportunities.filter(x=>String(x.projectId)===f.project.value);
  f.opportunity.innerHTML='<option value="">'+(!f.project.value?'Selecione o projeto':options.length?'Selecione':'Nenhuma oportunidade cadastrada')+'</option>'+options.map(x=>`<option value="${E(x.opportunity.id)}">${E(x.opportunity.serv)} · ${E(x.opportunity.titulo||'')}</option>`).join('');
  d.querySelector('[data-context-help]').innerHTML=f.project.value&&!options.length?'Este projeto ainda não possui oportunidades. <a href="projeto.html?id='+encodeURIComponent(f.project.value)+'&area=oportunidades" target="_blank" rel="noopener">Cadastrar uma oportunidade no projeto</a>. Depois, abra uma nova cotação.':'';
 }
 function clearContext(){checkedContext=null;d.querySelector('[data-existing]').innerHTML='';d.querySelector('[data-next]').textContent='Continuar';}
 function clearField(el){el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');el.parentElement.querySelector('.cq-field-error')?.remove();}
 function invalid(el,message){
  clearField(el);el.setAttribute('aria-invalid','true');const note=document.createElement('small');note.className='cq-field-error';note.id='cq-error-'+Q.uuid();note.textContent=message;el.after(note);el.setAttribute('aria-describedby',note.id);d.querySelector('.cq-error').textContent=message;el.focus();el.scrollIntoView({block:'center',behavior:'smooth'});
 }
 function validateStep(){
  for(const el of sets[phase()].querySelectorAll('input,textarea,select')){
   if(el.disabled)continue;
   const label=el.closest('label')?.firstChild?.textContent.trim()||'Campo';
   if(el.required&&!el.value.trim()){invalid(el,'Preencha '+label.toLowerCase()+' para continuar.');return false;}
   if(!el.checkValidity()){invalid(el,label+': '+(el.type==='date'?'escolha uma data entre '+el.min.split('-').reverse().join('/')+' e '+el.max.split('-').reverse().join('/')+'.':el.validationMessage));return false;}
   clearField(el);
  }
  return true;
 }
 async function existingQuotation(){
  if(!checkExisting||newOpportunity)return false;
  const key=JSON.stringify([f.project.value,f.opportunity.value]);if(checkedContext===key)return false;
  working=true;const controls=[...form.querySelectorAll('input,select,textarea,button'),d.querySelector('[data-close]')],disabled=controls.map(el=>el.disabled);
  controls.forEach(el=>el.disabled=true);d.querySelector('[data-saving]').textContent='Verificando cotações desta oportunidade…';
  try{
   const data=await Q.api('dashboard',{page:1,pageSize:100,filters:{projectId:f.project.value,opportunityId:f.opportunity.value,state:'OPEN'}});
   checkedContext=key;
   if(!data.total)return false;
   d.querySelector('[data-existing]').innerHTML='<div class="cq-notice"><b>Esta oportunidade já possui uma cotação ativa.</b><p>Abra uma cotação existente ou continue para criar outra solicitação independente.</p>'+data.rows.map(q=>'<p><a href="cotacoes.html?id='+encodeURIComponent(q.id)+'">Abrir '+E(q.code)+' · '+E(M.labels[q.status])+'</a></p>').join('')+'</div>';
   d.querySelector('[data-next]').textContent='Continuar com outra cotação';return true;
  }finally{controls.forEach((el,i)=>el.disabled=disabled[i]);working=false;d.querySelector('[data-saving]').textContent='';}
 }

 f.project.value=String(projectId);opps();if(!newOpportunity)f.opportunity.value=String(opportunityId);if(lockContext){f.project.disabled=true;if(!newOpportunity)f.opportunity.disabled=true}
 if(newOpportunity){const project=c.projects.find(p=>String(p.id)===String(projectId));f.responsible.value=project?.resp||f.responsible.value;d.querySelector('[data-context-help]').textContent='Cliente: '+(project?.cliente||project?.nome||'definido pelo projeto')+'. A cotação será vinculada automaticamente a este projeto.';}
 const service=()=>newOpportunity?f.service.value:c.opportunities.find(x=>String(x.projectId)===f.project.value&&String(x.opportunity.id)===f.opportunity.value)?.opportunity.serv||'';
 const selected=new Set();let suggestedTitle='';
 function selectedList(){let aside=d.querySelector('[data-selected-suppliers]');if(!aside){const list=d.querySelector('[data-suppliers]'),grid=document.createElement('div');grid.className='cq-supplier-picker';list.before(grid);grid.append(list);aside=document.createElement('aside');aside.dataset.selectedSuppliers='';grid.append(aside)}aside.innerHTML='<h3>Fornecedores selecionados ('+selected.size+')</h3>'+c.suppliers.filter(s=>selected.has(String(s.id))).map(s=>'<div class="cq-row">'+Q.avatar(s.nome)+'<div><b>'+E(s.nome)+'</b><small>'+E([s.cidade,s.uf].filter(Boolean).join(' · '))+'</small></div><button type="button" class="cq-x" data-unpick="'+E(s.id)+'" aria-label="Remover '+E(s.nome)+'">×</button></div>').join('')+(selected.size?'':'<p>Marque os fornecedores ao lado.</p>');}
 function suppliers(){const eligible=c.suppliers.filter(s=>M.eligible(s,service())),allowed=new Set(eligible.map(s=>String(s.id)));for(const id of selected)if(!allowed.has(id))selected.delete(id);d.querySelector('[data-suppliers]').innerHTML=eligible.map(s=>`<label class="cq-pick" data-name="${E(M.norm([s.nome,s.cidade,s.uf].join(' ')))}"><input type="checkbox" data-supplier="${E(s.id)}" ${selected.has(String(s.id))?'checked':''}> ${Q.avatar(s.nome)}<span class="cq-supplier-info"><b>${E(s.nome)}</b><small>${E([s.cidade,s.uf].filter(Boolean).join(' · '))}</small><small>${E((Array.isArray(s.categorias)?s.categorias:[s.categoria]).filter(Boolean).join(', '))}</small></span></label>`).join('')||'<p>Nenhum fornecedor ativo com este serviço cadastrado.</p>';f.search.dispatchEvent(new Event('input'));selectedList();}
 f.project.onchange=()=>{opps();selected.clear();clearContext()};if(newOpportunity)f.service.onchange=()=>selected.clear();else f.opportunity.onchange=()=>{selected.clear();clearContext()};
 f.search.oninput=()=>d.querySelectorAll('[data-name]').forEach(n=>n.hidden=!n.dataset.name.includes(M.norm(f.search.value)));
 const items=()=>[...d.querySelectorAll('.cq-room')].flatMap((r,ri)=>[...r.querySelectorAll('.cq-item')].map((i,ii)=>({id:`${ri}-${ii}`,room:r.querySelector('[data-room]').value.trim(),title:i.querySelector('[data-title]').value.trim(),quantity:Number(i.querySelector('[data-qty]').value),unit:i.querySelector('[data-unit]').value.trim()})));
 function render(){
  sets.forEach((s,i)=>s.hidden=i!==phase());
  d.querySelector('[data-progress]').innerHTML=Q.stepper(newOpportunity?['Oportunidade','Fornecedores','Pedido','Revisão']:['Dados gerais','Produtos e escopo','Fornecedores','Revisar e criar'],step);
  d.querySelector('[data-prev]').hidden=step===0;
  d.querySelector('[data-next]').textContent=step===3?(result?'Concluir solicitação':newOpportunity?'Solicitar cotação':'Criar cotação e links'):'Continuar';
  if(phase()===2)suppliers();
  if(step===3){const project=c.projects.find(p=>String(p.id)===f.project.value);d.querySelector('[data-review]').innerHTML=`<p>Cliente: <b>${E(project?.cliente||project?.nome||'')}</b><br>Projeto: ${E(project?.nome||'')}</p><p><b>${E(f.title.value)}</b> · ${E(service())}</p><p>${items().length} itens · ${selected.size} fornecedores · ${f.files.files.length} anexos</p><p>Estimativa: ${Q.money(f.estimate.value)} · prazo: ${E(f.deadline.value.split('-').reverse().join('/'))}</p><p>${c.suppliers.filter(s=>selected.has(String(s.id))).map(s=>E(s.nome)).join(' · ')}</p>${newOpportunity?'<p>A oportunidade será criada em <b>Prospecção</b>, com uma cotação para todos os fornecedores selecionados. Ao concluir, você volta ao Kanban.</p>':''}`;}
  d.scrollTop=0;
 }
 form.onsubmit=e=>{e.preventDefault();if(!working)d.querySelector('[data-next]').click()};
 form.addEventListener('input',e=>{if(e.target.matches('input,textarea,select')){clearField(e.target);d.querySelector('.cq-error').textContent=''}});
 d.addEventListener('cancel',e=>{if(working)e.preventDefault()});
 d.addEventListener('change',e=>{if(e.target.dataset.supplier){e.target.checked?selected.add(e.target.dataset.supplier):selected.delete(e.target.dataset.supplier);selectedList()}});
 d.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||working)return;try{
  if(b.hasAttribute('data-unpick')){selected.delete(b.dataset.unpick);suppliers();}
  if(b.hasAttribute('data-add-room'))d.querySelector('[data-rooms]').insertAdjacentHTML('beforeend',room());
  if(b.hasAttribute('data-add-item'))b.closest('.cq-room').querySelector('[data-items]').insertAdjacentHTML('beforeend',item());
  if(b.hasAttribute('data-remove-room'))b.closest('.cq-room').remove();if(b.hasAttribute('data-remove-item'))b.closest('.cq-item').remove();
  if(b.hasAttribute('data-refresh')){c.suppliers=(await Q.api('catalog')).suppliers;suppliers();}
  if(b.hasAttribute('data-prev')){step--;render()}
  if(!b.hasAttribute('data-next'))return;
  d.querySelector('.cq-error').textContent='';
  if(!validateStep())return;
  if(phase()===0&&await existingQuotation())return;
  if(phase()===0){if(!f.title.value||f.title.value===suggestedTitle)f.title.value='Orçamento de '+service();suggestedTitle='Orçamento de '+service();if(!f.description.value)f.description.value='Orçar os itens abaixo conforme o projeto anexo. Informar materiais, valores unitários e condições de fornecimento.';}
  if(phase()===1&&(!items().length||items().length>100))throw Error('Adicione de 1 a 100 itens.');
  if(phase()===1){const files=[...f.files.files];if(files.length>10||files.some(x=>!x.size||x.size>26214400||!/\.(pdf|png|jpe?g|dwg|dxf|zip)$/i.test(x.name)))throw Error('Confira os anexos: até 10 arquivos válidos de 25 MB.');}
  if(phase()===2&&!selected.size)throw Error('Selecione ao menos um fornecedor.');
  if(step<3){step++;render();return}
  const files=[...f.files.files];if(files.length>10||files.some(x=>!x.size||x.size>26214400||!/\.(pdf|png|jpe?g|dwg|dxf|zip)$/i.test(x.name)))throw Error('Confira os anexos: até 10 arquivos válidos de 25 MB.');
  working=true;d.querySelectorAll('button').forEach(x=>x.disabled=true);d.querySelector('[data-saving]').textContent='Criando cotação…';
  if(!result)result=await Q.api(newOpportunity?'create_opportunity':'new_quotation',{quotationId:qid,projectId:f.project.value,opportunityId:newOpportunity?oid:f.opportunity.value,service:service(),responsible:f.responsible?.value||'',estimatedValue:Number(f.estimate.value),expiresAt:f.deadline.value+'T23:59:59-03:00',supplierIds:[...selected],specification:{mode:f.mode.value,title:f.title.value,description:f.description.value,items:items()}});
  form.querySelectorAll('input,select,textarea').forEach(x=>x.disabled=true);
  const detail=await Q.api('detail',{quotationId:qid});for(const r of detail.requests)for(let i=0;i<files.length;i++){const key=r.id+':'+i;if(uploads.has(key))continue;d.querySelector('[data-saving]').textContent='Anexando projeto · '+r.supplier_name;await Q.api('upload',{id:r.id,fileId:await fileId(r.id,i)},files[i]);uploads.add(key);}
  if(window.CamberCloud?.atualizarOportunidades)await CamberCloud.atualizarOportunidades(f.project.value);
  location.href=newOpportunity?'projeto.html?id='+encodeURIComponent(f.project.value)+'&area=oportunidades&cotacao_criada='+encodeURIComponent(qid):'cotacoes.html?id='+encodeURIComponent(qid);
 }catch(err){d.querySelector('.cq-error').textContent=err.message;d.querySelector('[data-saving]').textContent=result?'A cotação está salva. Tente novamente para concluir os anexos.':'';}finally{working=false;d.querySelectorAll('button').forEach(x=>x.disabled=false);if(result){d.querySelector('[data-prev]').disabled=true;d.querySelector('[data-next]').textContent='Concluir anexos';}}});
 const uploadIds=new Map();async function fileId(r,i){const key=r+':'+i;if(!uploadIds.has(key))uploadIds.set(key,Q.uuid());return uploadIds.get(key)}
 render();
};
})();
