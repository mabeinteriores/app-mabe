(function(){
'use strict';
const Q=CamberQuotes,M=CamberQuoteModel,E=Q.esc;
const labels={PAUSED:'Pausar cotação',RESUME:'Retomar / reabrir cotação',CANCELED:'Cancelar cotação',ARCHIVED:'Arquivar cotação',TRASH:'Mover para a lixeira',RESTORE:'Restaurar cotação'};
Q.controlButtons=q=>M.controlActions(q).map(a=>'<button data-action="control" data-control="'+a+'" data-quotation="'+E(q.id)+'">'+labels[a]+'</button>').join('');
Q.controlDialog=function(q,action,refresh){
 if(!M.controlActions(q).includes(action))throw Error('Atualize a cotação para consultar as ações disponíveis.');
 const notes={PAUSED:'Os links ficam suspensos até a retomada. As propostas e os arquivos recebidos continuam salvos.',RESUME:'Defina um novo prazo. Os mesmos links voltam a aceitar propostas, preservando as respostas anteriores.',CANCELED:'Os fornecedores deixam de enviar propostas. O motivo e as respostas recebidas ficam no histórico.',ARCHIVED:'A cotação sai das listas principais e continua disponível em Arquivadas.',TRASH:'Este rascunho vai para a Lixeira e pode ser restaurado. Nenhum arquivo ou histórico será apagado.',RESTORE:'A cotação retorna à situação anterior. Restaurar não reabre o recebimento de propostas.'};
 const reason=action==='PAUSED'||action==='CANCELED',resume=action==='RESUME';
 const d=Q.dialog('<form><div class="cq-row"><h2>'+labels[action]+'?</h2><button type="button" data-close class="cq-x" aria-label="Fechar">×</button></div><p><b>'+E(q.code)+' · '+E(q.service)+'</b><br>'+E(q.project_name)+'</p><p>'+notes[action]+'</p>'+(reason?'<label>Motivo<select name="reason" required><option value="">Selecione</option>'+(action==='PAUSED'?['Aguardando decisão do cliente','Aguardando revisão do projeto','Obra suspensa','Outro motivo']:['Cliente desistiu da contratação','Escopo alterado','Cotação duplicada','Contratação não será realizada','Outro motivo']).map(s=>'<option>'+s+'</option>').join('')+'</select></label><label>Observação (opcional)<textarea name="note" maxlength="700"></textarea></label>':'')+(resume?'<label>Novo prazo para receber propostas<input type="date" name="deadline" required min="'+M.day(new Date())+'" max="'+M.day(Date.now()+89*86400000)+'" value="'+M.day(Date.now()+7*86400000)+'"></label>':'')+'<p class="cq-hint">Sem envio automático de e-mail. Histórico e propostas preservados.</p><p class="cq-error" role="alert"></p><div class="cq-actions"><button type="button" data-close>Voltar</button><button type="submit" class="primary">'+labels[action]+'</button></div></form>');
 const form=d.querySelector('form'),mutationId=Q.uuid();let busy=false,saved=false;
 d.addEventListener('cancel',e=>{if(busy||saved)e.preventDefault()});
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);d.querySelector('.cq-error').textContent='';
 try{if(!saved){const data=new FormData(form);await Q.api('workflow',{quotationId:q.id,state:action,expectedVersion:q.control_version||0,mutationId,reason:[data.get('reason'),data.get('note')].filter(Boolean).join(' · '),...(resume?{expiresAt:new Date(data.get('deadline')+'T23:59:59-03:00').toISOString()}: {})});saved=true;}
 await refresh();d.close();
 }catch(err){d.querySelector('.cq-error').textContent=(saved?'Alteração salva. Não foi possível atualizar a lista: ':'')+err.message;form.querySelector('[type="submit"]').textContent=saved?'Atualizar lista':labels[action];}
 finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=saved&&b.hasAttribute('data-close'));}
 };
};
})();
