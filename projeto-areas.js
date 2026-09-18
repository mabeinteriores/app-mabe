(function(){
'use strict';
if(!window.PROJ || !projId)return;
var area=new URLSearchParams(location.search).get('area')||'',wrap=document.querySelector('#app .wrap');
function e(t,s){var n=document.createElement(t);if(s)n.textContent=s;return n;}
function url(a){return 'projeto.html?id='+encodeURIComponent(projId)+(a?'&area='+a:'');}
var css=e('style');css.textContent=`
#app .wrap > [hidden]{display:none!important}#app .area-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}#app .area-card{display:block;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--hair-2);border-radius:18px;padding:28px;transition:.2s}#app .area-card:hover{transform:translateY(-3px);border-color:var(--accent);box-shadow:0 12px 30px #40302010}#app .area-card h2{font-size:22px;margin:24px 0 8px}#app .area-card p{color:var(--ink-3);font-size:13px;line-height:1.6}#app .area-icon{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:13px;background:#f3e5d8;color:#aa633b;font-size:22px}#app .area-card:nth-child(2) .area-icon{background:#e8eddf;color:#6f805a}#app .area-card:nth-child(3) .area-icon{background:#f3ecd8;color:#9b8341}#app .area-card:nth-child(4) .area-icon{background:#e4ecee;color:#698791}#app .area-link{display:block;border-top:1px solid var(--hair);margin-top:24px;padding-top:15px;font-size:12px;color:var(--accent)}#app .area-back{color:var(--ink-3);text-decoration:none;font-size:13px;margin:8px 0 15px;display:block}#app .area-heading{font-size:30px;margin:0}#app.area-services #ct-ov{display:block!important;position:static!important;background:none!important;padding:0!important;z-index:auto!important}#app.area-services #ct-ov .modal{width:100%;max-width:none;max-height:none;box-shadow:none;transform:none;margin:0}#app.area-services .modal-close{display:none}body.area-visits #visDrawer{display:block!important;position:static!important;width:100%!important;max-width:none!important;max-height:none!important;transform:none!important;margin:0;box-shadow:none;opacity:1!important;visibility:visible!important}body.area-visits #visDrawer .vis-drawer-b{max-height:none}body.area-visits .vis-drawer-x,body.area-visits .vis-grip,body.area-visits #visDrawerScrim{display:none!important}#app .schedule-form{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:12px;align-items:end}#app .schedule-form label{font-size:12px;color:var(--ink-3)}#app .schedule-form input,#app .schedule-form select{display:block;width:100%;padding:10px;border:1px solid var(--hair-2);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink);margin-top:6px}#app .schedule-row{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:18px 0;border-bottom:1px solid var(--hair);flex-wrap:wrap}@media(max-width:750px){#app .area-grid{grid-template-columns:1fr}#app .schedule-form{grid-template-columns:1fr 1fr}}`;
document.head.append(css);
var back=e('a',area?'← Áreas do projeto':'← Todos os projetos');back.href=area?url(''):'projetos.html';back.className='area-back';
if(area==='oportunidades'){wrap.prepend(back);return;}
Array.from(wrap.children).forEach(function(n){n.hidden=true;});wrap.append(back);
var h=e('h1',area==='servicos'?'Serviços terceirizados':area==='visitas'?'Controle de visitas':area==='cronograma'?'Cronograma da obra':area==='agenda'?'Agenda de Obras':PROJ.nome);h.className='area-heading';wrap.append(h,e('p',area?PROJ.nome:[PROJ.cliente,PROJ.cidade,PROJ.uf].filter(Boolean).join(' · ')));
if(!area){var grid=e('div');grid.className='area-grid';[['oportunidades','▥','Oportunidades comerciais','Acompanhe propostas, negociações e fechamentos.'],['cronograma','▦','Cronograma da obra','Organize etapas, prazos e responsáveis pela execução.'],['servicos','◇','Serviços terceirizados','Reúna prestadores, serviços contratados e custos.'],['visitas','◎','Controle de visitas','Registre horários, localização e acompanhamento da obra.']].forEach(function(m){var a=e(m[0]==='cronograma'?'article':'a');if(m[0]!=='cronograma')a.href=url(m[0]);a.className='area-card';var icon=e('span',m[1]);icon.className='area-icon';var link=e(m[0]==='cronograma'?'a':'span','Acessar →');if(m[0]==='cronograma'){link.href=url('cronograma');var agenda=e('a');agenda.className='area-agenda';agenda.href=url('agenda');agenda.append(e('span','▦ Agenda de Obras'),e('small','Prazos e responsáveis →'));a.append(agenda);}link.className='area-link';a.append(icon,e('h2',m[2]),e('p',m[3]),link);grid.append(a);});wrap.append(grid);return;}
if(area==='servicos'){document.getElementById('app').classList.add('area-services');var panel=document.getElementById('ct-ov');wrap.append(panel);CT.open(projId,function(){});return;}
if(area==='visitas'){document.body.classList.add('area-visits');wrap.append(document.getElementById('visDrawer'));Visitas.open();return;}
if(area==='agenda'){CamberAgenda.mount(wrap,{projectId:projId});return;}
if(area!=='cronograma'){location.replace(url(''));return;}
var box=e('div');box.className='panel';box.style.padding='24px';var form=e('form');form.className='schedule-form';
function field(label,name,type){var l=e('label',label),i=e('input');i.name=name;i.type=type||'text';l.append(i);form.append(l);return i;}
var stageKey='mabe-cronograma-etapas-v1';
var stageDefaults=['Levantamento e medições','Estudo preliminar','Projeto executivo','Aprovações e licenças','Planejamento e mobilização da obra','Proteção dos ambientes','Demolições e remoções','Alvenaria e adequações','Instalações hidráulicas','Instalações elétricas','Infraestrutura de climatização','Impermeabilização','Contrapiso e regularização','Forros e gesso','Revestimentos e pisos','Pintura','Marmoraria e pedras','Marcenaria','Vidraçaria e esquadrias','Iluminação','Louças e metais','Mobiliário e decoração','Limpeza pós-obra','Vistoria e ajustes finais','Entrega da obra'];
function customStages(){try{var a=JSON.parse(localStorage.getItem(stageKey)||'[]');return Array.isArray(a)?a.filter(function(v){return typeof v==='string'&&v.trim();}):[];}catch(err){return [];}}
function stageValues(){return stageDefaults.concat(customStages()).filter(function(v,i,a){return a.findIndex(function(x){return x.toLocaleLowerCase('pt-BR')===v.toLocaleLowerCase('pt-BR');})===i;});}
function fillStages(value){var values=stageValues();rows().forEach(function(r){if(r.title&&values.indexOf(r.title)<0)values.push(r.title);});if(value&&values.indexOf(value)<0)values.push(value);name.replaceChildren(new Option('Selecione uma etapa…',''));values.forEach(function(v){name.add(new Option(v,v));});name.add(new Option('+ Adicionar nova etapa…','__nova__'));name.value=value||'';}
async function newStage(){if(busy)return;var previous=name.value==='__nova__'?'':name.value;name.value=previous;var value=prompt('Nome da nova etapa. Ela ficará disponível para todos os projetos.');if(!value||!value.trim())return;value=value.trim().replace(/\s+/g,' ');if(value.length>150){status.textContent='Use até 150 caracteres para o nome da etapa.';return;}busy=true;save.disabled=true;name.disabled=true;try{var found=stageValues().find(function(v){return v.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR');});if(found){value=found;}else{localStorage.setItem(stageKey,JSON.stringify(customStages().concat(value)));}if(window.CamberCloud)await CamberCloud.flush();fillStages(value);status.textContent='Etapa disponível na lista de todos os projetos.';}catch(err){fillStages(value);status.textContent='A opção está neste navegador, mas a sincronização não foi confirmada. Confira sua conexão e tente novamente antes de sair.';}finally{busy=false;save.disabled=false;name.disabled=false;}}
var stageLabel=e('label','Etapa'),name=e('select');name.name='title';name.required=true;stageLabel.append(name);form.append(stageLabel);name.onchange=function(){if(name.value==='__nova__')newStage();};var addStage=e('button','+ Nova opção de etapa');addStage.className='btn';addStage.type='button';addStage.onclick=newStage;stageLabel.append(addStage);
var responsible=field('Responsável','responsible'),start=field('Início','start','date'),end=field('Fim previsto','end','date');var label=e('label','Status'),select=e('select');['A iniciar','Em andamento','Pausada','Concluído'].forEach(function(v){select.add(new Option(v,v));});select.disabled=true;label.append(select);form.append(label);var save=e('button','Adicionar etapa');save.className='btn primary';save.type='submit';var cancel=e('button','Cancelar edição');cancel.type='button';cancel.className='btn';cancel.hidden=true;form.append(save,cancel);var status=e('p');status.setAttribute('role','status');var list=e('div');box.append(form,status,list);wrap.append(box);var editing=null,busy=false;
function rows(){return (CamberDB.getProject(projId)||{}).cronograma||[];}
function reset(){editing=null;form.reset();fillStages();save.textContent='Adicionar etapa';cancel.hidden=true;}
cancel.onclick=reset;
async function persist(data){if(!CamberDB.updateProject(projId,{cronograma:data}))throw new Error('Projeto não encontrado. Atualize a página.');if(window.CamberCloud)await CamberCloud.flush();}
async function runStage(id,action,payload){
 if(busy)return;busy=true;status.textContent='Registrando execução…';var pendingExecution=false;
 try{
  var person=await CamberExecution.actor();
  if(window.CamberCloud&&CamberCloud.atualizarProjetos)await CamberCloud.atualizarProjetos();
  var data=rows().slice(),idx=data.findIndex(function(r){return r.id===id;});
  if(idx<0)throw new Error('Etapa não encontrada.');
  var token=window.crypto&&crypto.randomUUID?crypto.randomUUID():String(CamberDB.newId());
  data[idx]=CamberExecution.update(data[idx],action,payload,person,new Date().toISOString(),token);
  pendingExecution=true;await persist(data);pendingExecution=false;draw();
  status.textContent=action==='hours'?'Horas registradas.':'Status atualizado.';return {ok:true};
 }catch(err){
  draw();status.textContent='Registro não confirmado. '+err.message;
  if(pendingExecution){var retry=e('button','Reenviar registro');retry.className='btn';retry.onclick=async function(){retry.disabled=true;try{await CamberCloud.flush();busy=false;draw();status.textContent='Registro confirmado.';}catch(error){retry.disabled=false;status.firstChild.textContent='Registro ainda pendente. '+error.message+' ';}};status.append(retry);}
  return {ok:false,message:err.message};
 }finally{if(!pendingExecution)busy=false;}
}
var executionClock=setInterval(function(){list.querySelectorAll('.execution-time').forEach(function(n){var r=rows().find(function(x){return String(x.id)===n.dataset.stageId;});if(r)n.textContent='Tempo trabalhado: '+CamberExecution.duration(CamberExecution.total(r,Date.now()));});},1000);
window.addEventListener('pagehide',function(){clearInterval(executionClock);});
function draw(){list.replaceChildren();var data=rows();if(!data.length)list.append(e('p','Nenhuma etapa cadastrada. Adicione a primeira etapa da obra.'));data.forEach(function(r){var row=e('div');row.className='schedule-row';var desc=e('div');desc.append(e('strong',r.title),e('p',[r.responsible,r.start,r.end].filter(Boolean).join(' · ')));var actions=e('div'),edit=e('button','Editar'),del=e('button','Excluir');edit.className=del.className='btn';edit.onclick=function(){if(busy)return;editing=r.id;fillStages(r.title);responsible.value=r.responsible||'';start.value=r.start||'';end.value=r.end||'';select.value=r.status;save.textContent='Salvar etapa';cancel.hidden=false;name.focus();};del.onclick=async function(){if(busy||!confirm('Excluir a etapa "'+r.title+'"?'))return;busy=true;try{await persist(rows().filter(function(x){return x.id!==r.id;}));reset();draw();status.textContent='Etapa excluída.';}catch(err){draw();status.textContent='Não foi possível sincronizar. Confira sua conexão antes de sair.';}finally{busy=false;}};actions.append(edit,del);actions.hidden=true;row.append(desc,CamberExecution.controls(r,runStage,{edit:function(){edit.click();},remove:function(){del.click();}}),actions);list.append(row);});}
form.onsubmit=async function(ev){
 ev.preventDefault();if(busy)return;
 if(!name.value||name.value==='__nova__'){status.textContent='Selecione uma etapa antes de salvar.';name.focus();return;}
 if(start.value&&end.value&&end.value<start.value){status.textContent='O fim previsto deve ser igual ou posterior ao início. Corrija a data para salvar.';end.focus();return;}
 busy=true;save.disabled=true;status.textContent='Salvando etapa…';
 try{
  var id=editing || (window.crypto && typeof window.crypto.randomUUID==='function' ? window.crypto.randomUUID() : 'etapa-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  var data=rows().slice(),previous=data.find(function(r){return r.id===id;}),record=Object.assign({},previous||{},{id:id,title:name.value.trim(),responsible:responsible.value.trim(),start:start.value,end:end.value,status:previous?previous.status:'A iniciar'});
  var idx=data.findIndex(function(r){return r.id===id;});if(idx<0)data.push(record);else data[idx]=record;editing=id;
  await persist(data);reset();draw();status.textContent='Cronograma salvo.';
 }catch(err){status.textContent='Não foi possível salvar a etapa. '+(err && err.message ? err.message : 'Tente novamente.');}
 finally{busy=false;save.disabled=false;}
};fillStages();

var mode='lista',originalDraw=draw,originalReset=reset;
var dialog=e('dialog');dialog.style.cssText='width:min(540px,94vw);max-height:90vh;padding:28px;border:1px solid var(--hair-2);border-radius:18px;background:var(--surface);color:var(--ink)';
var dialogTitle=e('h2','Adicionar etapa');form.style.gridTemplateColumns='1fr 1fr';stageLabel.style.gridColumn='1 / -1';dialog.append(dialogTitle,form);document.getElementById('app').append(dialog);
function openStageDialog(){status.textContent='';dialog.append(status);dialog.showModal();}
status.style.cssText='color:#a95132;font-size:13px;line-height:1.5';dialog.addEventListener('close',function(){box.insertBefore(status,list);});
var add=e('button','+ Adicionar etapa');add.className='btn primary';add.style.alignSelf='flex-end';wrap.insertBefore(add,box);
var intro=e('div');intro.className='panel';intro.style.padding='22px';intro.append(e('strong','1. Cadastre a etapa → 2. Informe datas e responsável → 3. Acompanhe nas visualizações'));wrap.insertBefore(intro,box);
var tabs=e('div');tabs.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px';box.prepend(tabs);
var tabNames=[['lista','Etapas cadastradas'],['gantt','Gantt'],['semanas','Próximas 3 semanas'],['semanal','Plano semanal'],['trimestral','Plano trimestral']];
add.onclick=function(){if(busy)return;originalReset();cancel.hidden=false;dialogTitle.textContent='Adicionar etapa';openStageDialog();};
reset=function(){originalReset();if(dialog.open)dialog.close();};cancel.onclick=function(){if(!busy)reset();};dialog.addEventListener('cancel',function(ev){if(busy)ev.preventDefault();});
var day=function(v){return v?Date.parse(v+'T12:00:00'):NaN;},one=86400000;
var dated=function(r){return Number.isFinite(day(r.start))&&Number.isFinite(day(r.end))&&day(r.end)>=day(r.start);};
function editor(r){if(busy)return;mode='lista';draw();var index=rows().findIndex(function(x){return x.id===r.id;});var row=list.children[index];if(row)row.lastChild.firstChild.click();}
draw=function(){
 tabs.replaceChildren();tabNames.forEach(function(t){var b=e('button',t[1]);b.className='btn'+(mode===t[0]?' primary':'');b.onclick=function(){if(!busy){mode=t[0];draw();}};tabs.append(b);});
 originalDraw();
 Array.from(list.children).forEach(function(row){if(!row.lastChild||!row.lastChild.firstChild)return;var b=row.lastChild.firstChild;if(b.tagName!=='BUTTON')return;var fn=b.onclick;b.onclick=function(){if(busy)return;fn();dialogTitle.textContent='Editar etapa';openStageDialog();};});
 if(mode==='lista')return;
 list.replaceChildren();var all=rows(),data=all.filter(dated);if(!data.length){list.append(e('p','Nenhuma etapa com início e fim válidos. Cadastre ou edite uma etapa na lista.'));return;}
 if(data.length<all.length)list.append(e('p',(all.length-data.length)+' etapa(s) sem período válido. Consulte Etapas cadastradas para completar as datas.'));
 if(mode==='gantt'){
 var min=Math.min.apply(null,data.map(function(r){return day(r.start);})),max=Math.max.apply(null,data.map(function(r){return day(r.end);})),span=Math.round((max-min)/one)+1;
 list.append(e('p',new Date(min).toLocaleDateString('pt-BR')+' até '+new Date(max).toLocaleDateString('pt-BR')));
 data.forEach(function(r){var row=e('div');row.style.cssText='display:grid;grid-template-columns:minmax(130px,220px) 1fr;gap:18px;padding:16px 0;border-top:1px solid var(--hair);align-items:center';var label=e('button',r.title);label.className='btn';label.onclick=function(){editor(r);};var track=e('div');track.style.cssText='height:28px;background:var(--surface-2);border-radius:6px;position:relative';var bar=e('div');bar.title=r.start+' — '+r.end+' · '+r.status;bar.style.cssText='height:100%;position:absolute;border-radius:6px;background:'+(r.status==='Concluído'?'#849273':'#bd7952')+';left:'+((day(r.start)-min)/one/span*100)+'%;width:'+((Math.round((day(r.end)-day(r.start))/one)+1)/span*100)+'%';track.append(bar);row.append(label,track);list.append(row);});return;}
 var now=new Date();now.setHours(12,0,0,0);var count=mode==='semanal'?1:3,grid=e('div');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px';
 for(var w=0;w<count;w++){var from=mode==='trimestral'?new Date(now.getFullYear(),now.getMonth()+w,1,12).getTime():now.getTime()+w*7*one,to=mode==='trimestral'?new Date(now.getFullYear(),now.getMonth()+w+1,0,12).getTime():from+6*one,col=e('section');col.append(e('h3',new Date(from).toLocaleDateString('pt-BR')+' — '+new Date(to).toLocaleDateString('pt-BR')));var selected=data.filter(function(r){return day(r.start)<=to&&day(r.end)>=from;});if(!selected.length)col.append(e('p','Nenhuma etapa neste período.'));selected.forEach(function(r){var card=e('div');card.style.cssText='padding:16px;background:var(--surface-2);border-radius:12px;margin:10px 0';var b=e('button','Atualizar etapa');b.className='btn';b.onclick=function(){editor(r);};card.append(e('strong',r.title),e('p',(r.responsible||'Sem responsável')+' · '+r.status),b);col.append(card);});grid.append(col);}list.append(grid);
};draw();

})();
