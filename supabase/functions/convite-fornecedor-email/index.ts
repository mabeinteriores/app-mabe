// Notifica o time sobre convites de fornecedor.
// tipo='respondido' (fornecedor enviou) | tipo='expirado_7d' (7 dias sem resposta).
// MODO TESTE: destinatario fixo abaixo (trocar pelo e-mail real depois).
const TEST_TO = "rafael@ecomet.com.br";

const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("LEAD_WEBHOOK_SECRET");
    if (secret && req.headers.get("x-webhook-secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
    const payload = await req.json().catch(() => ({}));
    const tipo = String(payload?.tipo || "respondido");
    const r = payload?.record ?? {};

    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!RESEND) return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), { status: 500 });
    const FROM = Deno.env.get("LEAD_EMAIL_FROM") || "Camber <lead@mabeinteriores.com.br>";
    const TO = (Deno.env.get("FORN_CONVITE_TO") || TEST_TO).split(",").map((s) => s.trim()).filter(Boolean);

    let subject = "";
    let html = "";

    if (tipo === "expirado_7d") {
      subject = `Fornecedor nao preencheu em 7 dias${r.nome_hint ? " - " + r.nome_hint : ""}`;
      html =
        `<div style="font-family:Arial,Helvetica,sans-serif;color:#2A2620;max-width:620px">` +
        `<div style="background:#8a6d3b;color:#F5F1EA;padding:16px 20px;border-radius:10px 10px 0 0">` +
        `<div style="font-size:20px;font-weight:bold">⏰ Fornecedor ainda nao preencheu</div>` +
        `<div style="font-size:11px;color:#e6d9bf;letter-spacing:1.5px;margin-top:2px">CAMBER · CONVITE DE FORNECEDOR</div></div>` +
        `<div style="border:1px solid #E2D9CC;border-top:none;border-radius:0 0 10px 10px;padding:18px 20px">` +
        `<p style="margin:0 0 8px;font-size:15px">O link enviado ao fornecedor <b>${esc(r.nome_hint || "(sem nome)")}</b> completou <b>7 dias</b> sem resposta.</p>` +
        `<p style="margin:0;color:#8C8475;font-size:13px">Convite criado em: ${esc(r.created_at || "-")}</p>` +
        `<p style="margin:14px 0 0;color:#8C8475;font-size:12px">Dica: reenvie o link ou fale com ele no WhatsApp.</p></div></div>`;
    } else {
      subject = `Fornecedor preencheu o cadastro - ${esc(r.nome || "novo fornecedor")}`;
      const linha = (rot: string, val: unknown) =>
        `<tr><td style="padding:6px 10px;color:#8C8475;font-size:12px;width:140px">${rot}</td>` +
        `<td style="padding:6px 10px;color:#2A2620;font-size:13px">${esc(val) || "-"}</td></tr>`;
      html =
        `<div style="font-family:Arial,Helvetica,sans-serif;color:#2A2620;max-width:620px">` +
        `<div style="background:#4f6f3b;color:#F5F1EA;padding:16px 20px;border-radius:10px 10px 0 0">` +
        `<div style="font-size:20px;font-weight:bold">✅ Fornecedor preencheu o cadastro</div>` +
        `<div style="font-size:11px;color:#d7e6c9;letter-spacing:1.5px;margin-top:2px">CAMBER · AUTO-CADASTRO POR LINK</div></div>` +
        `<div style="border:1px solid #E2D9CC;border-top:none;border-radius:0 0 10px 10px;padding:18px 20px">` +
        `<p style="margin:0 0 12px;font-size:13px;color:#8C8475">Ja foi cadastrado automaticamente na aba Fornecedores. Confira/complete os dados (RT, endereco, etc.).</p>` +
        `<table style="width:100%;border-collapse:collapse;background:#FBFAF7;border:1px solid #ECE5D9;border-radius:8px">` +
        linha("Razao social", r.nome) + linha("Nome fantasia", r.fantasia) + linha("CNPJ", r.doc) +
        linha("Categoria/servico", r.categoria) + linha("Contato", r.contato) +
        linha("Telefone", r.tel) + linha("E-mail", r.email) +
        `</table></div></div>`;
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: TO, subject, html }),
    });
    const out = await resp.text();
    if (!resp.ok) return new Response(JSON.stringify({ error: "resend", status: resp.status, body: out }), { status: 502 });
    return new Response(JSON.stringify({ ok: true, tipo, to: TO }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500 });
  }
});
