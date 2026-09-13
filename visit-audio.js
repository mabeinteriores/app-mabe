// Conteúdo de áudio e análise nunca passa pelo localStorage/kv_store.
(function(){
  'use strict';
  var current=null, busy=false, admin=false, audioUrl=null, panel=null, statusTimer=null;
  function client(){return window.CamberCloud && CamberCloud.client();}
  async function api(body){
    var sb=client(); if(!sb) throw new Error('Entre no aplicativo para gravar a visita.');
    var r=await sb.functions.invoke('visit-recordings',{body:body});
    if(r.error || (r.data && r.data.error)) throw new Error((r.data&&r.data.error)||'Não foi possível conectar ao serviço de gravação. Tente novamente.');
    return r.data;
  }
  var badge=document.createElement('div');
  badge.style.cssText='display:none;position:fixed;bottom:18px;left:18px;z-index:2147483000;max-width:340px;background:#7c2525;color:white;padding:12px 16px;border-radius:12px;font:14px system-ui;box-shadow:0 4px 20px #0003';
  badge.setAttribute('role','status');document.body.appendChild(badge);
  function message(text,retry){
    badge.style.display='block';badge.replaceChildren(document.createTextNode(text));
    if(retry){var b=document.createElement('button');b.textContent='Tentar enviar novamente';b.style.cssText='display:block;margin-top:8px;padding:8px';b.onclick=function(){finish().catch(function(e){message(e.message,true);});};badge.appendChild(b);}
  }
  function stopTracks(s){s.stream.getTracks().forEach(function(t){t.stop();});if(s.wake){s.wake.release().catch(function(){});s.wake=null;}}
  async function wake(s){try{if(navigator.wakeLock)s.wake=await navigator.wakeLock.request('screen');}catch(_){} }
  async function start(projectId,visitRef,onInterrupted){
    if(current || busy) throw new Error('Finalize e envie a gravação anterior antes de iniciar outra.');
    if(!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Este navegador não permite gravação. Use Chrome ou Safari atualizado em HTTPS.');
    if(!confirm('Iniciar gravação desta visita? Confirme que os participantes foram avisados e concordaram. Áudio e análise serão acessíveis apenas ao administrador. Mantenha esta página aberta e a tela desbloqueada até finalizar. Ao atingir 23 MB, a visita será encerrada e o áudio será enviado automaticamente.')) return false;
    busy=true;var stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
      var mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(function(m){return MediaRecorder.isTypeSupported(m);});
      if(!mime) throw new Error('Formato de gravação incompatível com este navegador.');
      var recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:32000});
      var upload=await api({action:'start',projectId:String(projectId),visitRef:visitRef,mime:mime,consent:true});
      var s={stream:stream,recorder:recorder,upload:upload,projectId:projectId,visitRef:visitRef,mime:mime,chunks:[],bytes:0,blob:null,uploaded:false,stopping:null,wake:null,interrupting:false};
      current=s;
      var session=await client().auth.getSession();
      s.ownerId=session.data.session && session.data.session.user.id;
      function interrupted(reason){
        if(current!==s || s.stopping || s.interrupting) return;
        s.interrupting=true;message(reason+' Finalizando e salvando o trecho capturado.');
        onInterrupted();
      }
      recorder.ondataavailable=function(e){if(e.data.size){s.chunks.push(e.data);s.bytes+=e.data.size;if(s.bytes>=23*1024*1024) interrupted('A gravação atingiu o limite de tamanho.');}};
      recorder.onerror=function(){interrupted('A gravação foi interrompida pelo navegador.');};
      stream.getAudioTracks().forEach(function(t){t.onended=function(){interrupted('O microfone foi desconectado.');};t.onmute=function(){if(!s.stopping)message('Atenção: o microfone foi suspenso. Volte para esta página para verificar a gravação.');};t.onunmute=function(){if(!s.stopping)message('● Gravando a visita. Finalize no Controle de visitas.');};});
      recorder.start(1000);wake(s);
      message('● Gravando a visita. Finalize no Controle de visitas.');
      return true;
    }catch(e){if(stream)stream.getTracks().forEach(function(t){t.stop();});current=null;throw new Error(e.name==='NotAllowedError'?'Permita o microfone para iniciar a visita com gravação.':e.message);}
    finally{busy=false;}
  }
  async function finish(){
    var s=current;if(!s)return;
    if(busy) throw new Error('Aguarde a operação atual.');
    busy=true;
    try{
      if(!s.stopping){
        s.stopping=new Promise(function(resolve){
          if(s.recorder.state==='inactive'){resolve();return;}
          s.recorder.addEventListener('stop',resolve,{once:true});s.recorder.stop();
        });
      }
      await s.stopping;stopTracks(s);
      var session=await client().auth.getSession();
      if(!session.data.session || session.data.session.user.id!==s.ownerId) throw new Error('Entre com o mesmo usuário que iniciou a gravação para enviá-la.');
      if(!s.blob){s.blob=new Blob(s.chunks,{type:s.mime.split(';')[0]});s.chunks=[];}
      if(!s.blob.size) throw new Error('O microfone não produziu áudio. A gravação não foi salva.');
      message('Enviando gravação. Mantenha esta página aberta…');
      if(!s.uploaded){
        // Renova a autorização de upload depois de visitas longas.
        s.upload=await api({action:'start',projectId:String(s.projectId),visitRef:s.visitRef,mime:s.mime,consent:true});
        if(s.upload.saved){s.uploaded=true;}
        else {
        var r=await client().storage.from('visit-recordings').uploadToSignedUrl(s.upload.path,s.upload.uploadToken,s.blob,{contentType:s.blob.type});
        if(r.error){
          // Uma resposta perdida pode acontecer depois de o upload já ter sido salvo.
          var recovered=await api({action:'finalize',id:s.upload.id});
          if(!recovered.saved) throw new Error('Falha no envio.');
        }
        s.uploaded=true;
        }
      }
      await api({action:'finalize',id:s.upload.id});
      current=null;s.blob=null;message('Gravação salva com acesso exclusivo do administrador.');
      setTimeout(function(){if(!current)badge.style.display='none';},10000);
    }catch(e){message('Não foi possível salvar o áudio. '+e.message+' Mantenha a página aberta.',true);throw e;}
    finally{busy=false;}
  }
  function closePanel(){if(statusTimer)clearInterval(statusTimer);statusTimer=null;if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}if(panel){panel.remove();panel=null;}}
  function text(parent,tag,value){var el=document.createElement(tag);el.textContent=value;parent.appendChild(el);return el;}
  async function openAdmin(projectId){
    try{
      var cap=await api({action:'capabilities'});if(!cap.admin)throw new Error('Acesso exclusivo do administrador.');
      closePanel();panel=document.createElement('dialog');panel.style.cssText='width:min(800px,94vw);max-height:85vh;border:1px solid #ddd;border-radius:14px;padding:24px;font:15px system-ui;color:#2A2620';
      document.body.appendChild(panel);panel.addEventListener('close',closePanel);
      var close=text(panel,'button','Fechar');close.onclick=closePanel;
      text(panel,'h2','Gravações e análises — somente administrador');
      if(!cap.aiConfigured)text(panel,'p','Áudios serão preservados. Configure OPENAI_API_KEY nos segredos do Supabase para gerar a análise.');
      var list=document.createElement('div'),detail=document.createElement('div');panel.append(list,detail);panel.showModal();
      var names={recording:'Gravação iniciada / envio não concluído',pending:'Aguardando análise',processing:'Analisando',ready:'Análise pronta',error:'Falha na análise',awaiting_configuration:'Aguardando configuração da IA'};
      async function refresh(){
        var result=await api({action:'list',projectId:String(projectId)});if(!panel)return;list.replaceChildren();
        if(!result.rows.length)text(list,'p','Nenhuma gravação neste projeto.');
        result.rows.forEach(function(row){var b=text(list,'button',new Date(row.created_at).toLocaleString('pt-BR')+' · '+(names[row.status]||row.status));b.style.cssText='display:block;width:100%;text-align:left;padding:12px;margin:8px 0';b.onclick=async function(){
          try{
            var data=await api({action:'detail',id:row.id});if(!panel)return;detail.replaceChildren();
            if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}
            text(detail,'h3',names[data.status]||data.status);
            if(data.error_message)text(detail,'p',data.error_message);
            if(data.status!=='recording'){
              var play=text(detail,'button','Carregar áudio');play.onclick=async function(){
                try{var r=await client().storage.from('visit-recordings').download(data.object_path);if(r.error)throw r.error;if(!panel)return;audioUrl=URL.createObjectURL(r.data);var audio=document.createElement('audio');audio.controls=true;audio.src=audioUrl;detail.appendChild(audio);play.remove();}catch(_){alert('Não foi possível acessar o áudio. Verifique sua permissão.');}
              };
            }
            if(data.summary){text(detail,'h3','Resumo e análise');text(detail,'div',data.summary).style.whiteSpace='pre-wrap';}
            if(data.transcript){text(detail,'h3','Transcrição');text(detail,'div',data.transcript).style.whiteSpace='pre-wrap';}
            if(data.status!=='recording' && data.status!=='ready'){
              var retry=text(detail,'button','Gerar / tentar análise novamente');retry.onclick=async function(){try{retry.disabled=true;await api({action:'process',id:row.id});await refresh();text(detail,'p','Processamento solicitado. Selecione a gravação novamente quando a análise estiver pronta.');}catch(e){alert(e.message);}finally{retry.disabled=false;}};
            }
          }catch(e){alert(e.message);}
        };});
      }
      await refresh();statusTimer=setInterval(function(){refresh().catch(function(){closePanel();});},10000);
    }catch(e){closePanel();alert(e.message);}
  }
  window.addEventListener('beforeunload',function(e){if(current){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',function(){if(current&&!document.hidden&&!current.stopping)wake(current);});
  window.VisitAudio={start:start,finish:finish,isAdmin:function(){return admin;},openAdmin:openAdmin,active:function(){return !!current;}};
  var attempts=0,ready=setInterval(async function(){
    if(!client()){if(++attempts>60)clearInterval(ready);return;}
    clearInterval(ready);
    client().auth.onAuthStateChange(function(event){if(event==='SIGNED_OUT'){admin=false;closePanel();if(window.Visitas)Visitas.render();}});
    try{var caps=await api({action:'capabilities'});admin=caps.admin;if(window.Visitas)Visitas.render();}catch(_){}
  },1000);
})();
