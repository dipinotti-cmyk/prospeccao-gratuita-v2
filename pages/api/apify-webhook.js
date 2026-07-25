import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';
import { generateLeadMessage } from '../../lib/generateMessage';
import { openaiCallCostUsd } from '../../lib/pricing';

// Recebe o callback da Apify quando uma run termina, filtra quem não tem
// site próprio, separa em blocos WhatsApp/e-mail e salva como leads novos.
// Deduplica por place_id (chave natural do Google).
//
// Automação completa (25/07/2026): se OPENAI_API_KEY estiver configurada, cada
// lead qualificado já sai com a mensagem de WhatsApp/e-mail pronta pra copiar —
// antes disso só existia geração manual (botão "Gerar" por lead). Também
// registra o custo real da rodada (Apify via usageTotalUsd + OpenAI calculado
// pelos tokens de cada chamada) em prospeccao_runs, pra alimentar o dashboard
// de custos.
export const config = {
  api: { bodyParser: true },
};

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

    let niche = null;
    if (run?.niche_slug) {
      const { data: nicheRow } = await db.from('prospeccao_niches').select('*').eq('slug', run.niche_slug).single();
      niche = nicheRow || null;
    }

    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_TOKEN}`
    );
    if (!itemsResp.ok) return apiError(res, 502, 'Falha ao buscar resultados da Apify.');
    const items = await itemsResp.json();

    let qualified = 0;
    let whatsappCount = 0;
    let emailCount = 0;
    const toSave = [];

    for (const item of items) {
      const hasOwnSite = item.website && !/instagram\.com|facebook\.com|linktr\.ee|ifood|doctoralia/i.test(item.website);
      if (hasOwnSite) continue;

      const phone = item.phone || null;
      const email = item.email || null;
      if (!phone && !email) continue;

      let channel = null;
      if (phone && whatsappCount < 10) {
        channel = 'whatsapp';
        whatsappCount += 1;
      } else if (email && emailCount < 10) {
        channel = 'email';
        emailCount += 1;
      } else {
        continue; // blocos já completos (10 whatsapp + 10 e-mail)
      }

      qualified += 1;
      toSave.push({
        run_id: run?.id || null,
        place_id: item.placeId,
        name: item.title,
        category: item.categoryName,
        niche_slug: run?.niche_slug || null,
        oferta: run?.oferta || 'site',
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
      });
    }

    // Geração automática de mensagem: roda em paralelo pra não somar tempo
    // sequencial (podem ser até 20 leads). Se faltar a chave, ou se uma
    // chamada específica falhar, o lead é salvo do mesmo jeito sem mensagem —
    // dá pra usar "Editar msg" ou "Gerar" depois, nunca trava o salvamento.
    let tokensIn = 0;
    let tokensOut = 0;
    let costOpenai = 0;
    if (process.env.OPENAI_API_KEY && toSave.length > 0) {
      const results = await Promise.allSettled(
        toSave.map((lead) => generateLeadMessage({ lead, niche, apiKey: process.env.OPENAI_API_KEY }))
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const { message, subject, usage } = r.value;
          if (toSave[i].channel === 'email') {
            toSave[i].message_email = message;
            if (subject) toSave[i].email_subject = subject;
          } else {
            toSave[i].message_wa = message;
          }
          toSave[i].message_model = 'gpt-4o-mini';
          if (usage) {
            tokensIn += Number(usage.prompt_tokens || 0);
            tokensOut += Number(usage.completion_tokens || 0);
            costOpenai += openaiCallCostUsd(usage);
          }
        }
        // se falhar, o lead segue sem mensagem pronta — não é motivo pra descartar o lead
      });
    }

    let saved = 0;
    for (const leadData of toSave) {
      const { error } = await db.from('prospeccao_leads').upsert(leadData, { onConflict: 'place_id', ignoreDuplicates: true });
      if (!error) saved += 1;
    }

    // Custo real da Apify: só fica disponível depois que a run termina —
    // por isso é buscado aqui (no fim), não em /api/run (no início).
    let costApify = 0;
    try {
      const runInfoResp = await fetch(
        `https://api.apify.com/v2/actor-runs/${apifyRunId}?token=${process.env.APIFY_TOKEN}`
      );
      if (runInfoResp.ok) {
        const runInfo = await runInfoResp.json();
        costApify = Number(runInfo?.data?.usageTotalUsd || 0);
      }
    } catch {
      // custo da Apify é informativo — se a consulta falhar, segue com 0 em vez de quebrar o webhook
    }

    if (run) {
      await db
        .from('prospeccao_runs')
        .update({
          status: 'done',
          found: items.length,
          qualified,
          saved,
          cost_apify: costApify,
          cost_openai: costOpenai,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
        })
        .eq('id', run.id);
    }

    return res.status(200).json({ found: items.length, qualified, saved, cost_apify: costApify, cost_openai: costOpenai });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado no webhook.');
  }
}
