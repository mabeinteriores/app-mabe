import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY');
// Remetente. Requer domínio verificado no Resend. Configurável por secret.
const FROM = Deno.env.get('CADASTRO_EMAIL_FROM') || 'Ecomet <cadastrofornecedor@ecomet.com.br>';
const REPLY_TO = Deno.env.get('CADASTRO_EMAIL_REPLYTO') || 'cadastrofornecedor@ecomet.com.br';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não suportado' }, 405);
  if (!RESEND) return json({ error: 'RESEND_API_KEY ausente no projeto' }, 500);

  try {
    const body = await req.json().catch(() => ({} as any));
    const slug = (body?.slug || '').trim();
    const link = (body?.link || '').trim();
    if (!slug || !link) return json({ error: 'slug e link são obrigatórios' }, 400);
    if (!/^https?:\/\//i.test(link)) return json({ error: 'link inválido' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: cad, error } = await admin
      .from('cadastros')
      .select('empresa, dest_nome, dest_email')
      .eq('slug', slug)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!cad) return json({ error: 'Cadastro não encontrado' }, 404);
    if (!cad.dest_email) return json({ error: 'Este cadastro não tem e-mail de destinatário.' }, 400);

    const nome = cad.dest_nome || '';
    const empresa = cad.empresa || 'sua empresa';
    const saud = nome ? `Olá ${esc(nome)},` : 'Olá,';

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1C2530;max-width:560px;margin:0 auto">
      <div style="background:#1E2A35;padding:22px 24px;border-radius:12px 12px 0 0">
        <div style="font-family:Arial;font-weight:bold;font-size:20px;letter-spacing:2px;color:#fff">ECOMET</div>
        <div style="font-size:12px;color:#A9B2BB;margin-top:2px">Reciclagem de metais não ferrosos</div>
      </div>
      <div style="border:1px solid #E7E4DE;border-top:none;border-radius:0 0 12px 12px;padding:26px 24px">
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${saud}</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#525b64">Para começarmos a negociar com <b>${esc(empresa)}</b>, precisamos do cadastro de fornecedor. É rápido — os dados da sua empresa já vêm preenchidos. É só conferir e completar o restante.</p>
        <p style="margin:0 0 22px"><a href="${esc(link)}" style="background:#B7623B;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 26px;border-radius:9px;display:inline-block">Preencher meu cadastro</a></p>
        <p style="margin:0 0 6px;font-size:12.5px;color:#8A9099">Ou copie e cole este link no navegador:</p>
        <p style="margin:0 0 18px;font-size:12.5px;color:#B7623B;word-break:break-all">${esc(link)}</p>
        <p style="margin:0;font-size:13px;color:#8A9099;line-height:1.5">Atenciosamente,<br>Equipe Ecomet</p>
      </div>
    </div>`;

    const text = `${saud}\n\nPara começarmos a negociar com ${empresa}, precisamos do seu cadastro de fornecedor.\nAcesse: ${link}\n\nAtenciosamente,\nEquipe Ecomet`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [cad.dest_email],
        reply_to: REPLY_TO,
        subject: 'Cadastro de fornecedor — Ecomet',
        html,
        text,
      }),
    });
    const out = await r.text();
    if (!r.ok) return json({ error: 'resend', status: r.status, body: out }, 502);
    return json({ ok: true, to: cad.dest_email });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
