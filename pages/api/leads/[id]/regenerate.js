import { supabaseAdmin, apiError } from '../../../../lib/supabaseAdmin';
import { generateLeadMessage } from '../../../../lib/generateMessage';
import { openaiCallCostUsd } from '../../../../lib/pricing';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  const { id } = req.query;
  if (!id || Number.isNaN(Number(id))) {
    return apiError(res, 400, 'ID de lead inválido.');
  }

  if (!process.env.OPENAI_API_KEY) {
    return apiError(
      res,
      501,
      'OPENAI_API_KEY não configurada. Escreva a mensagem manualmente por enquanto — assim que a chave for adicionada nas variáveis de ambiente da Vercel, a geração automática volta a funcionar.'
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

    let generated;
    try {
      generated = await generateLeadMessage({ lead, niche, apiKey: process.env.OPENAI_API_KEY });
    } catch (genErr) {
      return apiError(res, 502, genErr.message);
    }

    const updatePayload = lead.channel === 'email'
      ? { message_email: generated.message, email_subject: generated.subject || lead.email_subject, message_model: 'gpt-4o-mini' }
      : { message_wa: generated.message, message_model: 'gpt-4o-mini' };

    const { data: updated, error: updateErr } = await db
      .from('prospeccao_leads')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return apiError(res, 500, `Falha ao salvar mensagem gerada: ${updateErr.message}`);

    // Soma o custo desta chamada avulsa na rodada de origem, pra o dashboard de
    // custos continuar refletindo a realidade mesmo depois de "Gerar de novo"
    // várias vezes num lead. Leads criados manualmente (sem run_id) não têm
    // rodada pra atribuir — custo real do mesmo jeito, só não some no total por nicho.
    if (lead.run_id && generated.usage) {
      const cost = openaiCallCostUsd(generated.usage);
      const { data: run } = await db.from('prospeccao_runs').select('cost_openai, tokens_in, tokens_out').eq('id', lead.run_id).single();
      if (run) {
        await db
          .from('prospeccao_runs')
          .update({
            cost_openai: Number(run.cost_openai || 0) + cost,
            tokens_in: Number(run.tokens_in || 0) + Number(generated.usage.prompt_tokens || 0),
            tokens_out: Number(run.tokens_out || 0) + Number(generated.usage.completion_tokens || 0),
          })
          .eq('id', lead.run_id);
      }
    }

    return res.status(200).json({ lead: updated });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado ao gerar mensagem.');
  }
}
