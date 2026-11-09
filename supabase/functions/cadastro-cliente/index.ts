import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const MAX_FILE = 20 * 1024 * 1024; // 20MB por arquivo
const MAX_FILES = 12;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const url = new URL(req.url);

    // ---- GET: carrega os dados da empresa por slug (só o necessário) ----
    if (req.method === 'GET') {
      const slug = (url.searchParams.get('slug') || '').trim();
      if (!slug) return json({ error: 'slug ausente' }, 400);
      const { data, error } = await admin
        .from('cadastros')
        .select('empresa, cnpj, dados_empresa, dest_nome, status')
        .eq('slug', slug)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: 'Cadastro não encontrado' }, 404);
      return json({ cadastro: data });
    }

    // ---- POST: grava a resposta do cliente + anexos ----
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as any;
      const slug = (body?.slug || '').trim();
      const resposta = body?.resposta ?? {};
      const anexos = Array.isArray(body?.anexos) ? body.anexos : [];
      if (!slug) return json({ error: 'slug ausente' }, 400);
      if (typeof resposta !== 'object') return json({ error: 'resposta inválida' }, 400);
      if (anexos.length > MAX_FILES) return json({ error: 'Muitos arquivos' }, 400);

      const { data: cad, error: e1 } = await admin
        .from('cadastros')
        .select('id, status')
        .eq('slug', slug)
        .maybeSingle();
      if (e1) return json({ error: e1.message }, 500);
      if (!cad) return json({ error: 'Cadastro não encontrado' }, 404);
      if (['homologado', 'reprovado'].includes(cad.status))
        return json({ error: 'Este cadastro já foi finalizado.' }, 409);

      // upload de anexos
      const anexoRows: any[] = [];
      for (const a of anexos) {
        if (!a?.data_base64 || !a?.nome_arquivo) continue;
        const bytes = b64ToBytes(a.data_base64);
        if (bytes.byteLength > MAX_FILE) return json({ error: `Arquivo ${a.nome_arquivo} excede 20MB` }, 400);
        const safe = String(a.nome_arquivo).replace(/[^\w.\-]+/g, '_').slice(0, 120);
        const path = `${cad.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        const { error: eUp } = await admin.storage.from('anexos').upload(path, bytes, {
          contentType: a.content_type || 'application/octet-stream',
          upsert: false,
        });
        if (eUp) return json({ error: `Falha no upload: ${eUp.message}` }, 500);
        anexoRows.push({
          cadastro_id: cad.id, campo: a.campo || null, nome_arquivo: a.nome_arquivo,
          caminho: path, tamanho: bytes.byteLength, content_type: a.content_type || null,
        });
      }
      if (anexoRows.length) {
        const { error: eA } = await admin.from('anexos').insert(anexoRows);
        if (eA) return json({ error: eA.message }, 500);
      }

      const { error: e2 } = await admin
        .from('cadastros')
        .update({ resposta, status: 'respondido', respondido_em: new Date().toISOString() })
        .eq('id', cad.id);
      if (e2) return json({ error: e2.message }, 500);

      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});
