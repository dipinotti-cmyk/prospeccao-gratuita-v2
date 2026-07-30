// Custo por chamada de IA em cada rodada de prospecção.
//
// 30/07/2026: migrado da OpenAI para a Gemini no free tier, onde os tokens de
// entrada e saída do gemini-2.5-flash-lite custam ZERO. As constantes ficam
// zeradas de propósito, e a função continua existindo: no dia em que a chave
// virar paga, basta preencher os dois números aqui e o painel volta a mostrar
// custo real, sem mexer em mais nada.
//
// Referência histórica (OpenAI gpt-4o-mini, conferido em 25/07/2026):
// $0.15 / 1M tokens de entrada · $0.60 / 1M tokens de saída.
const AI_INPUT_PER_1M_USD = 0;
const AI_OUTPUT_PER_1M_USD = 0;

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
