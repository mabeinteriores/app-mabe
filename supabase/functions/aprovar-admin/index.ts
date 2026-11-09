import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ABAS_VALIDAS = ["painel","precificacao","projetos","clientes","fornecedores","indicacoes","lead","config"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown) => new Response(JSON.stringify(obj), { headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const auth = req.headers.get("Authorization") || "";
  const uc = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: ures } = await uc.auth.getUser();
  if (!ures?.user) return json({ error: "Nao autenticado." });

  const svc = createClient(URL_, SERVICE);
  const { data: me } = await svc.from("profiles").select("papel").eq("id", ures.user.id).maybeSingle();
  if (!me || me.papel !== "admin") return json({ error: "Acesso restrito — somente administradores." });

  let body: any = {};
  try { body = await req.json(); } catch { /* sem body */ }
  const action = body?.action;
  const targetId = body?.user_id;

  if (action === "list") {
    const { data } = await svc
      .from("profiles")
      .select("id,nome,email,papel,aprovado,abas_permitidas,solicitado_em,created_at")
      .order("aprovado", { ascending: true })
      .order("created_at", { ascending: false });
    return json({ users: data || [], me: ures.user.id, abas: ABAS_VALIDAS });
  }

  if (!targetId) return json({ error: "user_id ausente." });

  if (action === "approve") {
    await svc.from("profiles").update({ aprovado: true }).eq("id", targetId);
    return json({ ok: true });
  }
  if (action === "revoke") {
    if (targetId === ures.user.id) return json({ error: "Voce nao pode bloquear a propria conta." });
    await svc.from("profiles").update({ aprovado: false }).eq("id", targetId);
    return json({ ok: true });
  }
  if (action === "make_admin") {
    await svc.from("profiles").update({ papel: "admin", aprovado: true }).eq("id", targetId);
    return json({ ok: true });
  }
  if (action === "remove_admin") {
    if (targetId === ures.user.id) return json({ error: "Voce nao pode remover o proprio admin." });
    await svc.from("profiles").update({ papel: "arquiteto" }).eq("id", targetId);
    return json({ ok: true });
  }
  if (action === "set_abas") {
    const abas = Array.isArray(body.abas) ? body.abas.filter((a: string) => ABAS_VALIDAS.indexOf(a) >= 0) : [];
    await svc.from("profiles").update({ abas_permitidas: abas }).eq("id", targetId);
    return json({ ok: true, abas });
  }
  if (action === "delete") {
    if (targetId === ures.user.id) return json({ error: "Voce nao pode excluir a propria conta." });
    const { error } = await svc.auth.admin.deleteUser(targetId);
    if (error) return json({ error: "Falha ao excluir: " + error.message });
    return json({ ok: true });
  }
  return json({ error: "Acao invalida." });
});
