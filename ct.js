/* Custos de Terceiros — adaptado do MABE para operar sobre um PROJETO (MabeDB).
   Os custos ficam salvos no próprio projeto (campo .custos) via MabeDB.updateProject. */
window.CT = (function(){
  var CATKEY='mabe_ct_cats_v1';
  var brl=function(n){return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});};
  var el=function(id){return document.getElementById(id);};
  var uid=function(){return Date.now()+'_'+Math.floor(Math.random()*100000);};
  var cats=['Freelancer','Renderização','Filmagem','Maquete','Consultoria'], pid=null, editId=null, onChange=null;

  function loadCats(){try{var c=JSON.parse(localStorage.getItem(CATKEY));if(c&&c.length)cats=c;}catch(e){}}
  function saveCats(){try{localStorage.setItem(CATKEY,JSON.stringify(cats));}catch(e){}}
  function proj(){ return (window.MabeDB&&pid!=null) ? MabeDB.getProject(pid) : null; }
  function fillCats(){ var s=el('ct-cat'); if(!s)return; var cur=s.value; s.innerHTML=cats.map(function(c){return '<option>'+c+'</option>';}).join(''); if(cur)s.value=cur; }
  function novaCategoria(){ var n=prompt('Nome da nova categoria:'); if(!n)return; n=n.trim(); if(n&&cats.indexOf(n)<0){cats.push(n);saveCats();fillCats();el('ct-cat').value=n;} }
  function editarCategoria(){
    var s=el('ct-cat'); if(!s||!s.value)return; var atual=s.value;
    var n=prompt('Renomear categoria "'+atual+'" para:', atual); if(n===null)return; n=n.trim();
    if(!n){alert('Nome inválido.');return;}
    if(n!==atual && cats.indexOf(n)>-1){alert('Já existe uma categoria com esse nome.');return;}
    var i=cats.indexOf(atual); if(i>-1)cats[i]=n; saveCats();
    // atualiza os custos que usavam a categoria antiga (em todos os projetos)
    try{ MabeDB.loadProjects().forEach(function(p){ var arr=MabeDB.loadOpps?null:null; var c=p.custos; if(Array.isArray(c)){ var ch=false; c.forEach(function(it){ if(it.cat===atual){it.cat=n;ch=true;} }); if(ch)MabeDB.updateProject(p.id,{custos:c}); } }); }catch(e){}
    fillCats(); el('ct-cat').value=n; render();
  }
  function excluirCategoria(){
    var s=el('ct-cat'); if(!s||!s.value)return; var atual=s.value;
    if(cats.length<=1){alert('Mantenha ao menos uma categoria.');return;}
    var p=proj(); var emUso=p&&Array.isArray(p.custos)?p.custos.filter(function(it){return it.cat===atual;}).length:0;
    var msg='Excluir a categoria "'+atual+'"?'+(emUso?('\n\n'+emUso+' custo(s) deste projeto usam ela e ficarão como "Sem categoria".'):'');
    if(!confirm(msg))return;
    cats=cats.filter(function(c){return c!==atual;}); saveCats();
    if(emUso){ var arr=p.custos.slice(); arr.forEach(function(it){ if(it.cat===atual)it.cat='Sem categoria'; }); persist(arr); }
    fillCats(); render();
  }
  function today(){ return new Date().toISOString().slice(0,10); }
  function clearForm(){ ['ct-prest','ct-desc','ct-valor'].forEach(function(i){var e=el(i);if(e)e.value='';}); var d=el('ct-data'); if(d)d.value=today(); }

  function persist(custos){
    if(!window.MabeDB||pid==null)return;
    var total=custos.reduce(function(s,i){return s+(Number(i.valor)||0);},0);
    MabeDB.updateProject(pid,{custos:custos, custosTotal:total});
    if(typeof onChange==='function'){ try{onChange();}catch(e){} }
  }

  function open(projId, cb){
    pid=projId; onChange=cb||null;
    var p=proj(); if(!p){alert('Projeto não encontrado.');return;}
    if(!Array.isArray(p.custos))p.custos=[];
    loadCats(); fillCats();
    el('ct-title').textContent='💸 Custos de Terceiros — '+(p.nome||'Projeto');
    editId=null; el('ct-add').textContent='Adicionar'; el('ct-cancel').style.display='none';
    el('ct-status').value='a_pagar'; clearForm(); render();
    el('ct-ov').classList.add('open');
  }
  function close(){ var o=el('ct-ov'); if(o)o.classList.remove('open'); pid=null; editId=null; }

  function salvar(){
    var p=proj(); if(!p)return;
    var custos=Array.isArray(p.custos)?p.custos.slice():[];
    var data=el('ct-data').value, cat=el('ct-cat').value, prest=el('ct-prest').value.trim(), desc=el('ct-desc').value.trim();
    var valor=parseFloat(el('ct-valor').value)||0, status=el('ct-status').value;
    if(valor<=0){alert('Informe o valor.');return;}
    if(!prest&&!desc){alert('Informe ao menos o prestador ou a descrição.');return;}
    if(editId){
      for(var i=0;i<custos.length;i++){ if(custos[i].id===editId){ custos[i]={id:editId,data:data,cat:cat,prest:prest,desc:desc,valor:valor,status:status}; break; } }
      editId=null; el('ct-add').textContent='Adicionar'; el('ct-cancel').style.display='none';
    } else {
      custos.unshift({id:uid(),data:data||today(),cat:cat,prest:prest,desc:desc,valor:valor,status:status});
    }
    persist(custos); clearForm(); el('ct-status').value='a_pagar'; render();
  }
  function editar(id){
    var p=proj(); if(!p)return; var it=(p.custos||[]).filter(function(x){return x.id===id;})[0]; if(!it)return;
    editId=id; el('ct-data').value=it.data; el('ct-cat').value=it.cat; el('ct-prest').value=it.prest; el('ct-desc').value=it.desc; el('ct-valor').value=it.valor; el('ct-status').value=it.status;
    el('ct-add').textContent='Salvar'; el('ct-cancel').style.display='inline-block';
  }
  function cancelar(){ editId=null; el('ct-add').textContent='Adicionar'; el('ct-cancel').style.display='none'; el('ct-status').value='a_pagar'; clearForm(); }
  function excluir(id){
    var p=proj(); if(!p)return; if(!confirm('Excluir este custo?'))return;
    persist((p.custos||[]).filter(function(x){return x.id!==id;})); render();
  }
  function toggleStatus(id){
    var p=proj(); if(!p)return; var custos=(p.custos||[]).slice();
    for(var i=0;i<custos.length;i++){ if(custos[i].id===id){ custos[i]=Object.assign({},custos[i],{status:(custos[i].status==='pago'?'a_pagar':'pago')}); break; } }
    persist(custos); render();
  }
  function render(){
    var p=proj(); if(!p)return; var arr=p.custos||[];
    var tot=arr.reduce(function(s,i){return s+(Number(i.valor)||0);},0);
    var pagar=arr.filter(function(i){return i.status==='a_pagar';}).reduce(function(s,i){return s+(Number(i.valor)||0);},0);
    var pago=arr.filter(function(i){return i.status==='pago';}).reduce(function(s,i){return s+(Number(i.valor)||0);},0);
    el('ct-tot').textContent=brl(tot); el('ct-pagar').textContent=brl(pagar); el('ct-pago').textContent=brl(pago);
    el('ct-n').textContent=arr.length; el('ct-foot-total').textContent=brl(tot);
    var tb=el('ct-tbody');
    if(!arr.length){ tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--ink-3);padding:26px">Nenhum custo lançado para este projeto.</td></tr>'; return; }
    tb.innerHTML=arr.map(function(it){
      var dt=(it.data||'').split('-').reverse().join('/');
      return '<tr>'
        +'<td>'+dt+'</td>'
        +'<td><span class="ct-badge">'+(it.cat||'-')+'</span></td>'
        +'<td>'+(it.prest||'-')+'</td>'
        +'<td>'+(it.desc||'-')+'</td>'
        +'<td><span class="ct-pill '+it.status+'" data-act="toggle" data-id="'+it.id+'">'+(it.status==='pago'?'✅ Pago':'⏳ A pagar')+'</span></td>'
        +'<td class="r" style="font-weight:700">'+brl(it.valor)+'</td>'
        +'<td class="r" style="white-space:nowrap"><button type="button" class="ct-ico" data-act="edit" data-id="'+it.id+'">✏️</button> <button type="button" class="ct-ico" data-act="del" data-id="'+it.id+'">🗑</button></td>'
        +'</tr>';
    }).join('');
    bindRowActions();
  }
  function bindRowActions(){
    var tb=el('ct-tbody'); if(!tb||tb._ctBound)return; tb._ctBound=true;
    tb.addEventListener('click',function(ev){
      var t=ev.target; while(t&&t!==tb&&!t.getAttribute('data-act'))t=t.parentNode;
      if(!t||t===tb)return;
      var act=t.getAttribute('data-act'), id=t.getAttribute('data-id');
      if(!act||!id)return;
      ev.preventDefault();
      if(act==='toggle')toggleStatus(id);
      else if(act==='edit')editar(id);
      else if(act==='del')excluir(id);
    });
  }
  return { open:open, close:close, salvar:salvar, editar:editar, excluir:excluir, toggleStatus:toggleStatus, cancelar:cancelar, novaCategoria:novaCategoria, editarCategoria:editarCategoria, excluirCategoria:excluirCategoria };
})();
