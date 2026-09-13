(function(){
  'use strict';
  var BUCKET='cliente-anexos', MAX=25*1024*1024;
  function validar(file){
    if(!file || !file.size) throw new Error('Selecione um arquivo que não esteja vazio.');
    if(file.size>MAX) throw new Error('Cada arquivo pode ter no máximo 25 MB.');
    if(!/\.(pdf|png|jpe?g|webp|dwg|dxf|docx?)$/i.test(file.name)) throw new Error('Use PDF, imagem, DWG, DXF, DOC ou DOCX.');
    if(file.name.length>250) throw new Error('Use um nome de arquivo com até 250 caracteres.');
  }
  function check(r){if(r.error)throw r.error;return r.data;}
  window.CamberAnexos={validar:validar, enviarPlanta:async function(sb,token,file,state){
    validar(file);
    var path='convites/'+token+'/planta';
    if(!state.enviado){check(await sb.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'}));state.enviado=true;state.nome=file.name;}
    check(await sb.rpc('registrar_anexo_cliente',{p_path:path,p_nome:state.nome,p_token:token,p_categoria:'planta'}));
  }};
  var dialog,select,list,category='contrato',status,input,button,working=false,sequence=0;
  function client(){var s=window.CamberCloud&&CamberCloud.client();if(!s)throw new Error('Anexos disponíveis no aplicativo online.');return s;}
  function element(tag,text){var e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function selected(){var v=select.value;return {invite:v.startsWith('i:'),id:v.slice(2)};}
  async function render(){
    var seq=++sequence;list.replaceChildren();status.textContent='';
    var chosen=selected();input.disabled=button.disabled=!chosen.id||chosen.invite;
    if(!chosen.id){status.textContent='Selecione o cliente ou convite.';return;}
    if(chosen.invite)status.textContent='Arquivos recebidos pelo convite. Conclua o cadastro para anexar outros documentos.';
    try{
      var query=client().from('cliente_anexos').select('id,nome,caminho,tamanho,criado_em').eq('categoria',category);
      query=chosen.invite?query.eq('convite_token',chosen.id):query.eq('cliente_id',chosen.id);
      var docs=check(await query.order('criado_em',{ascending:false}));if(seq!==sequence)return;
      if(!docs.length){list.append(element('p','Nenhum arquivo nesta categoria.'));return;}
      docs.forEach(function(doc){
        var row=element('div');row.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #e5ddd0;';
        var label=element('span',doc.nome+' · '+(doc.tamanho/1024/1024).toFixed(2)+' MB');label.style.cssText='flex:1;overflow-wrap:anywhere';
        var download=element('button','Baixar');download.className='btn';download.onclick=async function(){
          download.disabled=true;
          try{var data=check(await client().storage.from(BUCKET).createSignedUrl(doc.caminho,60,{download:doc.nome}));var a=element('a');a.href=data.signedUrl;a.rel='noopener';a.target='_blank';document.body.append(a);a.click();a.remove();}
          catch(e){status.textContent='Não foi possível abrir o arquivo. Tente novamente.';}
          finally{download.disabled=false;}
        };
        var remove=element('button','Excluir');remove.className='btn';remove.style.color='#b34332';
        remove.onclick=async function(){
          if(working||!window.confirm('Excluir o anexo "'+doc.nome+'"? Esta ação não pode ser desfeita.'))return;
          working=true;remove.disabled=download.disabled=button.disabled=input.disabled=true;
          var wasDisabled=select.disabled;select.disabled=true;
          try{
            check(await client().storage.from(BUCKET).remove([doc.caminho]));
            var deleted=check(await client().from('cliente_anexos').delete().eq('id',doc.id).select('id'));
            if(!deleted.length)throw new Error('Exclusão não confirmada');
            await render();status.textContent='Anexo excluído.';
          }catch(e){status.textContent='Não foi possível concluir a exclusão. Tente novamente.';}
          finally{working=false;remove.disabled=download.disabled=false;select.disabled=wasDisabled;input.disabled=button.disabled=!chosen.id||chosen.invite;}
        };row.append(label,download,remove);list.append(row);
      });
    }catch(e){status.textContent='Não foi possível carregar os anexos. Tente novamente.';}
  }
  function setup(){
    dialog=element('dialog');dialog.style.cssText='width:min(720px,92vw);max-height:85vh;border:1px solid var(--line,#e5ddd0);border-radius:16px;padding:24px;color:var(--ink,#2a2620);background:var(--surface,#fff);font:inherit;';
    var head=element('div');head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px';
    var close=element('button','Fechar');close.className='btn';close.onclick=function(){if(!working)dialog.close();};head.append(element('h2','Anexos de clientes'),close);
    var label=element('label','Cliente ou convite');label.htmlFor='anexoCliente';select=element('select');select.id='anexoCliente';select.className='inp';select.style.cssText='width:100%;margin:8px 0 16px';select.onchange=render;
    var tabs=element('div');tabs.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px';
    [['contrato','Contrato'],['planta','Planta baixa'],['referencias','Referências']].forEach(function(pair){var b=element('button',pair[1]);b.className='btn'+(pair[0]===category?' primary':'');b.onclick=function(){if(working)return;category=pair[0];Array.from(tabs.children).forEach(x=>x.className='btn');b.className='btn primary';render();};tabs.append(b);});
    list=element('div');status=element('p');status.setAttribute('role','status');status.style.cssText='font-size:13px;color:#8c5a34';
    input=element('input');input.type='file';input.multiple=true;input.accept='.pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.doc,.docx';input.setAttribute('aria-label','Arquivos para anexar');
    button=element('button','Anexar arquivos');button.className='btn primary';button.onclick=upload;
    var actions=element('div');actions.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin-top:16px';actions.append(input,button);
    dialog.addEventListener('cancel',function(e){if(working)e.preventDefault();});
    dialog.append(head,label,select,tabs,list,status,element('p','PDF, imagens, DWG, DXF, DOC ou DOCX. Até 25 MB por arquivo.'),actions);(document.getElementById('app')||document.body).append(dialog);
  }
  async function upload(){
    if(working)return;var files=Array.from(input.files),chosen=selected();if(!files.length||!chosen.id||chosen.invite)return;
    try{files.forEach(validar);}catch(e){status.textContent=e.message;return;}
    working=true;button.disabled=true;select.disabled=true;input.disabled=true;
    var sent=0;
    try{for(var file of files){
      status.textContent='Enviando '+file.name+'…';
      var random=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
      var path='clientes/'+chosen.id+'/'+random;
      check(await client().storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'}));
      check(await client().rpc('registrar_anexo_cliente',{p_path:path,p_nome:file.name,p_cliente_id:chosen.id,p_categoria:category}));sent++;
    }input.value='';await render();status.textContent=sent+' arquivo(s) anexado(s).';}
    catch(e){await render();status.textContent='Falha no envio. '+sent+' arquivo(s) concluído(s). Confira a lista antes de tentar novamente.';}
    finally{working=false;button.disabled=false;select.disabled=false;input.disabled=false;}
  }
  window.abrirAnexosClientes=async function(clienteId){
    if(!dialog)setup();dialog.showModal();select.replaceChildren(new Option('Selecione…',''));list.replaceChildren();input.disabled=button.disabled=true;
    (window.CamberDB?CamberDB.loadClientes():[]).filter(function(c){return !clienteId||String(c.id)===String(clienteId);}).forEach(function(c){select.add(new Option(c.nome,'c:'+c.id));});
    if(clienteId){select.value='c:'+clienteId;select.disabled=true;await render();return;}
    select.disabled=false;
    try{var rows=check(await client().from('cliente_convites').select('token,nome_hint,dados').eq('status','respondido'));rows.forEach(function(c){select.add(new Option((c.dados&&c.dados.nome||c.nome_hint||'Cliente')+' (convite recebido)','i:'+c.token));});}
    catch(e){status.textContent='Não foi possível consultar os convites.';}
  };
})();
