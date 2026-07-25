import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';

// Recebe o callback da Apify quando uma run termina, filtra quem não tem
// site próprio, separa em blocos WhatsApp/e-mail e salva como leads novos.
// Deduplica por place_id (chave natural do Google).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  if (!process.env.APIFY_TOKEN) {
    return apiError(res, 501, 'Apify não configurada.');
  }

  try {
    const db = supabaseAdmin();
    const { resource } = req.body || {};
    const datasetId = resource?.defaultDatasetId;
    const apifyRunId = resource?.id;

    if (!datasetId) return apiError(res, 400, 'Payload sem defaultDatasetId.');

    const { data: run } = await db.from('prospeccao_runs').select('*').eq('apify_run_id', apifyRunId).single();

    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_TOKEN}`
    );
    if (!itemsResp.ok) return apiError(res, 502, 'Falha ao buscar resultados da Apify.');
    const items = await itemsResp.json();

    let qualified = 0;
    let saved = 0;
    let whatsappCount = 0;
    let emailCount = 0;

    for (const item of items) {
      const hasOwnSite = item.website && !/instagram\.com|facebook\.com|linktr\.ee|ifood|doctoralia/i.test(item.website);
      if (hasOwnSite) continue;

      const phone = item.phone || null;
      const email = item.email || null;
      if (!phone && !email) continue;

      qualified += 1;

      let channel = null;
      if (phone && whatsappCount < 10) {
        channel = 'whatsapp';
        whatsappCount += 1;
      } else if (email && emailCount < 10) {
        channel = 'email';
        emailCount += 1;
      } else {
        continue; // blocos já completos
      }

      const { error } = await db.from('prospeccao_leads').upsert(
        {
          run_id: run?.id || null,
          place_id: item.placeId,
          name: item.title,
          category: item.categoryName,
          niche_slug: run?.niche_slug || null,
          city: run?.city || null,
          address: item.address,
          rating: item.totalScore,
          reviews_count: item.reviewsCount,
          phone,
          whatsapp: phone,
          email,
          website: item.website || null,
          site_tipo: item.website ? 'social' : 'nenhum',
          gmaps_url: item.url,
          channel,
          status: 'novo',
        },
        { onConflict: 'place_id', ignoreDuplicates: true }
      );
      if (!error) saved += 1;
    }

    if (run) {
      await db
        .from('prospeccao_runs')
        .update({ status: 'done', found: items.length, qualified, saved })
        .eq('id', run.id);
    }

    return res.status(200).json({ found: items.length, qualified, saved });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado no webhook.');
  }
}
