/* ════════════════════════════════════════════════════════════════
   Precificação (PRC) — portado do app MABE para o Mabe Comercial.
   Camada de compatibilidade (shims) + módulo window.PRC original.
   Os ganchos do app antigo (clientes, propostas, PDF, alertas) foram
   reimplementados de forma autônoma, persistindo em localStorage.
   ════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";

  /* ---- stores locais ---- */
  var CKEY='mabe_prc_clientes_v1', PKEY='mabe_prc_propostas_v1';
  function rd(k){ try{var s=localStorage.getItem(k);return s?JSON.parse(s):null;}catch(e){return null;} }
  function wr(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch(e){} }

  // clientes: começa com os clientes dos projetos (MabeDB), se existir
  window.clientes = rd(CKEY);
  if(!Array.isArray(window.clientes)){
    window.clientes = [];
    try{
      if(window.MabeDB){
        var seen={};
        MabeDB.loadProjects().forEach(function(p){
          if(p.cliente && !seen[p.cliente]){ seen[p.cliente]=1;
            window.clientes.push({id:Date.now()+Math.floor(Math.random()*1e6),nome:p.cliente,tel:'',email:'',end:(p.cidade?(p.cidade+(p.uf?'/'+p.uf:'')):''),data:''});
          }
        });
      }
    }catch(e){}
    wr(CKEY, window.clientes);
  }
  window.salvarClientes = function(){ wr(CKEY, window.clientes); };

  window.propostas = rd(PKEY);
  if(!Array.isArray(window.propostas)) window.propostas = [];
  window.salvarPropostas = function(){ wr(PKEY, window.propostas); };

  window.CFG = window.CFG || { user: 'Você (Arq.)' };
  // responsável padrão = nome do usuário logado (substitui "Você (Arq.)")
  (function setPrcUser(tries){
    tries = tries || 0;
    var n = window.__mabeProfile && window.__mabeProfile.nome;
    if (n) { window.CFG = window.CFG || {}; window.CFG.user = n; return; }
    if (tries < 40) setTimeout(function(){ setPrcUser(tries+1); }, 200);
  })(0);

  /* ---- formatação ---- */
  window.fmt = window.fmt || function(n){ return (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}); };
  window.fmtDate = window.fmtDate || function(){ var d=new Date(); return d.toLocaleDateString('pt-BR'); };
  window.safeName = window.safeName || function(s){ return String(s||'cliente').replace(/[^\w\-]+/g,'_'); };

  /* ---- cliente: select + nome ---- */
  // Reconstrói a lista apenas com clientes cadastrados de fato:
  // (a) os criados aqui pelo botão "Novo cliente" (marcados _manual) e
  // (b) os clientes da carteira de Projetos (MabeDB). Resíduos de demo são descartados.
  window.refreshClientes = function(){
    try{
      var manuais=(window.clientes||[]).filter(function(c){return c && c._manual;});
      var lista=manuais.slice();
      var seen={};
      lista.forEach(function(c){ if(c.nome) seen[c.nome.toLowerCase()]=true; });
      if(window.MabeDB){
        // (b) clientes cadastrados na aba Clientes
        if(MabeDB.loadClientes){
          MabeDB.loadClientes().forEach(function(cl){
            var nm=(cl.nome||'').trim();
            if(nm && !seen[nm.toLowerCase()]){
              seen[nm.toLowerCase()]=true;
              lista.push({id:cl.id||(Date.now()+Math.floor(Math.random()*1e6)),nome:nm,tel:cl.tel||cl.cel||'',email:cl.email||'',end:(cl.endereco||cl.localizacao||(cl.cidade?(cl.cidade+(cl.uf?'/'+cl.uf:'')):''))||''});
            }
          });
        }
        // (c) clientes da carteira de Projetos
        MabeDB.loadProjects().forEach(function(p){
          var nm=(p.cliente||'').trim();
          if(nm && !seen[nm.toLowerCase()]){
            seen[nm.toLowerCase()]=true;
            lista.push({id:Date.now()+Math.floor(Math.random()*1e6),nome:nm,tel:'',email:'',end:(p.cidade?(p.cidade+(p.uf?'/'+p.uf:'')):''),data:''});
          }
        });
      }
      window.clientes=lista;
      wr(CKEY, window.clientes);
    }catch(e){}
  };
  window.popularSelectClientes = function(){
    var sel=document.getElementById('sel-cliente'); if(!sel)return;
    if(window.refreshClientes) window.refreshClientes();
    var keep=sel.value;
    var lista=window.clientes.slice().sort(function(a,b){return (a.nome||'').localeCompare(b.nome||'');});
    sel.innerHTML='<option value="">— Selecionar cliente —</option>'+
      lista.map(function(c){return '<option value="'+c.id+'">'+(c.nome||'')+'</option>';}).join('');
    if(keep)sel.value=keep;
  };
  window.getNome = window.getNome || function(){
    var sel=document.getElementById('sel-cliente');
    if(sel && sel.value){ var c=window.clientes.find(function(x){return String(x.id)===String(sel.value);}); if(c)return c.nome; }
    var man=document.getElementById('inp-cliente-manual');
    return man ? man.value.trim() : '';
  };

  /* ---- alertas inline ---- */
  window.showAlert = window.showAlert || function(id,msg,type){
    var box=document.getElementById(id); if(!box)return;
    box.innerHTML='<div class="alert '+(type||'')+'">'+msg+'</div>';
    if(type==='success'||type==='loading'){ clearTimeout(box._t); box._t=setTimeout(function(){ if(box.firstChild)box.innerHTML=''; },4200); }
  };

  /* ---- modais ---- */
  window.abrirModal = window.abrirModal || function(id){ var o=document.getElementById(id); if(o)o.classList.add('open'); };
  window.fecharModal = window.fecharModal || function(id){ var o=document.getElementById(id); if(o)o.classList.remove('open'); };

  /* ---- navegação (sem abas internas aqui) → atualiza lista recente ---- */
  window.showTab = window.showTab || function(){ try{ window.renderPropostas(); }catch(e){} };

  /* ---- lista de propostas recentes (substitui a "Pasta de Propostas") ---- */
  window.renderPropostas = function(){
    var box=document.getElementById('prc-recent'); if(!box)return;
    var ps=window.propostas||[];
    var wrap=document.getElementById('prc-recent-wrap'); if(wrap)wrap.style.display=ps.length?'block':'none';
    box.innerHTML = ps.slice(0,12).map(function(p){
      var n=(p.comodos&&p.comodos.length)?p.comodos.reduce(function(a,c){return a+(c.qtd||1);},0):0;
      return '<div class="prc-recrow">'+
        '<div class="rcm"><div class="rcn">'+(p.cliente||'—')+'</div>'+
        '<div class="rcs">'+(p.segmento||p.tipo||'—')+' · '+n+' cômodos · '+(p.criado||'')+'</div></div>'+
        '<div class="rcv">'+(window.fmt(p.totalGeral||0))+'</div>'+
        '<button class="btn btn-secondary" style="padding:7px 11px" onclick="PRC.editProposta('+p.id+')">Abrir</button>'+
        '<button class="btn btn-secondary" style="padding:7px 11px" onclick="imprimirProp('+p.id+')">PDF</button>'+
        '<button class="btn btn-secondary" style="padding:7px 9px;color:var(--lost)" onclick="prcDelProp('+p.id+')">🗑</button>'+
        '</div>';
    }).join('');
  };
  window.prcDelProp = function(id){
    if(!confirm('Excluir esta proposta?'))return;
    window.propostas = window.propostas.filter(function(x){return String(x.id)!==String(id);});
    window.salvarPropostas(); window.renderPropostas();
  };

  /* ---- "Gerar PDF": versão por impressão (window.print de proposta estilizada) ---- */
  window.gerarPropPDFfromProp = function(p){
    var coms=Array.isArray(p.comodos)?p.comodos:[];
    var totalQtd=0; coms.forEach(function(c){totalQtd+=(c.qtd||1);});
    var rows=coms.map(function(c){return '<tr><td>'+(c.cat?'<span style="color:#8B6545">'+c.cat+'</span> · ':'')+(c.nome||'')+'</td><td>'+(c.sub||'—')+'</td><td style="text-align:center">'+(c.qtd||1)+'</td></tr>';}).join('');
    var seg=p.segmento||p.tipo||'—';
    var corpo = coms.length
      ? '<table><thead><tr><th>Cômodo</th><th>Tamanho</th><th>Qtd</th></tr></thead><tbody>'+rows+'</tbody></table>'
      : '<p style="color:#6B6560">Proposta sem detalhamento de cômodos.</p>';
    var totalTxt=(p.totalGeral||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    var _L=p.localizacao||{}; var _ep=[];
    if(_L.rua)_ep.push(_L.rua+(_L.numero?(', '+_L.numero):''));
    if(_L.bairro)_ep.push(_L.bairro);
    if(_L.cidade)_ep.push(_L.cidade); if(_L.uf)_ep.push(_L.uf);
    if(_L.cep)_ep.push('CEP '+_L.cep);
    var imovMeta=_L.tipoImovel?('<div class="meta"><div><b>Imóvel:</b> '+_L.tipoImovel+(_L.condicao?(' · '+_L.condicao):'')+'</div>'+(_L.condominio?('<div><b>Condomínio:</b> '+_L.condominio+'</div>'):'')+(_ep.length?('<div><b>Endereço:</b> '+_ep.join(' · ')+'</div>'):'')+'</div>'):'';
    var w=window.open('','_blank'); if(!w){alert('Permita pop-ups para gerar o PDF.');return;}
    w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta - '+(p.cliente||'')+'</title>'+
      '<style>*{box-sizing:border-box}body{font-family:Georgia,Times New Roman,serif;color:#1C1917;margin:0;padding:42px}'+
      'h1{font-size:26px;letter-spacing:3px;color:#B8936A;margin:0}.sub{color:#8B6545;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-top:3px}'+
      '.hr{height:2px;background:#B8936A;width:60px;margin:16px 0 26px}'+
      '.meta{display:flex;flex-wrap:wrap;gap:6px 34px;font-size:14px;margin-bottom:20px}.meta b{color:#8B6545}'+
      '.box{background:#F7F5F0;border:1px solid #E5E0D8;border-radius:10px;padding:14px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}'+
      '.box .k{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B6560}.box .v{font-size:24px;font-weight:bold}'+
      'table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;border-bottom:2px solid #B8936A;padding:8px 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6B6560}th:last-child{text-align:center}td{border-bottom:1px solid #E5E0D8;padding:10px 6px}'+
      '.total{margin-top:26px;text-align:right;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6B6560}.total b{display:block;font-size:28px;color:#B8936A;letter-spacing:0;text-transform:none;margin-top:4px}'+
      '.ft{margin-top:46px;text-align:center;color:#9A8467;font-size:11px;letter-spacing:3px}'+
      '@media print{body{padding:24px}}</style></head><body>'+
      '<h1>MABE</h1><div class="sub">Arquitetura &amp; Design</div><div class="hr"></div>'+
      '<div class="meta"><div><b>Cliente:</b> '+(p.cliente||'')+'</div><div><b>Segmento:</b> '+seg+'</div><div><b>Data:</b> '+(p.criado||'')+'</div></div>'+
      imovMeta+
      '<div class="box"><div class="k">Total de cômodos</div><div class="v">'+totalQtd+'</div></div>'+
      corpo+
      '<div class="total">Investimento total<b>'+totalTxt+'</b></div>'+
      '<div class="ft">MABE &middot; ARQUITETURA &amp; DESIGN</div>'+
      '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt></body></html>');
    w.document.close();
  };
  window.imprimirProp = function(id){
    var p=window.propostas.find(function(x){return String(x.id)===String(id);}); if(p)window.gerarPropPDFfromProp(p);
  };
})();


/* ===== Módulo PRC (portado do MABE, sem alterações de lógica) ===== */
window.PRC = (function(){
  "use strict";
  var KEY="mabe_prc_segs_v1";
  var _i=0, uid=function(){_i++;return String(Date.now())+'_'+_i;};
  var EMOJIS=['🏠','🏡','🏢','🏬','🏨','🏤','🔑','🛏️','🛋️','🛁','🍽️','🛠️','🏗️','🏖️','🌿','🚪','🪑','🏪'];
  var money=function(n){return (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});};

  function t(l,p){return {id:uid(),label:l,price:p};}
  function g(n,ts){return {id:uid(),name:n,tiers:ts};}
  function m2(n,gs){return {id:uid(),name:n,mode:'m2',groups:gs};}
  function fix(n,p){return {id:uid(),name:n,mode:'fixed',groups:[g('',[t('valor fixo',p)])]};}

  function residencial(){return [
    m2("Banheiros",[
      g("Lavabo",[t("até 3 m²",3000),t("4 a 8 m²",4200)]),
      g("Banheiro Tradicional",[t("até 4 m²",2500),t("4,1 a 8 m²",3200),t("8,1 a 12 m²",4000),t("12,1 a 30 m²",4500)]),
      g("Casal Master c/ Hidro",[t("1 a 6 m²",3200),t("6,1 a 10 m²",4000),t("10,1 a 30 m²",4800)]),
      g("Muito Pequeno",[t("até 3 m²",2000)])
    ]),
    m2("Lavanderia",[g("",[t("até 3 m²",2800),t("3,1 a 5 m²",3000),t("5,1 a 10 m²",4000)])]),
    m2("Closet",[g("",[t("até 6 m²",3000),t("6,1 a 10 m²",4000),t("10,1 a 20 m²",6000)])]),
    m2("Quartos",[g("",[t("até 9 m²",3500),t("9,1 a 15 m²",4000),t("15,1 a 20 m²",6000)])]),
    fix("Escada",2000),
    fix("Hall",1200),
    m2("Sala de Estar",[g("",[t("até 10 m²",4200),t("10,1 a 18 m²",5500),t("18,1 a 22 m²",6000)])]),
    m2("Home Office",[g("",[t("até 12 m²",3500)])]),
    m2("Sala de Jantar",[g("",[t("até 12 m²",3000),t("acima de 12 m²",3500)])]),
    m2("Cozinha Gourmet",[g("",[t("1 a 20 m²",4500),t("20,1 a 40 m²",6000)])]),
    m2("Cozinha Tradicional",[]),
    m2("Varanda",[]),
    m2("Piscina / Fundos",[]),
    fix("SPA",0), fix("Depósito",0), fix("Circulação",0), fix("Adega",0), fix("Louceiro / Despensa",0)
  ];}
  function cloneZero(arr){return arr.map(function(r){return {id:uid(),name:r.name,mode:r.mode,groups:r.groups.map(function(gr){return {id:uid(),name:gr.name,tiers:gr.tiers.map(function(tt){return {id:uid(),label:tt.label,price:0};})};})};});}
  function seed(){var r=residencial();return [
    {id:uid(),name:"Residencial",sub:"Casas e apartamentos",emoji:"🏠",rooms:r},
    {id:uid(),name:"Corporativos",sub:"Escritórios e empresas",emoji:"🏢",rooms:cloneZero(r)},
    {id:uid(),name:"Airbnb",sub:"Locação por temporada",emoji:"🔑",rooms:cloneZero(r)},
    {id:uid(),name:"Reforma",sub:"Projetos de reforma",emoji:"🛠️",rooms:cloneZero(r)}
  ];}

  var segs=[], proj=[], cur=null, openSegs={}, backFn=null, editId=null, desc=0, imovelData=null, imSelTipo='', imSelCond='', imovelThenSave=false;

  function load(){try{var d=localStorage.getItem(KEY);segs=d?JSON.parse(d):seed();}catch(e){segs=seed();}
    if(!Array.isArray(segs)||!segs.length)segs=seed();
    segs.forEach(function(s){(s.rooms||[]).forEach(function(r){if(!r.mode)r.mode='m2';});});}
  function save(){localStorage.setItem(KEY,JSON.stringify(segs));}
  function findSeg(id){for(var i=0;i<segs.length;i++)if(String(segs[i].id)===String(id))return segs[i];return null;}
  function findRoom(id){if(!cur)return null;for(var i=0;i<cur.rooms.length;i++)if(String(cur.rooms[i].id)===String(id))return cur.rooms[i];return null;}
  function active(r){return r.groups.filter(function(x){return x.tiers.length;});}
  function firstPrice(r){for(var i=0;i<r.groups.length;i++)if(r.groups[i].tiers.length)return r.groups[i].tiers[0].price||0;return 0;}
  function el(id){return document.getElementById(id);}
  function fmtM2(n){n=Number(n)||0;var r=Math.round(n*100)/100;return r.toLocaleString('pt-BR')+' m²';}
  function parseRange(label){var s=String(label||'').toLowerCase();var nums=(s.replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)||[]).map(Number);if(!nums.length)return null;var acima=s.indexOf('acima')>=0||s.indexOf('mais de')>=0;var ate=(s.indexOf('at')>=0)&&!acima;if(acima)return {min:nums[0],max:Infinity};if(ate)return {min:0,max:nums[0]};if(nums.length>=2)return {min:nums[0],max:nums[1]};return {min:0,max:nums[0]};}
  function tierForM2(group,m2v){var parsed=[];group.tiers.forEach(function(tr){var rg=parseRange(tr.label);if(rg)parsed.push({tier:tr,min:rg.min,max:rg.max});});if(!parsed.length)return null;parsed.sort(function(a,b){return a.max-b.max;});for(var i=0;i<parsed.length;i++){if(m2v<=parsed[i].max)return parsed[i].tier;}return parsed[parsed.length-1].tier;}
  function projSize(){var s=0;for(var i=0;i<proj.length;i++)s+=(proj[i].m2||0)*proj[i].qty;return s;}

  /* ---- SELECTOR ---- */
  function renderSegs(){
    var box=el('prc-segs'); if(!box)return; box.innerHTML='';
    segs.forEach(function(s){
      var b=document.createElement('button');b.className='prc-seg-card'+(cur&&String(cur.id)===String(s.id)?' sel':'');
      b.innerHTML='<div class="e">'+(s.emoji||'🏠')+'</div><div><div class="t">'+s.name+'</div><div class="s">'+(s.sub||'')+'</div></div>';
      b.addEventListener('click',function(){selectSeg(s.id);});
      box.appendChild(b);
    });
  }
  function selectSeg(id){
    var s=findSeg(id); if(!s)return;
    editId=null; var _eb=el('prc-edit-banner'); if(_eb)_eb.style.display='none';
    if(cur && String(cur.id)!==String(s.id) && proj.length){ if(!confirm('Trocar de tipo de projeto? Os cômodos já adicionados serão limpos.'))return; proj=[]; }
    cur=s; if(!proj)proj=[];
    if(!proj.length){ desc=0; var _dv2=el('prc-desc-val'); if(_dv2)_dv2.value=''; imovelData=null; }
    el('prc-cur-emoji').textContent=s.emoji||'🏠';
    el('prc-cur-name').textContent=s.name;
    el('prc-builder').style.display='block';
    renderSegs(); renderRooms(); renderItems(); updateImovelBtn();
    // não abre o modal de imóvel automaticamente — mais intuitivo montar os cômodos primeiro;
    // o imóvel é solicitado ao salvar, ou pelo botão "Informações do imóvel".
  }

  /* ---- ROOMS GRID ---- */
  function roomCount(rid){var c=0;for(var i=0;i<proj.length;i++)if(String(proj[i].roomId)===String(rid))c+=proj[i].qty;return c;}
  function cardSub(r){var a=active(r);
    if(!a.length)return {txt:'a definir',def:true};
    if(a.length>1)return {txt:a.length+' tipos'};
    if(a[0].tiers.length===1){var o=a[0].tiers[0];if(o.price<=0)return {txt:'valor a definir',def:true};return {txt:o.label};}
    return {txt:a[0].tiers.length+' tamanhos'};}
  function iconFor(name){
    var n=(name||'').toLowerCase(), P='';
    if(/lavabo|banh|banheiro|wc|sanit|hidro/.test(n)) P='<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M10 5 8 7"/><path d="M2 12h20"/><path d="M7 19v2"/><path d="M17 19v2"/>';
    else if(/su[ií]te|quarto|dorm/.test(n)) P='<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>';
    else if(/lavand|servi/.test(n)) P='<rect width="18" height="20" x="3" y="2" rx="2"/><path d="M3 6h3"/><path d="M17 6h.01"/><circle cx="12" cy="13" r="5"/><path d="M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5"/>';
    else if(/closet|vesti|guarda-roupa/.test(n)) P='<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>';
    else if(/jantar/.test(n)) P='<path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>';
    else if(/estar|living|home theater|\btv\b|sala/.test(n)) P='<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"/><path d="M4 18v2"/><path d="M20 18v2"/>';
    else if(/gourmet|churrasq|grill/.test(n)) P='<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>';
    else if(/cozinha|copa/.test(n)) P='<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.4"/><circle cx="15" cy="9" r="1.4"/><circle cx="9" cy="15" r="1.4"/><circle cx="15" cy="15" r="1.4"/>';
    else if(/office|escrit/.test(n)) P='<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>';
    else if(/escada/.test(n)) P='<path d="M4 20h4v-4h4v-4h4v-4h4"/>';
    else if(/hall|circul|corredor|entrada/.test(n)) P='<path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/>';
    else if(/garagem|vaga|carro/.test(n)) P='<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>';
    else if(/piscina|fundos/.test(n)) P='<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>';
    else if(/varanda|sacada|alpendre|deck|terra/.test(n)) P='<path d="M3 21V10"/><path d="M21 21V10"/><path d="M3 10h18"/><path d="M3 14h18"/><path d="M8 21v-7"/><path d="M13 21v-7"/><path d="M18 21v-7"/>';
    else if(/adega|vinho/.test(n)) P='<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>';
    else if(/dep[oó]sito|despensa|louceiro|estoque/.test(n)) P='<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>';
    else if(/spa/.test(n)) P='<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>';
    else if(/p[aá]tio|jardim|quintal|horta/.test(n)) P='<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>';
    else P='<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+P+'</svg>';
  }
  function renderRooms(){
    var box=el('prc-rooms'); if(!box||!cur)return; box.innerHTML='';
    cur.rooms.forEach(function(r){
      var sub=cardSub(r),cnt=roomCount(r.id);
      var b=document.createElement('button');b.className='prc-room'+(cnt>0?' has':'');b.setAttribute('data-r',r.id);
      b.innerHTML='<div class="bdg">'+cnt+'</div><div class="ricon">'+iconFor(r.name)+'</div><div class="rn">'+r.name+'</div><div class="rp'+(sub.def?' def':'')+'">'+sub.txt+'</div>';
      b.addEventListener('click',function(){tapRoom(r);});
      box.appendChild(b);
    });
  }
  function tapRoom(r){
    var groups=active(r);
    if(!groups.length){alert('Defina os tamanhos/valor deste cômodo em ⚙️ Configurar tabela.');return;}
    if(r.mode==='fixed'){
      if(groups.length===1){addSel(r,groups[0],groups[0].tiers[0]);}
      else groupSheet(r,groups);
      return;
    }
    if(groups.length===1){ m2Sheet(r,groups[0],false); }
    else groupSheet(r,groups);
  }

  /* ---- SHEET ---- */
  function showSheet(){el('prc-sheet-ov').classList.add('open');}
  function closeSheet(){el('prc-sheet-ov').classList.remove('open');el('prc-sheet-back').style.display='none';backFn=null;}
  function sheetBack(){if(backFn)backFn();}
  function opt(label,fn,arrow){var b=document.createElement('button');b.className='prc-opt';b.innerHTML='<span class="ol">'+label+'</span>'+(arrow?'<span class="oa">›</span>':'');b.addEventListener('click',fn);return b;}
  function groupSheet(r,groups){
    backFn=null; el('prc-sheet-back').style.display='none';
    el('prc-sheet-title').textContent=r.name; el('prc-sheet-sub').textContent='Selecione o tipo';
    var o=el('prc-sheet-opts'); o.innerHTML='';
    groups.forEach(function(gr){ o.appendChild(opt(gr.name,function(){
      if(r.mode==='m2'){ m2Sheet(r,gr,true); }
      else if(gr.tiers.length===1){ addSel(r,gr,gr.tiers[0]); closeSheet(); }
      else { tierSheet(r,gr,true); }
    }, true)); });
    showSheet();
  }
  function tierSheet(r,gr,fromGroup){
    if(fromGroup){el('prc-sheet-back').style.display='block';backFn=function(){groupSheet(r,active(r));};}
    else{el('prc-sheet-back').style.display='none';backFn=null;}
    el('prc-sheet-title').textContent=gr.name||r.name; el('prc-sheet-sub').textContent='Selecione o tamanho';
    var o=el('prc-sheet-opts'); o.innerHTML='';
    gr.tiers.forEach(function(tr){ o.appendChild(opt(tr.label,function(){ addSel(r,gr,tr); closeSheet(); },false)); });
    showSheet();
  }

  function m2Sheet(r,gr,fromGroup){
    if(fromGroup){el('prc-sheet-back').style.display='block';backFn=function(){groupSheet(r,active(r));};}
    else{el('prc-sheet-back').style.display='none';backFn=null;}
    el('prc-sheet-title').textContent=gr.name||r.name;
    el('prc-sheet-sub').textContent='Digite o tamanho do cômodo';
    var o=el('prc-sheet-opts'); o.innerHTML='';
    var row=document.createElement('div'); row.className='prc-m2row';
    var inp=document.createElement('input'); inp.type='number'; inp.min='0'; inp.step='0.01'; inp.className='prc-m2inp'; inp.placeholder='0';
    var unit=document.createElement('span'); unit.className='prc-m2unit'; unit.textContent='m²';
    row.appendChild(inp); row.appendChild(unit);
    var hint=document.createElement('div'); hint.className='prc-m2hint';
    var btn=document.createElement('button'); btn.className='prc-m2add'; btn.textContent='Adicionar cômodo';
    function preview(){var v=parseFloat(inp.value)||0;if(v>0){var tr=tierForM2(gr,v);hint.textContent=tr?('Faixa: '+tr.label+' · '+money(tr.price)):'Sem faixa cadastrada';}else hint.textContent='';}
    function go(){var v=parseFloat(inp.value)||0;if(v<=0){inp.focus();return;}var tr=tierForM2(gr,v);if(!tr){tierSheet(r,gr,fromGroup);return;}addSel(r,gr,tr,v);closeSheet();}
    inp.addEventListener('input',preview);
    inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();go();}});
    btn.addEventListener('click',go);
    o.appendChild(row); o.appendChild(hint); o.appendChild(btn);
    showSheet();
    setTimeout(function(){try{inp.focus();}catch(e){}},120);
  }

  /* ---- PROJECT ---- */
  function addSel(r,gr,tier,m2val){
    var isM2=(r.mode==='m2')&&(typeof m2val==='number')&&m2val>0;
    var key=String(r.id)+'_'+String(gr.id)+'_'+String(tier.id)+(isM2?('_'+m2val):'');
    for(var i=0;i<proj.length;i++){if(proj[i].key===key){proj[i].qty++;renderItems();return;}}
    var sub;
    if(isM2)sub=fmtM2(m2val);
    else sub=(tier.label==='valor fixo'||tier.label==='valor único')?'':tier.label;
    proj.push({pid:uid(),key:key,roomId:r.id,name:(gr.name||r.name),cat:(gr.name?r.name:''),sub:sub,price:tier.price,qty:1,m2:(isM2?m2val:0)});
    renderItems();
  }
  function total(){var s=0;for(var i=0;i<proj.length;i++)s+=proj[i].price*proj[i].qty;return s;}
  function qty(){var q=0;for(var i=0;i<proj.length;i++)q+=proj[i].qty;return q;}
  function renderItems(){
    var box=el('prc-items'); if(!box)return; box.innerHTML='';
    if(!proj.length){box.innerHTML='<div class="prc-empty">Nenhum cômodo ainda.<br>Toque em um cômodo ao lado para começar.</div>';}
    else proj.forEach(function(it){
      var d=document.createElement('div');d.className='prc-item';
      d.innerHTML='<div class="m">'+(it.cat?'<div class="c">'+it.cat+'</div>':'')+'<div class="n">'+it.name+'</div>'+(it.sub?'<div class="s">'+it.sub+'</div>':'')+'</div>'+
        '<div class="prc-step"><button data-a="m">−</button><span class="q">'+it.qty+'</span><button data-a="p">+</button></div>';
      var btns=d.querySelectorAll('button');
      btns[0].addEventListener('click',function(){it.qty--;if(it.qty<=0)proj=proj.filter(function(x){return x.pid!==it.pid;});renderItems();});
      btns[1].addEventListener('click',function(){it.qty++;renderItems();});
      box.appendChild(d);
    });
    var bruto=total(); var d=desc>0?Math.min(desc,bruto):0; var liq=Math.max(0,bruto-d);
    el('prc-total').textContent=money(liq);
    var orig=el('prc-total-orig'), dl=el('prc-total-desc');
    if(d>0){ if(orig){orig.style.display='block';orig.textContent=money(bruto);} if(dl){dl.style.display='block';dl.textContent='Desconto: -'+money(d);} }
    else { if(orig)orig.style.display='none'; if(dl)dl.style.display='none'; }
    var q=qty(); el('prc-total-count').textContent=q?(q+' '+(q===1?'cômodo':'cômodos')):'';
    var sz=projSize(); var szRow=el('prc-size-row'), szVal=el('prc-size-val');
    if(szRow&&szVal){ if(sz>0){szRow.style.display='flex';szVal.textContent=fmtM2(sz);} else {szRow.style.display='none';} }
    renderRooms(); refresh();
  }
  function onDesc(){ var i=el('prc-desc-val'); desc=i?(parseFloat(i.value)||0):0; if(desc<0)desc=0; renderItems(); }

  /* ---- CONFIG ---- */
  function openConfig(){renderConfig();el('prc-cfg-ov').classList.add('open');}
  function closeConfig(){el('prc-cfg-ov').classList.remove('open');renderSegs();if(cur){cur=findSeg(cur.id);if(cur){renderRooms();}else{el('prc-builder').style.display='none';}}}
  function renderConfig(){
    var box=el('prc-cfg-list'); box.innerHTML='';
    segs.forEach(function(s){
      var card=document.createElement('div');card.className='prc-cseg'+(openSegs[s.id]?' open':'');
      var h=document.createElement('div');h.className='prc-cseg-h';
      h.innerHTML='<div class="e">'+(s.emoji||'🏠')+'</div><div style="flex:1"><div class="n">'+s.name+'</div><div class="ct">'+s.rooms.length+' cômodos</div></div><div class="chev">▾</div>';
      h.addEventListener('click',function(){var op=card.classList.toggle('open');if(op)openSegs[s.id]=true;else delete openSegs[s.id];});
      card.appendChild(h);
      var b=document.createElement('div');b.className='prc-cseg-b';fillSeg(b,s);card.appendChild(b);
      box.appendChild(card);
    });
  }
  function fillSeg(b,s){
    b.innerHTML='';
    addField(b,'Nome do segmento',s.name,function(v){s.name=v;save();});
    addField(b,'Descrição',s.sub||'',function(v){s.sub=v;save();},'ex: Casas e apartamentos');
    var lab=document.createElement('label');lab.className='prc-flabel';lab.textContent='Ícone';b.appendChild(lab);
    var ep=document.createElement('div');ep.className='prc-emojis';
    EMOJIS.forEach(function(em){var bt=document.createElement('button');bt.textContent=em;if(em===s.emoji)bt.className='on';bt.addEventListener('click',function(){s.emoji=em;save();ep.querySelectorAll('button').forEach(function(x){x.classList.remove('on');});bt.classList.add('on');});ep.appendChild(bt);});
    b.appendChild(ep);
    var l2=document.createElement('label');l2.className='prc-flabel';l2.textContent='Cômodos';b.appendChild(l2);
    s.rooms.forEach(function(r){var rd=document.createElement('div');rd.className='prc-croom';renderRoomCfg(rd,s,r);b.appendChild(rd);});
    var add=document.createElement('button');add.className='prc-ghost';add.textContent='+ Adicionar cômodo';
    add.addEventListener('click',function(){s.rooms.push(m2('Novo cômodo',[g('',[t('',0)])]));save();fillSeg(b,s);});
    b.appendChild(add);
    var del=document.createElement('button');del.className='prc-delseg';del.textContent='Excluir segmento';
    del.addEventListener('click',function(){if(!confirm('Excluir o segmento "'+s.name+'"?'))return;segs=segs.filter(function(x){return String(x.id)!==String(s.id);});delete openSegs[s.id];if(cur&&String(cur.id)===String(s.id)){cur=null;el('prc-builder').style.display='none';}save();renderConfig();});
    b.appendChild(del);
  }
  function addField(parent,label,val,onin,ph){
    var l=document.createElement('label');l.className='prc-flabel';l.textContent=label;parent.appendChild(l);
    var i=document.createElement('input');i.className='prc-in';i.value=val;if(ph)i.placeholder=ph;
    i.addEventListener('input',function(){onin(i.value);});parent.appendChild(i);
  }
  function renderRoomCfg(rd,s,r){
    rd.innerHTML='';
    var n=document.createElement('input');n.className='prc-in';n.value=r.name;n.placeholder='Nome do cômodo';
    n.addEventListener('input',function(){r.name=n.value;save();});rd.appendChild(n);
    var mp=document.createElement('div');mp.className='prc-mode';
    var bM=document.createElement('button');bM.textContent='Por m²';if(r.mode==='m2')bM.className='on';
    var bF=document.createElement('button');bF.textContent='Valor fixo';if(r.mode==='fixed')bF.className='on';
    bM.addEventListener('click',function(){if(r.mode==='m2')return;r.mode='m2';r.groups=[g('',[t('',firstPrice(r))])];save();renderRoomCfg(rd,s,r);});
    bF.addEventListener('click',function(){if(r.mode==='fixed')return;r.mode='fixed';r.groups=[g('',[t('valor fixo',firstPrice(r))])];save();renderRoomCfg(rd,s,r);});
    mp.appendChild(bM);mp.appendChild(bF);rd.appendChild(mp);
    if(r.mode==='fixed'){
      if(!r.groups.length)r.groups=[g('',[t('valor fixo',0)])];
      var tr=r.groups[0].tiers[0];
      var l=document.createElement('label');l.className='prc-flabel';l.textContent='Valor (R$)';rd.appendChild(l);
      var pi=document.createElement('input');pi.className='prc-in';pi.type='number';pi.inputMode='numeric';pi.value=tr.price||'';pi.placeholder='ex: 2000';
      pi.addEventListener('input',function(){tr.price=parseFloat(pi.value)||0;save();});rd.appendChild(pi);
    } else {
      var named=(r.groups.length>1)||(r.groups.length===1&&r.groups[0].name!=='');
      r.groups.forEach(function(gr){
        var gb=document.createElement('div');gb.className='prc-grp';
        if(named){
          var gh=document.createElement('div');gh.className='prc-grp-h';
          var gi=document.createElement('input');gi.value=gr.name;gi.placeholder='Nome do tipo (ex: Lavabo)';
          gi.addEventListener('input',function(){gr.name=gi.value;save();});gh.appendChild(gi);
          var gx=document.createElement('button');gx.className='x';gx.textContent='×';
          gx.addEventListener('click',function(){r.groups=r.groups.filter(function(x){return String(x.id)!==String(gr.id);});save();renderRoomCfg(rd,s,r);});
          gh.appendChild(gx);gb.appendChild(gh);
        }
        gr.tiers.forEach(function(tr){
          var row=document.createElement('div');row.className='prc-tier';
          var li=document.createElement('input');li.className='lab';li.value=tr.label;li.placeholder='ex: até 8 m²';
          li.addEventListener('input',function(){tr.label=li.value;save();});
          var pi=document.createElement('input');pi.className='pri';pi.type='number';pi.inputMode='numeric';pi.value=tr.price||'';pi.placeholder='R$';
          pi.addEventListener('input',function(){tr.price=parseFloat(pi.value)||0;save();});
          var dx=document.createElement('button');dx.className='x';dx.textContent='×';
          dx.addEventListener('click',function(){gr.tiers=gr.tiers.filter(function(x){return String(x.id)!==String(tr.id);});save();renderRoomCfg(rd,s,r);});
          row.appendChild(li);row.appendChild(pi);row.appendChild(dx);gb.appendChild(row);
        });
        var at=document.createElement('button');at.className='prc-ghost';at.textContent='+ faixa de tamanho';
        at.addEventListener('click',function(){gr.tiers.push(t('',0));save();renderRoomCfg(rd,s,r);});gb.appendChild(at);
        rd.appendChild(gb);
      });
      var atype=document.createElement('button');atype.className='prc-ghost';atype.textContent='+ tipo (sub-cômodo, ex: Lavabo / Suíte)';
      atype.addEventListener('click',function(){r.groups.push(g('Novo tipo',[t('',0)]));save();renderRoomCfg(rd,s,r);});rd.appendChild(atype);
    }
    var del=document.createElement('button');del.className='prc-delroom';del.textContent='Excluir cômodo';
    del.addEventListener('click',function(){if(!confirm('Excluir "'+r.name+'"?'))return;s.rooms=s.rooms.filter(function(x){return String(x.id)!==String(r.id);});save();var body=rd.parentNode;fillSeg(body,s);});
    rd.appendChild(del);
  }
  function addSeg(){var s={id:uid(),name:"Novo segmento",sub:"",emoji:"🏠",rooms:[]};segs.push(s);openSegs[s.id]=true;save();renderConfig();}

  /* ---- CLIENTE ---- */
  function clientInfo(){
    var box=el('prc-cli-info'); if(!box)return;
    var sel=el('sel-cliente'); var c=(sel&&sel.value)?clientes.find(function(x){return String(x.id)===sel.value;}):null;
    if(c){box.style.display='block';box.innerHTML='<b>'+c.nome+'</b>'+(c.tel?' · '+c.tel:'')+(c.email?' · '+c.email:'')+(c.end?'<br>📍 '+c.end:'');}
    else box.style.display='none';
  }
  function refresh(){
    var nome=(typeof getNome==='function')?getNome():'';
    var ok=!!(nome && proj.length>0 && cur);
    ['prc-btn-salvar','prc-btn-pdf','prc-btn-wpp'].forEach(function(id){var b=el(id);if(b)b.disabled=!ok;});
  }
  function novoCliente(){
    ['prc-nc-nome','prc-nc-esposa','prc-nc-tel','prc-nc-email','prc-nc-end'].forEach(function(id){var e=el(id);if(e)e.value='';});
    el('prc-nc-tipo').value='comum';el('prc-nc-origem').value='direto';el('prc-newcli-alert').textContent='';
    abrirModal('prc-newcli-ov');
  }
  function salvarNovoCliente(){
    var nome=el('prc-nc-nome').value.trim();
    if(!nome){showAlert('prc-newcli-alert','⚠️ Informe o nome.','error');return;}
    var c={id:Date.now(),_manual:true,nome:nome,esposa:el('prc-nc-esposa').value.trim(),tel:el('prc-nc-tel').value.trim(),email:el('prc-nc-email').value.trim(),end:el('prc-nc-end').value.trim(),tipo:el('prc-nc-tipo').value,origem:el('prc-nc-origem').value,indicadoPor:'',obs:'',cpf:'',rg:'',anivCli:'',anivCasa:'',data:fmtDate()};
    clientes.unshift(c); salvarClientes(); popularSelectClientes();
    var sel=el('sel-cliente'); if(sel){sel.value=String(c.id);} 
    var man=el('inp-cliente-manual'); if(man){man.value='';man.disabled=true;}
    fecharModal('prc-newcli-ov'); clientInfo(); refresh();
  }

  /* ---- AÇÕES ---- */
  function buildProp(){
    var nome=getNome();
    var bruto=total();
    var d=desc>0?Math.min(desc,bruto):0;
    var liq=Math.max(0,bruto-d);
    return {
      id:Date.now(), cliente:nome, tipo:(cur?cur.name:'—'), segmento:(cur?cur.name:''), m2:projSize(),
      exig:1, perfil:1, valorProjetoBruto:bruto, valorProjeto:liq, valorAcomp:0,
      totalGeral:liq, totalSemDesconto:bruto,
      desconto:{tipo:(d>0?'valor':null),valor:d,pct:null,auth:''},
      temAcomp:false, modalidadeAcomp:null, freq:'', bonificado:null, tipoAcomp:'', fixoQtdVisitas:0,
      localizacao: imovelData,
      comodos: proj.map(function(it){return {nome:it.name,cat:it.cat,sub:it.sub,qtd:it.qty,m2:(it.m2||0)};}),
      status:'aguardando',
      historico:[{status:'aguardando',data:fmtDate(),responsavel:(typeof CFG!=='undefined'&&CFG.user)?CFG.user:'Sistema',obs:'Proposta criada (precificação por cômodos)'}],
      criado:fmtDate(),
      obs:'Cômodos: '+proj.map(function(it){return (it.cat?it.cat+' ':'')+it.name+(it.sub?' ('+it.sub+')':'')+(it.qty>1?' x'+it.qty:'');}).join('; ')
    };
  }
  function salvar(){
    var nome=getNome();
    if(!nome){showAlert('calc-alert','⚠️ Selecione ou informe o cliente.','error');return;}
    if(!cur){showAlert('calc-alert','⚠️ Selecione o tipo de projeto.','error');return;}
    if(total()<=0){showAlert('calc-alert','⚠️ Adicione cômodos (com valor) ao projeto.','error');return;}
    if(editId){ doSalvar(); } else if(imovelData){ doSalvar(); } else { openImovelModal(true); }
  }
  function doSalvar(){
    var np=buildProp();
    var savedProp;
    if(editId){
      var idx=propostas.findIndex(function(x){return String(x.id)===String(editId);});
      if(idx!==-1){
        var prev=propostas[idx];
        propostas[idx]=Object.assign({}, prev, np, {id:prev.id, status:prev.status, comercial:prev.comercial, criado:prev.criado, historico:prev.historico, localizacao:(np.localizacao||prev.localizacao||null), projId:prev.projId});
        if(!Array.isArray(propostas[idx].historico))propostas[idx].historico=[];
        propostas[idx].historico.push({status:propostas[idx].status||'aguardando',data:fmtDate(),responsavel:(typeof CFG!=='undefined'&&CFG.user)?CFG.user:'Sistema',obs:'Proposta editada (precificação por cômodos)'});
        savedProp=propostas[idx];
        showAlert('calc-alert','✅ Proposta atualizada — abrindo Projetos…','success');
      } else { savedProp=np; propostas.unshift(np); showAlert('calc-alert','✅ Proposta salva — abrindo Projetos…','success'); }
      editId=null; var _eb=el('prc-edit-banner'); if(_eb)_eb.style.display='none';
    } else {
      savedProp=np; propostas.unshift(np);
      showAlert('calc-alert','✅ Proposta salva — abrindo Projetos…','success');
    }
    syncProjetoFromProp(savedProp);   // cria/atualiza o projeto que alimenta os dashboards
    salvarPropostas();
    proj=[]; desc=0; imovelData=null; var _dvs=el('prc-desc-val'); if(_dvs)_dvs.value=''; renderItems(); refresh(); updateImovelBtn();
    try{renderPropostas();}catch(e){}
    // vai automaticamente para a aba Projetos (após garantir o envio ao banco)
    setTimeout(function(){ irPara('projetos.html'); }, 400);
  }

  // navega só depois de confirmar o envio das pendências ao banco
  function irPara(url){
    var done=false, go=function(){ if(done) return; done=true; location.href=url; };
    try {
      if (window.MabeCloud && MabeCloud.flush){
        var p = MabeCloud.flush();
        if (p && p.then){ p.then(go, go); setTimeout(go, 2500); return; }
      }
    } catch(e){}
    go();
  }

  // mapeia o segmento da precificação para o "tipo de projeto" do app
  function tipoFromSeg(seg){
    var m={ 'Residencial':'Residencial', 'Corporativos':'Comercial', 'Corporativo':'Comercial', 'Airbnb':'Airbnb', 'Reforma':'Reforma' };
    return m[seg]||seg||'Residencial';
  }
  // cria (ou atualiza) um Projeto em MabeDB a partir da proposta salva
  function syncProjetoFromProp(p){
    if(!p || !window.MabeDB) return;
    var L=p.localizacao||{};
    var dados={
      nome: (p.cliente||'Cliente') + ' — ' + (p.segmento||p.tipo||'Projeto'),
      cliente: p.cliente||'—',
      tipo: tipoFromSeg(p.segmento||p.tipo),
      cidade: L.cidade||'—', uf: L.uf||'',
      cep: L.cep||'', logradouro: L.rua||'', numero: L.numero||'', bairro: L.bairro||'',
      valor: Math.round(p.totalGeral||0),
      resp: (typeof CFG!=='undefined'&&CFG.user)?CFG.user:'Você (Arq.)',
      obs: 'Gerado a partir de proposta de precificação. ' + (p.obs||'')
    };
    if(p.projId && MabeDB.getProject(p.projId)){
      MabeDB.updateProject(p.projId, dados);
    } else {
      dados.op=0; dados.pct=0; dados.rt=0; dados.statusLabel='Prospecção'; dados.statusCls='prospec';
      var novo=MabeDB.addProject(dados);
      p.projId=novo.id;
    }
  }
  /* ---- Informações do imóvel ---- */
  var ufCache={};
  function onUF(){
    var uf=el('prc-imv-uf'), dl=el('prc-imv-cidades'), cid=el('prc-imv-cidade');
    if(!uf||!dl)return;
    if(cid)cid.value='';
    dl.innerHTML='';
    var v=uf.value; if(!v)return;
    function fill(list){ dl.innerHTML=list.map(function(n){return '<option value="'+String(n).replace(/"/g,'&quot;')+'"></option>';}).join(''); if(cid)cid.placeholder='Cidade (digite para buscar)'; }
    if(ufCache[v]){ fill(ufCache[v]); return; }
    if(cid)cid.placeholder='Carregando cidades...';
    try{
      fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/'+v+'/municipios')
        .then(function(r){return r.json();})
        .then(function(arr){ var names=(arr||[]).map(function(m){return m.nome;}).sort(function(a,b){return String(a).localeCompare(String(b),'pt-BR');}); ufCache[v]=names; fill(names); })
        .catch(function(){ if(cid)cid.placeholder='Cidade'; });
    }catch(e){ if(cid)cid.placeholder='Cidade'; }
  }
  function updateImovelBtn(){
    var b=el('prc-imovel-btn'); if(!b)return;
    if(imovelData&&imovelData.tipoImovel){
      var c=imovelData.cidade?(' · '+imovelData.cidade+(imovelData.uf?'/'+imovelData.uf:'')):'';
      b.textContent='🏡 '+imovelData.tipoImovel+c; b.classList.add('set');
    } else { b.textContent='🏡 Informações do imóvel'; b.classList.remove('set'); }
  }
  function openImovelModal(thenSave){
    imovelThenSave=!!thenSave;
    var d=imovelData||{};
    imSelTipo=d.tipoImovel||''; imSelCond=d.condicao||'';
    var tw=el('prc-imv-tipos'); if(tw){var bs=tw.querySelectorAll('.prc-imv-opt');for(var i=0;i<bs.length;i++){if(bs[i].getAttribute('data-v')===imSelTipo)bs[i].classList.add('sel');else bs[i].classList.remove('sel');}}
    var cw=el('prc-imv-conds'); if(cw){var cs=cw.querySelectorAll('.prc-imv-opt');for(var j=0;j<cs.length;j++){if(cs[j].getAttribute('data-v')===imSelCond)cs[j].classList.add('sel');else cs[j].classList.remove('sel');}}
    var cd=el('prc-imv-condo-wrap'); if(cd)cd.style.display=(imSelTipo==='Casa em condomínio')?'block':'none';
    var setV=function(id,val){var e=el(id);if(e)e.value=val||'';};
    setV('prc-imv-condo',d.condominio); setV('prc-imv-rua',d.rua); setV('prc-imv-num',d.numero);
    setV('prc-imv-bairro',d.bairro); setV('prc-imv-cep',d.cep);
    var _h=el('prc-imv-cephint'); if(_h){_h.textContent='digite o CEP para preencher o endereço automaticamente';_h.className='prc-cep-hint';}
    var _dl=el('prc-imv-cidades'); if(_dl)_dl.innerHTML='';
    var uf=el('prc-imv-uf'); if(uf)uf.value=d.uf||'';
    if(d.uf){ onUF(); }
    setV('prc-imv-cidade',d.cidade);
    var cf=el('prc-imv-confirm'); if(cf)cf.textContent=imovelThenSave?'💾 Salvar proposta':'✓ Salvar informações';
    var ov=el('prc-imovel-ov'); if(ov)ov.classList.add('open');
  }
  function openImovel(){ openImovelModal(false); }
  function closeImovel(){var o=el('prc-imovel-ov');if(o)o.classList.remove('open');}
  function imovelTipo(btn){imSelTipo=btn.getAttribute('data-v');var w=el('prc-imv-tipos');var bs=w.querySelectorAll('.prc-imv-opt');for(var i=0;i<bs.length;i++){if(bs[i]===btn)bs[i].classList.add('sel');else bs[i].classList.remove('sel');}var cd=el('prc-imv-condo-wrap');if(cd)cd.style.display=(imSelTipo==='Casa em condomínio')?'block':'none';}
  function imovelCond(btn){imSelCond=btn.getAttribute('data-v');var w=el('prc-imv-conds');var bs=w.querySelectorAll('.prc-imv-opt');for(var i=0;i<bs.length;i++){if(bs[i]===btn)bs[i].classList.add('sel');else bs[i].classList.remove('sel');}}
  function confirmImovel(){
    if(!imSelTipo){alert('Selecione o tipo de imóvel.');return;}
    if(!imSelCond){alert('Informe se o imóvel é novo ou usado.');return;}
    var gv=function(id){var e=el(id);return e?String(e.value||'').trim():'';};
    imovelData={ tipoImovel:imSelTipo, condicao:imSelCond, condominio:(imSelTipo==='Casa em condomínio'?gv('prc-imv-condo'):''), cep:gv('prc-imv-cep'), uf:gv('prc-imv-uf'), cidade:gv('prc-imv-cidade'), bairro:gv('prc-imv-bairro'), rua:gv('prc-imv-rua'), numero:gv('prc-imv-num') };
    closeImovel();
    updateImovelBtn();
    if(imovelThenSave){ imovelThenSave=false; doSalvar(); }
  }
  function buscaCep(){
    var inp=el('prc-imv-cep'); var hint=el('prc-imv-cephint'); if(!inp)return;
    var cep=String(inp.value||'').replace(/\D/g,'');
    if(cep.length!==8){ if(hint){hint.textContent='CEP incompleto — digite os 8 dígitos';hint.className='prc-cep-hint err';} inp.focus(); return; }
    inp.value=cep.slice(0,5)+'-'+cep.slice(5);
    if(hint){hint.textContent='buscando endereço…';hint.className='prc-cep-hint';}
    var btn=el('prc-imv-cepbtn'); if(btn)btn.disabled=true;
    fetch('https://viacep.com.br/ws/'+cep+'/json/').then(function(r){return r.json();}).then(function(dd){
      if(btn)btn.disabled=false;
      if(dd.erro){ if(hint){hint.textContent='CEP não encontrado — preencha manualmente';hint.className='prc-cep-hint err';} return; }
      var setV=function(id,val){var e=el(id);if(e)e.value=val||'';};
      var uf=el('prc-imv-uf'); if(uf){uf.value=dd.uf||'';}
      if(dd.uf)onUF();
      setV('prc-imv-cidade',dd.localidade);
      setV('prc-imv-bairro',dd.bairro);
      setV('prc-imv-rua',dd.logradouro);
      if(hint){hint.textContent='endereço preenchido · informe o número';hint.className='prc-cep-hint ok';}
      var nf=el('prc-imv-num'); if(nf)nf.focus();
    }).catch(function(){ if(btn)btn.disabled=false; if(hint){hint.textContent='sem conexão — preencha o endereço manualmente';hint.className='prc-cep-hint err';} });
  }
  function gerarPDF(){
    var nome=getNome();
    if(!nome){showAlert('calc-alert','⚠️ Selecione o cliente.','error');return;}
    if(total()<=0){showAlert('calc-alert','⚠️ Adicione cômodos ao projeto.','error');return;}
    var np=buildProp();
    if(window.gerarPropPDFfromProp) window.gerarPropPDFfromProp(np);
  }
  function whatsapp(){
    if(!proj.length){showAlert('calc-alert','⚠️ Adicione cômodos primeiro.','error');return;}
    var nome=getNome();
    var L=['*MABE — Arquitetura & Design*','Estimativa · Projeto '+(cur?cur.name:''),''];
    if(nome)L.splice(2,0,'Cliente: '+nome);
    proj.forEach(function(it){L.push('• '+(it.cat?it.cat+' — ':'')+it.name+(it.sub?' ('+it.sub+')':'')+(it.qty>1?'  x'+it.qty:''));});
    var bruto=total(); var d=desc>0?Math.min(desc,bruto):0; var liq=Math.max(0,bruto-d);
    var _sz=projSize();
    L.push('');
    if(_sz>0)L.push('Tamanho do projeto: '+fmtM2(_sz));
    if(d>0){ L.push('Subtotal: '+money(bruto)); L.push('Desconto: -'+money(d)); }
    L.push('*Investimento total: '+money(liq)+'*'); L.push(''); L.push('_Projeto de design de interiores Mabe._');
    window.open('https://wa.me/?text='+encodeURIComponent(L.join('\n')),'_blank');
  }

  function rebuildFromComodos(seg, comodos){
    var out=[];
    (comodos||[]).forEach(function(c){
      var roomName=c.cat?c.cat:c.nome, room=null;
      for(var i=0;i<seg.rooms.length;i++){if(seg.rooms[i].name===roomName){room=seg.rooms[i];break;}}
      if(!room)return;
      var group=null;
      if(c.cat){for(var j=0;j<room.groups.length;j++){if(room.groups[j].name===c.nome){group=room.groups[j];break;}}}
      if(!group)group=room.groups[0];
      if(!group)return;
      var tier=null;
      var hasM2=(typeof c.m2==='number'&&c.m2>0&&room.mode==='m2');
      if(hasM2){tier=tierForM2(group,c.m2);}
      if(!tier&&c.sub){for(var k=0;k<group.tiers.length;k++){if(group.tiers[k].label===c.sub){tier=group.tiers[k];break;}}}
      if(!tier)tier=group.tiers[0];
      if(!tier)return;
      var key=String(room.id)+'_'+String(group.id)+'_'+String(tier.id)+(hasM2?('_'+c.m2):'');
      var f=null;for(var m=0;m<out.length;m++){if(out[m].key===key){f=out[m];break;}}
      if(f){f.qty+=(c.qtd||1);return;}
      var subTxt=hasM2?fmtM2(c.m2):((tier.label==='valor fixo'||tier.label==='valor único')?'':tier.label);
      out.push({pid:uid(),key:key,roomId:room.id,name:(group.name||room.name),cat:(group.name?room.name:''),sub:subTxt,price:tier.price,qty:(c.qtd||1),m2:(hasM2?c.m2:0)});
    });
    return out;
  }
  function editProposta(id){
    var p=propostas.find(function(x){return String(x.id)===String(id);}); if(!p)return;
    editId=id;
    var sel=el('sel-cliente'), man=el('inp-cliente-manual');
    var cli=clientes.find(function(c){return c.nome===p.cliente;});
    if(sel){ if(cli){sel.value=String(cli.id); if(man){man.disabled=true;man.value='';}} else {sel.value=''; if(man){man.disabled=false;man.value=p.cliente||'';}} }
    var seg=segs.find(function(s){return s.name===(p.segmento||p.tipo);});
    cur=seg||null;
    proj=(seg&&Array.isArray(p.comodos))?rebuildFromComodos(seg,p.comodos):[];
    desc=(p.desconto&&p.desconto.valor>0)?p.desconto.valor:0;
    imovelData=p.localizacao||null;
    updateImovelBtn();
    var _dve=el('prc-desc-val'); if(_dve)_dve.value=desc>0?desc:'';
    if(cur){ el('prc-cur-emoji').textContent=cur.emoji||'🏠'; el('prc-cur-name').textContent=cur.name; el('prc-builder').style.display='block'; }
    else { el('prc-builder').style.display='none'; }
    var eb=el('prc-edit-banner'); if(eb)eb.style.display='flex';
    renderSegs(); renderItems(); clientInfo(); refresh();
    if(!seg){ showAlert('calc-alert','⚠️ O segmento "'+(p.segmento||p.tipo||'—')+'" desta proposta não existe mais. Selecione um tipo para reconstruir.','error'); }
  }
  function cancelarEdicao(){ editId=null; var eb=el('prc-edit-banner'); if(eb)eb.style.display='none'; showAlert('calc-alert','Edição cancelada — o próximo salvamento criará uma nova proposta.','loading'); }
  function novoOrcamento(){
    editId=null; cur=null; proj=[]; desc=0; imovelData=null;
    var eb=el('prc-edit-banner'); if(eb)eb.style.display='none';
    var sc=el('sel-cliente'); if(sc)sc.value='';
    var mc=el('inp-cliente-manual'); if(mc){mc.value='';mc.disabled=false;}
    var ci=el('prc-cli-info'); if(ci){ci.style.display='none';ci.innerHTML='';}
    var dv=el('prc-desc-val'); if(dv)dv.value='';
    var bd=el('prc-builder'); if(bd)bd.style.display='none';
    renderSegs(); renderItems(); refresh(); updateImovelBtn();
    var al=el('calc-alert'); if(al)al.innerHTML='';
    try{ window.scrollTo(0,0); var bs=document.querySelector('.body.scroll'); if(bs)bs.scrollTop=0; }catch(e){}
    showAlert('calc-alert','📝 Novo orçamento — selecione o cliente e o tipo de projeto.','loading');
  }
  function init(){ load(); renderSegs(); renderItems(); clientInfo(); refresh(); }

  return {
    init:init, openConfig:openConfig, closeConfig:closeConfig, addSeg:addSeg,
    closeSheet:closeSheet, sheetBack:sheetBack,
    salvar:salvar, gerarPDF:gerarPDF, whatsapp:whatsapp,
    novoCliente:novoCliente, salvarNovoCliente:salvarNovoCliente,
    editProposta:editProposta, cancelarEdicao:cancelarEdicao, novoOrcamento:novoOrcamento, onDesc:onDesc,
    imovelTipo:imovelTipo, imovelCond:imovelCond, confirmImovel:confirmImovel, closeImovel:closeImovel, onUF:onUF, openImovel:openImovel, buscaCep:buscaCep,
    _onClient:function(){ clientInfo(); refresh(); }
  };
})();

function onClienteChange(){
  var sel=document.getElementById('sel-cliente');
  var man=document.getElementById('inp-cliente-manual');
  if(sel&&man){ man.disabled=!!sel.value; if(sel.value)man.value=''; }
  if(window.PRC) PRC._onClient();
}

function abrirEditarProp(id){
  showTab('calc', document.querySelectorAll('nav button')[0]);
  if(window.PRC) PRC.editProposta(id);
}

document.addEventListener('DOMContentLoaded', function(){ if(window.PRC) PRC.init(); });
if(document.readyState!=='loading'){ if(window.PRC) PRC.init(); }
