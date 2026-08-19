import { supabaseAdmin, apiError } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id || Number.isNaN(Number(id))) {
    return apiError(res, 400, 'ID de nicho inválido.');
  }

  try {
    const db = supabaseAdmin();

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const patch = {};
      // demo_url e companhia entraram em 19/08/2026: o campo 'Link do prototipo'
      // ja existia na tela, mas nao estava nesta lista, entao o PATCH descartava
      // o valor em silencio e o link nunca chegava no banco.
      const allowed = ['label', 'gmaps_query', 'leitor', 'tom', 'solucao', 'elogio_sugestao', 'pedido_demo', 'resumo', 'demo_url', 'demo_tipo', 'demo_quem', 'demo_olhar', 'demo_fechamento'];
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }
      if (Object.keys(patch).length === 0) {
        return apiError(res, 400, 'Nenhum campo válido para atualizar.');
      }

      const { data, error } = await db.from('prospeccao_niches').update(patch).eq('id', id).select().single();
      if (error) return apiError(res, 500, `Falha ao atualizar nicho: ${error.message}`);
      return res.status(200).json({ niche: data });
    }

    if (req.method === 'DELETE') {
      // Não apaga o nicho se ainda tiver lead vinculado — evita órfão silencioso
      // no filtro "nicho" do painel. Avisa com mensagem clara em vez de quebrar.
      const { data: nicheRow } = await db.from('prospeccao_niches').select('slug').eq('id', id).single();
      if (nicheRow?.slug) {
        const { count } = await db
          .from('prospeccao_leads')
          .select('id', { count: 'exact', head: true })
          .eq('niche_slug', nicheRow.slug);
        if (count && count > 0) {
          return apiError(res, 409, `Esse nicho tem ${count} lead(s) vinculado(s) — não dá pra excluir sem perder a referência. Edite em vez de excluir, se quiser.`);
        }
      }

      const { error } = await db.from('prospeccao_niches').delete().eq('id', id);
      if (error) return apiError(res, 500, `Falha ao excluir nicho: ${error.message}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['PATCH', 'DELETE']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado.');
  }
}
