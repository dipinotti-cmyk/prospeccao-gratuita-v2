import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from('prospeccao_niches').select('*').order('label');
    if (error) return apiError(res, 500, `Falha ao buscar nichos: ${error.message}`);
    return res.status(200).json({ niches: data || [] });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado.');
  }
}
