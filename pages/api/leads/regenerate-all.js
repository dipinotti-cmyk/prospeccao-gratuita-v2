import { supabaseAdmin, apiError } from '../../../lib/supabaseAdmin';
import { generateLeadMessage, aiApiKey, AI_MODEL } from '../../../lib/generateMessage';
import { aiCallCostUsd } from '../../../lib/pricing';

// Regera a mensagem de TODOS os leads com status "novo" (ainda nao enviados),
// reusando a mesma logica de pages/api/leads/[id]/regenerate.js pra nunca
// divergir. Criado em 09/09/2026 depois que um lead real respondeu com
// defensiva ("nossas vendas nao ficam 'travadas'") a uma pergunta de
// fechamento que presumia que o negocio dele nao fechava venda direito — a
// causa raiz foi corrigida no prompt (lib/generateMessage.js), e este
// endpoint reescreve os leads que ja tinham texto gerado com o prompt velho.
//
// So mexe em status "novo" de proposito: lead ja enviado, respondido ou
// fechado tem historico real de conversa — reescrever o texto por baixo dele
// destruiria o registro do que foi realmente mandado, mesmo sem reenviar
// nada. "Leads atuais" = os que ainda nao viraram conversa de verdade.
//
// Protegido pelo mesmo CRON_SECRET que ja existe pros outros jobs em lote,
// pra nao ficar aberto pra qualquer um disparar geracao (custo de IA).
// Plano Hobby da Vercel: 60s por invocacao. Um lote de 12 leads (Gemini leva
// uns 2-4s por chamada) cabe com folga; o resto fica pra proxima chamada. O
// retorno traz "restantes" pra saber se precisa chamar de novo.
const LOTE_PADRAO = 12;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(res, 401, 'Não autorizado.');
  }

  const apiKey = aiApiKey();
  if (!apiKey) {
    return apiError(res, 501, 'GEMINI_API_KEY não está configurada nas variáveis de ambiente da Vercel.');
  }

  const limite = Number(req.query.limite) > 0 ? Number(req.query.limite) : LOTE_PADRAO;

  const db = supabaseAdmin();

  const { data: leads, error: fetchErr } = await db
    .from('prospeccao_leads')
    .select('*')
    .eq('status', 'novo')
    .order('id', { ascending: true })
    .limit(limite);

  if (fetchErr) return apiError(res, 500, `Falha ao buscar leads: ${fetchErr.message}`);
  if (!leads || leads.length === 0) return res.status(200).json({ total: 0, regenerados: 0, desqualificados: 0, restantes: 0, falhas: [] });

  const nichesCache = new Map();
  async function nicheDoLead(lead) {
    if (!lead.niche_slug) return null;
    if (nichesCache.has(lead.niche_slug)) return nichesCache.get(lead.niche_slug);
    const { data: nicheRow } = await db.from('prospeccao_niches').select('*').eq('slug', lead.niche_slug).single();
    nichesCache.set(lead.niche_slug, nicheRow || null);
    return nicheRow || null;
  }

  let regenerados = 0;
  let desqualificados = 0;
  const falhas = [];

  // Sequencial, nao em paralelo: a Gemini free tier tem limite de
  // requisicoes por minuto, e disparar tudo de uma vez derruba a rodada
  // inteira em vez de so atrasar.
  for (const lead of leads) {
    try {
      const niche = await nicheDoLead(lead);
      const generated = await generateLeadMessage({ lead, niche, apiKey });

      if (generated.qualificado === false) {
        const motivo = `Não qualificado pela IA em ${new Date().toLocaleDateString('pt-BR')} (regeneração em lote): ${generated.motivo}`;
        await db
          .from('prospeccao_leads')
          .update({
            message_wa: null,
            message_email: null,
            message_demo: null,
            message_model: generated.model || AI_MODEL,
            notes: lead.notes ? `${motivo}\n${lead.notes}` : motivo,
            status: 'descartado',
          })
          .eq('id', lead.id);
        desqualificados += 1;
        continue;
      }

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

      const { error: updateErr } = await db.from('prospeccao_leads').update(updatePayload).eq('id', lead.id);
      if (updateErr) throw new Error(updateErr.message);

      if (lead.run_id && generated.usage) {
        const cost = aiCallCostUsd(generated.usage);
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
              tokens_in: Number(run.tokens_in || 0) + Number(generated.usage.prompt_tokens || 0),
              tokens_out: Number(run.tokens_out || 0) + Number(generated.usage.completion_tokens || 0),
            })
            .eq('id', lead.run_id);
        }
      }

      regenerados += 1;
    } catch (err) {
      falhas.push({ id: lead.id, erro: err.message });
    }
  }

  const { count: restantes } = await db
    .from('prospeccao_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'novo');

  return res.status(200).json({
    total: leads.length,
    regenerados,
    desqualificados,
    restantes: restantes || 0,
    falhas,
  });
}
