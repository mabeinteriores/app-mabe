import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function page(titulo: string, msg: string, cor: string): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#F5F0EA;color:#3a3128;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center;max-width:440px;padding:24px">
<div style="width:56px;height:56px;border-radius:14px;background:${cor};color:#fff;font-weight:700;font-size:26px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px">M</div>
<h1 style="font-size:21px;margin:0 0 8px">${titulo}</h1>
<p style="color:#6b6051;font-size:14px;line-height:1.5">${msg}</p>
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const uid = url.searchParams.get("uid");
  const token = url.searchParams.get("token");
  if (!uid || !token) return page("Link inválido", "Faltam dados no link de aprovação.", "#b3402a");

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: prof, error } = await sb
    .from("profiles")
    .select("id,nome,email,aprovado,aprovacao_token")
    .eq("id", uid)
    .maybeSingle();

  if (error || !prof || prof.aprovacao_token !== token) {
    return page("Link inválido", "Este link de aprovação não é válido ou expirou.", "#b3402a");
  }
  if (prof.aprovado) {
    return page("Já estava liberado", `${prof.email} já tinha acesso ao sistema.`, "#2e7d32");
  }
  await sb.from("profiles").update({ aprovado: true }).eq("id", uid);
  return page("Acesso liberado! ✅", `${prof.nome || prof.email} já pode entrar no Mabe Comercial.`, "#2e7d32");
});
