// Painel "A" (KPIs + funil) da Mabe Comercial — hi-fi.
// Mesma estrutura, renderizada em 3 peles (paper/studio/tech) e 2 temas.
// Exporta MabeDashboard para window.
(function () {
  function I(path, props) {
    return React.createElement('svg', Object.assign({ width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, props || {}),
      React.createElement('path', { d: path }));
  }
  var icons = {
    check: 'M20 6L9 17l-5-5',
    x: 'M18 6L6 18M6 6l12 12',
    coin: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    pct: 'M19 5L5 19M6.5 6.5h.01M17.5 17.5h.01',
    up: 'M7 17L17 7M17 7H8M17 7v9',
    down: 'M7 7l10 10M17 17H8M17 17V8'
  };

  var KPIS = [
    { ml: 'Fechado · ano', kv: 'R$ 1,24 mi', kd: '18% vs. mês anterior', dir: 'up', ic: 'check' },
    { ml: 'Perdido', kv: 'R$ 380 mil', kd: '13 oportunidades', dir: 'down', ic: 'x' },
    { ml: 'Comissões a receber', kv: 'R$ 96,5 mil', kd: 'RT média 7,8%', dir: '', ic: 'coin', hero: true },
    { ml: 'Taxa de conversão', kv: '62%', kd: 'ganhos ÷ total', dir: '', ic: 'pct' }
  ];

  var FUNNEL = [
    { k: 'prospec', l: 'Prospecção', v: 'R$ 2,4 mi', n: '48 op.', w: 100 },
    { k: 'negoc', l: 'Em negociação', v: 'R$ 1,8 mi', n: '31 op.', w: 76 },
    { k: 'prop', l: 'Proposta enviada', v: 'R$ 1,25 mi', n: '19 op.', w: 54 },
    { k: 'win', l: 'Fechado / Ganho', v: 'R$ 1,24 mi', n: '22 op.', w: 40 },
    { k: 'lost', l: 'Perdido', v: 'R$ 380 mil', n: '13 op.', w: 17 }
  ];

  var MONTHS = [
    { m: 'Jan', total: 52, win: 46 }, { m: 'Fev', total: 64, win: 52 },
    { m: 'Mar', total: 58, win: 60 }, { m: 'Abr', total: 80, win: 55 },
    { m: 'Mai', total: 72, win: 64 }, { m: 'Jun', total: 95, win: 60 }
  ];

  var RANK = [
    { f: 'Marcenaria Bianco', s: 'Marcenaria', fe: 'R$ 312 mil', rt: 'R$ 28 mil', w: 100 },
    { f: 'VidroArt', s: 'Vidraçaria', fe: 'R$ 188 mil', rt: 'R$ 15 mil', w: 60 },
    { f: 'Pisos & Cia', s: 'Pisos', fe: 'R$ 164 mil', rt: 'R$ 12 mil', w: 52 },
    { f: 'Studio Móveis', s: 'Móveis soltos', fe: 'R$ 142 mil', rt: 'R$ 14 mil', w: 46 }
  ];

  var RESP = [
    { in: 'V', n: 'Você (Arq.)', o: '38', c: '68%', rt: 'R$ 61 mil' },
    { in: 'A', n: 'Ana', o: '22', c: '55%', rt: 'R$ 24 mil' },
    { in: 'R', n: 'Rafael', o: '17', c: '59%', rt: 'R$ 11 mil' }
  ];

  function MabeDashboard(props) {
    var skin = props.skin || 'studio';
    var theme = props.theme || 'light';
    var h = React.createElement;

    var top = h('div', { className: 'top' },
      h('div', { className: 'brand' },
        h('div', { className: 'mark' }, 'M'),
        h('div', null,
          h('div', { className: 'bn' }, 'Mabe Comercial'),
          h('div', { className: 'bs' }, 'Oportunidades'))),
      h('nav', { className: 'nav' },
        h('a', { className: 'on' }, 'Painel'),
        h('a', null, 'Projetos'),
        h('a', null, 'Fornecedores'),
        h('a', null, 'Config.')),
      h('div', { className: 'sp' }),
      h('div', { className: 'search' }, '⌕  Buscar projeto, fornecedor…'),
      h('button', { className: 'btn primary' }, '+  Nova oportunidade'),
      h('div', { className: 'av' }, 'MA'));

    var pageH = h('div', { className: 'page-h' },
      h('div', null,
        h('div', { className: 'crumb' }, 'Visão geral'),
        h('h1', null, 'Painel')),
      h('div', { className: 'seg' },
        h('button', null, 'Mês'),
        h('button', { className: 'on' }, 'Ano'),
        h('button', null, 'Tudo')));

    var kpis = h('div', { className: 'kpis' }, KPIS.map(function (k, i) {
      return h('div', { className: 'kpi' + (k.hero ? ' hero' : ''), key: i },
        h('div', { className: 'kl' },
          h('span', { className: 'ml' }, k.ml),
          h('span', { className: 'ico' }, icons[k.ic] ? I(icons[k.ic]) : null)),
        h('div', { className: 'kv num' }, k.kv),
        h('div', { className: 'kd' + (k.dir ? ' ' + k.dir : '') },
          k.dir ? I(icons[k.dir], { width: 13, height: 13 }) : null,
          h('span', null, k.kd)));
    }));

    var funnel = h('div', { className: 'panel' },
      h('div', { className: 'panel-h' },
        h('h3', null, 'Funil de oportunidades'),
        h('span', { className: 'meta' }, 'por etapa · valor R$')),
      h('div', { className: 'funnel' }, FUNNEL.map(function (f, i) {
        return h('div', { className: 'frow ' + f.k, key: i },
          h('div', { className: 'fl' }, h('span', { className: 'dot ' + f.k }), f.l),
          h('div', { className: 'ftrack' }, h('div', { className: 'fbar ' + f.k, style: { width: f.w + '%' } }, h('span', { className: 'num' }, f.v))),
          h('div', { className: 'fn num' }, f.n));
      })));

    var chart = h('div', { className: 'panel' },
      h('div', { className: 'panel-h' },
        h('h3', null, 'Evolução no tempo'),
        h('div', { className: 'legend' },
          h('span', null, h('i', { style: { background: 'var(--accent-soft)' } }), 'Negociado'),
          h('span', null, h('i', { style: { background: 'var(--st-win)' } }), 'Fechado'))),
      h('div', { className: 'chart' }, MONTHS.map(function (m, i) {
        return h('div', { className: 'cbar', key: i },
          h('div', { className: 'stack', style: { height: m.total + '%' } },
            h('div', { className: 's1', style: { flex: 1 } }),
            h('div', { className: 's2', style: { height: m.win + '%' } })),
          h('span', { className: 'ccap' }, m.m));
      })));

    var ranking = h('div', { className: 'panel' },
      h('div', { className: 'panel-h' },
        h('h3', null, 'Ranking de fornecedores'),
        h('span', { className: 'meta' }, 'top 4 · fechado')),
      h('table', { className: 'tbl' },
        h('thead', null, h('tr', null,
          h('th', null, 'Fornecedor'),
          h('th', null, 'Serviço'),
          h('th', { className: 'r' }, 'Fechado'),
          h('th', { className: 'r' }, 'RT'))),
        h('tbody', null, RANK.map(function (r, i) {
          return h('tr', { key: i },
            h('td', null, h('div', { className: 'who' }, h('span', { className: 'sw' }, r.f[0]), r.f)),
            h('td', { style: { color: 'var(--ink-2)' } }, r.s),
            h('td', { className: 'r num' }, r.fe),
            h('td', { className: 'r num rtpill' }, r.rt));
        }))));

    var resp = h('div', { className: 'panel' },
      h('div', { className: 'panel-h' },
        h('h3', null, 'Por responsável'),
        h('span', { className: 'meta' }, 'conversão')),
      h('table', { className: 'tbl' },
        h('thead', null, h('tr', null,
          h('th', null, 'Responsável'),
          h('th', { className: 'r' }, 'Op.'),
          h('th', { className: 'r' }, 'Conv.'),
          h('th', { className: 'r' }, 'RT'))),
        h('tbody', null, RESP.map(function (r, i) {
          return h('tr', { key: i },
            h('td', null, h('div', { className: 'who' }, h('span', { className: 'sw' }, r.in), r.n)),
            h('td', { className: 'r num' }, r.o),
            h('td', { className: 'r num' }, r.c),
            h('td', { className: 'r num rtpill' }, r.rt));
        }))));

    return h('div', { className: 'mabe skin-' + skin, 'data-theme': theme },
      top,
      h('div', { className: 'body' },
        pageH,
        kpis,
        h('div', { className: 'grid-2' },
          h('div', { className: 'col' }, funnel),
          h('div', { className: 'col' }, chart)),
        h('div', { className: 'grid-2b' }, ranking, resp)));
  }

  window.MabeDashboard = MabeDashboard;
})();
