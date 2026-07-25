import { createClient } from '@supabase/supabase-js';

// Cliente server-side, com Service Role key — só é importado dentro de
// pages/api/**, nunca em código que roda no browser. As chaves nunca são
// expostas ao cliente (variáveis de ambiente sem prefixo NEXT_PUBLIC_).
let cached = null;

export function supabaseAdmin() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas nas variáveis de ambiente da Vercel.'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// Helper padrão pra rotas de API: nunca deixa um erro inesperado virar
// um 500 sem corpo — sempre volta { error: mensagem } com o status certo.
export function apiError(res, status, message, extra) {
  return res.status(status).json({ error: message, ...(extra || {}) });
}
