(function(){
  'use strict';
  function active(stage){var x=stage.execution;return x&&x.activeId?(x.sessions||[]).find(function(s){return s.id===x.activeId&&!s.stoppedAt;}):null;}
  function transition(stage,action,actor,now,id){
    if(!actor||!actor.id||!actor.name)throw new Error('Entre com seu usuário para registrar a execução.');
    if(!Number.isFinite(Date.parse(now))||!id)throw new Error('Data ou identificador inválido.');
    var result=JSON.parse(JSON.stringify(stage)),running=active(result);
    if(result.status==='Concluído')throw new Error('Esta etapa já foi concluída.');
    var x=result.execution||{activeId:null,sessions:[],events:[]};
    if(x.activeId&&!running)throw new Error('Registro de execução inconsistente. Confira o histórico.');
    if(action==='start'){
      if(running)throw new Error('Esta etapa já está com a contagem em execução.');
      var session={id:id,userId:actor.id,userName:actor.name,startedAt:now,stoppedAt:null};
      x.sessions.push(session);x.activeId=id;result.status='Em andamento';
    }else if(action==='pause'||action==='finish'){
      if(action==='pause'&&!running)throw new Error('Não há contagem ativa para parar.');
      if(action==='finish'&&result.status!=='Em andamento')throw new Error('Inicie a etapa antes de finalizar.');
      if(running){
        if(running.userId!==actor.id)throw new Error('Somente '+running.userName+' pode parar ou finalizar este período.');
        if(Date.parse(now)<Date.parse(running.startedAt))throw new Error('O relógio está anterior ao início. Ajuste a hora do dispositivo.');
        running.stoppedAt=now;running.stoppedBy=actor.id;running.stopReason=action;
        x.activeId=null;
      }
      result.status=action==='finish'?'Concluído':'Em andamento';
      if(action==='finish'){x.completedAt=now;x.completedBy={id:actor.id,name:actor.name};}
    }else throw new Error('Ação de execução inválida.');
    x.events=x.events||[];x.events.push({id:id,action:action,userId:actor.id,userName:actor.name,at:now});
    // Every transition changes this field: concurrent starts/stops conflict,
    // even when they would otherwise merge into separate sessions.
    x.revision=id;result.execution=x;return result;
  }
  function total(stage,now){return ((stage.execution||{}).entries||[]).reduce(function(n,r){return n+r.minutes*60000;},0)+ ((stage.execution||{}).sessions||[]).reduce(function(n,s){var end=s.stoppedAt?Date.parse(s.stoppedAt):now;return n+Math.max(0,end-Date.parse(s.startedAt));},0);}
  function duration(ms){var seconds=Math.floor(ms/1000);return Math.floor(seconds/3600)+'h '+String(Math.floor(seconds/60)%60).padStart(2,'0')+'min '+String(seconds%60).padStart(2,'0')+'s';}
  function node(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  async function actor(){
    if(window.CamberDemoActor)return window.CamberDemoActor;
    var client=window.CamberCloud&&CamberCloud.client();
    if(!client)throw new Error('Entre com seu usuário para registrar a execução.');
    var response=await client.auth.getUser();
    if(response.error||!response.data.user)throw new Error('Sua sessão expirou. Entre novamente.');
    var u=response.data.user;return {id:u.id,name:(window.__camberProfile||{}).nome||u.email||'Usuário'};
  }
  function history(stage){
    var modal=node('dialog',null,'execution-dialog');modal.append(node('h2','Histórico de execução'),node('p',stage.title));
    var sessions=(stage.execution||{}).sessions||[],people=new Map();
    var entries=(stage.execution||{}).entries||[];
    entries.forEach(function(r){var person=people.get(r.userId)||{name:r.userName,ms:0};person.ms+=r.minutes*60000;people.set(r.userId,person);var entry=node('div',null,'execution-entry');entry.append(node('strong',r.userName),node('p',r.date.split('-').reverse().join('/')+' · '+duration(r.minutes*60000)),node('p',r.note));modal.append(entry);});
    ((stage.execution||{}).events||[]).filter(function(r){return r.action==='status';}).forEach(function(r){modal.append(node('p',new Date(r.at).toLocaleString('pt-BR')+' · '+r.userName+' · '+r.from+' → '+r.to+(r.reason?' · '+r.reason:'')));});
    if(!sessions.length&&!entries.length)modal.append(node('p','Nenhum período de trabalho registrado.'));
    sessions.forEach(function(s){var end=s.stoppedAt?Date.parse(s.stoppedAt):Date.now(),ms=Math.max(0,end-Date.parse(s.startedAt));var person=people.get(s.userId)||{name:s.userName,ms:0};person.ms+=ms;people.set(s.userId,person);var entry=node('div',null,'execution-entry');entry.append(node('strong',s.userName),node('p','Início: '+new Date(s.startedAt).toLocaleString('pt-BR')),node('p','Parada: '+(s.stoppedAt?new Date(s.stoppedAt).toLocaleString('pt-BR'):'Em execução')),node('p','Tempo: '+duration(ms)));modal.append(entry);});
    if(people.size){modal.append(node('h3','Tempo por pessoa'));people.forEach(function(person){modal.append(node('p',person.name+': '+duration(person.ms)));});}
    var completed=(stage.execution||{}).completedBy;
    if(completed)modal.append(node('p','Concluída por '+completed.name+' em '+new Date(stage.execution.completedAt).toLocaleString('pt-BR')));
    var close=node('button','Fechar','btn');close.onclick=function(){modal.close();};modal.append(close);modal.addEventListener('close',function(){modal.remove();});document.body.append(modal);modal.showModal();
  }
  function update(stage,action,payload,actor,now,id){
    if(!actor||!actor.id||!actor.name)throw new Error('Entre com seu usuário para registrar.');
    if(!Number.isFinite(Date.parse(now))||!id)throw new Error('Data inválida.');
    var result=JSON.parse(JSON.stringify(stage)),x=result.execution||{sessions:[],events:[],activeId:null};
    x.events=x.events||[];x.entries=x.entries||[];
    if(action==='status'){
      if(['A iniciar','Em andamento','Pausada','Concluído'].indexOf(payload.status)<0)throw new Error('Selecione um status válido.');
      var reason=String(payload.reason||'').trim();
      if(payload.status==='Pausada'&&!reason)throw new Error('Informe o motivo da pausa.');
      var running=active(result);
      if(running){
        if(running.userId!==actor.id)throw new Error('O período antigo precisa ser encerrado por '+running.userName+'.');
        if(Date.parse(now)<Date.parse(running.startedAt))throw new Error('Confira a hora do dispositivo.');
        running.stoppedAt=now;running.stoppedBy=actor.id;running.stopReason='manual-status';x.activeId=null;
      }
      x.events.push({id:id,action:'status',from:result.status||'A iniciar',to:payload.status,reason:reason,userId:actor.id,userName:actor.name,at:now});
      result.status=payload.status;x.pauseReason=payload.status==='Pausada'?reason:'';
      if(payload.status==='Concluído'){x.completedAt=now;x.completedBy={id:actor.id,name:actor.name};}
      else {delete x.completedAt;delete x.completedBy;}
    }else if(action==='hours'){
      var minutes=Number(payload.minutes),date=String(payload.date||''),note=String(payload.note||'').trim();
      var parsed=new Date(date+'T12:00:00Z');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error('Informe uma data válida.');
      if(!Number.isInteger(minutes)||minutes<=0||minutes>1440)throw new Error('Informe um tempo entre 1 minuto e 24 horas.');
      if(!note)throw new Error('Descreva o trabalho realizado.');
      x.entries.push({id:id,userId:actor.id,userName:actor.name,date:date,minutes:minutes,note:note,createdAt:now});
    }else throw new Error('Ação inválida.');
    x.revision=id;result.execution=x;return result;
  }
  function openUpdate(stage,onAction,maintenance){
    var d=node('dialog',null,'execution-dialog'),heading=node('h2','Atualizar etapa');d.append(heading,node('p',stage.title));
    var statusForm=node('form',null,'execution-form'),statusLabel=node('label','Status'),select=node('select');
    ['A iniciar','Em andamento','Pausada','Concluído'].forEach(function(v){select.add(new Option(v,v));});select.value=stage.status||'A iniciar';statusLabel.append(select);
    var reasonLabel=node('label','Motivo da pausa'),reason=node('textarea');reason.maxLength=500;reason.value=(stage.execution||{}).pauseReason||'';reasonLabel.append(reason);
    function toggle(){reasonLabel.hidden=select.value!=='Pausada';reason.required=!reasonLabel.hidden;}
    select.onchange=toggle;toggle();
    var save=node('button','Salvar status','btn primary');save.type='submit';statusForm.append(statusLabel,reasonLabel,save);
    var form=node('form',null,'execution-form');form.append(node('h3','Registrar horas trabalhadas'),node('p','O lançamento será registrado em nome do usuário conectado.'));
    function field(label,type){var l=node('label',label),i=node('input');i.type=type;i.required=true;l.append(i);form.append(l);return i;}
    var date=field('Data do trabalho','date'),now=new Date();date.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    var hours=field('Horas','number');hours.min=0;hours.max=24;hours.step=1;hours.value=0;
    var minutes=field('Minutos','number');minutes.min=0;minutes.max=59;minutes.step=1;minutes.value=0;
    var note=field('O que foi realizado?','text');note.maxLength=1000;
    var add=node('button','Registrar horas','btn primary');add.type='submit';form.append(add);
    var message=node('p');message.setAttribute('role','status');
    var saving=false;
    async function submit(action,payload){if(saving)return;saving=true;save.disabled=add.disabled=true;message.textContent='Salvando…';try{var result=await onAction(stage.id,action,payload);if(result&&result.ok)d.close();else message.textContent=(result&&result.message)||'Não confirmado. Feche esta janela e confira o aviso na etapa.';}catch(err){message.textContent=err.message;}finally{saving=false;save.disabled=add.disabled=false;}}
    statusForm.onsubmit=function(ev){ev.preventDefault();submit('status',{status:select.value,reason:reason.value});};
    form.onsubmit=function(ev){ev.preventDefault();submit('hours',{date:date.value,minutes:Number(hours.value)*60+Number(minutes.value),note:note.value});};
    var log=node('button','Ver histórico','btn');log.type='button';log.onclick=function(){history(stage);};
    var close=node('button','Fechar','btn');close.type='button';close.onclick=function(){if(!saving)d.close();};
    d.addEventListener('cancel',function(ev){if(saving)ev.preventDefault();});d.addEventListener('close',function(){d.remove();});
    d.append(statusForm,form,message,log,close);if(maintenance){[['Editar dados da etapa','edit'],['Excluir etapa','remove']].forEach(function(item){var button=node('button',item[0],'btn');button.type='button';button.onclick=function(){if(saving)return;d.close();maintenance[item[1]]();};d.append(button);});}document.body.append(d);d.showModal();
  }
  function controls(stage,onAction,maintenance){
    var group=node('div',null,'execution-simple'),badge=node('span',stage.status||'A iniciar','execution-badge');badge.dataset.status=stage.status;group.append(badge);
    group.append(node('span','Tempo registrado: '+duration(total(stage,Date.now())).replace(/ \d+s$/,'')));
    if(stage.status==='Pausada')group.append(node('small',(stage.execution||{}).pauseReason||'Motivo ainda não informado'));
    if(active(stage))group.append(node('small','Contagem antiga ativa: salve o status para encerrá-la.'));
    var b=node('button','Atualizar etapa','btn primary');b.type='button';b.onclick=function(){openUpdate(stage,onAction,maintenance);};group.append(b);return group;
  }
  window.CamberExecution={active:active,transition:transition,update:update,total:total,duration:duration,actor:actor,controls:controls};
})();
