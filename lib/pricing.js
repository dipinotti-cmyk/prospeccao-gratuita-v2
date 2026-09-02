// Custo por chamada de IA em cada rodada de prospecção.
//
// 30/07/2026: migrado da OpenAI para a Gemini no free tier, onde os tokens de
// entrada e saída do gemini-2.5-flash-lite custavam ZERO. As constantes
// ficaram zeradas de propósito, com a promessa de preencher no dia em que a
// chave virasse paga.
//
// 02/09/2026 (3): chave virou paga, modelo primário virou gemini-3.5-flash
// (ver lib/generateMessage.js). Preço conferido em benchlm.ai/google/api-pricing
// (setembro/2026): $1.50 / 1M tokens de entrada · $9.00 / 1M tokens de saída.
// Isso é o preço do modelo PRIMÁRIO da fila — os candidatos de fallback
// (-flash-lite) custam bem menos, então em runs onde o fallback entra o
// painel vai mostrar um custo um pouco acima do real. Aceitável: o objetivo
// aqui é parar de mentir "R$0", não centavo certo por candidato.
//
// Referência histórica (OpenAI gpt-4o-mini, conferido em 25/07/2026):
// $0.15 / 1M tokens de entrada · $0.60 / 1M tokens de saída.
const AI_INPUT_PER_1M_USD = 1.5;
const AI_OUTPUT_PER_1M_USD = 9.0;

// Custo em USD de uma chamada, a partir do campo "usage" que a API devolve em
// toda resposta de chat completion ({ prompt_tokens, completion_tokens }).
// Nunca lança erro — usage ausente ou incompleto vira custo 0.
export function aiCallCostUsd(usage) {
  if (!usage) return 0;
  const inTokens = Number(usage.prompt_tokens || 0);
  const outTokens = Number(usage.completion_tokens || 0);
  return (inTokens / 1_000_000) * AI_INPUT_PER_1M_USD + (outTokens / 1_000_000) * AI_OUTPUT_PER_1M_USD;
}

// Nome antigo mantido pra não quebrar import de arquivo que ainda não foi
// migrado. Aponta pra mesma função.
export const openaiCallCostUsd = aiCallCostUsd;
