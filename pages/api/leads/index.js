import { supabaseAdmin, apiError } from '../../../lib/supabaseAdmin';
import { isValidStatus } from '../../../lib/statuses';

export default async function handler(req, res) {
  try {
    const db = supabaseAdmin();

    if (req.method === 'GET') {
      const { status, channel, niche, q, limit } = req.query;
      let query = db.from('prospeccao_leads').select('*').order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (channel) query = query.eq('channel', channel);
      if (niche) query = query.eq('niche_slug', niche);
      if (q) query = query.ilike('name', `%${q}%`);
      query = query.limit(Number(limit) > 0 ? Number(limit) : 500);

      const { data, error } = await query;
      if (error) return apiError(res, 500, `Falha ao buscar leads: ${error.message}`);
      return res.status(200).json({ leads: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (!body.name || !String(body.name).trim()) {
        return apiError(res, 400, 'Campo "name" é obrigatório.');
      }
      if (body.status && !isValidStatus(body.status)) {
        return apiError(res, 400, `Status inválido: "${body.status}".`);
      }
      if (!body.whatsapp && !body.email) {
        return apiError(res, 400, 'Informe pelo menos WhatsApp ou e-mail.');
      }

      const channel = body.channel || (body.whatsapp ? 'whatsapp' : 'email');

      const insertPayload = {
        name: String(body.name).trim(),
        category: body.category || null,
        niche_slug: body.niche_slug || null,
        city: body.city || null,
        address: body.address || null,
        phone: body.phone || null,
        whatsapp: body.whatsapp || null,
        email: body.email || null,
        website: body.website || null,
        channel,
        status: body.status || 'novo',
        valor: body.valor ?? null,
        notes: body.notes || null,
        message_wa: body.message_wa || null,
        message_email: body.message_email || null,
        email_subject: body.email_subject || null,
        origem_manual: true,
      };

      const { data, error } = await db.from('prospeccao_leads').insert(insertPayload).select().single();
      if (error) return apiError(res, 500, `Falha ao criar lead: ${error.message}`);
      return res.status(201).json({ lead: data });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado.');
  }
}
