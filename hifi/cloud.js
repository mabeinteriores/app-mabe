// =====================================================================
// Mabe Comercial — Camada de Nuvem (Supabase)
// Adiciona LOGIN e sincroniza todos os dados do app (localStorage) com a
// nuvem, compartilhados por toda a equipe. Não altera a lógica das telas:
// intercepta localStorage e espelha as chaves "mabe-*"/"mabe_*".
//
// Deve ser o PRIMEIRO <script> do <head>, antes de projects-data.js/prc.js.
// =====================================================================
(function () {
  var SUPABASE_URL = 'https://vlvadvlfsbgwcldaxhah.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_le8I7BGWpHrvdWqxjQKwdg_YUEyZJL-';
  var SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  var WORKSPACE = 'mabe';
  var SYNC_RE = /^mabe[-_]/;                 // chaves de dados do app
  var SKIP = { 'mabe-theme': 1 };            // preferências locais (não sincronizam)
  // NUNCA sincronizar a sessão de login (mabe-auth*) nem chaves de auth — é por usuário e secreto
  function shouldSync(k) { return SYNC_RE.test(k) && !SKIP[k] && k.indexOf('mabe-auth') !== 0 && k.indexOf('sb-') !== 0; }

  var isChild = !!(window.parent && window.parent !== window); // iframe (indicações)
  var sb = null, ready = false, pending = {}, pushTimer = null, lastStamp = null;

  // ---------- 1) intercepta localStorage IMEDIATAMENTE ----------
  var _set = localStorage.setItem.bind(localStorage);
  var _remove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    _set(k, v);
    if (shouldSync(k)) queuePush(k, v);
  };
  localStorage.removeItem = function (k) {
    _remove(k);
    if (shouldSync(k)) queuePush(k, null);
  };
  function queuePush(k, v) {
    pending[k] = v; // v = string JSON ou null (remoção)
    if (!ready) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 300);
  }
  function flush() {
    if (!sb || !ready) return Promise.resolve();
    var keys = Object.keys(pending);
    if (!keys.length) return Promise.resolve();
    var batch = pending; pending = {};
    var ts = new Date().toISOString();
    lastStamp = ts;   // marca como escrita própria p/ o polling não recarregar a si mesmo
    var ops = keys.map(function (k) {
      var raw = batch[k];
      if (raw === null) {
        return sb.from('kv_store').delete().eq('workspace', WORKSPACE).eq('key', k).then(function () {});
      } else {
        var val; try { val = JSON.parse(raw); } catch (e) { val = raw; }
        return sb.from('kv_store').upsert({ workspace: WORKSPACE, key: k, value: val, updated_at: ts },
          { onConflict: 'workspace,key' }).then(function () {});
      }
    });
    return Promise.all(ops);
  }

  // ---------- 2) overlay (esconde a UI até estar pronto) ----------
  var styleEl = document.createElement('style');
  styleEl.textContent =
    '#mabeCloudOv{position:fixed;inset:0;z-index:2147483647;background:#F5F0EA;color:#3a3128;' +
    'display:flex;align-items:center;justify-content:center;font-family:Archivo,system-ui,sans-serif}' +
    '#mabeCloudOv .box{width:320px;max-width:88vw;text-align:center}' +
    '#mabeCloudOv .mk{width:46px;height:46px;border-radius:12px;background:#C0653A;color:#fff;font-weight:700;' +
    'display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 14px}' +
    '#mabeCloudOv h1{font-size:18px;margin:0 0 2px}#mabeCloudOv p{font-size:12.5px;color:#8a7d6d;margin:0 0 18px}' +
    '#mabeCloudOv input{width:100%;box-sizing:border-box;padding:11px 12px;margin:6px 0;border:1px solid #ddd2c4;' +
    'border-radius:9px;font-size:14px;font-family:inherit;background:#fff;color:inherit}' +
    '#mabeCloudOv button{width:100%;padding:11px;margin-top:8px;border:none;border-radius:9px;background:#C0653A;' +
    'color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit}' +
    '#mabeCloudOv button.alt{background:transparent;color:#C0653A;font-weight:500;font-size:12.5px;margin-top:10px}' +
    '#mabeCloudOv .msg{font-size:12px;margin-top:10px;min-height:16px}' +
    '#mabeCloudOv .spin{width:30px;height:30px;border:3px solid #e4dacb;border-top-color:#C0653A;border-radius:50%;' +
    'margin:0 auto;animation:mabeSpin .8s linear infinite}@keyframes mabeSpin{to{transform:rotate(360deg)}}';
  (document.head || document.documentElement).appendChild(styleEl);

  var ov = null;
  function overlay() {
    if (isChild) return null; // dentro do iframe não mostramos login
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'mabeCloudOv';
    ov.innerHTML = '<div class="box"><div class="mk">M</div><div class="spin"></div></div>';
    (document.body || document.documentElement).appendChild(ov);
    return ov;
  }
  function showSpinner(txt) {
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML = '<div class="mk">M</div><div class="spin"></div>' +
      (txt ? '<p style="margin-top:14px">' + txt + '</p>' : '');
  }
  function removeOverlay() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }

  // Esconde a UI base enquanto carrega
  if (!isChild) {
    var hide = document.createElement('style'); hide.id = 'mabeHide';
    hide.textContent = '#app{opacity:0!important}';
    (document.head || document.documentElement).appendChild(hide);
  }
  function revealApp() { var h = document.getElementById('mabeHide'); if (h) h.remove(); }

  // ---------- 3) login ----------
  function showLogin(msg) {
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML =
      '<div class="mk">M</div><h1>Mabe Comercial</h1><p>Entre para acessar o sistema</p>' +
      '<input id="mcNome" type="text" placeholder="Seu nome" autocomplete="name" style="display:none">' +
      '<input id="mcEmail" type="email" placeholder="E-mail" autocomplete="username">' +
      '<input id="mcPass" type="password" placeholder="Senha" autocomplete="current-password">' +
      '<button id="mcLogin">Entrar</button>' +
      '<button id="mcToggle" class="alt">Criar conta</button>' +
      '<div class="msg" id="mcMsg" style="color:#b3402a">' + (msg || '') + '</div>';
    var mode = 'login';
    var nomeEl = o.querySelector('#mcNome');
    var emailEl = o.querySelector('#mcEmail'), passEl = o.querySelector('#mcPass');
    var btn = o.querySelector('#mcLogin'), tgl = o.querySelector('#mcToggle'), msgEl = o.querySelector('#mcMsg');
    tgl.onclick = function () {
      mode = mode === 'login' ? 'signup' : 'login';
      nomeEl.style.display = mode === 'signup' ? 'block' : 'none';
      btn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
      tgl.textContent = mode === 'login' ? 'Criar conta' : 'Já tenho conta';
      msgEl.textContent = '';
    };
    function submit() {
      var nome = (nomeEl.value || '').trim();
      var email = (emailEl.value || '').trim(), pass = passEl.value || '';
      if (!email || !pass) { msgEl.style.color = '#b3402a'; msgEl.textContent = 'Preencha e-mail e senha.'; return; }
      if (mode === 'signup' && !nome) { msgEl.style.color = '#b3402a'; msgEl.textContent = 'Informe seu nome.'; return; }
      btn.disabled = true; msgEl.style.color = '#8a7d6d'; msgEl.textContent = 'Aguarde…';
      var p = mode === 'login'
        ? sb.auth.signInWithPassword({ email: email, password: pass })
        : sb.auth.signUp({ email: email, password: pass, options: { data: { nome: nome } } });
      p.then(function (res) {
        btn.disabled = false;
        if (res.error) { msgEl.style.color = '#b3402a'; msgEl.textContent = traduz(res.error.message); return; }
        if (mode === 'signup' && res.data && res.data.user && !res.data.session) {
          msgEl.style.color = '#2e7d32';
          msgEl.textContent = 'Conta criada! Confirme pelo e-mail e depois entre.';
          mode = 'login'; nomeEl.style.display = 'none'; btn.textContent = 'Entrar'; tgl.textContent = 'Criar conta';
          return;
        }
        afterAuth();
      });
    }
    btn.onclick = submit;
    passEl.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    nomeEl.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    emailEl.focus();
  }
  function traduz(m) {
    m = m || '';
    if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Faça login.';
    if (/at least 6/i.test(m)) return 'A senha precisa de ao menos 6 caracteres.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
    return m;
  }

  // ---------- 4) hidratação da nuvem -> localStorage ----------
  function hydrate(cb) {
    showSpinner('Carregando seus dados…');
    sb.from('kv_store').select('key,value').eq('workspace', WORKSPACE).then(function (res) {
      if (res.error) { cb(res.error, 0); return; }
      var changed = 0;
      (res.data || []).forEach(function (row) {
        if (!shouldSync(row.key)) return;            // ignora chaves de auth porventura gravadas antes
        if (pending[row.key] !== undefined) return;  // edição local ainda não enviada: não sobrescreve
        var incoming = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
        try { if (localStorage.getItem(row.key) !== incoming) { _set(row.key, incoming); changed++; } } catch (e) {}
      });
      cb(null, changed);
    });
  }

  // ---------- 5) fluxo principal ----------
  // ---------- permissões de abas por usuário ----------
  var perms = { admin: false, abas: [] };
  var ALL_TABS = ['painel', 'precificacao', 'projetos', 'clientes', 'fornecedores', 'indicacoes', 'lead', 'config'];
  var FILE_TAB = {
    'painel.html': 'painel', 'lead.html': 'lead', 'precificacao.html': 'precificacao',
    'projetos.html': 'projetos', 'projeto.html': 'projetos', 'oportunidade.html': 'projetos',
    'clientes.html': 'clientes', 'cliente.html': 'clientes',
    'fornecedores.html': 'fornecedores', 'fornecedor.html': 'fornecedores',
    'indicacoes.html': 'indicacoes', 'configuracao.html': 'config', 'usuarios.html': 'usuarios'
  };
  var TAB_FILE = {
    painel: 'painel.html', lead: 'lead.html', precificacao: 'precificacao.html', projetos: 'projetos.html',
    clientes: 'clientes.html', fornecedores: 'fornecedores.html', indicacoes: 'indicacoes.html', config: 'configuracao.html'
  };
  function tabAllowed(tab) {
    if (perms.admin) return true;
    if (!tab) return true;                 // sub-páginas sem aba definida
    if (tab === 'usuarios') return false;  // área exclusiva de admin
    return perms.abas.indexOf(tab) >= 0;
  }
  function currentFile() { return (location.pathname.split('/').pop() || 'painel.html'); }
  function firstAllowedFile() {
    for (var i = 0; i < ALL_TABS.length; i++) { if (tabAllowed(ALL_TABS[i])) return TAB_FILE[ALL_TABS[i]]; }
    return null;
  }
  function enforcePageAccess() {
    var tab = FILE_TAB[currentFile()];
    if (tab === undefined) return true;    // arquivo não mapeado → permite
    if (tabAllowed(tab)) return true;
    var dest = firstAllowedFile();
    if (dest) { location.replace(dest); return false; }
    showNoAccess(); return false;
  }
  function applyNavPerms() {
    try {
      var nodes = document.querySelectorAll('.top .nav a, .top a.btn.primary');
      Array.prototype.forEach.call(nodes, function (a) {
        var href = (a.getAttribute('href') || '').split('?')[0].split('/').pop();
        var tab = FILE_TAB[href];
        if (tab && !tabAllowed(tab)) a.style.display = 'none';
      });
    } catch (e) {}
  }
  // mostra o primeiro nome do usuário na topbar (no lugar de "Oportunidades")
  function applyUserUI() {
    try {
      var nome = (window.__mabeProfile && window.__mabeProfile.nome) || '';
      var first = (nome.trim().split(/\s+/)[0]) || '';
      if (!first && window.__mabeUser && window.__mabeUser.email) first = window.__mabeUser.email.split('@')[0];
      if (!first) return;
      var bs = document.querySelector('.top .bs');
      if (bs) bs.textContent = first;
      var av = document.querySelector('.top .av');
      if (av) av.textContent = first.charAt(0).toUpperCase();
    } catch (e) {}
  }

  // ---------- "Responsável" = usuários aprovados do sistema ----------
  var respList = [];
  function repopResp() {
    if (!respList.length) return;
    try {
      var sels = document.querySelectorAll('select');
      Array.prototype.forEach.call(sels, function (sel) {
        var id = (sel.id || '').toLowerCase();
        var ehResp = id.indexOf('resp') >= 0 || sel.textContent.indexOf('Você (Arq.)') >= 0;
        if (!ehResp) return;
        var cur = sel.value;
        var opts = respList.slice();
        if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);   // mantém o valor já salvo
        sel.innerHTML = '';
        opts.forEach(function (n) { var o = document.createElement('option'); o.textContent = n; sel.appendChild(o); });
        if (cur) sel.value = cur;
      });
    } catch (e) {}
  }
  function fetchResponsaveis() {
    if (!sb) return;
    sb.from('profiles').select('nome,email').eq('aprovado', true).then(function (res) {
      if (res.error || !res.data) return;
      respList = res.data.map(function (p) {
        var n = (p.nome || '').trim();
        return n || (p.email || '').split('@')[0];
      }).filter(Boolean);
      if (window.MabeCloud) window.MabeCloud._resp = respList;
      repopResp();
    }, function () {});
  }
  function showNoAccess() {
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML =
      '<div class="mk">M</div><h1>Sem acesso</h1>' +
      '<p style="margin:8px 0 18px">Sua conta ainda não tem nenhuma área liberada. Fale com o administrador.</p>' +
      '<button id="mcOut" class="alt">Sair</button>';
    o.querySelector('#mcOut').onclick = function () { window.MabeCloud.signOut(); };
  }

  // verifica se o usuário logado já foi aprovado pelo administrador
  function checkApproval(cb) {
    sb.auth.getUser().then(function (r) {
      var u = r && r.data && r.data.user;
      if (!u) { cb('invalid'); return; }
      window.__mabeUser = u;
      sb.from('profiles').select('aprovado,papel,nome,abas_permitidas').eq('id', u.id).maybeSingle()
        .then(function (res) {
          if (res.error) { perms = { admin: false, abas: ALL_TABS.slice() }; window.__mabePerms = perms; cb('approved'); return; }
          var p = res.data;
          window.__mabeProfile = p || null;
          perms = { admin: !!(p && p.papel === 'admin'), abas: (p && p.abas_permitidas) || [] };
          window.__mabePerms = perms;
          cb(p && p.aprovado ? 'approved' : 'pending');
        }, function () { perms = { admin: false, abas: ALL_TABS.slice() }; window.__mabePerms = perms; cb('approved'); });
    }, function () { cb('invalid'); });
  }

  // tela de "aguardando aprovação"
  function showPending() {
    ready = false;
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML =
      '<div class="mk">M</div><h1>Cadastro recebido!</h1>' +
      '<p style="margin:8px 0 18px">Sua conta está <b>aguardando autorização</b> do administrador. ' +
      'Assim que liberar, é só entrar de novo.</p>' +
      '<button id="mcRecheck">Já fui autorizado — entrar</button>' +
      '<button id="mcOut" class="alt">Sair</button>';
    o.querySelector('#mcRecheck').onclick = function () { location.reload(); };
    o.querySelector('#mcOut').onclick = function () { window.MabeCloud.signOut(); };
  }

  // segue o fluxo normal (hidrata da nuvem e revela o app)
  function proceed() {
    ready = true;
    if (!enforcePageAccess()) return;   // redireciona/bloqueia se a aba não for permitida
    var first = sessionStorage.getItem('mabe_cloud_hydrated') !== '1';
    var done = function () {
      sessionStorage.removeItem('mabe_reload_guard');
      revealApp(); removeOverlay(); applyNavPerms(); applyUserUI(); fetchResponsaveis(); flush(); setupLivePolling();
    };
    hydrate(function (err, changed) {
      sessionStorage.setItem('mabe_cloud_hydrated', '1');
      if (err) { done(); return; }
      // só recarrega na 1ª carga da sessão (p/ as telas renderizarem com os dados da nuvem).
      // NÃO recarregar por "changed": telas como projeto.html regravam dados ao carregar
      // e isso causaria loop de recarregamento. Atualização entre usuários fica a cargo
      // do polling leve (setupLivePolling), que tem trava de própria-gravação e banner.
      if (first) { location.reload(); return; }
      done();
    });
  }

  // ---------- 5b) atualizações AO VIVO (Supabase Realtime) ----------
  // Ouve mudanças no banco (kv_store/respostas/profiles) e atualiza a tela
  // quase em tempo real. Se o usuário estiver digitando, adia e mostra um aviso.
  var liveOn = false, liveTimer = null, livePending = false, liveBanner = null;

  function isBusyEditing() {
    try {
      var a = document.activeElement;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
      if (document.querySelector('.drawer.open, .scrim.open, #delModal.open, #mabeCloudOv')) return true;
    } catch (e) {}
    return false;
  }
  function showLiveBanner() {
    if (liveBanner || isChild) return;
    liveBanner = document.createElement('div');
    liveBanner.innerHTML = '🔄&nbsp; Há atualizações novas <button id="mabeLiveBtn">Atualizar</button>';
    liveBanner.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483600;background:#3a3128;color:#fff;font-family:Archivo,system-ui,sans-serif;font-size:13px;padding:10px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.28);display:flex;align-items:center;gap:10px';
    var b = liveBanner.querySelector('#mabeLiveBtn');
    b.style.cssText = 'background:#C0653A;color:#fff;border:none;border-radius:8px;padding:6px 11px;font:inherit;font-weight:600;cursor:pointer';
    b.onclick = function () { doLiveRefresh(); };
    (document.body || document.documentElement).appendChild(liveBanner);
  }
  function scheduleLive() {
    livePending = true;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(tryLive, 1200);
  }
  function tryLive() {
    if (!livePending) return;
    if (isBusyEditing()) { showLiveBanner(); return; }
    doLiveRefresh();
  }
  function doLiveRefresh() {
    livePending = false;
    if (!sb) { location.reload(); return; }
    // re-hidrata o kv_store (pega o estado novo) e recarrega UMA vez para renderizar
    sb.from('kv_store').select('key,value').eq('workspace', WORKSPACE).then(function (res) {
      try {
        if (!res.error) {
          var remote = {};
          (res.data || []).forEach(function (row) {
            if (!shouldSync(row.key)) return;
            remote[row.key] = 1;
            try { _set(row.key, typeof row.value === 'string' ? row.value : JSON.stringify(row.value)); } catch (e) {}
          });
          Object.keys(localStorage).forEach(function (k) { if (shouldSync(k) && !remote[k]) { try { _remove(k); } catch (e) {} } });
        }
      } catch (e) {}
      location.reload();
    }, function () { location.reload(); });
  }
  function onRemoteChange(payload) {
    try {
      // ignora o próprio eco: se o valor recebido já é igual ao local, não faz nada
      if (payload && payload.table === 'kv_store' && payload['new'] && payload['new'].key) {
        var k = payload['new'].key;
        if (!shouldSync(k)) return;
        var incoming = typeof payload['new'].value === 'string' ? payload['new'].value : JSON.stringify(payload['new'].value);
        var cur = null; try { cur = localStorage.getItem(k); } catch (e) {}
        if (cur === incoming) return;
      }
    } catch (e) {}
    scheduleLive();
  }
  // ---------- 5c) atualização entre usuários SEM Realtime (polling leve) ----------
  // Verifica só o maior updated_at do workspace; se mudou (outro usuário salvou),
  // dispara o mesmo fluxo seguro (banner se estiver editando, senão atualiza).
  function checkForUpdates() {
    if (!sb || !ready || isChild) return;
    // telas que regravam dados ao carregar (recalc/persist) NÃO entram no auto-update,
    // senão o reload as faz regravar de novo e vira loop. Atualizam só com F5 manual.
    var _f = currentFile();
    if (_f === 'precificacao.html' || _f === 'projeto.html' || _f === 'oportunidade.html') return;
    sb.from('kv_store').select('updated_at').eq('workspace', WORKSPACE)
      .order('updated_at', { ascending: false }).limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return;
        var stamp = res.data[0].updated_at;
        if (lastStamp === null) { lastStamp = stamp; return; }   // 1ª leitura = referência
        if (stamp !== lastStamp) { lastStamp = stamp; scheduleLive(); }
      }, function () {});
  }
  function setupLivePolling() {
    if (isChild || window.__mabeLiveSet) return;
    window.__mabeLiveSet = true;
    checkForUpdates();   // referência inicial
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkForUpdates(); });
    window.addEventListener('focus', function () { checkForUpdates(); });
    setInterval(checkForUpdates, 18000);
  }

  function setupRealtime() {
    // DESATIVADO temporariamente: a atualização ao vivo entrava em loop de
    // recarregamento porque algumas telas regravam dados no banco ao carregar.
    // Será reativada com um modelo seguro (aviso para atualizar, sem recarregar sozinho).
    return;
    if (liveOn || isChild || !sb) return;
    liveOn = true;
    try {
      // Leads (respostas) já têm atualização ao vivo própria na tela de Leads;
      // aqui cuidamos do RESTANTE do app (dados em kv_store) e das permissões (profiles).
      sb.channel('mabe-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store', filter: 'workspace=eq.' + WORKSPACE }, onRemoteChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onRemoteChange)
        .subscribe();
    } catch (e) {}
    document.addEventListener('focusout', function () { setTimeout(tryLive, 400); });
    window.addEventListener('focus', function () { setTimeout(tryLive, 200); });
    setInterval(function () { if (livePending) tryLive(); }, 5000);
  }

  function afterAuth() {
    if (isChild) { ready = true; flush(); return; }   // iframe: só espelha gravações
    checkApproval(function (status) {
      if (status === 'invalid') {           // sessão expirada/usuário removido → limpa e volta ao login
        sessionStorage.removeItem('mabe_cloud_hydrated');
        var goLogin = function () {
          try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('mabe-auth') === 0 || k.indexOf('sb-') === 0) localStorage.removeItem(k); }); } catch (e) {}
          showLogin('Sua sessão expirou. Entre novamente.');
        };
        try { sb.auth.signOut({ scope: 'local' }).then(goLogin, goLogin); } catch (e) { goLogin(); }
        return;
      }
      if (status === 'pending') { showPending(); return; }
      proceed();
    });
  }

  function boot() {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mabe-auth' }
    });
    sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session) { afterAuth(); }
      else if (isChild) { ready = true; }   // sem sessão no iframe: aguarda o pai
      else { showLogin(''); }
    });
  }

  function loadLib(cb) {
    if (window.supabase && window.supabase.createClient) return cb();
    var s = document.createElement('script'); s.src = SB_LIB;
    s.onload = cb;
    s.onerror = function () {
      revealApp(); removeOverlay();
      console.error('Falha ao carregar a biblioteca do Supabase (sem internet?). App segue offline.');
      ready = false;
    };
    (document.head || document.documentElement).appendChild(s);
  }

  // garante overlay assim que o body existir
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { if (!ready && !isChild) overlay(); });
  }
  loadLib(boot);

  // API auxiliar para a UI (ex.: botão Sair)
  window.MabeCloud = {
    signOut: function () {
      if (!sb) return;
      sessionStorage.removeItem('mabe_cloud_hydrated');
      var done = function () {
        try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('mabe-auth') === 0 || k.indexOf('sb-') === 0) localStorage.removeItem(k); }); } catch (e) {}
        location.reload();
      };
      try { sb.auth.signOut({ scope: 'local' }).then(done, done); } catch (e) { done(); }
    },
    client: function () { return sb; },
    responsaveis: function () { return respList; },
    // envia AGORA tudo o que está pendente e devolve uma Promise (para esperar antes de navegar)
    flush: function () { try { clearTimeout(pushTimer); } catch (e) {} return flush(); },
    pendente: function () { return Object.keys(pending).length > 0; }
  };

  // rede de segurança: tenta enviar pendências antes da página sair
  window.addEventListener('pagehide', function () { try { clearTimeout(pushTimer); flush(); } catch (e) {} });
})();
