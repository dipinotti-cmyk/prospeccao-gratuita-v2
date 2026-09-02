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

  const { niche, city, oferta } = req.body || {};
  if (!niche || !city) {
    return apiError(res, 400, 'Informe "niche" e "city".');
  }

  const ofertaValida = ['nuvemshop', 'site', 'automacao', 'completo'].includes(oferta) ? oferta : 'nuvemshop';

  try {
    const db = supabaseAdmin();
    const { data: run, error: runErr } = await db
      .from('prospeccao_runs')
      .insert({ niche_slug: niche, city, source: 'manual', status: 'running', oferta: ofertaValida })
      .select()
      .single();
    if (runErr) return apiError(res, 500, `Falha ao criar run: ${runErr.message}`);

    const { data: nicheRow } = await db.from('prospeccao_niches').select('*').eq('slug', niche).single();
    const searchString = (nicheRow?.gmaps_query || `${niche} em {cidade}`).replace('{cidade}', city);

    // A Apify identifica actors públicos como "usuario/nome-do-actor" (é assim que
    // aparece na store, e é o formato natural pra colar na env var) mas a API REST
    // exige "usuario~nome-do-actor" (til, não barra) — uma barra literal na URL
    // quebra o roteamento e devolve 404. Normalizamos aqui pra aceitar os dois formatos
    // sem depender de ninguém lembrar da troca de caractere.
    const actorId = (process.env.APIFY_ACTOR_ID || '').trim().replace('/', '~');

    // Webhook de retorno: sem isso a Apify termina a busca mas nunca avisa o
    // app, e os leads ficam presos lá (rodada eternamente "running" com 0
    // salvos — bug real visto em produção em 25/07/2026). O parâmetro
    // "webhooks" é um JSON em base64 com a URL a chamar quando a run termina.
    const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`;
    const webhooks = Buffer.from(JSON.stringify([
      {
        eventTypes: ['ACTOR.RUN.SUCCEEDED'],
        requestUrl: `${baseUrl}/api/apify-webhook`,
      },
    ])).toString('base64');

    const apifyResp = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${process.env.APIFY_TOKEN}&webhooks=${encodeURIComponent(webhooks)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchStringsArray: [searchString],
          // 50, nao 30: os ja contatados sao descartados antes de qualificar,
          // entao a busca precisa de folga pra ainda sobrar lead novo. Cidade
          // ja varrida devolve pouco de qualquer jeito — a tela avisa quando
          // nao entrou ninguem.
          maxCrawledPlacesPerSearch: 50,
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
