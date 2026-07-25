import { supabaseAdmin, apiError } from '../../../lib/supabaseAdmin';

// Nichos viraram gerenciáveis pela própria tela (25/07/2026) — antes só dava
// pra mudar via SQL direto no Supabase. GET lista todos (usado nos <select>
// do painel), POST cria um novo. Edição/exclusão em pages/api/niches/[id].js.
export default async function handler(req, res) {
  try {
    const db = supabaseAdmin();

    if (req.method === 'GET') {
      const { data, error } = await db.from('prospeccao_niches').select('*').order('label');
      if (error) return apiError(res, 500, `Falha ao buscar nichos: ${error.message}`);
      return res.status(200).json({ niches: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.slug || !String(body.slug).trim()) {
        return apiError(res, 400, 'Campo "slug" é obrigatório (identificador único, ex: "clinica-veterinaria").');
      }
      if (!body.label || !String(body.label).trim()) {
        return apiError(res, 400, 'Campo "label" (nome de exibição) é obrigatório.');
      }

      const insertPayload = {
        slug: String(body.slug).trim().toLowerCase().replace(/\s+/g, '-'),
        label: String(body.label).trim(),
        gmaps_query: body.gmaps_query || `${body.label} em {cidade}`,
        leitor: body.leitor || null,
        tom: body.tom || null,
        solucao: body.solucao || null,
        elogio_sugestao: body.elogio_sugestao || null,
        pedido_demo: body.pedido_demo || null,
        resumo: body.resumo || null,
      };

      const { data, error } = await db.from('prospeccao_niches').insert(insertPayload).select().single();
      if (error) return apiError(res, 500, `Falha ao criar nicho: ${error.message}`);
      return res.status(201).json({ niche: data });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado.');
  }
}
