// Envia e-mail de aviso quando um formulario e ABANDONADO (fuga).
// Chamado pelo pg_cron via net.http_post com header x-webhook-secret.
const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("LEAD_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-webhook-secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const row = payload?.record ?? payload;
    if (!row) return new Response(JSON.stringify({ error: "sem registro (record)" }), { status: 400 });

    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!RESEND) return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), { status: 500 });

    const FROM = Deno.env.get("LEAD_EMAIL_FROM") || "Camber Leads <lead@mabeinteriores.com.br>";
    const TO = (Deno.env.get("LEAD_EMAIL_TO") || "comercial@mabeinteriores.com.br")
      .split(",").map((s) => s.trim()).filter(Boolean);

    const nome = String(row.nome || "Sem nome").trim();
    const quando = row.atualizado_em
      ? new Date(row.atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "";
    const respostas = Array.isArray(row.respostas) ? row.respostas : [];

    const linhas = respostas.map((it: any) =>
      `<tr><td style="padding:6px 10px;color:#8C8475;font-size:12px;border-bottom:1px solid #eee;vertical-align:top">${esc(it?.label)}</td>` +
      `<td style="padding:6px 10px;color:#2A2620;font-size:13px;border-bottom:1px solid #eee">${esc(it?.value) || "-"}</td></tr>`
    ).join("");

    const contato = [row.telefone, row.email].map((x) => String(x || "").trim()).filter(Boolean).map(esc).join("  ·  ");

    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#2A2620;max-width:640px">` +
        `<div style="background:#6A4D2E;color:#F5F1EA;padding:16px 20px;border-radius:10px 10px 0 0">` +
          `<div style="font-size:20px;font-weight:bold">⚠️ Formulário não finalizado</div>` +
          `<div style="font-size:11px;color:#D8CBB6;letter-spacing:1.5px;margin-top:2px">CAMBER · SOLICITAÇÃO DE ORÇAMENTO</div>` +
        `</div>` +
        `<div style="border:1px solid #E2D9CC;border-top:none;border-radius:0 0 10px 10px;padding:18px 20px">` +
          `<p style="margin:0 0 2px;font-size:18px;font-weight:bold">${esc(nome)}</p>` +
          `<p style="margin:0 0 14px;color:#8C8475;font-size:13px">${contato || "sem contato informado"}</p>` +
          `<table style="width:100%;border-collapse:collapse;background:#FBFAF7;border:1px solid #ECE5D9;border-radius:8px;margin:0 0 14px">` +
            `<tr><td style="padding:6px 10px;color:#8C8475;font-size:12px;width:130px">Categoria</td><td style="padding:6px 10px;font-size:13px">${esc(row.categoria || "-")}</td></tr>` +
            `<tr><td style="padding:6px 10px;color:#8C8475;font-size:12px">Parou em</td><td style="padding:6px 10px;font-size:13px">Pergunta ${esc(row.pagina || "?")} — “${esc(row.ultima_pergunta || "-")}”</td></tr>` +
            `<tr><td style="padding:6px 10px;color:#8C8475;font-size:12px">Última atividade</td><td style="padding:6px 10px;font-size:13px">${esc(quando)}</td></tr>` +
          `</table>` +
          `<div style="font-size:11px;color:#8C8475;letter-spacing:.8px;margin:0 0 6px">RESPOSTAS ATÉ AQUI (${respostas.length})</div>` +
          `<table style="width:100%;border-collapse:collapse;border:1px solid #ECE5D9;border-radius:8px;overflow:hidden">${linhas || '<tr><td style="padding:8px 10px;color:#8C8475;font-size:13px">Nenhuma resposta capturada.</td></tr>'}</table>` +
          `<p style="margin:16px 0 0;color:#8C8475;font-size:12px">Dica: um retorno rápido no WhatsApp costuma recuperar esse lead.</p>` +
        `</div>` +
      `</div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        subject: `Formulário não finalizado - ${nome}`,
        html,
      }),
    });
    const out = await r.text();
    if (!r.ok) return new Response(JSON.stringify({ error: "resend", status: r.status, body: out }), { status: 502 });
    return new Response(JSON.stringify({ ok: true, id: row.id }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500 });
  }
});
