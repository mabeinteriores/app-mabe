// Relatorio diario do Painel + PDFs de propostas (etapa 'Proposta enviada') por projeto.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const CRON_KEY = "mabe-painel-cron-7bd91f4a2c";

function rtOf(o: any) { return o?.rtTipo === 'brl' ? (Number(o.rt) || 0) : ((Number(o?.val) || 0) * (Number(o?.rt) || 0) / 100); }
function anoAtual() { return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date())); }
function inAno(dt: string, ano: number) { if (!dt) return true; return Number(String(dt).slice(0, 4)) === ano; }
function scopeAberto(cls: string) { return cls === 'prospec' || cls === 'negoc' || cls === 'prop'; }
function fmtMil(v: number) { return 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR'); }
function fmtNum(v: number) { return Math.round(v || 0).toLocaleString('pt-BR'); }
function esc(s: any) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]); }
function safePdf(s: any) { return String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF]/g, ''); }
function trunc(s: any, font: any, size: number, maxW: number) { s = safePdf(s); if (!s) return ''; if (font.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > maxW) s = s.slice(0, -1); return s + '...'; }
function nomeArquivo(nome: string) { const s = safePdf(nome).replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60); return s || 'projeto'; }

async function buildPropostaPdf(proj: any, props: any[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 45;
  const DARK = rgb(0.149, 0.141, 0.122), ACC = rgb(0.753, 0.404, 0.247), MUT = rgb(0.55, 0.52, 0.46), INK = rgb(0.15, 0.14, 0.12), HAIR = rgb(0.905, 0.878, 0.824), ROWBG = rgb(0.976, 0.965, 0.945);
  const cols = [{ x: M, w: 140, t: 'SERVICO', r: false }, { x: M + 140, w: 130, t: 'FORNECEDOR', r: false }, { x: M + 270, w: 100, t: 'RESPONSAVEL', r: false }, { x: M + 370, w: 66, t: 'VALOR', r: true }, { x: M + 436, w: 64, t: 'RT', r: true }];
  let page: any, y = 0;
  const cell = (c: any, txt: any, yy: number, f: any, sz: number, col: any) => { txt = trunc(txt, f, sz, c.w - 8); const w = f.widthOfTextAtSize(txt, sz); const x = c.r ? (c.x + c.w - 4 - w) : (c.x + 4); page.drawText(txt, { x, y: yy, size: sz, font: f, color: col }); };
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: DARK });
    page.drawText(trunc(proj.nome || 'Projeto', bold, 16, W - 2 * M), { x: M, y: H - 44, size: 16, font: bold, color: rgb(1, 1, 1) });
    page.drawText(safePdf('Propostas enviadas  -  ' + (proj.cliente || '')), { x: M, y: H - 62, size: 9.5, font, color: rgb(0.72, 0.69, 0.62) });
    y = H - 78 - 28;
    for (const c of cols) cell(c, c.t, y, bold, 8, MUT);
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: HAIR }); y -= 17;
  };
  newPage();
  let i = 0, total = 0, totalRt = 0;
  for (const o of props) {
    if (y < M + 50) newPage();
    if (i % 2 === 1) page.drawRectangle({ x: M - 2, y: y - 5, width: W - 2 * M + 4, height: 20, color: ROWBG });
    cell(cols[0], o.serv || '-', y, font, 9.5, INK);
    cell(cols[1], o.forn || '-', y, font, 9.5, INK);
    cell(cols[2], o.resp || '-', y, font, 9.5, INK);
    cell(cols[3], fmtNum(o.val), y, font, 9.5, INK);
    cell(cols[4], fmtNum(rtOf(o)), y, font, 9.5, ACC);
    total += (o.val || 0); totalRt += rtOf(o); y -= 20; i++;
  }
  y -= 4; page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 1, color: DARK }); y -= 6;
  cell(cols[2], 'TOTAL (' + props.length + ')', y, bold, 9.5, INK);
  cell(cols[3], fmtNum(total), y, bold, 10, INK);
  cell(cols[4], fmtNum(totalRt), y, bold, 10, ACC);
  page.drawText(safePdf('Gerado automaticamente pelo app Gestao Camber'), { x: M, y: M - 22, size: 8, font, color: MUT });
  return await doc.save();
}

Deno.serve(async (req: Request) => {
  try {
    if (req.headers.get('x-cron-key') !== CRON_KEY) return new Response('unauthorized', { status: 401 });
    const body = await req.json().catch(() => ({} as any));
    const SB_URL = Deno.env.get('SUPABASE_URL')!;
    const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND = req.headers.get('x-resend-key') || Deno.env.get('RESEND_API_KEY');
    if (!RESEND) return new Response(JSON.stringify({ error: 'chave Resend ausente' }), { status: 500 });
    const FROM = Deno.env.get('PAINEL_EMAIL_FROM') || 'Gestao Camber <painel@camberinteriores.com.br>';
    const TO = (body && body.to) ? (Array.isArray(body.to) ? body.to : [body.to]) : (Deno.env.get('PAINEL_EMAIL_TO') || 'comercial@mabeinteriores.com.br').split(',').map((s) => s.trim()).filter(Boolean);
    const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

    const pr = await fetch(`${SB_URL}/rest/v1/kv_store?select=value&workspace=eq.mabe&key=eq.mabe-projects-v3`, { headers: h });
    const prj = ((await pr.json())?.[0]?.value) ?? [];
    const orr = await fetch(`${SB_URL}/rest/v1/kv_store?select=key,value&workspace=eq.mabe&key=like.mabe-opps-v3-*`, { headers: h });
    const oppRows = await orr.json();
    const opps: Record<string, any[]> = {};
    (oppRows || []).forEach((r: any) => { opps[String(r.key).replace('mabe-opps-v3-', '')] = r.value || []; });

    const ano = anoAtual();
    const byStage: any = { prospec: { v: 0, n: 0 }, negoc: { v: 0, n: 0 }, prop: { v: 0, n: 0 }, win: { v: 0, n: 0 }, lost: { v: 0, n: 0 } };
    let fech = 0, lostRt = 0, rtReal = 0, ganhoAll = 0, nFech = 0, nLost = 0, nAbertos = 0, projVal = 0;
    (prj || []).forEach((p: any) => {
      if (!scopeAberto(p.statusCls)) return;
      nAbertos++; projVal += (p.valor || 0);
      (opps[String(p.id)] || []).forEach((o: any) => {
        if (!inAno(o.dt, ano)) return;
        const rt = rtOf(o); ganhoAll += rt;
        if (byStage[o.et]) { byStage[o.et].v += (o.val || 0); byStage[o.et].n++; }
        if (o.et === 'win') { fech += (o.val || 0); rtReal += rt; nFech++; }
        if (o.et === 'lost') { lostRt += rt; nLost++; }
      });
    });
    const pct = ganhoAll ? Math.round(rtReal / ganhoAll * 100) : 0;
    const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

    // Propostas (etapa 'prop') com data prevista de fechamento: vencidas / hoje / proximas
    const hojeISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const diasDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
    const projById: Record<string, any> = {}; (prj || []).forEach((p: any) => { projById[String(p.id)] = p; });
    const prazoList: any[] = [];
    Object.keys(opps).forEach((pid) => (opps[pid] || []).forEach((o: any) => {
      if (o.et === 'prop' && o.prazo) { const p = projById[pid] || {}; prazoList.push({ proj: p.nome || ('Projeto ' + pid), serv: o.serv || '-', val: Number(o.val) || 0, prazo: String(o.prazo), dias: diasDiff(hojeISO, String(o.prazo)) }); }
    }));
    if (body && body.demo) {
      prazoList.push({ proj: 'ALBORNOZ JORDAO', serv: 'Marcenaria', val: 180000, prazo: '', dias: -3 });
      prazoList.push({ proj: 'Casa Ecoville', serv: 'Automacao', val: 38000, prazo: '', dias: -1 });
      prazoList.push({ proj: 'Residencia Alphaville', serv: 'Vidracaria', val: 92000, prazo: '', dias: 0 });
      prazoList.push({ proj: 'Apartamento Batel', serv: 'Iluminacao', val: 54000, prazo: '', dias: 4 });
    }
    const vencidas = prazoList.filter((x) => x.dias < 0).sort((a, b) => a.dias - b.dias);
    const vencemHoje = prazoList.filter((x) => x.dias === 0);
    const proximas = prazoList.filter((x) => x.dias > 0 && x.dias <= 7).sort((a, b) => a.dias - b.dias);
    const prow = (x: any, cor: string, txt: string) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #eee2d4;font-size:12.5px;color:#26241f"><b>${esc(x.proj)}</b> <span style="color:#b4ac9a">&middot; ${esc(x.serv)}</span></td><td align="right" style="padding:9px 12px;border-bottom:1px solid #eee2d4;font-size:12.5px;font-weight:bold;color:#26241f;white-space:nowrap">${esc(fmtMil(x.val))}</td><td align="right" style="padding:9px 12px;border-bottom:1px solid #eee2d4;font-size:12px;font-weight:bold;color:${cor};white-space:nowrap">${esc(txt)}</td></tr>`;
    const grp = (titulo: string, cor: string, arr: any[], fn: (x: any) => string) => arr.length ? `<tr><td colspan="3" style="padding:12px 12px 4px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:${cor};font-weight:bold">${titulo} (${arr.length})</td></tr>` + arr.map((x) => prow(x, cor, fn(x))).join('') : '';
    const prazoSection = (vencidas.length || vencemHoje.length || proximas.length) ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 6px 0;background:#fffdf9;border:1px solid #e7e0d2;border-radius:12px;overflow:hidden"><tr><td colspan="3" style="padding:14px 12px 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9a9385;font-weight:bold">Propostas &middot; previsao de fechamento</td></tr>` + grp('Vencidas', '#b1503f', vencidas, (x) => 'ha ' + (-x.dias) + (x.dias === -1 ? ' dia' : ' dias')) + grp('Vencem hoje', '#a37f1f', vencemHoje, () => 'hoje') + grp('Proximos 7 dias', '#5d7e49', proximas, (x) => 'em ' + x.dias + (x.dias === 1 ? ' dia' : ' dias')) + `</table>` : '';

    // PDFs de propostas por projeto (etapa 'prop')
    const attachments: any[] = []; const nomesAnexos: string[] = [];
    for (const p of (prj || [])) {
      const props = (opps[String(p.id)] || []).filter((o: any) => o.et === 'prop');
      if (!props.length) continue;
      const pdf = await buildPropostaPdf(p, props);
      attachments.push({ filename: nomeArquivo(p.nome) + '.pdf', content: encodeBase64(pdf) });
      nomesAnexos.push(p.nome);
    }
    if (body && body.demo) {
      const dp = { nome: 'Residencia Exemplo (DEMO)', cliente: 'Cliente Exemplo' };
      const dpr = [{ serv: 'Marcenaria', forn: 'Marcenaria Bianco', resp: 'Joao Silva', val: 180000, rt: 9, rtTipo: 'pct' }, { serv: 'Vidracaria', forn: 'VidroArt', resp: 'Ana Prado', val: 92000, rt: 8, rtTipo: 'pct' }, { serv: 'Iluminacao', forn: 'LuxLed', resp: 'Rafael', val: 54000, rt: 8, rtTipo: 'pct' }];
      const pdf = await buildPropostaPdf(dp, dpr);
      attachments.push({ filename: nomeArquivo(dp.nome) + '.pdf', content: encodeBase64(pdf) });
      nomesAnexos.push(dp.nome);
    }

    const kpis = [
      { t: 'Total dos projetos', v: fmtMil(projVal), s: nAbertos + (nAbertos === 1 ? ' obra' : ' obras'), c: '#26241f' },
      { t: 'Total investido', v: fmtMil(fech), s: nFech + ' oportunidades', c: '#5d7e49' },
      { t: 'Montando Orcamentos', v: fmtMil(byStage.prospec.v), s: byStage.prospec.n + ' oportunidades', c: '#a37f1f' },
      { t: 'Total perdido', v: fmtMil(lostRt), s: 'RT de ' + nLost + ' perdidas', c: '#b1503f' },
      { t: 'RT realizado', v: fmtMil(rtReal), s: 'comissao do fechado', c: '#c0673f' },
      { t: '% Fechado', v: pct + '%', s: 'RT realizada / ganho possivel', c: '#26241f' },
    ];
    const card = (k: any) => `<td width="50%" valign="top" style="padding:6px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#fffdf9;border:1px solid #e7e0d2;border-radius:12px;padding:14px 15px"><div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#9a9385;font-weight:bold">${esc(k.t)}</div><div style="font-size:22px;font-weight:bold;color:${k.c};margin-top:6px">${esc(k.v)}</div><div style="font-size:11.5px;color:#6f6a60;margin-top:3px">${esc(k.s)}</div></td></tr></table></td>`;
    let kpiRows = '';
    for (let i = 0; i < kpis.length; i += 2) kpiRows += `<tr>${card(kpis[i])}${kpis[i + 1] ? card(kpis[i + 1]) : '<td width="50%"></td>'}</tr>`;
    const hero = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:6px 6px 0"><tr><td style="background:#c0673f;border-radius:12px;padding:16px 18px"><div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#f2e1d5;font-weight:bold">Ganho possivel</div><div style="font-size:26px;font-weight:bold;color:#fff;margin-top:4px">${esc(fmtMil(ganhoAll))}</div><div style="font-size:11.5px;color:#f2e1d5;margin-top:3px">RT de todas as oportunidades (inclui perdidas)</div></td></tr></table>`;
    const SL: any = { prospec: 'Prospeccao', negoc: 'Montando Orcamentos', prop: 'Proposta enviada', win: 'Fechado / Ganho', lost: 'Perdido' };
    const funil = ['prospec', 'negoc', 'prop', 'win', 'lost'].map((k) => `<tr><td style="font-size:12.5px;color:#6f6a60;padding:5px 0">${SL[k]}</td><td align="right" style="font-size:12.5px;font-weight:bold;color:#26241f;padding:5px 0">${esc(fmtMil(byStage[k].v))}</td><td align="right" style="font-size:11.5px;color:#9a9385;padding:5px 0 5px 12px">${byStage[k].n} op.</td></tr>`).join('');
    const anexoNota = nomesAnexos.length ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 6px 0"><tr><td style="background:#f2e1d5;border:1px solid #e2c9b6;border-radius:12px;padding:14px 16px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a44e29;font-weight:bold;margin-bottom:6px">Anexos - Propostas enviadas</div><div style="font-size:12.5px;color:#6f4a30">${nomesAnexos.map((n) => '&bull; ' + esc(n) + '.pdf').join('<br>')}</div></td></tr></table>` : '';
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f1ea;padding:22px 0;color:#26241f"><div style="max-width:600px;margin:0 auto;padding:0 12px">` +
      `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#26241f;border-radius:12px;padding:18px 20px"><div style="font-size:18px;font-weight:bold;color:#fff">Gestao Camber - Relatorio do Painel</div><div style="font-size:13px;color:#b4ac9a;margin-top:2px">${hoje} &middot; Projetos em aberto: <b style="color:#fff">${nAbertos}</b></div></td></tr></table>` +
      `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${kpiRows}</table>` +
      hero +
      `<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 6px 0"><tr><td style="background:#fffdf9;border:1px solid #e7e0d2;border-radius:12px;padding:14px 16px"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9a9385;font-weight:bold;margin-bottom:8px">Funil de oportunidades</div><table width="100%" cellpadding="0" cellspacing="0">${funil}</table></td></tr></table>` +
      prazoSection +
      anexoNota +
      `<div style="text-align:center;color:#9a9385;font-size:11px;margin-top:18px">Enviado automaticamente pelo app Gestao Camber &middot; ${hoje}</div>` +
      `</div></div>`;

    const emailBody: any = { from: FROM, to: TO, subject: `Relatorio do Painel - ${hoje}`, html };
    if (attachments.length) emailBody.attachments = attachments;
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify(emailBody) });
    const out = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ error: 'resend', status: r.status, body: out }), { status: 502 });
    return new Response(JSON.stringify({ ok: true, enviado_para: TO, anexos: nomesAnexos, qtd_anexos: attachments.length, propostas_prazo: { vencidas: vencidas.length, hoje: vencemHoje.length, proximas: proximas.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500 });
  }
});
