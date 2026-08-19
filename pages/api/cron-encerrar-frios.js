import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';

// Chamado pelo Vercel Cron, 1x por dia.
//
// Regra do Diogo (19/08/2026): prospeccao fria NAO tem follow-up. Quem nao
// respondeu em 3 dias nao vai responder — insistir queima o numero e enche a
// tela de lead morto. Entao o lead vai pra "sem interesse" sozinho e some das
// abas de trabalho.
//
// Ele nao volta em busca futura: prospeccao_contatados guarda o place_id pra
// sempre, independente do status ou de o lead ser apagado depois.
//
// Antes esta rota gerava follow-up. Foi trocada de proposito, e o nome do
// arquivo mudou junto pra ninguem achar que ainda dispara mensagem.
const DIAS = 3;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(res, 401, 'Não autorizado.');
  }

  try {
    const db = supabaseAdmin();
    const agora = new Date();
    const limite = new Date(agora.getTime() - DIAS * 24 * 3600 * 1000).toISOString();

    // Só encerra o que realmente foi enviado e nunca respondeu. Lead em
    // negociação, fechado ou já respondido nunca é tocado.
    const { data: frios, error } = await db
      .from('prospeccao_leads')
      .select('id')
      .in('status', ['enviado', 'aguardando_resposta'])
      .eq('replied', false)
      .not('sent_at', 'is', null)
      .lte('sent_at', limite);

    if (error) return apiError(res, 500, `Falha ao buscar leads frios: ${error.message}`);
    if (!frios || frios.length === 0) return res.status(200).json({ encerrados: 0 });

    const ids = frios.map((l) => l.id);
    const { error: updErr } = await db
      .from('prospeccao_leads')
      .update({ status: 'sem_interesse', followup_sent_at: agora.toISOString() })
      .in('id', ids);

    if (updErr) return apiError(res, 500, `Falha ao encerrar leads: ${updErr.message}`);

    return res.status(200).json({ encerrados: ids.length, dias: DIAS });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado no cron.');
  }
}
