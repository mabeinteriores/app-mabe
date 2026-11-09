import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_EMAIL = "comercial@mabeinteriores.com.br";
const FROM = "Mabe Comercial <onboarding@resend.dev>";
const APROVAR_BASE = `${URL_}/functions/v1/aprovar-usuario`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ures } = await userClient.auth.getUser();
  if (!ures?.user) return json({ error: "nao autenticado" }, 401);

  const svc = createClient(URL_, SERVICE);
  const { data: prof } = await svc
    .from("profiles")
    .select("id,nome,email,aprovado,aprovacao_token")
    .eq("id", ures.user.id)
    .maybeSingle();

  if (!prof) return json({ skip: "sem perfil" });
  if (prof.aprovado) return json({ skip: "ja aprovado" });
  if (!RESEND) return json({ error: "RESEND_API_KEY nao configurada no Supabase" }, 500);

  const nome = (prof.nome || "").trim() || "(sem nome informado)";
  const email = prof.email || "—";
  const link = `${APROVAR_BASE}?uid=${encodeURIComponent(prof.id)}&token=${encodeURIComponent(prof.aprovacao_token)}`;
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#3a3128">
  <div style="background:#C0653A;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0"><strong style="font-size:16px">Mabe Comercial</strong></div>
  <div style="background:#F5F0EA;padding:24px;border-radius:0 0 12px 12px">
    <h2 style="margin:0 0 6px;font-size:18px">Novo pedido de acesso</h2>
    <p style="color:#6b6051;font-size:14px;margin:0 0 16px">Alguém criou uma conta e está aguardando sua autorização:</p>
    <p style="font-size:15px;margin:0 0 2px"><strong>${nome}</strong></p>
    <p style="font-size:13px;color:#6b6051;margin:0 0 20px">${email}</p>
    <a href="${link}" style="display:inline-block;background:#C0653A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:9px;font-weight:600">Aprovar acesso</a>
    <p style="color:#9a8d7d;font-size:12px;margin:22px 0 0;line-height:1.5">Se não reconhece este cadastro, é só ignorar — a pessoa não terá acesso enquanto você não aprovar.</p>
  </div>
</div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [ADMIN_EMAIL], subject: `🔔 Novo acesso pendente: ${nome}`, html }),
  });
  const out = await r.text();
  return json({ ok: r.ok, status: r.status, resp: out.slice(0, 300) });
});
