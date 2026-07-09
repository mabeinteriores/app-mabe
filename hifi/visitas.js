// =====================================================================
// Gestão Camber — Controle de Visitas (por projeto)
// Abre a partir do menu "Mais" do projeto (Visitas.open()), numa gaveta.
// Depende de globals do projeto.html: projId, PROJ, meuNome(), MabeDB.
// Salva em localStorage 'mabe-visitas-v1-<projId>' (sincroniza pela nuvem).
// A meta "visitas previstas" fica no próprio projeto (PROJ.visitasPrev).
// =====================================================================
(function () {
  if (typeof projId === 'undefined' || projId == null) return;

  var LIMITE_ABERTA_MS = 6 * 3600000; // aviso de check-out esquecido: 6h
  var mount = null;                    // corpo da gaveta (definido na montagem)

  // ---------- dados ----------
  function vkey() { return 'mabe-visitas-v1-' + projId; }
  function load() { try { return JSON.parse(localStorage.getItem(vkey())) || []; } catch (e) { return []; } }
  function save(v) { try { localStorage.setItem(vkey(), JSON.stringify(v)); } catch (e) {} }
  function prevQtd() { var p = MabeDB.getProject(projId); return (p && parseInt(p.visitasPrev, 10)) || 0; }
  function setPrev(n) { MabeDB.updateProject(projId, { visitasPrev: Math.max(0, parseInt(n, 10) || 0) }); render(); }

  // ---------- formatação ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDur(ms) { var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60), mm = m % 60; return h > 0 ? (h + 'h' + (mm > 0 ? (' ' + mm + 'min') : '')) : (mm + 'min'); }
  function fmtClock(ms) { var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return pad(h) + ':' + pad(m) + ':' + pad(ss); }
  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function fData(ts) { var d = new Date(ts); return DIAS[d.getDay()] + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function fDataFull(ts) { var d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function fHora(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function eu() { return (typeof meuNome === 'function' ? meuNome() : '') || '—'; }

  // ---------- ações ----------
  function checkin(motivo) {
    var v = load();
    var nova = { id: (v.reduce(function (a, x) { return Math.max(a, x.id); }, 0) + 1), user: eu(), in: Date.now(), out: null, obs: motivo || '', loc: null };
    v.push(nova); save(v); render();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        var arr = load(), it = arr.find(function (x) { return x.id === nova.id; });
        if (it && !it.loc) { it.loc = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }; save(arr); render(); }
      }, function () {}, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    }
  }
  function checkout(id) {
    var v = load(), it = v.find(function (x) { return x.id === id; });
    if (it && !it.out) {
      it.out = Date.now(); save(v);
      // GPS na saída — não bloqueia; anexa a localização quando (e se) chegar
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (pos) {
          var arr = load(), x = arr.find(function (y) { return y.id === id; });
          if (x && !x.locOut) { x.locOut = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }; save(arr); render(); }
        }, function () {}, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      }
    }
    render();
  }

  // ---------- check-in: escolha do motivo ----------
  var choosing = false, showOutro = false;
  function startCheckin() { choosing = true; showOutro = false; render(); }
  function cancelCheckin() { choosing = false; showOutro = false; render(); }
  function pick(m) {
    if (m === 'Outro') { showOutro = true; render(); var t = document.getElementById('visOutro'); if (t) t.focus(); return; }
    doCheckin(m);
  }
  function confirmOutro() {
    var t = document.getElementById('visOutro'); var val = ((t && t.value) || '').trim().slice(0, 500);
    if (!val) { if (t) t.focus(); return; }
    doCheckin(val);
  }
  function countOutro(el) { var c = document.getElementById('visOutroCount'); if (c) c.textContent = (el.value || '').length + '/500'; }
  function doCheckin(motivo) { choosing = false; showOutro = false; checkin(motivo); }

  // ---------- abrir / fechar a gaveta ----------
  function open() {
    var d = document.getElementById('visDrawer');
    if (d) d.classList.add('open');
    render();
    if (d) {  // centraliza ao abrir; depois pode arrastar pelo cabeçalho
      var w = d.offsetWidth, h = d.offsetHeight;
      d.style.left = Math.max(6, Math.round((window.innerWidth - w) / 2)) + 'px';
      d.style.top = Math.max(6, Math.round((window.innerHeight - h) / 2)) + 'px';
    }
  }
  function close() {
    var s = document.getElementById('visDrawerScrim'), d = document.getElementById('visDrawer');
    if (s) s.classList.remove('open'); if (d) d.classList.remove('open');
    if (tick) { clearInterval(tick); tick = null; }
  }
  // arrastar a janela pelo cabeçalho (mouse e toque)
  function initDrag() {
    var d = document.getElementById('visDrawer');
    var h = d ? d.querySelector('.vis-drawer-h') : null;
    if (!d || !h) return;
    var dragging = false, ox = 0, oy = 0;
    h.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.vis-drawer-x')) return;
      dragging = true;
      var r = d.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      d.classList.add('dragging');
      try { h.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    h.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var w = d.offsetWidth, ht = d.offsetHeight;
      var x = Math.max(6, Math.min(e.clientX - ox, window.innerWidth - w - 6));
      var y = Math.max(6, Math.min(e.clientY - oy, window.innerHeight - ht - 6));
      d.style.left = x + 'px'; d.style.top = y + 'px';
    });
    var end = function (e) { if (dragging) { dragging = false; d.classList.remove('dragging'); try { h.releasePointerCapture(e.pointerId); } catch (_) {} } };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  }

  // ---------- render ----------
  var tick = null;
  function render() {
    var v = load(), me = eu();
    var ativa = v.find(function (x) { return x.user === me && !x.out; });
    var concl = v.filter(function (x) { return x.out; });
    var prev = prevQtd(), rz = concl.length;

    // indicador (bolinha verde) no botão "Mais" quando há visita em andamento
    var badge = document.getElementById('maisBadge'); if (badge) badge.style.display = ativa ? 'inline-block' : 'none';
    if (!mount) return;

    var pct = prev > 0 ? Math.round(rz / prev * 100) : 0;
    var totalMs = concl.reduce(function (a, x) { return a + (x.out - x.in); }, 0);
    var rest = prev - rz;

    // 1) previsão
    var prevHtml =
      '<div class="vis-prev"><div class="h">' +
        '<div><div class="bl">Previstas</div><input class="pin" type="number" min="0" value="' + prev + '" onchange="Visitas.setPrev(this.value)"></div>' +
        '<div><div class="bl">Realizadas</div><div class="bv done">' + rz + '</div></div>' +
        '<div class="pct">' + pct + '%</div>' +
      '</div>' +
      '<div class="vis-bar"><i style="width:' + Math.min(100, pct) + '%"></i></div>' +
      '<div class="foot"><span>' + (rest > 0 ? (rest + ' restante' + (rest > 1 ? 's' : '')) : (rz > 0 ? 'meta atingida ✓' : '—')) + '</span>' +
        '<span>Tempo total: <b>' + (rz ? fmtDur(totalMs) : '0min') + '</b></span></div></div>';

    // 2) status / ação
    var stHtml;
    if (choosing) {
      var OPCOES = ['Medição', 'Conferência fornecedor', 'Dúvidas Cliente', 'Outro'];
      stHtml = '<div class="vis-st idle">' +
        '<div class="r1"><span class="dot"></span><span class="st">O que foi feito?</span></div>' +
        '<div class="sub">Escolha o motivo da visita para registrar o check-in.</div>' +
        '<div class="vis-opts">' + OPCOES.map(function (o) { return '<button class="vis-opt' + (o === 'Outro' && showOutro ? ' on' : '') + '" onclick="Visitas.pick(\'' + o + '\')">' + o + '</button>'; }).join('') + '</div>' +
        (showOutro ? '<textarea class="vis-outro" id="visOutro" maxlength="500" placeholder="Descreva o motivo (até 500 caracteres)" oninput="Visitas.countOutro(this)"></textarea><div class="vis-outro-c" id="visOutroCount">0/500</div><button class="vis-big in" onclick="Visitas.confirmOutro()">▶&nbsp; Confirmar check-in</button>' : '') +
        '<button class="vis-cancel" onclick="Visitas.cancelCheckin()">Cancelar</button></div>';
    } else if (ativa) {
      var atrasada = (Date.now() - ativa.in) > LIMITE_ABERTA_MS;
      stHtml = '<div class="vis-st ' + (atrasada ? 'warn' : 'live') + '">' +
        '<div class="r1"><span class="dot"></span><span class="st">Em visita — ' + esc(ativa.user) + '</span></div>' +
        '<div class="sub">Chegou às ' + fHora(ativa.in) + ' · ' + fData(ativa.in) + (ativa.loc ? ' · 📍 local registrado' : '') + '</div>' +
        (ativa.obs ? '<div class="sub" style="color:var(--ink);font-weight:600">📝 ' + esc(ativa.obs) + '</div>' : '') +
        (atrasada ? '<div class="sub" style="color:var(--lost);font-weight:600">⏰ Aberta há mais de 6h — esqueceu o check-out?</div>' : '') +
        '<div class="timer" id="visTimer">00:00:00</div>' +
        '<button class="vis-big out" onclick="Visitas.checkout(' + ativa.id + ')">■&nbsp; Fazer Check-out</button></div>';
    } else {
      stHtml = '<div class="vis-st idle">' +
        '<div class="r1"><span class="dot"></span><span class="st">Nenhuma visita em andamento</span></div>' +
        '<div class="sub">Toque para registrar sua chegada — nome, dia e hora capturados automaticamente.</div>' +
        '<button class="vis-big in" onclick="Visitas.startCheckin()">▶&nbsp; Fazer Check-in</button></div>';
    }

    // 3) relatório
    var repHtml = '<button class="vis-report" onclick="Visitas.openReport()">📄&nbsp; Gerar relatório de visitas</button>';

    mount.innerHTML = prevHtml + stHtml + repHtml;

    if (tick) { clearInterval(tick); tick = null; }
    if (ativa) { var upd = function () { var el = document.getElementById('visTimer'); if (el) el.textContent = fmtClock(Date.now() - ativa.in); }; upd(); tick = setInterval(upd, 1000); }
  }

  // ---------- relatório ----------
  function concluidas() { return load().filter(function (x) { return x.out; }).slice().sort(function (a, b) { return a.in - b.in; }); }
  function repTexto() {
    var c = concluidas(), prev = prevQtd(), tot = c.reduce(function (a, x) { return a + (x.out - x.in); }, 0);
    var linhas = c.map(function (x, i) {
      var locIn = x.loc ? ('\n   📍 Chegada: https://maps.google.com/?q=' + x.loc.lat + ',' + x.loc.lng) : '';
      var locOut = x.locOut ? ('\n   📍 Saída: https://maps.google.com/?q=' + x.locOut.lat + ',' + x.locOut.lng) : '';
      var obs = x.obs ? ('\n   „' + x.obs + '“') : '';
      return (i + 1) + ') ' + x.user + '\n   ' + fDataFull(x.in) + ' · ' + fHora(x.in) + '→' + fHora(x.out) + ' · ' + fmtDur(x.out - x.in) + obs + locIn + locOut;
    });
    return '*RELATÓRIO DE VISITAS*\n' + (PROJ ? PROJ.nome : '') + '\n\n' +
      'Previstas: ' + prev + '  |  Realizadas: ' + c.length + '\n' +
      'Tempo total em obra: ' + (c.length ? fmtDur(tot) : '0min') + '\n\n' +
      '*Visitas:*\n' + (linhas.length ? linhas.join('\n') : '(nenhuma)') + '\n\n' +
      '_Gerado pelo app Gestão Camber_';
  }
  function repHTML() {
    var c = concluidas(), prev = prevQtd(), tot = c.reduce(function (a, x) { return a + (x.out - x.in); }, 0);
    var rows = c.map(function (x, i) {
      var linkIn = x.loc ? ('<a href="https://maps.google.com/?q=' + x.loc.lat + ',' + x.loc.lng + '">chegada</a>') : '';
      var linkOut = x.locOut ? ('<a href="https://maps.google.com/?q=' + x.locOut.lat + ',' + x.locOut.lng + '">saída</a>') : '';
      var loc = (linkIn || linkOut) ? [linkIn, linkOut].filter(Boolean).join(' · ') : '—';
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(x.user) + '</td><td>' + fDataFull(x.in) + '</td><td>' + fHora(x.in) + ' → ' + fHora(x.out) + '</td><td>' + esc(x.obs || '—') + '</td><td>' + loc + '</td><td class="r">' + fmtDur(x.out - x.in) + '</td></tr>';
    }).join('');
    return '<h1>Relatório de Visitas</h1><div class="s">' + esc(PROJ ? PROJ.nome : '') + ' · emitido em ' + fDataFull(Date.now()) + '</div>' +
      '<div class="k"><div><b>' + prev + '</b><span>Previstas</span></div><div><b>' + c.length + '</b><span>Realizadas</span></div><div><b>' + (c.length ? fmtDur(tot) : '0min') + '</b><span>Tempo total</span></div></div>' +
      '<table><thead><tr><th>#</th><th>Responsável</th><th>Data</th><th>Entrada → Saída</th><th>Observação</th><th>Local</th><th class="r">Duração</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7">Nenhuma visita registrada.</td></tr>') + '</tbody></table>';
  }
  function openReport() {
    document.getElementById('visSheetSub').textContent = PROJ ? PROJ.nome : '';
    document.getElementById('visPreview').textContent = repTexto();
    document.getElementById('visScrim').classList.add('open');
    document.getElementById('visSheet').classList.add('open');
  }
  function closeReport() {
    document.getElementById('visScrim').classList.remove('open');
    document.getElementById('visSheet').classList.remove('open');
  }
  function whats() { window.open('https://wa.me/?text=' + encodeURIComponent(repTexto()), '_blank'); }
  function pdf() {
    document.getElementById('visPrint').innerHTML = repHTML();
    closeReport();
    document.body.classList.add('pv-print');
    var limpar = function () { document.body.classList.remove('pv-print'); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(function () { window.print(); }, 250);
  }

  // ---------- estilos ----------
  var css = document.createElement('style');
  css.textContent =
    // gaveta
    '.vis-scrim{position:fixed;inset:0;background:rgba(30,22,14,.42);opacity:0;visibility:hidden;transition:.18s;z-index:54}.vis-scrim.open{opacity:1;visibility:visible}' +
    '.vis-drawer{position:fixed;left:0;top:0;width:calc(100% - 32px);max-width:440px;background:var(--bg);border:1px solid var(--hair);border-radius:16px;max-height:86vh;display:flex;flex-direction:column;opacity:0;visibility:hidden;transition:opacity .16s,visibility .16s;z-index:56;box-shadow:0 20px 60px rgba(0,0,0,.3)}' +
    '.vis-drawer.open{opacity:1;visibility:visible}' +
    '.vis-drawer.dragging{box-shadow:0 26px 70px rgba(0,0,0,.42)}' +
    '.vis-drawer-h{display:flex;align-items:center;gap:8px;padding:13px 16px 8px;flex:0 0 auto;cursor:move;touch-action:none;user-select:none}' +
    '.vis-drawer-h h2{margin:0;font-size:17px;letter-spacing:-.01em;flex:1}' +
    '.vis-grip{color:var(--ink-3);font-size:15px;line-height:1;letter-spacing:-2px}' +
    '.vis-drawer-x{background:none;border:none;font-size:20px;color:var(--ink-3);cursor:pointer;line-height:1}' +
    '.vis-drawer-b{padding:6px 16px calc(20px + env(safe-area-inset-bottom));overflow-y:auto}' +
    // conteúdo
    '.vis-prev{background:var(--surface);border:1px solid var(--hair);border-radius:var(--r);padding:13px 14px;margin-bottom:10px;box-shadow:var(--shadow-sm)}' +
    '.vis-prev .h{display:flex;align-items:flex-end;gap:16px;margin-bottom:10px}' +
    '.vis-prev .bl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);font-weight:600;margin-bottom:4px}' +
    '.vis-prev .bv{font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1;height:28px;display:flex;align-items:center}.vis-prev .bv.done{color:var(--win)}' +
    '.vis-prev .pin{width:52px;height:28px;box-sizing:border-box;font-family:inherit;font-size:19px;font-weight:700;text-align:center;border:1px solid var(--hair-2);border-radius:8px;padding:0 4px;background:var(--bg);color:var(--ink);line-height:1}' +
    '.vis-prev .pct{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:17px;font-weight:600;color:var(--accent)}' +
    '.vis-bar{height:8px;border-radius:999px;background:var(--surface-2);overflow:hidden}.vis-bar>i{display:block;height:100%;background:var(--win);border-radius:999px;transition:width .3s}' +
    '.vis-prev .foot{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-3);margin-top:10px}' +
    '.vis-st{border-radius:var(--r);padding:13px 14px;margin-bottom:10px;box-shadow:var(--shadow-sm);border:1px solid var(--hair)}' +
    '.vis-st.idle{background:var(--surface)}.vis-st.live{background:var(--win-soft);border-color:var(--win)}.vis-st.warn{background:var(--lost-soft);border-color:var(--lost)}' +
    '.vis-st .r1{display:flex;align-items:center;gap:10px;margin-bottom:4px}.vis-st .dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}' +
    '.vis-st.idle .dot{background:var(--ink-3)}.vis-st.live .dot{background:var(--win);animation:vpz 1.4s infinite}.vis-st.warn .dot{background:var(--lost)}' +
    '@keyframes vpz{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.vis-st .st{font-weight:700;font-size:14px}.vis-st .sub{font-size:12.5px;color:var(--ink-2);margin-bottom:10px}' +
    '.vis-st .timer{font-family:"IBM Plex Mono",monospace;font-size:23px;font-weight:600;margin:2px 0 10px}' +
    '.vis-big{width:100%;border:none;border-radius:11px;padding:12px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px}' +
    '.vis-big.in{background:var(--accent);color:#fff}.vis-big.out{background:var(--lost);color:#fff}.vis-big:active{transform:translateY(1px)}' +
    '.vis-report{width:100%;border:1px solid var(--hair-2);background:var(--surface);color:var(--ink);border-radius:11px;padding:11px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;min-height:44px}' +
    '.vis-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}' +
    '.vis-opt{border:1px solid var(--hair-2);background:var(--surface-2);color:var(--ink);border-radius:10px;padding:12px 10px;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;min-height:46px;text-align:center}' +
    '.vis-opt:active{transform:translateY(1px)}.vis-opt.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}' +
    '.vis-outro{width:100%;box-sizing:border-box;font-family:inherit;font-size:13.5px;padding:9px 11px;border:1px solid var(--hair-2);border-radius:10px;background:var(--surface);color:var(--ink);min-height:70px;resize:vertical;margin-bottom:4px}' +
    '.vis-outro-c{text-align:right;font-size:11px;color:var(--ink-3);margin-bottom:10px}' +
    '.vis-cancel{width:100%;background:none;border:none;color:var(--ink-3);font-family:inherit;font-size:13px;padding:8px;cursor:pointer;margin-top:4px}' +
    // sheet do relatório
    '.vsheet-scrim{position:fixed;inset:0;background:rgba(30,22,14,.42);opacity:0;visibility:hidden;transition:.18s;z-index:60}.vsheet-scrim.open{opacity:1;visibility:visible}' +
    '.vsheet{position:fixed;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;background:var(--surface);border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.2);transform:translateY(100%);transition:.22s;z-index:61}.vsheet.open{transform:translateY(0)}' +
    '.vsheet h3{margin:0 0 4px;font-size:16px}.vsheet .ss{font-size:12.5px;color:var(--ink-3);margin-bottom:12px}' +
    '.vsheet .pv{background:var(--bg);border:1px solid var(--hair);border-radius:10px;padding:12px;font-size:12px;line-height:1.5;white-space:pre-wrap;max-height:180px;overflow:auto;color:var(--ink-2);margin-bottom:14px;font-family:"IBM Plex Mono",monospace}' +
    '.vsheet .acts{display:flex;gap:10px}.vsheet .acts button{flex:1;border:none;border-radius:11px;padding:14px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;min-height:50px}' +
    '.vsheet .wa{background:#25D366;color:#fff}.vsheet .pdf{background:var(--ink);color:#fff}.vsheet .cx{position:absolute;top:12px;right:14px;background:none;border:none;font-size:20px;color:var(--ink-3);cursor:pointer}' +
    '@media print{body.pv-print *{visibility:hidden!important}body.pv-print #visPrint,body.pv-print #visPrint *{visibility:visible!important}#visPrint{display:none}body.pv-print #visPrint{display:block!important;position:absolute;top:0;left:0;width:100%;padding:24px;color:#000;font-family:Archivo,sans-serif}#visPrint h1{font-size:20px;margin:0 0 2px}#visPrint .s{color:#555;font-size:13px;margin-bottom:16px}#visPrint .k{display:flex;gap:26px;margin-bottom:18px}#visPrint .k b{display:block;font-size:22px}#visPrint .k span{font-size:11px;text-transform:uppercase;color:#777}#visPrint table{width:100%;border-collapse:collapse;font-size:12.5px}#visPrint th,#visPrint td{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}#visPrint th{font-size:10px;text-transform:uppercase;color:#777}#visPrint td.r,#visPrint th.r{text-align:right}}';
  document.head.appendChild(css);

  // ---------- monta gaveta + sheet do relatório (dentro de #app p/ herdar as cores) ----------
  var app = document.getElementById('app') || document.body;

  var dScrim = document.createElement('div'); dScrim.className = 'vis-scrim'; dScrim.id = 'visDrawerScrim'; dScrim.onclick = close;
  var drawer = document.createElement('div'); drawer.className = 'vis-drawer'; drawer.id = 'visDrawer';
  drawer.innerHTML = '<div class="vis-drawer-h"><span class="vis-grip" title="Arraste para mover">⠿</span><h2>Controle de visitas</h2><button class="vis-drawer-x" onclick="Visitas.close()">✕</button></div><div class="vis-drawer-b" id="visDrawerBody"></div>';
  app.appendChild(dScrim); app.appendChild(drawer);
  mount = document.getElementById('visDrawerBody');
  initDrag();

  var scrim = document.createElement('div'); scrim.className = 'vsheet-scrim'; scrim.id = 'visScrim'; scrim.onclick = closeReport;
  var sheet = document.createElement('div'); sheet.className = 'vsheet'; sheet.id = 'visSheet';
  sheet.innerHTML = '<button class="cx" onclick="Visitas.closeReport()">✕</button><h3>Relatório de visitas</h3><div class="ss" id="visSheetSub"></div><div class="pv" id="visPreview"></div><div class="acts"><button class="wa" onclick="Visitas.whats()">📱 WhatsApp</button><button class="pdf" onclick="Visitas.pdf()">📄 Salvar PDF</button></div>';
  var printd = document.createElement('div'); printd.id = 'visPrint';
  app.appendChild(scrim); app.appendChild(sheet); app.appendChild(printd);

  window.Visitas = { open: open, close: close, render: render, startCheckin: startCheckin, cancelCheckin: cancelCheckin, pick: pick, confirmOutro: confirmOutro, countOutro: countOutro, checkout: checkout, setPrev: setPrev, openReport: openReport, closeReport: closeReport, whats: whats, pdf: pdf };

  render(); // define o indicador no botão "Mais" mesmo com a gaveta fechada
})();
