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
      if(!docs.length){var empty=element('div');empty.className='ax-empty';empty.append(element('strong','Seus documentos ficam aqui'),element('p','Nenhum arquivo nesta categoria. Selecione abaixo os documentos que deseja anexar.'));list.append(empty);return;}
      docs.forEach(function(doc){
        var row=element('div');row.className='ax-file';
        var label=element('div');label.className='ax-file-info';label.append(element('strong',doc.nome),element('small',(doc.tamanho/1024/1024).toFixed(2)+' MB'));
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
    var css=element('style');css.textContent=`
      dialog.ax-modal{box-sizing:border-box;width:min(740px,94vw);max-height:90vh;padding:30px;border:1px solid #e8dfd3;border-radius:24px;background:#fffdf9;color:#302c27;font:inherit;box-shadow:0 24px 90px #29211730}
      .ax-modal::backdrop{background:#25221c66;backdrop-filter:blur(4px)}
      .ax-modal h2{font-size:24px;letter-spacing:-.6px;margin:0 0 6px}.ax-modal p{line-height:1.5}
      .ax-modal .ax-sub{margin:0;color:#8b8073;font-size:13px}
      .ax-modal .ax-context{margin:24px 0 20px;padding:14px 16px;background:#f5f1ea;border-radius:12px}
      .ax-modal .ax-context label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#948573;margin-bottom:6px}
      .ax-modal .ax-context select{width:100%;font:inherit;font-size:13px;border:0;background:transparent;color:#51483e;padding:4px 0;opacity:1}
      .ax-modal .ax-tabs{display:flex;gap:4px;padding:5px;border-radius:12px;background:#f2eee7;margin-bottom:20px}
      .ax-modal .ax-tabs .btn{flex:1;justify-content:center;border:0;border-radius:9px;background:transparent;color:#857564;box-shadow:none;padding:11px 8px}
      .ax-modal .ax-tabs .btn.primary{background:#fffdf9;color:#b55f36;box-shadow:0 2px 6px #40302312}
      .ax-modal .ax-empty{text-align:center;padding:27px 20px;color:#7c7164;border:1px solid #eee7dc;border-radius:14px}
      .ax-modal .ax-empty strong{font-size:14px;color:#51483d}.ax-modal .ax-empty p{font-size:12px;max-width:330px;margin:8px auto 0}
      .ax-modal .ax-file{display:flex;align-items:center;gap:10px;padding:14px;border:1px solid #ebe3d8;border-radius:12px;margin:8px 0;background:white}
      .ax-modal .ax-file-info{flex:1;min-width:0;overflow-wrap:anywhere}.ax-modal .ax-file-info strong{display:block;font-size:13px;font-weight:500}.ax-modal .ax-file-info small{display:block;color:#9b8a76;margin-top:5px}
      .ax-modal .ax-upload{margin-top:20px;padding:18px;border:1px dashed #d6b99c;border-radius:14px;background:#fcf8f2}
      .ax-modal .ax-upload strong{display:block;font-size:13px;margin-bottom:5px}.ax-modal .ax-upload p{font-size:11px;color:#978571;margin:0 0 14px}
      .ax-modal input[type=file]{width:100%;min-width:0;font:inherit;font-size:12px;color:#897969}
      .ax-modal input::file-selector-button{font:inherit;font-weight:600;border:1px solid #dfcebb;border-radius:8px;background:#fffdf9;color:#665240;padding:10px 12px;margin-right:12px;cursor:pointer}
      .ax-modal .ax-footer{display:flex;justify-content:flex-end;margin-top:18px}.ax-modal .ax-footer .btn{padding:12px 22px;border-radius:10px}
      .ax-modal .ax-status{font-size:12px;color:#986443;margin:14px 0 0}.ax-modal .ax-status:empty{display:none}
      .ax-modal button:focus-visible,.ax-modal input:focus-visible,.ax-modal select:focus-visible{outline:2px solid #bf693f;outline-offset:3px}
      @media(max-width:520px){dialog.ax-modal{padding:20px;border-radius:18px}.ax-modal h2{font-size:21px}.ax-modal .ax-file{flex-wrap:wrap}.ax-modal .ax-file-info{flex-basis:100%}.ax-modal .ax-footer .btn{width:100%;justify-content:center}}
    `;document.head.append(css);
    dialog=element('dialog');dialog.className='ax-modal';dialog.setAttribute('aria-labelledby','axTitle');
    var head=element('div');head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px';
    var close=element('button','Fechar');close.className='btn';close.onclick=function(){if(!working)dialog.close();};var title=element('div'),h=element('h2','Anexos do cliente');h.id='axTitle';var subtitle=element('p','Documentos organizados, sempre à mão.');subtitle.className='ax-sub';title.append(h,subtitle);head.append(title,close);
    var label=element('label','Cliente ou convite');label.htmlFor='anexoCliente';select=element('select');select.id='anexoCliente';select.className='inp';select.style.cssText='width:100%;margin:8px 0 16px';select.onchange=render;
    select.style.cssText='';var context=element('div');context.className='ax-context';context.append(label,select);
    var tabs=element('div');tabs.className='ax-tabs';
    [['contrato','Contrato'],['planta','Planta baixa'],['referencias','Referências']].forEach(function(pair){var b=element('button',pair[1]);b.className='btn'+(pair[0]===category?' primary':'');b.onclick=function(){if(working)return;category=pair[0];Array.from(tabs.children).forEach(x=>x.className='btn');b.className='btn primary';render();};tabs.append(b);});
    list=element('div');status=element('p');status.setAttribute('role','status');status.className='ax-status';
    input=element('input');input.type='file';input.multiple=true;input.accept='.pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.doc,.docx';input.setAttribute('aria-label','Arquivos para anexar');
    button=element('button','Anexar arquivos');button.className='btn primary';button.onclick=upload;
    var actions=element('div');actions.className='ax-upload';actions.append(element('strong','Adicionar documentos'),element('p','PDF, imagens, DWG, DXF ou Word · Até 25 MB por arquivo'),input);
    var footer=element('div');footer.className='ax-footer';footer.append(button);
    dialog.addEventListener('cancel',function(e){if(working)e.preventDefault();});
    dialog.append(head,context,tabs,list,actions,status,footer);(document.getElementById('app')||document.body).append(dialog);
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
