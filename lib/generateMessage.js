// Geração de mensagem por IA — usada tanto na primeira leva automática
// (apify-webhook, assim que os leads chegam) quanto no botão "Gerar" manual
// (regenerate.js). Centralizada aqui pra nunca divergir entre os dois lugares.
//
// 30/07/2026: migrado da OpenAI para a Gemini (free tier), pelo endpoint de
// compatibilidade OpenAI do Google. A chave é lida de GEMINI_API_KEY e, se não
// existir, de OPENAI_API_KEY — assim a variável antiga da Vercel continua
// servindo, bastando trocar o VALOR dela pela chave do Google AI Studio.
//
// reasoning_effort: 'none' desliga o "thinking" do Gemini 2.5. Sem isso o
// modelo gasta o orçamento de tokens pensando e devolve texto vazio, sem erro.

const AI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// 30/07/2026 — o gemini-2.5-flash saiu do ar antes da data anunciada e a camada
// de compatibilidade devolve 404 seco, sem corpo de erro. Em vez de cravar um
// modelo, a chamada percorre esta fila e pula pro próximo quando toma 404 ou
// 400. Ordem pensada pra volume alto: o mais barato e rápido primeiro.
// GEMINI_MODEL nas variáveis de ambiente entra na frente da fila, se existir.
//
// reasoning_effort: no 2.5 o valor 'none' desliga o thinking; na família 3.x o
// mínimo aceito é 'low'. O último candidato vai sem o parâmetro, como rede.
const CANDIDATOS = [
  { model: 'gemini-3.1-flash-lite', reasoning_effort: 'low' },
  { model: 'gemini-3.5-flash', reasoning_effort: 'low' },
  { model: 'gemini-2.5-flash-lite', reasoning_effort: 'none' },
  { model: 'gemini-3.1-flash-lite' },
];

// Mantido pra compatibilidade com quem importa AI_MODEL. O modelo realmente
// usado volta em generateLeadMessage().model.
export const AI_MODEL = CANDIDATOS[0].model;

// Chave única de toda a aplicação. Um lugar só pra ler, pra nunca divergir.
export function aiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// O free tier da Gemini limita requisições por minuto. Numa leva grande de
// leads o 429 é esperado, então a chamada tenta de novo com espera crescente
// em vez de perder o lead.
const RETRY_WAITS_MS = [3000, 8000];

const SYSTEM_PROMPT = `Você escreve mensagens curtas de primeiro contato para donos de pequenos
negócios no Brasil, oferecendo um serviço digital (site, automação de
atendimento no WhatsApp, ou os dois). Escreva como um brasileiro real
falando no WhatsApp: direto, natural, sem soar robô. Regras:
- 4 a 6 linhas na mensagem principal.
- Trate o negócio como único (use nome, categoria, cidade e reputação reais quando fizer sentido).
- Comece elogiando um ponto real do negócio antes de sugerir a melhoria — nunca abra criticando.
- Cite no máximo 1 dado de mercado, só se reforçar o ponto.
- NÃO use travessões, nem "espero que esteja bem", nem clichê de IA.
- NÃO invente que já é cliente nem prometa preço.
- Termine com uma pergunta leve que convide a responder.
- Nunca repita a mesma abertura de outra mensagem.
Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON.`;

const ANGULOS = ['elogio à reputação', 'observação sobre a categoria', 'pergunta direta', 'dado de mercado'];

const OFERTA_LABEL = {
  site: 'criação de um site profissional',
  automacao: 'automação de atendimento no WhatsApp com CRM e lembretes automáticos',
  completo: 'pacote completo: site profissional + automação de atendimento no WhatsApp com CRM e lembretes',
};

// lead: { name, category, city, rating, reviews_count, channel, oferta }
// niche: { label, leitor, tom, solucao, elogio_sugestao, pedido_demo, resumo } ou null
// Retorna { message, subject, usage } — subject só vem preenchido pra canal e-mail.
// Lança erro (com mensagem já pronta pra mostrar ao usuário) se a Gemini falhar.
export async function generateLeadMessage({ lead, niche, apiKey }) {
  const angulo = ANGULOS[Math.floor(Math.random() * ANGULOS.length)];
  const isEmail = lead.channel === 'email';
  const oferta = OFERTA_LABEL[lead.oferta] || OFERTA_LABEL.site;

  // Nicho estruturado (25/07/2026): em vez de um "resumo" solto, cada componente
  // vira uma instrução específica pro prompt — mais fácil de editar na tela e
  // mais fácil da IA seguir de forma consistente. "resumo" fica como fallback
  // pra nicho antigo que ainda não foi migrado pra estrutura nova.
  const partesNicho = [];
  if (niche?.leitor) partesNicho.push(`Quem provavelmente vai ler primeiro: ${niche.leitor}`);
  if (niche?.tom) partesNicho.push(`Tom de voz pra esse nicho: ${niche.tom}`);
  if (niche?.solucao) partesNicho.push(`Argumento/solução específica desse nicho: ${niche.solucao}`);
  if (niche?.elogio_sugestao) partesNicho.push(`Estrutura de elogio + sugestão: ${niche.elogio_sugestao}`);
  if (niche?.pedido_demo) partesNicho.push(`Sobre pedir demonstração grátis: ${niche.pedido_demo}`);
  if (partesNicho.length === 0 && niche?.resumo) partesNicho.push(niche.resumo);
  const contextoNicho = partesNicho.length > 0
    ? `Contexto do nicho "${niche.label}" (use pra calibrar tom, argumento e ângulo — não cite o texto literalmente):\n${partesNicho.join('\n')}`
    : '';

  const userPrompt = `Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Cidade: ${lead.city || 'não informado'}
Nota no Google: ${lead.rating ?? 'não informado'} (${lead.reviews_count ?? 0} avaliações)
Oferta desta mensagem: ${oferta}
${contextoNicho}
Ângulo desta mensagem: ${angulo}
Canal: ${isEmail ? 'e-mail' : 'whatsapp'}
${isEmail
    ? 'Responda em JSON: {"subject": "assunto curto, 5 a 8 palavras, sem clickbait", "message": "corpo do e-mail"}'
    : 'Responda em JSON: {"message": "texto da mensagem de whatsapp"}'}`;

  const fila = process.env.GEMINI_MODEL
    ? [{ model: process.env.GEMINI_MODEL, reasoning_effort: 'low' }, ...CANDIDATOS]
    : CANDIDATOS;

  const chamar = (candidato) => {
    const corpo = {
      model: candidato.model,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    };
    if (candidato.reasoning_effort) corpo.reasoning_effort = candidato.reasoning_effort;
    return fetch(AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(corpo),
    });
  };

  const tentativas = [];

  for (const candidato of fila) {
    let resp = null;
    let errBody = '';

    // Retry do 429 no mesmo modelo: é limite por minuto, não é modelo errado.
    for (let tentativa = 0; tentativa <= RETRY_WAITS_MS.length; tentativa += 1) {
      resp = await chamar(candidato);
      if (resp.ok) break;
      errBody = await resp.text();
      const valeRetry = resp.status === 429 || resp.status >= 500;
      if (!valeRetry || tentativa === RETRY_WAITS_MS.length) break;
      await sleep(RETRY_WAITS_MS[tentativa]);
    }

    // Modelo aposentado (404) ou parâmetro recusado (400): próximo da fila.
    if (!resp.ok && (resp.status === 404 || resp.status === 400)) {
      tentativas.push(`${candidato.model} -> ${resp.status} ${errBody.slice(0, 120)}`);
      continue;
    }

    if (!resp.ok) {
      if (resp.status === 429) {
        throw new Error(`Limite de requisições da Gemini atingido (429) mesmo após as tentativas. Espere um minuto e gere de novo. Detalhe: ${errBody.slice(0, 200)}`);
      }
      throw new Error(`Falha ao chamar a Gemini com ${candidato.model} (${resp.status}): ${errBody.slice(0, 300)}`);
    }

    const json = await resp.json();
    const choice = json?.choices?.[0];
    const raw = choice?.message?.content;
    if (!raw) {
      tentativas.push(`${candidato.model} -> vazio (${choice?.finish_reason || 'sem finish_reason'})`);
      continue;
    }

    // A camada de compatibilidade às vezes devolve o JSON dentro de cerca de
    // markdown. Limpa antes do parse, e ainda tenta achar o primeiro objeto
    // {...} do texto como último recurso.
    const limpo = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(limpo);
    } catch {
      const recorte = limpo.match(/\{[\s\S]*\}/);
      if (recorte) {
        try {
          parsed = JSON.parse(recorte[0]);
        } catch {
          parsed = null;
        }
      }
    }
    if (!parsed) {
      throw new Error(`A Gemini (${candidato.model}) respondeu num formato inesperado, não veio JSON válido. Início da resposta: ${limpo.slice(0, 160)}`);
    }

    const texto = String(parsed.message || '').trim();
    if (!texto) throw new Error(`A Gemini (${candidato.model}) respondeu sem o campo "message".`);

    return {
      message: texto,
      subject: isEmail ? String(parsed.subject || '').trim() : null,
      usage: json.usage || null,
      model: candidato.model,
    };
  }

  throw new Error(`Nenhum modelo da Gemini respondeu. Tentativas: ${tentativas.join(' | ')}`);
}
