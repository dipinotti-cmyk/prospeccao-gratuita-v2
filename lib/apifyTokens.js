// Toda run pode ter sido criada com APIFY_TOKEN ou, em failover (ver
// pages/api/run.js), com APIFY_TOKEN_2 — uma segunda conta Apify, usada
// quando o crédito mensal da primeira acaba (402). Um dataset ou run criado
// na segunda conta não existe pra quem consulta só com o token primário: a
// Apify devolve 401/404, não 200. Antes disso, pages/api/apify-webhook.js e
// pages/api/runs.js só tentavam APIFY_TOKEN — qualquer run que tivesse usado
// o failover ficava presa em "running" pra sempre, com o webhook devolvendo
// 502 a cada retry da Apify (bug real visto em produção em 10/09/2026).
export function apifyTokens() {
  return [process.env.APIFY_TOKEN, process.env.APIFY_TOKEN_2].filter(Boolean);
}

// Tenta cada token configurado, na ordem, até um responder com sucesso.
// Se todos falharem, devolve a última resposta (pra quem chamou decidir o
// que fazer com o erro, igual um fetch normal que deu errado).
export async function apifyFetchWithFailover(buildUrl) {
  const tokens = apifyTokens();
  let resp;
  for (const token of tokens) {
    resp = await fetch(buildUrl(token));
    if (resp.ok) return resp;
  }
  return resp;
}
