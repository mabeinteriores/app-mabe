(function () {
  'use strict';
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function day(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    var p = value.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2], 12);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2] ? d : null;
  }
  function add(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); }
  function key(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function range(anchor, view) {
    var a = add(anchor, 0), b;
    if (view === 'semana') a = add(a, -((a.getDay() + 6) % 7));
    if (view === 'quinzena') a.setDate(a.getDate() <= 15 ? 1 : 16);
    if (view === 'mes') a.setDate(1);
    b = view === 'semana' ? add(a, 6) : view === 'quinzena' ? (a.getDate() === 1 ? new Date(a.getFullYear(), a.getMonth(), 15, 12) : new Date(a.getFullYear(), a.getMonth() + 1, 0, 12)) : view === 'mes' ? new Date(a.getFullYear(), a.getMonth() + 1, 0, 12) : add(a, 0);
    return [a, b];
  }
  function span(task) { var a = day(task.start), b = day(task.end); return a && b && b >= a ? [a, b] : null; }
  function lateDays(task, today) {
    var end = day(task.end), current = today || new Date();
    if(task.status === 'Concluído' || !end) return 0;
    return Math.max(0, Math.round((Date.UTC(current.getFullYear(),current.getMonth(),current.getDate())-Date.UTC(end.getFullYear(),end.getMonth(),end.getDate()))/86400000));
  }
  function overdue(task, today) { return lateDays(task, today)>0; }
  function lateLabel(task, today) { var days=lateDays(task,today); return days ? '⚠ Atrasada há '+days+(days===1?' dia':' dias') : ''; }
  function mount(host, options) {
    options = options || {};
    var now = options.today ? day(options.today) : new Date(), today = add(now, 0), anchor = add(today, 0), view = 'semana';
    var root = el('section', null, 'obras-agenda'); root.setAttribute('aria-label', 'Agenda de Obras'); host.append(root);
    var intro = el('div', null, 'ag-intro'); intro.append(el('p', 'Etapas, prazos e responsáveis dos seus cronogramas.'));
    var edit = el('a', 'Gerenciar cronograma →', 'ag-manage'); edit.href = 'projeto.html?id=' + encodeURIComponent(options.projectId) + '&area=cronograma'; intro.append(edit); root.append(intro);
    var filters = el('div', null, 'ag-filters');
    function filter(label, entries) { var l = el('label', label), s = el('select'); entries.forEach(function (x) { s.add(new Option(x[1], x[0])); }); l.append(s); filters.append(l); s.onchange = render; return s; }
    var projects = CamberDB.loadProjects(), work = filter('Obra', [['', 'Todas as obras']].concat(projects.map(function (p) { return [String(p.id), p.nome]; })));
    work.value = String(options.projectId || '');
    var people = Array.from(new Set(projects.flatMap(function (p) { return (p.cronograma || []).map(function (t) { return (t.responsible || '').trim(); }); }).filter(Boolean))).sort();
    var person = filter('Responsável', [['', 'Todos os responsáveis'], ['__none', 'Sem responsável']].concat(people.map(function (p) { return [p, p]; })));
    var status = filter('Situação', [['pending', 'Todas as pendentes'], ['late', 'Atrasadas'], ['A iniciar', 'A iniciar'], ['Em andamento', 'Em andamento'], ['Pausada', 'Pausadas'], ['Concluído', 'Concluídas'], ['all', 'Todas as atividades']]);
    root.append(filters);
    var toolbar = el('div', null, 'ag-toolbar'), nav = el('div', null, 'ag-nav'), title = el('strong'); title.setAttribute('aria-live', 'polite');
    function button(text, action, parent) { var b = el('button', text); b.type = 'button'; b.onclick = action; parent.append(b); return b; }
    function move(dir) { var r = range(anchor, view); anchor = dir > 0 ? add(r[1], 1) : add(r[0], -1); render(); }
    button('‹', function () { move(-1); }, nav).setAttribute('aria-label', 'Período anterior');
    button('Hoje', function () { anchor = add(today, 0); render(); }, nav);
    button('›', function () { move(1); }, nav).setAttribute('aria-label', 'Próximo período');
    nav.append(title); toolbar.append(nav);
    var tabs = el('div', null, 'ag-tabs'); tabs.setAttribute('aria-label', 'Visualização');
    [['dia', 'Dia'], ['semana', 'Semana'], ['quinzena', 'Quinzena'], ['mes', 'Mês']].forEach(function (v) { var b = button(v[1], function () { view = v[0]; render(); }, tabs); b.dataset.view = v[0]; }); toolbar.append(tabs); root.append(toolbar);
    var summary = el('p', null, 'ag-summary'), content = el('div'), extras = el('div'); summary.setAttribute('aria-live', 'polite'); root.append(summary, content, extras);
    function card(task) {
      var b = el('button', null, 'ag-task' + (overdue(task, today) ? ' ag-late' : task.status === 'Concluído' ? ' ag-done' : '')); b.type = 'button';
      var owner = el('span', null, 'ag-responsible');
      owner.append(el('span', 'Responsável:', 'ag-responsible-label'), el('strong', (task.responsible || '').trim() || 'Não definido'));
      b.append(el('strong', task.title || 'Etapa sem título'), el('span', task.projectName), owner, el('small', overdue(task, today) ? lateLabel(task, today) + ' · ' + (task.status || 'A iniciar') : task.status || 'A iniciar'));
      b.onclick = function () { details(task, b); }; return b;
    }
    function details(task, trigger) {
      var d = el('dialog', null, 'ag-dialog'); d.append(el('small', task.projectName), el('h2', task.title || 'Etapa sem título'));
      [['Responsável', task.responsible || 'Não definido'], ['Início', day(task.start) ? day(task.start).toLocaleDateString('pt-BR') : 'Não definido'], ['Fim previsto', day(task.end) ? day(task.end).toLocaleDateString('pt-BR') : 'Não definido'], ['Situação', overdue(task, today) ? lateLabel(task, today) + ' · ' + (task.status || 'A iniciar') : task.status || 'A iniciar']].forEach(function (pair) { var p = el('p'); p.append(el('strong', pair[0] + ': '), document.createTextNode(pair[1])); d.append(p); });
      var link = el('a', 'Abrir cronograma da obra →', 'ag-manage'); link.href = 'projeto.html?id=' + encodeURIComponent(task.projectId) + '&area=cronograma'; d.append(link);
      button('Fechar', function () { d.close(); }, d); d.addEventListener('close', function () { d.remove(); trigger.focus(); }); root.append(d); d.showModal();
    }
    function render() {
      edit.hidden = !work.value;
      edit.href = 'projeto.html?id=' + encodeURIComponent(work.value) + '&area=cronograma';
      var tasks = CamberDB.loadProjects().flatMap(function (p) { return (p.cronograma || []).map(function (t) { return Object.assign({}, t, { projectId: String(p.id), projectName: p.nome }); }); }).filter(function (t) {
        return (!work.value || t.projectId === work.value) && (!person.value || (person.value === '__none' ? !(t.responsible || '').trim() : (t.responsible || '').trim() === person.value)) && (status.value === 'all' || (status.value === 'pending' ? t.status !== 'Concluído' : status.value === 'late' ? overdue(t, today) : t.status === status.value));
      }).sort(function (a, b) { return String(a.end || '9999').localeCompare(String(b.end || '9999')) || String(a.title).localeCompare(String(b.title)); });
      var r = range(anchor, view); title.textContent = r[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + (view === 'dia' ? '' : ' — ' + r[1].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })) + ' · ' + r[1].getFullYear();
      tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === view)); });
      var visible = tasks.filter(function (t) { var s = span(t); return s && s[0] <= r[1] && s[1] >= r[0]; });
      summary.textContent = visible.length + ' atividade(s) no período · ' + tasks.filter(function (t) { return overdue(t, today); }).length + ' atrasada(s) nos filtros selecionados';
      content.replaceChildren(); extras.replaceChildren();
      var grid = el('div', null, 'ag-calendar ag-' + view); content.append(grid);
      if (view === 'mes') for (var pad = 0; pad < (r[0].getDay() + 6) % 7; pad++) grid.append(el('div', null, 'ag-pad'));
      for (var current = add(r[0], 0); current <= r[1]; current = add(current, 1)) {
        var column = el('section', null, 'ag-day' + (key(current) === key(today) ? ' ag-today' : ''));
        column.append(el('h3', current.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })));
        var matches = visible.filter(function (t) { var s = span(t); return s[0] <= current && s[1] >= current; });
        matches.forEach(function (t) { column.append(card(t)); }); if (!matches.length) column.append(el('p', 'Sem atividades', 'ag-empty')); grid.append(column);
      }
      function extra(titleText, list) { if (!list.length) return; var section = el('section', null, 'ag-extra'); section.append(el('h3', titleText + ' (' + list.length + ')')); var cards = el('div', null, 'ag-extra-cards'); list.forEach(function (t) { cards.append(card(t)); }); section.append(cards); extras.append(section); }
      extra('Atrasadas fora do período', tasks.filter(function (t) { return span(t) && overdue(t, today) && visible.indexOf(t) < 0; }));
      extra('Datas a definir ou revisar', tasks.filter(function (t) { return !span(t); }));
    }
    render();
  }
  window.CamberAgenda = { mount: mount, range: range, span: span, overdue: overdue, lateDays: lateDays, lateLabel: lateLabel, day: day };
})();
