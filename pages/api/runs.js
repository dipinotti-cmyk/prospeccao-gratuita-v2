import { supabaseAdmin, apiError } from '../../lib/supabaseAdmin';

// Lista o histórico de rodadas — e faz auto-recuperação: se uma rodada está
// "running" no banco mas a Apify já terminou (caso real: runs disparadas antes
// do webhook ser registrado, ou webhook que falhou), processa o resultado
// agora, chamando o próprio /api/apify-webhook com o payload que a Apify teria
// mandado. Assim nenhuma rodada fica presa pra sempre — basta o painel
// atualizar (o que ele faz sozinho a cada 15s enquanto tem rodada rodando).
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from('prospeccao_runs').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) return apiError(res, 500, `Falha ao buscar histórico de rodadas: ${error.message}`);

    let runs = data || [];

    const stuck = runs.filter((r) => r.status === 'running' && r.apify_run_id).slice(0, 3);
    if (stuck.length > 0 && process.env.APIFY_TOKEN) {
      let recovered = false;
      for (const run of stuck) {
        try {
          const infoResp = await fetch(
            `https://api.apify.com/v2/actor-runs/${run.apify_run_id}?token=${process.env.APIFY_TOKEN}`
          );
          if (!infoResp.ok) continue;
          const info = await infoResp.json();
          const apifyStatus = info?.data?.status;

          if (apifyStatus === 'SUCCEEDED') {
            const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`;
            await fetch(`${baseUrl}/api/apify-webhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resource: { id: run.apify_run_id, defaultDatasetId: info?.data?.defaultDatasetId },
              }),
            });
            recovered = true;
          } else if (apifyStatus === 'FAILED' || apifyStatus === 'ABORTED' || apifyStatus === 'TIMED-OUT') {
            await db.from('prospeccao_runs').update({ status: 'error', error: `Apify: ${apifyStatus}` }).eq('id', run.id);
            recovered = true;
          }
          // RUNNING/READY: ainda rodando de verdade, deixa quieto
        } catch {
          // recuperação é melhor-esforço — nunca derruba a listagem por causa dela
        }
      }
      if (recovered) {
        const { data: fresh } = await db.from('prospeccao_runs').select('*').order('created_at', { ascending: false }).limit(50);
        if (fresh) runs = fresh;
      }
    }

    return res.status(200).json({ runs });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado.');
  }
}
