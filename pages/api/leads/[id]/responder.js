import { supabaseAdmin, apiError } from '../../../../lib/supabaseAdmin';
import { aiApiKey } from '../../../../lib/generateMessage';
import { gerarMensagemSeguinte } from '../../../../lib/generateReply';
import { aiCallCostUsd } from '../../../../lib/pricing';

// O lead respondeu no WhatsApp. O Diogo cola aqui o que ele escreveu e sai a
// mensagem SEGUINTE, pronta pra copiar — antes disso ele escrevia na mão toda
// vez (03/09/2026).
//
// A geração vem ANTES da mudança de status: se a IA falhar, o lead continua
// em "aguardando resposta" e é só tentar de novo com o mesmo texto. Quem quiser
// só mover o funil sem gerar mensagem usa o PATCH normal de /api/leads/[id].
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  const { id } = req.query;
  if (!id || Number.isNaN(Number(id))) {
    return apiError(res, 400, 'ID de lead inválido.');
  }

  // preview: gera e devolve o texto SEM gravar nada e SEM mover o lead de
  // status. Serve pra conferir como a mensagem está saindo (e pra testar
  // mudança de prompt) sem sujar o funil com lead que não respondeu.
  const preview = req.body?.preview === true;
  const respostaLead = String(req.body?.respostaLead || '').trim();
  if (!respostaLead) {
    return apiError(res, 400, 'Cole o que o lead respondeu — é isso que a mensagem seguinte responde.');
  }

  const apiKey = aiApiKey();
  if (!apiKey) {
    return apiError(
      res,
      501,
      'GEMINI_API_KEY não está configurada nas variáveis de ambiente da Vercel. Escreva a mensagem manualmente por enquanto.'
    );
  }

  try {
    const db = supabaseAdmin();

    const { data: lead, error: fetchErr } = await db.from('prospeccao_leads').select('*').eq('id', id).single();
    if (fetchErr || !lead) return apiError(res, 404, 'Lead não encontrado.');

    let niche = null;
    if (lead.niche_slug) {
      const { data: nicheRow } = await db.from('prospeccao_niches').select('*').eq('slug', lead.niche_slug).single();
      niche = nicheRow || null;
    }

    let gerado;
    try {
      gerado = await gerarMensagemSeguinte({ lead, respostaLead, niche, apiKey });
    } catch (genErr) {
      return apiError(res, 502, genErr.message);
    }

    if (preview) {
      return res.status(200).json({
        preview: true,
        mensagem: gerado.mensagem,
        plano: gerado.plano,
        quantidade: gerado.quantidade,
        avisos: gerado.avisos || [],
        model: gerado.model,
      });
    }

    // Mesmo tratamento de custo do regenerate.js: a chamada avulsa entra na
    // rodada de origem, pra o dashboard continuar batendo com a realidade.
    if (lead.run_id && gerado.usage) {
      const cost = aiCallCostUsd(gerado.usage);
      const { data: run } = await db
        .from('prospeccao_runs')
        .select('cost_openai, tokens_in, tokens_out')
        .eq('id', lead.run_id)
        .single();
      if (run) {
        await db
          .from('prospeccao_runs')
          .update({
            cost_openai: Number(run.cost_openai || 0) + cost,
            tokens_in: Number(run.tokens_in || 0) + Number(gerado.usage.prompt_tokens || 0),
            tokens_out: Number(run.tokens_out || 0) + Number(gerado.usage.completion_tokens || 0),
          })
          .eq('id', lead.run_id);
      }
    }

    // Gerou: agora sim o lead vira negociação. replied fica true porque ele
    // respondeu de verdade — é o dado que alimenta a taxa de resposta.
    const { data: updated, error: updateErr } = await db
      .from('prospeccao_leads')
      .update({
        resposta_lead: respostaLead,
        mensagem_seguinte: gerado.mensagem,
        mensagem_seguinte_at: new Date().toISOString(),
        status: 'negociacao',
        replied: true,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return apiError(res, 500, `Falha ao salvar a mensagem seguinte: ${updateErr.message}`);

    return res.status(200).json({ lead: updated, plano: gerado.plano, avisos: gerado.avisos || [] });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado ao gerar a mensagem seguinte.');
  }
}
