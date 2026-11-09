import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const BROWN  = rgb(0.416, 0.302, 0.180);
const CREAM  = rgb(0.957, 0.945, 0.918);
const SAND   = rgb(0.82, 0.78, 0.69);
const INK    = rgb(0.165, 0.149, 0.125);
const LABEL  = rgb(0.50, 0.45, 0.37);
const ANSWER = rgb(0.20, 0.18, 0.15);
const MUT    = rgb(0.549, 0.518, 0.459);
const CARDBG = rgb(0.984, 0.980, 0.965);
const CARDBR = rgb(0.886, 0.859, 0.812);

function safe(s: string): string {
  return String(s ?? "")
    .replace(/–|—/g, "-").replace(/‘|’/g, "'").replace(/“|”/g, '"').replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}
function spaced(s: string, n = 1): string { return safe(s).split("").join(" ".repeat(n)); }
function wrap(text: string, font: any, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).replace(/\r/g, "").split(/\n/)) {
    if (para === "") { out.push(""); continue; }
    let cur = "";
    for (const w of para.split(/\s+/)) {
      const test = cur ? cur + " " + w : w;
      if (cur && font.widthOfTextAtSize(test, size) > maxW) { out.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) out.push(cur);
  }
  return out;
}
function rrPath(w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

const PAD = 13, LSIZE = 8.5, LLH = 11, ASIZE = 11, ALH = 14;

async function buildPdf(row: any, leadNo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 50;
  let page = doc.addPage([W, H]);
  let y = H, pageNum = 1;
  const maxW = W - M * 2;
  const colGap = 14;
  const cardW = (maxW - colGap) / 2;

  const header = () => {
    page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BROWN });
    page.drawText("camber", { x: M, y: H - 54, size: 30, font: bold, color: CREAM });
    page.drawText(spaced("DESIGN DE INTERIORES", 1), { x: M + 2, y: H - 70, size: 7, font, color: SAND });
    const tag = spaced("LEAD No " + (leadNo || "-"), 1);
    page.drawText(tag, { x: W - M - font.widthOfTextAtSize(tag, 9), y: H - 50, size: 9, font: bold, color: CREAM });
    const sub = spaced("SOLICITACAO DE ORCAMENTO", 1);
    page.drawText(sub, { x: W - M - font.widthOfTextAtSize(sub, 7), y: H - 66, size: 7, font, color: SAND });
    y = H - 92 - 30;
  };
  const footer = () => {
    page.drawLine({ start: { x: M, y: M - 14 }, end: { x: W - M, y: M - 14 }, thickness: 0.5, color: CARDBR });
    page.drawText(safe("Camber Design de Interiores  -  camberinteriores.com.br"), { x: M, y: M - 26, size: 8, font, color: MUT });
    const pg = "Pagina " + pageNum;
    page.drawText(pg, { x: W - M - font.widthOfTextAtSize(pg, 8), y: M - 26, size: 8, font, color: MUT });
  };
  const newPage = () => { footer(); page = doc.addPage([W, H]); pageNum++; header(); };

  header();

  page.drawText(safe(row.nome || "Sem nome"), { x: M, y, size: 18, font: bold, color: INK }); y -= 18;
  const dt = row.created_at ? new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  const line = [row.telefone, dt ? "Recebido em " + dt : ""].filter(Boolean).map(safe).join("    |    ");
  if (line) { page.drawText(line, { x: M, y, size: 10, font, color: MUT }); y -= 14; }
  y -= 14;

  const cardLines = (item: any) => ({
    L: wrap(item?.label || "", font, LSIZE, cardW - 2 * PAD),
    A: wrap(item?.value || "-", font, ASIZE, cardW - 2 * PAD),
  });
  const cardH = (cl: any) => PAD + cl.L.length * LLH + 5 + cl.A.length * ALH + PAD - 4;
  const drawCard = (x: number, top: number, h: number, cl: any) => {
    page.drawSvgPath(rrPath(cardW, h, 9), { x, y: top, color: CARDBG, borderColor: CARDBR, borderWidth: 0.8 });
    let cy = top - PAD;
    for (const l of cl.L) { page.drawText(l, { x: x + PAD, y: cy - LSIZE, size: LSIZE, font, color: LABEL }); cy -= LLH; }
    cy -= 5;
    for (const l of cl.A) { page.drawText(l, { x: x + PAD, y: cy - ASIZE, size: ASIZE, font, color: ANSWER }); cy -= ALH; }
  };

  const summary = Array.isArray(row.summary) ? row.summary : [];
  for (let i = 0; i < summary.length; i += 2) {
    const lc = cardLines(summary[i]);
    const rc = summary[i + 1] ? cardLines(summary[i + 1]) : null;
    const rowH = Math.max(cardH(lc), rc ? cardH(rc) : 0);
    if (y - rowH < M + 22) newPage();
    drawCard(M, y, rowH, lc);
    if (rc) drawCard(M + cardW + colGap, y, rowH, rc);
    y -= rowH + 12;
  }
  footer();
  return await doc.save();
}

// Numero do lead: AAA (sequencia no mes) + BB (mes) + CC (ano), fuso America/Sao_Paulo
async function computeLeadNo(row: any): Promise<string> {
  const created = row.created_at ? new Date(row.created_at) : new Date();
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
  const [yy, mm] = f.format(created).split("-");           // ex.: "2026", "06"
  const monthStart = new Date(`${yy}-${mm}-01T00:00:00-03:00`).toISOString();
  let ny = +yy, nm = +mm + 1; if (nm > 12) { nm = 1; ny++; }
  const monthEnd = new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();

  let seq = 1;
  const SB_URL = Deno.env.get("SUPABASE_URL");
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (SB_URL && SB_KEY && row.id != null) {
    try {
      const url = `${SB_URL}/rest/v1/respostas?select=id&created_at=gte.${encodeURIComponent(monthStart)}&created_at=lt.${encodeURIComponent(monthEnd)}&id=lte.${row.id}`;
      const r = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length > 0) seq = arr.length;
    } catch (_e) { /* mantem seq=1 */ }
  }
  return String(seq).padStart(3, "0") + mm + String(+yy % 100).padStart(2, "0");
}

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("LEAD_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-webhook-secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const row = payload?.record ?? payload;
    if (!row || row.id == null) {
      return new Response(JSON.stringify({ error: "sem registro (record)" }), { status: 400 });
    }

    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!RESEND) return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), { status: 500 });

    // NOTA: o endereco continua @mabeinteriores.com.br porque so esse dominio esta
    // verificado no Resend. Trocar para @camberinteriores.com.br exige verificar o
    // dominio novo no Resend (DNS) - senao o envio para de funcionar.
    const FROM = Deno.env.get("LEAD_EMAIL_FROM") || "Camber Leads <lead@mabeinteriores.com.br>";
    const TO = (Deno.env.get("LEAD_EMAIL_TO") || "comercial@mabeinteriores.com.br")
      .split(",").map((s) => s.trim()).filter(Boolean);

    const leadNo = await computeLeadNo(row);
    const pdf = await buildPdf(row, leadNo);
    const b64 = encodeBase64(pdf);
    const nome = row.nome || "Cliente";
    const quando = row.created_at ? new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#2A2620">` +
      `<h2 style="color:#6A4D2E;margin:0 0 4px">Novo lead ${leadNo}</h2>` +
      `<p style="margin:0 0 12px;color:#8C8475">${nome}</p>` +
      `<p style="margin:0 0 4px"><b>Telefone:</b> ${row.telefone || "-"}</p>` +
      `<p style="margin:0 0 4px"><b>Recebido em:</b> ${quando}</p>` +
      `<p style="margin:14px 0 0;color:#8C8475">O formulario completo esta no PDF anexo.</p></div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        subject: `Novo lead ${leadNo} - ${nome}`,
        html,
        attachments: [{ filename: `lead-${leadNo}.pdf`, content: b64 }],
      }),
    });
    const out = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ error: "resend", status: r.status, body: out }), { status: 502 });
    return new Response(JSON.stringify({ ok: true, id: row.id, leadNo }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500 });
  }
});
