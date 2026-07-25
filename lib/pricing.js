// Preços de referência pra calcular custo real de cada rodada de prospecção.
// Conferido em 25/07/2026 (fonte: página oficial de pricing da OpenAI, via
// pricepertoken.com) — se a OpenAI mudar o preço do modelo, atualizar aqui.
// gpt-4o-mini: $0.15 / 1M tokens de entrada · $0.60 / 1M tokens de saída.
const OPENAI_INPUT_PER_1M_USD = 0.15;
const OPENAI_OUTPUT_PER_1M_USD = 0.6;

// Custo em USD de uma chamada, a partir do campo "usage" que a OpenAI devolve
// em toda resposta de chat completion ({ prompt_tokens, completion_tokens }).
// Nunca lança erro — usage ausente ou incompleto vira custo 0.
export function openaiCallCostUsd(usage) {
  if (!usage) return 0;
  const inTokens = Number(usage.prompt_tokens || 0);
  const outTokens = Number(usage.completion_tokens || 0);
  return (inTokens / 1_000_000) * OPENAI_INPUT_PER_1M_USD + (outTokens / 1_000_000) * OPENAI_OUTPUT_PER_1M_USD;
}
