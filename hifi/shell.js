// Mabe Comercial — shell de app hi-fi.
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

  var nav = pages.map(function (p) {
    return '<a class="' + (p.id === current ? 'on' : '') + '" href="' + p.href + '">' + p.t + '</a>';
  }).join('');

  var top = document.createElement('div');
  top.className = 'top';
  top.innerHTML =
    '<div class="brandwrap">' +
      '<a class="brand" href="painel.html" style="text-decoration:none;color:inherit">' +
        '<div class="mark">M</div>' +
        '<div><div class="bn">Mabe Comercial</div><div class="bs">Oportunidades</div></div>' +
      '</a>' +
      '<div class="brandmenu"><button type="button" class="brandmenu-item" id="mabeSairBtn">↪&nbsp;Sair do app</button></div>' +
    '</div>' +
    '<nav class="nav">' + nav + '</nav>' +
    '<div class="sp"></div>' +
    '<form class="ipt search" id="topSearch" style="gap:8px;text-align:left"><span>⌕</span><input id="topSearchInput" placeholder="Buscar projeto, cliente…" style="border:none;background:transparent;outline:none;font-family:inherit;font-size:13px;color:inherit;width:170px"></form>' +
    '<button class="iconbtn" id="themeBtn" title="Alternar tema">' + (saved === 'dark' ? sun : moon) + '</button>' +
    '<a class="btn primary" href="precificacao.html?novo=1">+&nbsp; Nova Precificação</a>' +
    '<div class="av">MA</div>';

  app.insertBefore(top, app.firstChild);

  // "Sair do app" (no menu do logo) → volta para a tela de login
  var sairBtn = document.getElementById('mabeSairBtn');
  if (sairBtn) sairBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (window.MabeCloud && window.MabeCloud.signOut) window.MabeCloud.signOut();
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
