import { supabaseAdmin, apiError } from '../../../lib/supabaseAdmin';
import { isValidStatus } from '../../../lib/statuses';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id || Number.isNaN(Number(id))) {
    return apiError(res, 400, 'ID de lead inválido.');
  }

  try {
    const db = supabaseAdmin();

    if (req.method === 'GET') {
      const { data, error } = await db.from('prospeccao_leads').select('*').eq('id', id).single();
      if (error) return apiError(res, 404, 'Lead não encontrado.');
      return res.status(200).json({ lead: data });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const patch = {};

      // Só aceita campos conhecidos — nunca deixa o cliente escrever
      // qualquer coluna arbitrária no banco.
      const allowed = [
        'status', 'valor', 'notes', 'phone', 'whatsapp', 'email',
        'message_wa', 'message_email', 'email_subject', 'replied',
        'sent_at', 'followup_due_at', 'followup_sent_at', 'oferta', 'niche_slug',
      ];
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }

      if ('status' in patch && !isValidStatus(patch.status)) {
        return apiError(res, 400, `Status inválido: "${patch.status}". Valores aceitos: novo, enviado, aguardando_resposta, negociacao, fechado, descartado.`);
      }

      if (Object.keys(patch).length === 0) {
        return apiError(res, 400, 'Nenhum campo válido para atualizar.');
      }

      const { data, error } = await db.from('prospeccao_leads').update(patch).eq('id', id).select().single();
      if (error) return apiError(res, 500, `Falha ao atualizar lead: ${error.message}`);
      return res.status(200).json({ lead: data });
    }

    if (req.method === 'DELETE') {
      const { error } = await db.from('prospeccao_leads').delete().eq('id', id);
      if (error) return apiError(res, 500, `Falha ao excluir lead: ${error.message}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado.');
  }
}
