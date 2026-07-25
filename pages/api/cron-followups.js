import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';

// Chamada pelo Vercel Cron (1x/h). Marca leads vencidos (+48h sem resposta)
// como "aguardando_resposta" pra aparecerem em destaque no painel — o envio
// do follow-up em si é manual (mesmo padrão de segurança do WhatsApp),
// então aqui só sinalizamos, nunca disparamos mensagem sozinho.
export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(res, 401, 'Não autorizado.');
  }

  try {
    const db = supabaseAdmin();
    const now = new Date().toISOString();

    const { data: due, error } = await db
      .from('prospeccao_leads')
      .select('id')
      .eq('status', 'enviado')
      .not('followup_due_at', 'is', null)
      .lte('followup_due_at', now)
      .is('followup_sent_at', null);

    if (error) return apiError(res, 500, `Falha ao buscar follow-ups vencidos: ${error.message}`);

    if (!due || due.length === 0) {
      return res.status(200).json({ processed: 0 });
    }

    const ids = due.map((l) => l.id);
    const { error: updateErr } = await db
      .from('prospeccao_leads')
      .update({ status: 'aguardando_resposta', followup_sent_at: now })
      .in('id', ids);

    if (updateErr) return apiError(res, 500, `Falha ao atualizar leads: ${updateErr.message}`);

    return res.status(200).json({ processed: ids.length });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado no cron.');
  }
}
