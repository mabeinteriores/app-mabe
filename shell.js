// Gestão Camber — shell de app hi-fi.
// Injeta a topbar (marca + navegação + busca + tema) em todas as telas.
// Tema persiste em localStorage. Pele fixa: Studio.
(function () {
  var pages = [
    { id: 'painel',       t: 'Painel',       href: 'painel.html' },
    { id: 'precificacao', t: 'Precificação', href: 'precificacao.html' },
    { id: 'projetos',     t: 'Projetos',     href: 'projetos.html' },
    { id: 'clientes',     t: 'Clientes',     href: 'clientes.html' },
    { id: 'fornecedores', t: 'Fornecedores', href: 'fornecedores.html' },
    { id: 'indicacoes',   t: 'Indicações',   href: 'indicacoes.html' },
    { id: 'lead',         t: 'Lead',         href: 'lead.html' },
    { id: 'usuarios',     t: 'Usuários',     href: 'usuarios.html' },
    { id: 'config',       t: 'Configuração', href: 'configuracao.html' }
  ];

  var app = document.getElementById('app');
  if (!app) return;
  var current = app.getAttribute('data-page') || '';

  // tema
  var saved = 'light';
  try { saved = localStorage.getItem('mabe-theme') || 'light'; } catch (e) {}
  app.setAttribute('data-theme', saved);

  // estilo do menu "Sair" que aparece ao passar o mouse sobre o logo
  var _shStyle = document.createElement('style');
  _shStyle.textContent =
    '.brandwrap{position:relative}' +
    '.brandmenu{position:absolute;top:100%;left:0;background:#fff;border:1px solid #e8e0d4;border-radius:10px;box-shadow:0 10px 28px rgba(60,40,20,.16);padding:6px;min-width:178px;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .14s,transform .14s,visibility .14s;z-index:2000}' +
    '.brandwrap:hover .brandmenu{opacity:1;visibility:visible;transform:translateY(0)}' +
    '.brandmenu-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:none;padding:9px 12px;border-radius:7px;font-family:inherit;font-size:13.5px;color:#b3402a;cursor:pointer;font-weight:600}' +
    '.brandmenu-item:hover{background:#faf3ee}';
  document.head.appendChild(_shStyle);

  var sun = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var moon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var icons=['▦','◇','▤','♙','▣','↗','◎','♙','⚙'];
  var nav = pages.map(function (p,i) {
    return '<a class="' + (p.id === current ? 'on' : '') + '" href="' + p.href + '" aria-label="'+p.t+'"'+(p.id===current?' aria-current="page"':'')+'><span class="nav-icon" aria-hidden="true">'+icons[i]+'</span><span class="nav-label">' + p.t + '</span></a>';
  }).join('');

  var top = document.createElement('div');
  top.className = 'top camber-sidebar';top.id='camberSidebar';app.classList.add('has-sidebar');
  var sideCss=document.createElement('link');sideCss.rel='stylesheet';sideCss.href='menu-lateral.css?v=2';document.head.appendChild(sideCss);
  var layoutCss=document.createElement('link');layoutCss.rel='stylesheet';layoutCss.href='layout-telas.css?v=1';document.head.appendChild(layoutCss);
  document.querySelectorAll('#app .body table').forEach(function(table){if(table.parentElement.classList.contains('table-viewport'))return;var frame=document.createElement('div');frame.className='table-viewport';frame.tabIndex=0;frame.setAttribute('role','region');frame.setAttribute('aria-label','Tabela com rolagem horizontal');table.before(frame);frame.appendChild(table);});
  top.innerHTML =
    '<div class="brandwrap">' +
      '<a class="brand" href="painel.html" style="text-decoration:none;color:inherit">' +
        '<div class="mark">C</div>' +
        '<div><div class="bn">Gestão Camber</div><div class="bs">Oportunidades</div></div>' +
      '</a>' +
      '<div class="brandmenu"><button type="button" class="brandmenu-item" id="camberSairBtn">↪&nbsp;Sair do app</button></div>' +
    '</div>' +
    '<nav class="nav" aria-label="Menu principal">' + nav + '</nav>' +
    '<div class="sp"></div>' +
    '<form class="ipt search" id="topSearch" style="gap:8px;text-align:left"><span>⌕</span><input id="topSearchInput" placeholder="Buscar projeto, cliente…" style="border:none;background:transparent;outline:none;font-family:inherit;font-size:13px;color:inherit;width:170px"></form>' +
    '<button class="iconbtn" id="themeBtn" title="Alternar tema">' + (saved === 'dark' ? sun : moon) + '</button>' +
    '<a class="btn primary" href="precificacao.html?novo=1">+&nbsp; Nova Precificação</a>' +
    '<div class="av">MA</div>';

  app.insertBefore(top, app.firstChild);
  var toggle=document.createElement('button');toggle.type='button';toggle.className='sidebar-toggle';toggle.textContent='☰ Menu';toggle.setAttribute('aria-controls','camberSidebar');toggle.setAttribute('aria-expanded','false');app.appendChild(toggle);
  function closeMenu(){top.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}
  toggle.onclick=function(){var open=top.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));};
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeMenu();});
  document.addEventListener('click',function(ev){if(!top.contains(ev.target)&&!toggle.contains(ev.target))closeMenu();});

  // "Sair do app" (no menu do logo) → volta para a tela de login
  var sairBtn = document.getElementById('camberSairBtn');
  if (sairBtn) sairBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (window.CamberCloud && window.CamberCloud.signOut) window.CamberCloud.signOut();
    else { try { localStorage.clear(); sessionStorage.clear(); } catch (er) {} location.reload(); }
  });

  // busca da topbar → leva para Projetos já filtrado
  var sForm = document.getElementById('topSearch');
  if (sForm){
    sForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (document.getElementById('topSearchInput').value || '').trim();
      location.href = 'projetos.html' + (q ? ('?q=' + encodeURIComponent(q)) : '');
    });
  }

  document.getElementById('themeBtn').addEventListener('click', function () {
    var now = app.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    app.setAttribute('data-theme', now);
    try { localStorage.setItem('mabe-theme', now); } catch (e) {}
    this.innerHTML = now === 'dark' ? sun : moon;
  });
})();

// ============================================================
// Confirmação de exclusão com SENHA (reutilizável em todas as telas).
// window.pedirSenhaExcluir(nomeItem, onConfirmado): mostra um modal, re-verifica
// a senha de login do usuário (Supabase signInWithPassword) e, se correta,
// chama onConfirmado(). Usado para excluir fornecedor e cliente.
// ============================================================
(function(){
  var CB = null;
  function build(){
    if (document.getElementById('senhaExclModal')) return;
    var st = document.createElement('style');
    st.textContent =
      '#senhaExclModal{display:none;position:fixed;inset:0;z-index:2147483300;background:rgba(20,16,12,.5);align-items:center;justify-content:center}' +
      '#senhaExclModal.open{display:flex}' +
      '#senhaExclModal .sxcard{background:#fff;border-radius:16px;padding:22px;width:min(420px,92vw);box-shadow:0 22px 60px rgba(0,0,0,.32)}' +
      '#senhaExclModal h3{margin:0 0 6px;font-size:18px;font-weight:700;color:#b3402a}' +
      '#senhaExclModal p{margin:0 0 14px;font-size:13.5px;color:#555;line-height:1.45}' +
      '#senhaExclModal p b{color:#2a2620}' +
      '#senhaExclModal input{width:100%;padding:11px 13px;border:1px solid #e0d8cb;border-radius:10px;font-family:inherit;font-size:14px;box-sizing:border-box;outline:none}' +
      '#senhaExclModal input:focus{border-color:#b3402a}' +
      '#senhaExclModal .sxerr{color:#b3402a;font-size:12.5px;min-height:16px;margin:8px 2px 0}' +
      '#senhaExclModal .sxbtns{display:flex;justify-content:flex-end;gap:9px;margin-top:8px}' +
      '#senhaExclModal .sxbtn{padding:9px 15px;border-radius:10px;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;border:1px solid #e0d8cb;background:#fff;color:#555}' +
      '#senhaExclModal .sxbtn.danger{background:#b3402a;border-color:#b3402a;color:#fff}' +
      '#senhaExclModal .sxbtn.danger:disabled{opacity:.55;cursor:default}';
    document.head.appendChild(st);
    var m = document.createElement('div'); m.id = 'senhaExclModal';
    m.innerHTML =
      '<div class="sxcard">' +
        '<h3>Confirmar exclusão</h3>' +
        '<p>Esta ação é <b>permanente</b>. Para excluir <b id="sxNome">este item</b>, digite a sua senha.</p>' +
        '<input type="password" id="sxPwd" placeholder="Sua senha" autocomplete="current-password">' +
        '<div class="sxerr" id="sxErr"></div>' +
        '<div class="sxbtns">' +
          '<button class="sxbtn" id="sxCancel" type="button">Cancelar</button>' +
          '<button class="sxbtn danger" id="sxConfirm" type="button">Excluir definitivamente</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    function close(){ m.classList.remove('open'); CB = null; }
    function confirmar(){
      var pwd = document.getElementById('sxPwd').value;
      var errEl = document.getElementById('sxErr');
      var btn = document.getElementById('sxConfirm');
      if(!pwd){ errEl.textContent = 'Digite sua senha para confirmar.'; return; }
      var c = window.CamberCloud && window.CamberCloud.client && window.CamberCloud.client();
      if(!c){ errEl.textContent = 'Sem conexão com o servidor.'; return; }
      btn.disabled = true; errEl.textContent = 'Verificando senha…';
      c.auth.getUser().then(function(ures){
        var email = ures && ures.data && ures.data.user && ures.data.user.email;
        if(!email){ errEl.textContent = 'Sessão inválida. Faça login de novo.'; btn.disabled=false; return; }
        c.auth.signInWithPassword({ email: email, password: pwd }).then(function(res){
          if(res.error){ errEl.textContent = 'Senha incorreta. Tente novamente.'; btn.disabled=false; return; }
          errEl.textContent = 'Excluindo…';
          var cb = CB; close();
          try{ if(typeof cb === 'function') cb(); }catch(e){}
        }, function(){ errEl.textContent = 'Não foi possível verificar a senha.'; btn.disabled=false; });
      }, function(){ errEl.textContent = 'Sessão inválida.'; btn.disabled=false; });
    }
    document.getElementById('sxCancel').addEventListener('click', close);
    document.getElementById('sxConfirm').addEventListener('click', confirmar);
    m.addEventListener('click', function(e){ if(e.target===m) close(); });
    document.getElementById('sxPwd').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); confirmar(); } });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && m.classList.contains('open')) close(); });
  }
  window.pedirSenhaExcluir = function(nome, onOk){
    build();
    CB = onOk;
    document.getElementById('sxNome').textContent = nome || 'este item';
    document.getElementById('sxPwd').value = '';
    document.getElementById('sxErr').textContent = '';
    document.getElementById('sxConfirm').disabled = false;
    document.getElementById('senhaExclModal').classList.add('open');
    setTimeout(function(){ try{ document.getElementById('sxPwd').focus(); }catch(e){} }, 60);
  };
})();
