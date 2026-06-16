// Mabe Comercial — base de dados compartilhada (protótipo, persistida no navegador).
// Liga a lista de Projetos ao Detalhe do projeto e guarda as oportunidades de cada obra.
(function () {
  var PKEY = 'mabe-projects-v3';
  var OKEY = 'mabe-opps-v3-';

  // ---- seed: projetos iniciais ----
  var SEED_PROJECTS = [
    { id: 1, nome: 'Residência Alphaville', cliente: 'Marina Costa',  tipo: 'Residencial', cidade: 'Alphaville',        uf: 'SP', valor: 480, resp: 'Você (Arq.)', op: 9,  pct: 64,  rt: 38, statusLabel: 'Ativo',       statusCls: 'negoc' },
    { id: 2, nome: 'Cobertura Itaim',       cliente: 'Eduardo Lima',  tipo: 'Residencial', cidade: 'Itaim',             uf: 'SP', valor: 720, resp: 'Você (Arq.)', op: 12, pct: 41,  rt: 57, statusLabel: 'Ativo',       statusCls: 'negoc' },
    { id: 3, nome: 'Loja Oscar Freire',     cliente: 'Grupo Vênus',   tipo: 'Comercial',   cidade: 'Jardins',           uf: 'SP', valor: 310, resp: 'Ana',         op: 7,  pct: 88,  rt: 24, statusLabel: 'Fechando',    statusCls: 'prop' },
    { id: 4, nome: 'Apto Vila Nova',        cliente: 'Família Tanaka',tipo: 'Residencial', cidade: 'V. N. Conceição',   uf: 'SP', valor: 265, resp: 'Rafael',      op: 6,  pct: 100, rt: 19, statusLabel: 'Concluído',   statusCls: 'win' },
    { id: 5, nome: 'Escritório Faria Lima', cliente: 'NorthWind Adv.',tipo: 'Comercial',   cidade: 'Pinheiros',         uf: 'SP', valor: 540, resp: 'Você (Arq.)', op: 10, pct: 22,  rt: 43, statusLabel: 'Prospecção',  statusCls: 'prospec' }
  ];

  // ---- seed: oportunidades da obra 1 (Alphaville) ----
  var SEED_OPPS_1 = [
    { id:1, serv:'Climatização', forn:'a definir',        resp:'Você (Arq.)', val:48,  rt:0,   prob:20, et:'prospec', obs:'' },
    { id:2, serv:'Automação',    forn:'SmartHaus',         resp:'Você (Arq.)', val:36,  rt:9,   prob:25, et:'prospec', obs:'' },
    { id:3, serv:'Marcenaria',   forn:'Marcenaria Bianco', resp:'Você (Arq.)', val:180, rt:9,   prob:70, et:'negoc',   obs:'Pediu revisão do prazo.' },
    { id:4, serv:'Paisagismo',   forn:'Verde & Cia',       resp:'Ana',         val:29,  rt:6,   prob:50, et:'negoc',   obs:'' },
    { id:5, serv:'Vidraçaria',   forn:'VidroArt',          resp:'Ana',         val:92,  rt:8,   prob:55, et:'prop',    obs:'Proposta v2 enviada 14/06.' },
    { id:6, serv:'Pisos',        forn:'Pisos & Cia',       resp:'Você (Arq.)', val:88,  rt:7.5, prob:100,et:'win',     obs:'' },
    { id:7, serv:'Móveis soltos',forn:'Studio Móveis',     resp:'Rafael',      val:121, rt:10,  prob:100,et:'win',     obs:'' },
    { id:8, serv:'Iluminação',   forn:'LuxLed',            resp:'Ana',         val:54,  rt:8,   prob:100,et:'win',     obs:'' },
    { id:9, serv:'Pintura',      forn:'ColorArt',          resp:'Rafael',      val:38,  rt:5,   prob:100,et:'win',     obs:'' },
    { id:10,serv:'Forro/Gesso',  forn:'GessoArt',          resp:'Ana',         val:27,  rt:5,   prob:100,et:'win',     obs:'' },
    { id:11,serv:'Cortinas',     forn:'TecidoArt',         resp:'Rafael',      val:42,  rt:0,   prob:0,  et:'lost', motivo:'Preço acima do concorrente', obs:'' }
  ];

  // ---- seed: oportunidades das demais obras ----
  var SEED_OPPS = {
    2: [
      { id:1, serv:'Marcenaria',  forn:'Marcenaria Bianco', resp:'Você (Arq.)', val:220, rt:9,   prob:100, et:'win',   obs:'' },
      { id:2, serv:'Pisos',       forn:'Pisos & Cia',       resp:'Você (Arq.)', val:140, rt:7.5, prob:100, et:'win',   obs:'' },
      { id:3, serv:'Vidraçaria',  forn:'VidroArt',          resp:'Ana',         val:110, rt:8,   prob:55,  et:'negoc', obs:'' },
      { id:4, serv:'Climatização',forn:'ArCool',            resp:'Você (Arq.)', val:90,  rt:6,   prob:45,  et:'negoc', obs:'' },
      { id:5, serv:'Iluminação',  forn:'LuxLed',            resp:'Ana',         val:70,  rt:8,   prob:50,  et:'prop',  obs:'' },
      { id:6, serv:'Automação',   forn:'SmartHaus',         resp:'Rafael',      val:60,  rt:9,   prob:25,  et:'prospec',obs:'' },
      { id:7, serv:'Paisagismo',  forn:'Verde & Cia',       resp:'Ana',         val:40,  rt:6,   prob:0,   et:'lost',  motivo:'Prazo de entrega', obs:'' }
    ],
    3: [
      { id:1, serv:'Marcenaria',  forn:'Marcenaria Bianco', resp:'Ana',         val:120, rt:9,   prob:100, et:'win',   obs:'' },
      { id:2, serv:'Vidraçaria',  forn:'VidroArt',          resp:'Ana',         val:80,  rt:8,   prob:100, et:'win',   obs:'' },
      { id:3, serv:'Iluminação',  forn:'LuxLed',            resp:'Você (Arq.)', val:60,  rt:8,   prob:100, et:'win',   obs:'' },
      { id:4, serv:'Pisos',       forn:'Pisos & Cia',       resp:'Ana',         val:50,  rt:7.5, prob:70,  et:'prop',  obs:'Aguardando assinatura.' }
    ],
    4: [
      { id:1, serv:'Marcenaria',  forn:'Marcenaria Bianco', resp:'Rafael',      val:90,  rt:9,   prob:100, et:'win',   obs:'' },
      { id:2, serv:'Móveis soltos',forn:'Studio Móveis',    resp:'Rafael',      val:80,  rt:10,  prob:100, et:'win',   obs:'' },
      { id:3, serv:'Pintura',     forn:'ColorArt',          resp:'Ana',         val:40,  rt:5,   prob:100, et:'win',   obs:'' },
      { id:4, serv:'Iluminação',  forn:'LuxLed',            resp:'Rafael',      val:30,  rt:8,   prob:100, et:'win',   obs:'' }
    ],
    5: [
      { id:1, serv:'Marcenaria',  forn:'Marcenaria Bianco', resp:'Você (Arq.)', val:160, rt:9,   prob:30,  et:'prospec',obs:'' },
      { id:2, serv:'Pisos',       forn:'Pisos & Cia',       resp:'Você (Arq.)', val:120, rt:7.5, prob:40,  et:'negoc', obs:'' },
      { id:3, serv:'Vidraçaria',  forn:'VidroArt',          resp:'Ana',         val:90,  rt:8,   prob:20,  et:'prospec',obs:'' },
      { id:4, serv:'Iluminação',  forn:'LuxLed',            resp:'Você (Arq.)', val:70,  rt:8,   prob:25,  et:'prospec',obs:'' },
      { id:5, serv:'Pintura',     forn:'ColorArt',          resp:'Rafael',      val:60,  rt:5,   prob:100, et:'win',   obs:'' },
      { id:6, serv:'Forro/Gesso', forn:'GessoArt',          resp:'Ana',         val:50,  rt:5,   prob:100, et:'win',   obs:'' }
    ]
  };

  function read(key, fallback){
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // RT de uma oportunidade, em reais. rtTipo: 'pct' (% do valor) ou 'brl' (valor fixo em R$).
  function rtOf(o){
    if (!o) return 0;
    return o.rtTipo === 'brl' ? (Number(o.rt) || 0) : (o.val * (Number(o.rt) || 0) / 100);
  }

  // o seed está escrito em milhares (legibilidade); convertemos para reais cheios ao semear.
  function scaleOpp(o){
    var c = Object.assign({}, o);
    c.val = (o.val || 0) * 1000;
    if (o.rtTipo === 'brl') c.rt = (o.rt || 0) * 1000;
    return c;
  }

  function ensureSeed(){
    // App em produção: começa SEM projetos/dados de exemplo.
    if (read(PKEY, null) === null){ write(PKEY, []); }
  }

  window.MabeDB = {
    rtOf: rtOf,
    loadProjects: function(){ ensureSeed(); return read(PKEY, []); },
    saveProjects: function(arr){ write(PKEY, arr); },
    loadClientes: function(){ return read('mabe-clientes-v1', []); },
    saveClientes: function(arr){ write('mabe-clientes-v1', arr); },
    addCliente: function(c){
      var arr = this.loadClientes();
      c.id = arr.reduce(function(m,x){ return Math.max(m, x.id||0); }, 0) + 1;
      arr.unshift(c); this.saveClientes(arr); return c;
    },
    getCliente: function(id){ return this.loadClientes().find(function(c){ return String(c.id)===String(id); }) || null; },
    updateCliente: function(id, patch){
      var arr = this.loadClientes();
      var c = arr.find(function(x){ return String(x.id)===String(id); });
      if (c) { Object.assign(c, patch); this.saveClientes(arr); }
      return c;
    },
    loadFornecedores: function(){ return read('mabe-fornecedores-v1', []); },
    saveFornecedores: function(arr){ write('mabe-fornecedores-v1', arr); },
    // Configuração: lê uma lista de cadastro salva (responsaveis, servicos, etapas, motivos, pagamentos)
    loadConfigList: function(name, fallback){
      try{
        var raw = localStorage.getItem('mabe-config-v1');
        if(raw){ var cfg=JSON.parse(raw); if(cfg && Array.isArray(cfg[name])) return cfg[name]; }
      }catch(e){}
      return fallback || [];
    },
    loadResponsaveis: function(){
      // prioridade: usuários aprovados do sistema (login)
      if (window.MabeCloud && typeof window.MabeCloud.responsaveis === 'function'){
        var u = window.MabeCloud.responsaveis();
        if (u && u.length) return u.slice();
      }
      var arr = this.loadConfigList('responsaveis', []);
      return arr.map(function(r){ return r.nome; }).filter(Boolean);
    },
    loadServicos: function(){
      var arr = this.loadConfigList('servicos', [{nome:'Pisos'},{nome:'Vidraçaria'},{nome:'Marcenaria'},{nome:'Móveis soltos'},{nome:'Iluminação'},{nome:'Climatização'},{nome:'Pintura'},{nome:'Paisagismo'},{nome:'Automação'}]);
      return arr.map(function(s){ return s.nome; }).filter(Boolean);
    },
    addFornecedor: function(f){
      var arr = this.loadFornecedores();
      f.id = arr.reduce(function(m,x){ return Math.max(m, x.id||0); }, 0) + 1;
      arr.unshift(f); this.saveFornecedores(arr); return f;
    },
    getFornecedor: function(id){ return this.loadFornecedores().find(function(f){ return String(f.id)===String(id); }) || null; },
    updateFornecedor: function(id, patch){
      var arr = this.loadFornecedores();
      var f = arr.find(function(x){ return String(x.id)===String(id); });
      if (f) { Object.assign(f, patch); this.saveFornecedores(arr); }
      return f;
    },
    deleteFornecedor: function(id){
      var arr = this.loadFornecedores().filter(function(x){ return String(x.id)!==String(id); });
      this.saveFornecedores(arr);
    },
    getProject: function(id){ ensureSeed(); return read(PKEY, []).find(function(p){ return String(p.id) === String(id); }) || null; },
    addProject: function(p){
      var arr = this.loadProjects();
      p.id = arr.reduce(function(m,x){ return Math.max(m, x.id); }, 0) + 1;
      arr.unshift(p); this.saveProjects(arr);
      // Projetos Residencial/Comercial nascem com oportunidades padrão em Prospecção
      try { this.seedOppsPadrao(p); } catch(e) {}
      return p;
    },
    // cria oportunidades-base (em Prospecção) para projetos Residencial/Comercial
    seedOppsPadrao: function(p){
      if (!p || (p.tipo !== 'Residencial' && p.tipo !== 'Comercial')) return;
      if (this.loadOpps(p.id).length) return;   // não duplica se já houver
      var servicos = ['Marcenaria','Pisos','Vidraçaria','Móveis soltos','Automação','Cortina','Tapete','Piscina'];
      var rtPad = { 'Marcenaria':9,'Pisos':7.5,'Vidraçaria':8,'Móveis soltos':10,'Automação':9,'Cortina':6,'Tapete':6,'Piscina':8 };
      var hoje = new Date().toISOString().slice(0,10);
      var opps = servicos.map(function(s, i){
        return { id:i+1, serv:s, forn:'a definir', resp:(p.resp||'Você (Arq.)'),
          val:0, rt:(rtPad[s]||8), rtTipo:'pct', prob:20, et:'prospec', obs:'', dt:hoje };
      });
      this.saveOpps(p.id, opps);
      this.recalc(p.id);
    },
    updateProject: function(id, patch){
      var arr = this.loadProjects();
      var p = arr.find(function(x){ return String(x.id) === String(id); });
      if (!p) return null;
      Object.assign(p, patch);
      this.saveProjects(arr);
      return p;
    },
    deleteProject: function(id){
      var arr = this.loadProjects().filter(function(p){ return String(p.id) !== String(id); });
      this.saveProjects(arr);
      try { localStorage.removeItem(OKEY + id); } catch (e) {}
    },
    loadOpps: function(projId){
      ensureSeed();
      var arr = read(OKEY + projId, []);
      // migração: garante uma data (dt) em cada oportunidade, distribuída nos últimos ~10 meses
      var changed = false;
      arr.forEach(function(o){
        if (!o.dt){
          var hash = (Number(projId)*97 + (o.id||1)*13);
          var monthsAgo = hash % 10;          // 0..9 meses atrás
          var day = (hash % 27) + 1;          // 1..28
          var d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - monthsAgo);
          d.setDate(day);
          o.dt = d.toISOString().slice(0,10);
          changed = true;
        }
      });
      if (changed) write(OKEY + projId, arr);
      return arr;
    },
    saveOpps: function(projId, arr){ write(OKEY + projId, arr); },
    // recalcula resumo (op, pct, rt) do projeto a partir das oportunidades
    recalc: function(projId){
      var opps = this.loadOpps(projId);
      var arr = this.loadProjects();
      var p = arr.find(function(x){ return String(x.id) === String(projId); });
      if (!p) return;
      var won = opps.filter(function(o){ return o.et === 'win'; });
      var pipeline = opps.filter(function(o){ return o.et !== 'lost'; });
      var wonVal = won.reduce(function(a,o){ return a + o.val; }, 0);
      var pipeVal = pipeline.reduce(function(a,o){ return a + o.val; }, 0);
      p.op = opps.length;
      p.pct = pipeVal ? Math.round(wonVal / pipeVal * 100) : 0;
      p.rt = Math.round(won.reduce(function(a,o){ return a + rtOf(o); }, 0));
      this.saveProjects(arr);
    },
    resetAll: function(){
      try {
        Object.keys(localStorage).forEach(function(k){ if (k.indexOf('mabe-') === 0 && k !== 'mabe-theme') localStorage.removeItem(k); });
      } catch (e) {}
    }
  };
})();
