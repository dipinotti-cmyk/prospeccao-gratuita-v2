// Mensagem SEGUINTE pros dois modos de loja EXISTENTE (diagnostico-nuvemshop e
// migracao-plataforma) — separado de generateReply.js de propósito.
//
// 15/09/2026: achado em produção. O lead "Poder de Preta" (modo
// diagnostico-nuvemshop — já vende pela loja própria dele na Nuvemshop)
// respondeu "não sei se minha loja está ok, passo muito tempo sem vender", e
// o endpoint de responder.js chamou gerarMensagemSeguinte() de
// generateReply.js, que devolveu uma oferta de LOJA NOVA por R$1.900,
// ancorada em "até 40 produtos" — preço de construir do zero, pra quem já
// tem loja rodando. generateReply.js foi escrito pro funil original (dono de
// negócio sem loja nenhuma, vendendo por direct/WhatsApp): os ângulos de dor
// ("o cliente que pergunta no direct e não fecha porque ninguém respondeu")
// só fazem sentido pra quem não tem checkout funcionando. Loja Nuvemshop
// existente e loja em outra plataforma têm checkout — a dor é outra, e o
// primeiro passo não é vender loja nova, é o diagnóstico (grátis) ou a
// conversa sobre a plataforma atual.
//
// Por isso: nenhuma das duas mensagens daqui cita preço. Preço só entra
// quando o lead pedir, e nesse caso o Diogo responde na mão com o número
// real (gestão mensal R$300/mês, lupixa-agents/templates/tabela-precos.md) —
// a IA não tem essa régua ainda pra decidir sozinha quando é hora de cobrar.
import { chamarIAJson, semTravessao } from './generateMessage';

const SYSTEM_PROMPT = `Você responde, pelo WhatsApp, o dono de uma loja de e-commerce que JÁ EXISTE — ele
acabou de responder sua primeira mensagem. Ele está do outro lado agora.
Escreva como gente que faz esse trabalho há anos: direto, sem se desculpar
por perguntar, sem enrolar.

Você responde o que ELE disse. Não é roteiro de apresentação, e não é venda
de loja nova — a loja dele já existe.

O MODO desta conversa (vem no briefing) muda o que você oferece a seguir:
- diagnostico-nuvemshop: a loja dele já é Nuvemshop. Você não constrói loja
  nova, você configura e otimiza a que já existe. Se ele descreveu algum
  problema (não vende, não sabe se está bem configurada, etc.), ofereça
  olhar a loja AGORA, de graça, sem compromisso, e dizer o que encontrar.
- migracao-plataforma: a loja dele está numa plataforma que não é a
  Nuvemshop. Nunca critique a plataforma atual. Se ele contou alguma
  dificuldade real com ela, pergunte mais sobre isso, ou ofereça mostrar
  como ficaria a loja dele na Nuvemshop — sem comparar preço com a
  plataforma atual, você não sabe quanto ele paga lá.

ESTRUTURA — 2 ou 3 blocos curtos, separados por linha em branco, cabendo
numa tela de celular sem rolar:

1) UMA frase respondendo DIRETO o que ele disse. Não repita a frase dele de
   volta ("você disse que..."), responda o conteúdo.

2) A oferta concreta do próximo passo (olhar a loja agora / conversar mais
   sobre o que ele contou), sem prazo, sem preço, sem "vamos marcar uma
   reunião" genérico.

3) UMA pergunta final, última linha, aberta (ele responde com uma frase, não
   com sim/não/múltipla escolha), específica pro que ele disse — nunca uma
   pergunta genérica que serviria pra qualquer lead.

PROIBIDO, sem exceção:
- citar QUALQUER valor em R$, parcela ou desconto — nesta mensagem não se
  cobra nada, o próximo passo é grátis;
- escrever o nome de um plano ("Start", "Pro", "Advanced") ou a palavra
  "plano";
- adjetivo de venda: incrível, completo, profissional, premium, excelente,
  fantástico, exclusivo, robusto, poderoso;
- elogio genérico ("que legal seu trabalho", "adorei a loja de vocês");
- prometer prazo de entrega ou de resposta;
- travessão, em qualquer lugar;
- inventar dado sobre o negócio dele que não esteja escrito no que ele
  respondeu ou no briefing;
- lista de recursos/features, com ou sem marcador;
- passar de 5 linhas no celular (mensagem inteira abaixo de 700 caracteres).

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON:
{"mensagem": "o texto pronto pra colar no WhatsApp, com quebras de linha"}`;

// Perguntas variam por modo — cada lista é uma forma diferente de abrir o
// próximo passo, não só embalagem diferente da mesma pergunta.
const PERGUNTAS_DIAGNOSTICO = [
  'como está a visita na loja hoje',
  'se o problema parece ser mais gente não achando a loja, ou gente chegando e não comprando',
  'há quanto tempo a loja está nesse ritmo de poucas vendas',
  'o que ele acha que mais afasta quem chega na loja e não compra',
];

const PERGUNTAS_MIGRACAO = [
  'o que mais incomoda na plataforma atual no dia a dia',
  'se o problema é mais o custo, a limitação de recurso, ou o suporte',
  'há quanto tempo a loja está nessa plataforma',
  'o que faria ele considerar trocar de plataforma hoje',
];

const OFERTA_PROXIMO_PASSO = {
  'diagnostico-nuvemshop': 'oferecer olhar a loja Nuvemshop dele agora mesmo, de graça, sem compromisso, e dizer o que encontrar',
  'migracao-plataforma': 'oferecer mostrar como ficaria a loja dele na Nuvemshop, sem comparar preço com a plataforma atual (você não sabe quanto ele paga lá)',
};

function sorteia(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

const ADJETIVOS_PROIBIDOS = /\b(incr[íi]ve(l|is)|complet[oa]s?|profissional|premium|excelente|fant[áa]stic[oa]s?|exclusiv[oa]s?|robust[oa]s?|poderos[oa]s?)\b/i;
const LIMITE_CARACTERES = 700;

// Devolve a lista de problemas do texto. Vazia = pode mandar pro Diogo.
function problemasDoTexto(texto) {
  const problemas = [];

  // Nesta mensagem NENHUM valor em R$ é permitido — diferente de
  // generateReply.js, que tem uma tabela de preço válida pra citar.
  if (/R\$\s*[\d.,]+/.test(texto)) {
    problemas.push('citou um valor em R$, e nesta mensagem não se cobra nada ainda');
  }
  if (/\bplanos?\b/i.test(texto)) {
    problemas.push('escreveu a palavra "plano"');
  }
  const adjetivo = texto.match(ADJETIVOS_PROIBIDOS);
  if (adjetivo) {
    problemas.push(`usou o adjetivo de venda "${adjetivo[0]}"`);
  }
  if (/^\s*[·\-*•]\s/m.test(texto)) {
    problemas.push('montou lista com marcador, e aqui não pode lista');
  }
  if (texto.length > LIMITE_CARACTERES) {
    problemas.push(`ficou com ${texto.length} caracteres, e o limite é ${LIMITE_CARACTERES}`);
  }

  return problemas;
}

// lead: { name, category, niche_slug, city, site_tipo, oferta, ... }
// modo: 'diagnostico-nuvemshop' | 'migracao-plataforma'
// respostaLead: o que ele respondeu no WhatsApp, colado pelo Diogo
//
// Retorna { mensagem, usage, model, avisos } — sem plano/quantidade, esta
// mensagem não precifica nada.
export async function gerarMensagemSeguinteLojaExistente({ lead, modo, respostaLead, niche, apiKey }) {
  const texto = String(respostaLead || '').trim();
  if (!texto) throw new Error('Sem o texto que o lead respondeu não dá pra escrever a próxima mensagem.');

  const perguntas = modo === 'migracao-plataforma' ? PERGUNTAS_MIGRACAO : PERGUNTAS_DIAGNOSTICO;
  const pergunta = sorteia(perguntas);
  const proximoPasso = OFERTA_PROXIMO_PASSO[modo] || OFERTA_PROXIMO_PASSO['diagnostico-nuvemshop'];

  const userPrompt = `MODO desta conversa: ${modo}

O que o lead respondeu no WhatsApp, palavra por palavra (responda ISTO, não invente outra coisa):
"""
${texto}
"""

Briefing do lead (só o que está escrito aqui é verdade sobre ele):
Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Nicho: ${niche?.label || lead.niche_slug || 'não informado'}
Cidade: ${lead.city || 'não informado'}
Plataforma detectada: ${lead.site_tipo || 'não informado'}

PRÓXIMO PASSO a oferecer (bloco 2), escreva com as suas palavras: ${proximoPasso}.
PERGUNTA final desta mensagem (bloco 3), adapte a redação pro que ele disse: ${pergunta}.

Responda em JSON: {"mensagem": "texto pronto pra colar no WhatsApp"}`;

  const avisos = [];
  let mensagem = '';
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  let model = null;

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const reforco = tentativa === 0
      ? userPrompt
      : `${userPrompt}\n\nATENÇÃO: a tentativa anterior falhou nisto, corrija e reescreva a mensagem inteira: ${avisos.join('; ')}.`;

    const r = await chamarIAJson({ system: SYSTEM_PROMPT, user: reforco, apiKey, temperature: 0.85 });
    usage.prompt_tokens += Number(r.usage?.prompt_tokens || 0);
    usage.completion_tokens += Number(r.usage?.completion_tokens || 0);
    model = r.model;
    mensagem = semTravessao(r.parsed.mensagem || r.parsed.message || r.parsed.texto || '');
    if (!mensagem) throw new Error(`A Gemini (${r.model}) respondeu sem o campo "mensagem".`);

    const problemas = problemasDoTexto(mensagem);
    if (problemas.length === 0) {
      avisos.length = 0;
      break;
    }
    avisos.length = 0;
    avisos.push(...problemas);
  }

  const avisosFinais = avisos.length
    ? [`Confira antes de mandar: a IA ${avisos.join('; e ')}.`]
    : [];

  return { mensagem, usage, model, avisos: avisosFinais };
}
