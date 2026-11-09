// E-mail as 09:00 (BRT): avisa que ha proposta(s) com previsao de fechamento HOJE.
// Corpo do e-mail so com a frase; todos os dados vao no PDF anexo (A4 vertical).
// Nome do PDF = nomes dos projetos (Title Case) separados por ' - '.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const CRON_KEY = "mabe-aviso-fech-cron-3e8a1d";

function rtOf(o: any) { return o?.rtTipo === 'brl' ? (Number(o.rt) || 0) : ((Number(o?.val) || 0) * (Number(o?.rt) || 0) / 100); }
function fmtNum(v: number) { return Math.round(v || 0).toLocaleString('pt-BR'); }
function hojeISO() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function hojeBR() { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()); }
function diasDiff(a: string, b: string) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function fmtDataBR(iso: string) { if (!iso) return '-'; const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '-'; }
function titleCase(s: any) { return String(s ?? '').toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function nomeArquivoProjetos(nomes: string[]) {
  const uniq: string[] = [];
  nomes.map((n) => titleCase(n)).forEach((n) => { if (n && !uniq.includes(n)) uniq.push(n); });
  let base = uniq.join(' - ').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  if (base.length > 120) base = base.slice(0, 117).trim() + '...';
  return (base || 'Controle comercial') + '.pdf';
}
function safePdf(s: any) { return String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\xFF]/g, ''); }
function trunc(s: any, font: any, size: number, maxW: number) { s = safePdf(s); if (!s) return ''; if (font.widthOfTextAtSize(s, size) <= maxW) return s; while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > maxW) s = s.slice(0, -1); return s + '...'; }

async function buildAvisoPdf(list: any[], dataBR: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 45; // A4 retrato (vertical)
  const DARK = rgb(0.149, 0.141, 0.122), ACC = rgb(0.753, 0.404, 0.247), MUT = rgb(0.55, 0.52, 0.46), INK = rgb(0.15, 0.14, 0.12), HAIR = rgb(0.905, 0.878, 0.824), ROWBG = rgb(0.976, 0.965, 0.945);
  const cols = [{ x: M, w: 150, t: 'PROJETO', r: false }, { x: M + 150, w: 112, t: 'SERVICO', r: false }, { x: M + 262, w: 92, t: 'DATA ORC.', r: false }, { x: M + 354, w: 56, t: 'DIAS', r: true }, { x: M + 410, w: 90, t: 'VALOR', r: true }];
  let page: any, y = 0;
  const cell = (c: any, txt: any, yy: number, f: any, sz: number, col: any) => { txt = trunc(txt, f, sz, c.w - 8); const w = f.widthOfTextAtSize(txt, sz); const x = c.r ? (c.x + c.w - 4 - w) : (c.x + 4); page.drawText(txt, { x, y: yy, size: sz, font: f, color: col }); };
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 82, width: W, height: 82, color: DARK });
    page.drawText(safePdf('Previsao de fechamento hoje'), { x: M, y: H - 46, size: 16, font: bold, color: rgb(1, 1, 1) });
    page.drawText(safePdf(dataBR + '  -  ' + list.length + (list.length === 1 ? ' proposta' : ' propostas')), { x: M, y: H - 64, size: 9.5, font, color: rgb(0.72, 0.69, 0.62) });
    y = H - 82 - 28;
    for (const c of cols) cell(c, c.t, y, bold, 8, MUT);
    y -= 6; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: HAIR }); y -= 17;
  };
  newPage();
  let i = 0, total = 0, totalRt = 0;
  for (const o of list) {
    if (y < M + 50) newPage();
    if (i % 2 === 1) page.drawRectangle({ x: M - 2, y: y - 5, width: W - 2 * M + 4, height: 20, color: ROWBG });
    cell(cols[0], o.proj || '-', y, font, 9.5, INK);
    cell(cols[1], o.serv || '-', y, font, 9.5, INK);
    cell(cols[2], fmtDataBR(o.dt), y, font, 9.5, INK);
    cell(cols[3], (o.dt ? o.dias + 'd' : '-'), y, font, 9.5, ACC);
    cell(cols[4], fmtNum(o.val), y, font, 9.5, INK);
    total += (o.val || 0); totalRt += (o.rt || 0); y -= 20; i++;
  }
  y -= 4; page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 1, color: DARK }); y -= 6;
  cell(cols[1], 'TOTAL (' + list.length + ')', y, bold, 9.5, INK);
  cell(cols[4], fmtNum(total), y, bold, 10, INK);
  page.drawText(safePdf('RT total: ' + fmtNum(totalRt)), { x: M, y: y - 16, size: 9, font, color: ACC });
  page.drawText(safePdf('Gerado automaticamente pelo app Gestao Camber - ' + dataBR), { x: M, y: M - 22, size: 8, font, color: MUT });
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
    const hoje = hojeISO();

    const pr = await fetch(`${SB_URL}/rest/v1/kv_store?select=value&workspace=eq.mabe&key=eq.mabe-projects-v3`, { headers: h });
    const prj = ((await pr.json())?.[0]?.value) ?? [];
    const orr = await fetch(`${SB_URL}/rest/v1/kv_store?select=key,value&workspace=eq.mabe&key=like.mabe-opps-v3-*`, { headers: h });
    const oppRows = await orr.json();
    const opps: Record<string, any[]> = {};
    (oppRows || []).forEach((r: any) => { opps[String(r.key).replace('mabe-opps-v3-', '')] = r.value || []; });

    const projNome: Record<string, any> = {};
    (prj || []).forEach((p: any) => { projNome[String(p.id)] = p; });
    const hojeList: any[] = [];
    Object.keys(opps).forEach((pid) => {
      (opps[pid] || []).forEach((o: any) => {
        if (o.et === 'prop' && o.prazo && String(o.prazo) === hoje) {
          const p = projNome[pid] || {};
          const dt = o.dt ? String(o.dt).slice(0, 10) : '';
          hojeList.push({ proj: p.nome || ('Projeto ' + pid), serv: o.serv || '-', val: Number(o.val) || 0, rt: rtOf(o), dt, dias: dt ? diasDiff(dt, hoje) : null });
        }
      });
    });

    if (body && body.demo) {
      hojeList.push({ proj: 'ALBORNOZ JORDAO', serv: 'Marcenaria', val: 180000, rt: 16200, dt: '2026-06-19', dias: diasDiff('2026-06-19', hoje) });
      hojeList.push({ proj: 'Residencia Alphaville', serv: 'Vidracaria', val: 92000, rt: 7360, dt: '2026-06-24', dias: diasDiff('2026-06-24', hoje) });
      hojeList.push({ proj: 'Apartamento Batel', serv: 'Iluminacao', val: 54000, rt: 4320, dt: '2026-05-30', dias: diasDiff('2026-05-30', hoje) });
    }

    if (!hojeList.length) {
      return new Response(JSON.stringify({ ok: true, enviado: false, motivo: 'nenhuma proposta com previsao de fechamento hoje', data: hoje }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#26241f;padding:24px 20px">Relatório automático de controle comercial.</div>`;

    const pdf = await buildAvisoPdf(hojeList, hojeBR());
    const nomePdf = nomeArquivoProjetos(hojeList.map((o) => o.proj));
    const emailBody: any = { from: FROM, to: TO, subject: `Relatório automático de controle comercial - ${hojeBR()}`, html, attachments: [{ filename: nomePdf, content: encodeBase64(pdf) }] };
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify(emailBody) });
    const out = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ error: 'resend', status: r.status, body: out }), { status: 502 });
    return new Response(JSON.stringify({ ok: true, enviado: true, enviado_para: TO, qtd: hojeList.length, arquivo_pdf: nomePdf, data: hoje }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500 });
  }
});
