import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  if (!process.env.APIFY_TOKEN || !process.env.APIFY_ACTOR_ID) {
    return apiError(
      res,
      501,
      'Busca automática de leads (Apify) não configurada ainda. Adicione APIFY_TOKEN e APIFY_ACTOR_ID nas variáveis de ambiente da Vercel, ou cadastre leads manualmente por enquanto.'
    );
  }

  const { niche, city } = req.body || {};
  if (!niche || !city) {
    return apiError(res, 400, 'Informe "niche" e "city".');
  }

  try {
    const db = supabaseAdmin();
    const { data: run, error: runErr } = await db
      .from('prospeccao_runs')
      .insert({ niche_slug: niche, city, source: 'manual', status: 'running' })
      .select()
      .single();
    if (runErr) return apiError(res, 500, `Falha ao criar run: ${runErr.message}`);

    const { data: nicheRow } = await db.from('prospeccao_niches').select('*').eq('slug', niche).single();
    const searchString = (nicheRow?.gmaps_query || `${niche} em {cidade}`).replace('{cidade}', city);

    const apifyResp = await fetch(
      `https://api.apify.com/v2/acts/${process.env.APIFY_ACTOR_ID}/runs?token=${process.env.APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [searchString],
          maxCrawledPlacesPerSearch: 30,
          language: 'pt-BR',
          includeWebResults: false,
        }),
      }
    );

    if (!apifyResp.ok) {
      const errBody = await apifyResp.text();
      await db.from('prospeccao_runs').update({ status: 'error', error: errBody.slice(0, 500) }).eq('id', run.id);
      return apiError(res, 502, `Falha ao chamar a Apify (${apifyResp.status}).`);
    }

    const apifyJson = await apifyResp.json();
    await db.from('prospeccao_runs').update({ apify_run_id: apifyJson?.data?.id || null }).eq('id', run.id);

    return res.status(202).json({ run, apify: { runId: apifyJson?.data?.id } });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado ao disparar a busca.');
  }
}
