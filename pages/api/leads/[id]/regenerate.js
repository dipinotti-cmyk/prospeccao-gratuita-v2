import { supabaseAdmin, apiError } from '../../../../lib/supabaseAdmin';
import { generateLeadMessage, aiApiKey, AI_MODEL } from '../../../../lib/generateMessage';
import { aiCallCostUsd } from '../../../../lib/pricing';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  const { id } = req.query;
  if (!id || Number.isNaN(Number(id))) {
    return apiError(res, 400, 'ID de lead inválido.');
  }

  const apiKey = aiApiKey();
  if (!apiKey) {
    return apiError(
      res,
      501,
      'GEMINI_API_KEY não está configurada nas variáveis de ambiente da Vercel. Escreva a mensagem manualmente por enquanto — assim que a chave for adicionada e o projeto for redeployado, a geração automática volta a funcionar.'
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
      generated = await generateLeadMessage({ lead, niche, apiKey });
    } catch (genErr) {
      return apiError(res, 502, genErr.message);
    }

    // 02/09/2026 (2): a IA qualifica antes de escrever. Lead que nao vende
    // produto fisico proprio (conserto, feira, leilao) volta sem texto e com o
    // motivo. Aqui ele vai pra "descartado" com o motivo nas notas, e as duas
    // mensagens sao limpas — e o mesmo destino do botao "Sem interesse", so que
    // decidido antes de gastar uma mensagem. Lead que ja saiu de "novo"
    // (enviado, negociacao...) nao muda de status: a essa altura o Diogo ja
    // sabe mais sobre ele do que a IA.
    if (generated.qualificado === false) {
      const motivo = `Não qualificado pela IA em ${new Date().toLocaleDateString('pt-BR')}: ${generated.motivo}`;
      const patch = {
        message_wa: null,
        message_email: null,
        message_demo: null,
        message_model: generated.model || AI_MODEL,
        notes: lead.notes ? `${motivo}\n${lead.notes}` : motivo,
      };
      if (lead.status === 'novo') patch.status = 'descartado';

      const { data: updated, error: updateErr } = await db
        .from('prospeccao_leads')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (updateErr) return apiError(res, 500, `Falha ao registrar lead não qualificado: ${updateErr.message}`);
      return res.status(200).json({ lead: updated, qualificado: false, motivo: generated.motivo });
    }

    // message_demo é a segunda mensagem, a do protótipo. Vem null quando o
    // nicho não tem demo cadastrado, e nesse caso a coluna é limpa de
    // propósito: gerar de novo substitui o par inteiro, não deixa metade velha.
    const updatePayload = lead.channel === 'email'
      ? {
        message_email: generated.message,
        email_subject: generated.subject || lead.email_subject,
        message_demo: generated.demo,
        message_model: generated.model || AI_MODEL,
      }
      : {
        message_wa: generated.message,
        message_demo: generated.demo,
        message_model: generated.model || AI_MODEL,
      };

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
      const cost = aiCallCostUsd(generated.usage);
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
