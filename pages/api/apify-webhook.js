import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';
import { generateLeadMessage, aiApiKey, AI_MODEL } from '../../lib/generateMessage';
import { aiCallCostUsd } from '../../lib/pricing';

// Recebe o callback da Apify quando uma run termina, filtra quem não tem
// site próprio, separa em blocos WhatsApp/e-mail e salva como leads novos.
// Deduplica por place_id (chave natural do Google).
//
// Automação completa (25/07/2026): se GEMINI_API_KEY estiver configurada, cada
// lead qualificado já sai com a mensagem de WhatsApp/e-mail pronta pra copiar —
// antes disso só existia geração manual (botão "Gerar" por lead). Também
// registra o custo real da rodada (Apify via usageTotalUsd + OpenAI calculado
// pelos tokens de cada chamada) em prospeccao_runs, pra alimentar o dashboard
// de custos.
//
// 04/08/2026: a IA passou a devolver DUAS mensagens. A primeira (abertura, que
// continua vindo no campo "message") vai pra message_wa/message_email como
// antes. A segunda, com o link do protótipo/case/home, vai pra message_demo.
//
// 02/09/2026: a segunda mensagem passou a ser SEMPRE gerada — nicho sem case
// nem modelo cai no fallback da home do site (lib/generateMessage.js), então
// message_demo nunca fica vazia por falta de link.
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

    // Quem ja passou pela prospeccao alguma vez nunca mais volta. O ledger
    // prospeccao_contatados guarda isso pra sempre, entao apagar lead nao faz a
    // empresa reaparecer numa busca futura. Sem isso, repetir nicho + cidade
    // devolve as MESMAS empresas do Google e a rodada inteira vira repeteco.
    const idsAchados = items.map((it) => it.placeId).filter(Boolean);
    const jaContatados = new Set();
    for (let i = 0; i < idsAchados.length; i += 200) {
      const { data: conhecidos } = await db
        .from('prospeccao_contatados')
        .select('place_id')
        .in('place_id', idsAchados.slice(i, i + 200));
      (conhecidos || []).forEach((r) => jaContatados.add(r.place_id));
    }
    let repetidos = 0;

    for (const item of items) {
      if (item.placeId && jaContatados.has(item.placeId)) { repetidos += 1; continue; }
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
        oferta: run?.oferta || 'nuvemshop',
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

    // Geração automática de mensagem.
    //
    // 30/07/2026 (Gemini free tier): o disparo de tudo em paralelo virou 429
    // na hora, porque o free tier limita requisições por minuto. Agora vai em
    // blocos pequenos, com respiro entre eles, e cada chamada já tem retry
    // próprio. Além disso existe um orçamento de tempo: a função da Vercel tem
    // limite, então quando o tempo acaba os leads restantes são salvos SEM
    // mensagem, pra nunca perder o lead — é só apertar "Gerar" na tela depois.
    let tokensIn = 0;
    let tokensOut = 0;
    let costOpenai = 0;
    const apiKey = aiApiKey();

    if (apiKey && toSave.length > 0) {
      const LOTE = 3;
      const PAUSA_MS = 1500;
      const ORCAMENTO_MS = 45000;
      const inicio = Date.now();

      for (let ini = 0; ini < toSave.length; ini += LOTE) {
        if (Date.now() - inicio > ORCAMENTO_MS) break;

        const bloco = toSave.slice(ini, ini + LOTE);
        const results = await Promise.allSettled(
          bloco.map((lead) => generateLeadMessage({ lead, niche, apiKey }))
        );

        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return;
          const alvo = toSave[ini + i];
          const { message, demo, subject, usage, model } = r.value;

          if (alvo.channel === 'email') {
            alvo.message_email = message;
            if (subject) alvo.email_subject = subject;
          } else {
            alvo.message_wa = message;
          }

          // Segunda mensagem, a do protótipo. Vem null quando o nicho não tem
          // demo cadastrado, e nesse caso a coluna simplesmente não é tocada.
          if (demo) alvo.message_demo = demo;

          alvo.message_model = model || AI_MODEL;

          if (usage) {
            tokensIn += Number(usage.prompt_tokens || 0);
            tokensOut += Number(usage.completion_tokens || 0);
            costOpenai += aiCallCostUsd(usage);
          }
          // se falhar, o lead segue sem mensagem pronta — não é motivo pra descartar o lead
        });

        if (ini + LOTE < toSave.length) {
          await new Promise((r) => setTimeout(r, PAUSA_MS));
        }
      }
    }

    // ignoreDuplicates faz o Postgres pular a linha em silencio quando o
    // place_id ja existe — sem erro. O contador antigo somava esse silencio
    // como se fosse lead novo, entao repetir nicho+cidade mostrava "4 leads
    // novos" quando nao tinha entrado nada. Com .select('id'), lead inserido
    // devolve linha e lead pulado devolve vazio: da pra separar os tres casos.
    let saved = 0;
    let duplicados = 0;
    let falhas = 0;
    for (const leadData of toSave) {
      const { data, error } = await db
        .from('prospeccao_leads')
        .upsert(leadData, { onConflict: 'place_id', ignoreDuplicates: true })
        .select('id');
      if (error) falhas += 1;
      else if (data && data.length > 0) saved += 1;
      else duplicados += 1;
    }

    // O ledger e escrito sempre, mesmo quando o lead nao entrou: o objetivo e
    // nunca mais mostrar essa empresa numa busca, independente do que aconteca
    // com a linha em prospeccao_leads.
    if (toSave.length > 0) {
      await db.from('prospeccao_contatados').upsert(
        toSave.map((l) => ({ place_id: l.place_id, name: l.name, city: l.city, niche_slug: l.niche_slug })),
        { onConflict: 'place_id', ignoreDuplicates: true }
      );
    }
    if (falhas > 0) console.error(`[apify-webhook] ${falhas} lead(s) falharam ao salvar na run ${run?.id}`);

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
          duplicados: duplicados + repetidos,
          cost_apify: costApify,
          cost_openai: costOpenai,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
        })
        .eq('id', run.id);
    }

    return res.status(200).json({ found: items.length, qualified, saved, duplicados: duplicados + repetidos, cost_apify: costApify, cost_openai: costOpenai });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado no webhook.');
  }
}
