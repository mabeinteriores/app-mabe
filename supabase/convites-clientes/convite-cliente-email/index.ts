Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("LEAD_WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("unauthorized", {status:401});
  const payload = await req.json().catch(() => ({}));
  const reminder = payload.tipo === "expirado_7d";
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return new Response("Email indisponivel", {status:503});
  const to = (Deno.env.get("FORN_CONVITE_TO") || "rafael@ecomet.com.br").split(",").map(s=>s.trim()).filter(Boolean);
  const response = await fetch("https://api.resend.com/emails", {
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({
      from:Deno.env.get("LEAD_EMAIL_FROM") || "Camber <lead@mabeinteriores.com.br>",
      to,
      subject:reminder ? "Camber: convite de cliente sem resposta ha 7 dias" : "Camber: novo cadastro de cliente recebido",
      html:'<p>'+ (reminder ? 'Um convite de cliente aguarda resposta ha 7 dias.' : 'Um cliente preencheu o cadastro. Confira os dados e conclua o cadastro no aplicativo.') + '</p><p><a href="http://app.camberinteriores.com.br/clientes.html">Abrir Clientes no Camber</a></p>'
    })
  });
  return new Response(JSON.stringify({ok:response.ok}), {status:response.ok?200:502,headers:{"Content-Type":"application/json"}});
});

