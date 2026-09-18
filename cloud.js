// =====================================================================
// Gestão Camber — Camada de Nuvem (Supabase)
// Adiciona LOGIN e sincroniza todos os dados do app (localStorage) com a
// nuvem, compartilhados por toda a equipe. Não altera a lógica das telas:
// intercepta localStorage e espelha as chaves "camber-*"/"camber_*".
//
// Deve ser o PRIMEIRO <script> do <head>, antes de projects-data.js/prc.js.
// =====================================================================
(function () {
  if(new URLSearchParams(location.hash.slice(1)).get('type')==='recovery' || new URLSearchParams(location.hash.slice(1)).has('error_code')){
    location.replace('recuperar-senha.html'+location.search+location.hash);return;
  }
  var SUPABASE_URL = 'https://vlvadvlfsbgwcldaxhah.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_le8I7BGWpHrvdWqxjQKwdg_YUEyZJL-';
  var SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  var WORKSPACE = 'mabe';
  var SYNC_RE = /^mabe[-_]/;                 // chaves de dados do app
  var SKIP = { 'mabe-theme': 1 };            // preferências locais (não sincronizam)

  // ============================================================
  // TRAVA DE SEGURANÇA — o ambiente LOCAL nunca toca a nuvem.
  // Quando o app roda em localhost / 127.0.0.1 / file:// (preview de
  // desenvolvimento), desligamos TODA a sincronização com o Supabase:
  // não lê e não grava nada. Assim, testes de layout jamais alteram os
  // dados reais de produção. Em produção (domínio real) nada muda.
  // ============================================================
  var LOCAL_ONLY = (location.protocol === 'file:') ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\])$/i.test(location.hostname);

  // NUNCA sincronizar a sessão de login (camber-auth*) nem chaves de auth — é por usuário e secreto.
  // Em modo LOCAL_ONLY, shouldSync sempre retorna false → nada é enviado à nuvem.
  function shouldSync(k) { return !LOCAL_ONLY && SYNC_RE.test(k) && !SKIP[k] && k.indexOf('mabe-auth') !== 0 && k.indexOf('sb-') !== 0; }

  var isChild = !!(window.parent && window.parent !== window); // iframe (indicações)
  var sb = null, ready = false, pending = {}, pushTimer = null, lastStamp = null;

  // ---------- 1) intercepta localStorage IMEDIATAMENTE ----------
  var _get = localStorage.getItem.bind(localStorage);
  var pendingBase = {}, syncError = null;
  var _set = localStorage.setItem.bind(localStorage);
  var _remove = localStorage.removeItem.bind(localStorage);
  function syncedSet(k, v) {
    var before = _get(k);
    _set(k, v);
    if (shouldSync(k)) queuePush(k, v, before);
  };
  function syncedRemove(k) {
    var before = _get(k);
    _remove(k);
    if (shouldSync(k)) queuePush(k, null, before);
  };
  // Storage instances have named setters: assigning instance methods can create
  // storage keys instead of replacing the native methods. Patch the prototype.
  if(typeof Storage!=='undefined') {
    var nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
    Storage.prototype.setItem=function(k,v){return this===localStorage?syncedSet(String(k),String(v)):nativeSet.call(this,k,v);};
    Storage.prototype.removeItem=function(k){return this===localStorage?syncedRemove(String(k)):nativeRemove.call(this,k);};
  } else {localStorage.setItem=syncedSet;localStorage.removeItem=syncedRemove;}
  function queuePush(k, v, before) {
    if (!Object.prototype.hasOwnProperty.call(pending, k)) pendingBase[k] = before;
    pending[k] = v; // v = string JSON ou null (remoção)
    if (!ready) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 300);
  }
  var inFlight=null, activeBatch={};
  function decode(raw) { if(raw===null || raw===undefined)return undefined;try{return JSON.parse(raw);}catch(e){return raw;} }
  function same(a,b) {
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    var ak=Object.keys(a),bk=Object.keys(b);
    return ak.length===bk.length && ak.every(function(k){return Object.prototype.hasOwnProperty.call(b,k)&&same(a[k],b[k]);});
  }
  function conflict(path) { var err=new Error('Conflito de edição em '+path+'. Suas alterações continuam neste navegador. Confira com a equipe antes de recarregar.');err.code='SYNC_CONFLICT';throw err; }
  function merge(base,local,remote,path) {
    if(same(local,base))return remote;
    if(same(remote,base)||same(local,remote))return local;
    // An absent root can be treated as an empty collection. Missing records cannot.
    if(base===undefined&&Array.isArray(local)&&Array.isArray(remote))base=[];
    if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(remote)) {
      function byId(rows){var out=new Map();rows.forEach(function(r){if(!r||r.id==null||out.has(String(r.id)))conflict(path+' (identificadores)');out.set(String(r.id),r);});return out;}
      var bm=byId(base),lm=byId(local),rm=byId(remote),result=[];
      var ids=Array.from(new Set(Array.from(rm.keys()).concat(Array.from(lm.keys()),Array.from(bm.keys()))));
      ids.forEach(function(id){var row=merge(bm.get(id),lm.get(id),rm.get(id),path+'/'+id);if(row!==undefined)result.push(row);});
      return result;
    }
    if(base&&local&&remote&&typeof base==='object'&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(base)&&!Array.isArray(local)&&!Array.isArray(remote)) {
      var obj={};Array.from(new Set(Object.keys(base).concat(Object.keys(local),Object.keys(remote)))).forEach(function(k){
        if(k==='__proto__'||k==='constructor'||k==='prototype')conflict(path);
        var v=merge(base[k],local[k],remote[k],path+'/'+k);if(v!==undefined)obj[k]=v;
      });return obj;
    }
    conflict(path);
  }
  function validateMerged(k,value,remote) {
    if(k!=='mabe-clientes-v1'&&k!=='mabe-fornecedores-v1')return;
    function counts(rows){var result=new Map();(rows||[]).forEach(function(row){var doc=String(row.doc||'').replace(/\D/g,'');if(doc)result.set(doc,(result.get(doc)||0)+1);});return result;}
    var previous=counts(remote),next=counts(value);
    next.forEach(function(count,doc){if(count>1&&count>(previous.get(doc)||0))conflict(k+' (CPF/CNPJ duplicado)');});
  }
  async function commit(k,base,local) {
    for(var attempt=0;attempt<32;attempt++) {
      var read=await sb.from('kv_store').select('value,updated_at').eq('workspace',WORKSPACE).eq('key',k).maybeSingle();
      if(read.error)throw read.error;
      var exists=!!read.data,remote=exists?read.data.value:undefined;
      var value=merge(base,local,remote,k);validateMerged(k,value,remote);
      if(same(value,remote))return value;
      // Monotonic timestamp is a compare-and-swap token, not a client's wall clock.
      var stamp=new Date(Math.max(Date.now(),exists?(Date.parse(read.data.updated_at)||0)+1:0)).toISOString();
      var query;
      if(!exists)query=sb.from('kv_store').insert({workspace:WORKSPACE,key:k,value:value,updated_at:stamp}).select('key');
      else {
        query=value===undefined?sb.from('kv_store').delete():sb.from('kv_store').update({value:value,updated_at:stamp});
        query=query.eq('workspace',WORKSPACE).eq('key',k);
        query=read.data.updated_at==null?query.is('updated_at',null):query.eq('updated_at',read.data.updated_at);
        query=query.select('key');
      }
      var res=await query;
      if(res.error){if(!exists&&res.error.code==='23505')continue;throw res.error;}
      if(res.data&&res.data.length){lastStamp=stamp;return value;}
      // Another writer won the comparison; reread and recompute, never blind upsert.
    }
    throw new Error('Muitas alterações simultâneas. As alterações continuam pendentes; tente salvar novamente.');
  }
  function reportSyncError(err) {
    syncError=err;
    if(typeof document==='undefined'||!document.body)return;
    var banner=document.getElementById('camberSyncError');
    if(!banner){banner=document.createElement('div');banner.id='camberSyncError';banner.setAttribute('role','alert');banner.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483647;padding:16px;background:#fff0e8;color:#842b15;border:1px solid #ba725a;border-radius:10px;font:14px system-ui';document.body.appendChild(banner);}
    banner.textContent=err.code==='SYNC_CONFLICT'?err.message:'Gravação não confirmada. Suas alterações continuam pendentes neste navegador. Tente salvar novamente antes de sair.';
  }
  function flush() {
    if(inFlight)return inFlight.then(function(ok){return ok?flush():false;});
    if(!Object.keys(pending).length)return Promise.resolve(true);
    if(!sb||!ready)return Promise.resolve(false);
    var batch=pending,bases=pendingBase;pending={};pendingBase={};activeBatch=batch;
    inFlight=Promise.all(Object.keys(batch).map(async function(k){
      var sent=decode(batch[k]);
      try {
        await commit(k,decode(bases[k]),sent);
        // Keep the snapshot currently used by the form. Injecting merged rows
        // only into storage would make the next stale form save look like a deletion.
        // Normal hydration refreshes storage and the UI together after editing.
        return true;
      }catch(err){
        if(!Object.prototype.hasOwnProperty.call(pending,k))pending[k]=batch[k];
        pendingBase[k]=bases[k];reportSyncError(err);return false;
      }
    })).then(function(results){
      inFlight=null;activeBatch={};var ok=results.every(Boolean);
      if(ok){syncError=null;if(typeof document!=='undefined'){var b=document.getElementById('camberSyncError');if(b)b.remove();}}
      return ok;
    });
    return inFlight.then(function(ok){return ok&&Object.keys(pending).length?flush():ok;});
  }

  // ---------- 2) overlay (esconde a UI até estar pronto) ----------
  var styleEl = document.createElement('style');
  styleEl.textContent =
    '#camberCloudOv{position:fixed;inset:0;z-index:2147483647;background:#F5F0EA;color:#3a3128;' +
    'display:flex;align-items:center;justify-content:center;font-family:Archivo,system-ui,sans-serif}' +
    '#camberCloudOv .box{width:320px;max-width:88vw;text-align:center}' +
    '#camberCloudOv .mk{width:46px;height:46px;border-radius:12px;background:#C0653A;color:#fff;font-weight:700;' +
    'display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 14px}' +
    '#camberCloudOv h1{font-size:18px;margin:0 0 2px}#camberCloudOv p{font-size:12.5px;color:#8a7d6d;margin:0 0 18px}' +
    '#camberCloudOv input{width:100%;box-sizing:border-box;padding:11px 12px;margin:6px 0;border:1px solid #ddd2c4;' +
    'border-radius:9px;font-size:14px;font-family:inherit;background:#fff;color:inherit}' +
    '#camberCloudOv button{width:100%;padding:11px;margin-top:8px;border:none;border-radius:9px;background:#C0653A;' +
    'color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit}' +
    '#camberCloudOv button.alt{background:transparent;color:#C0653A;font-weight:500;font-size:12.5px;margin-top:10px}' +
    '#camberCloudOv .msg{font-size:12px;margin-top:10px;min-height:16px}' +
    '#camberCloudOv .spin{width:30px;height:30px;border:3px solid #e4dacb;border-top-color:#C0653A;border-radius:50%;' +
    'margin:0 auto;animation:camberSpin .8s linear infinite}@keyframes camberSpin{to{transform:rotate(360deg)}}';
  (document.head || document.documentElement).appendChild(styleEl);

  var ov = null;
  function overlay() {
    if (isChild) return null; // dentro do iframe não mostramos login
    if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'camberCloudOv';
    ov.innerHTML = '<div class="box"><div class="mk">C</div><div class="spin"></div></div>';
    (document.body || document.documentElement).appendChild(ov);
    return ov;
  }
  function showSpinner(txt) {
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML = '<div class="mk">C</div><div class="spin"></div>' +
      (txt ? '<p style="margin-top:14px">' + txt + '</p>' : '');
  }
  function removeOverlay() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }

  // Esconde a UI base enquanto carrega
  if (!isChild) {
    var hide = document.createElement('style'); hide.id = 'camberHide';
    hide.textContent = '#app{opacity:0!important}';
    (document.head || document.documentElement).appendChild(hide);
  }
  function revealApp() { var h = document.getElementById('camberHide'); if (h) h.remove(); }

  // ---------- 3) login ----------
  function showLogin(msg) {
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML =
      '<div class="mk">C</div><h1>Gestão Camber</h1><p>Entre para acessar o sistema</p>' +
      '<input id="mcNome" type="text" placeholder="Seu nome" autocomplete="name" style="display:none">' +
      '<input id="mcEmail" type="email" placeholder="E-mail" autocomplete="username">' +
      '<input id="mcPass" type="password" placeholder="Senha" autocomplete="current-password">' +
      '<button id="mcLogin">Entrar</button>' +
      '<button id="mcToggle" class="alt">Criar conta</button>' +
      '<a href="recuperar-senha.html" style="display:block;margin-top:16px;color:#a75c35;font-size:13px">Esqueci minha senha</a>' +
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
        if (pending[row.key] !== undefined || activeBatch[row.key] !== undefined) return;  // edição local ainda não enviada: não sobrescreve
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
      var nome = (window.__camberProfile && window.__camberProfile.nome) || '';
      var first = (nome.trim().split(/\s+/)[0]) || '';
      if (!first && window.__camberUser && window.__camberUser.email) first = window.__camberUser.email.split('@')[0];
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
      if (window.CamberCloud) window.CamberCloud._resp = respList;
      repopResp();
    }, function () {});
  }
  function showNoAccess() {
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML =
      '<div class="mk">C</div><h1>Sem acesso</h1>' +
      '<p style="margin:8px 0 18px">Sua conta ainda não tem nenhuma área liberada. Fale com o administrador.</p>' +
      '<button id="mcOut" class="alt">Sair</button>';
    o.querySelector('#mcOut').onclick = function () { window.CamberCloud.signOut(); };
  }

  // verifica se o usuário logado já foi aprovado pelo administrador
  function checkApproval(cb) {
    sb.auth.getUser().then(function (r) {
      var u = r && r.data && r.data.user;
      if (!u) { cb('invalid'); return; }
      window.__camberUser = u;
      sb.from('profiles').select('aprovado,papel,nome,abas_permitidas').eq('id', u.id).maybeSingle()
        .then(function (res) {
          if (res.error) { perms = { admin: false, abas: ALL_TABS.slice() }; window.__camberPerms = perms; cb('approved'); return; }
          var p = res.data;
          window.__camberProfile = p || null;
          perms = { admin: !!(p && p.papel === 'admin'), abas: (p && p.abas_permitidas) || [] };
          window.__camberPerms = perms;
          cb(p && p.aprovado ? 'approved' : 'pending');
        }, function () { perms = { admin: false, abas: ALL_TABS.slice() }; window.__camberPerms = perms; cb('approved'); });
    }, function () { cb('invalid'); });
  }

  // tela de "aguardando aprovação"
  function showPending() {
    ready = false;
    var o = overlay(); if (!o) return;
    o.querySelector('.box').innerHTML =
      '<div class="mk">C</div><h1>Cadastro recebido!</h1>' +
      '<p style="margin:8px 0 18px">Sua conta está <b>aguardando autorização</b> do administrador. ' +
      'Assim que liberar, é só entrar de novo.</p>' +
      '<button id="mcRecheck">Já fui autorizado — entrar</button>' +
      '<button id="mcOut" class="alt">Sair</button>';
    o.querySelector('#mcRecheck').onclick = function () { location.reload(); };
    o.querySelector('#mcOut').onclick = function () { window.CamberCloud.signOut(); };
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
    if(inFlight || Object.keys(pending).length) return true;
    try {
      var a = document.activeElement;
      if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
      if (document.querySelector('.drawer.open, .scrim.open, #delModal.open, #camberCloudOv')) return true;
    } catch (e) {}
    return false;
  }
  function showLiveBanner() {
    if (liveBanner || isChild) return;
    liveBanner = document.createElement('div');
    liveBanner.innerHTML = '🔄&nbsp; Há atualizações novas <button id="camberLiveBtn">Atualizar</button>';
    liveBanner.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483600;background:#3a3128;color:#fff;font-family:Archivo,system-ui,sans-serif;font-size:13px;padding:10px 14px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.28);display:flex;align-items:center;gap:10px';
    var b = liveBanner.querySelector('#camberLiveBtn');
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
    if(inFlight || Object.keys(pending).length){ showLiveBanner(); return; }
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
    if (isChild || window.__camberLiveSet) return;
    window.__camberLiveSet = true;
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

  if (LOCAL_ONLY) {
    // Modo LOCAL: nenhum acesso à nuvem. Revela o app com os dados locais,
    // sem login e sem sincronização — protege os testes de desenvolvimento.
    ready = true;                 // impede o overlay de login/spinner
    revealApp();
    removeOverlay();
    try { console.info('%c[Gestão Camber] MODO LOCAL — sincronização com a nuvem DESLIGADA. Dados de teste não afetam a produção.', 'color:#C0653A;font-weight:bold'); } catch (e) {}
  } else {
    loadLib(boot);
  }

  // API auxiliar para a UI (ex.: botão Sair)
  window.CamberCloud = {
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
    atualizarClientes: async function () {
      if(LOCAL_ONLY)return;
      if(!sb || !ready)throw new Error('Aguarde a conexão com o servidor.');
      if(!await flush())throw new Error('Não foi possível sincronizar os dados.');
      var res=await sb.from('kv_store').select('value').eq('workspace',WORKSPACE).eq('key','mabe-clientes-v1').maybeSingle();
      if(res.error)throw res.error;
      if(pending['mabe-clientes-v1']!==undefined || activeBatch['mabe-clientes-v1']!==undefined)throw new Error('O cadastro foi alterado durante a consulta. Tente novamente.');
      var rows=res.data ? res.data.value : [];
      if(typeof rows==='string')rows=JSON.parse(rows);
      if(!Array.isArray(rows))throw new Error('Lista de clientes inválida.');
      _set('mabe-clientes-v1',JSON.stringify(rows));
    },
    responsaveis: function () { return respList; },
    // envia AGORA tudo o que está pendente e devolve uma Promise (para esperar antes de navegar)
    flush: function () { try { clearTimeout(pushTimer); } catch (e) {} return flush().then(function(ok){if(!ok)throw syncError || new Error('Não foi possível sincronizar os dados.');}); },
    pendente: function () { return !!inFlight || Object.keys(pending).length > 0; }
  };

  window.addEventListener('beforeunload', function(ev){if(inFlight||Object.keys(pending).length){ev.preventDefault();ev.returnValue='';}});
  // rede de segurança: tenta enviar pendências antes da página sair
  window.addEventListener('pagehide', function () { try { clearTimeout(pushTimer); flush(); } catch (e) {} });
})();
