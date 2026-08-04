// Geração de mensagem por IA — usada tanto na primeira leva automática
// (apify-webhook, assim que os leads chegam) quanto no botão "Gerar" manual
// (regenerate.js). Centralizada aqui pra nunca divergir entre os dois lugares.
//
// 30/07/2026: migrado da OpenAI para a Gemini (free tier), pelo endpoint de
// compatibilidade OpenAI do Google. A chave é lida de GEMINI_API_KEY e, se não
// existir, de OPENAI_API_KEY.
//
// 04/08/2026: a IA passou a devolver DUAS mensagens, não uma. É o fluxo que já
// é usado na mão: manda a abertura atacando a dor e, logo em seguida, manda o
// protótipo. A segunda mensagem só é gerada quando existe link de demonstração
// pro nicho, e o link NUNCA é escrito pela IA (ela escreve o marcador {LINK} e
// o código troca) — modelo de linguagem inventa URL.
const AI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// A fila existe porque a camada de compatibilidade devolve 404 seco quando o
// modelo é aposentado. GEMINI_MODEL entra na frente da fila, se existir.
//
// reasoning_effort: no 2.5 o valor 'none' desliga o thinking; na família 3.x o
// mínimo aceito é 'low'. O último candidato vai sem o parâmetro, como rede.
//
// 04/08/2026: a cota do free tier é POR MODELO. Repetir o mesmo modelo na fila
// garante o mesmo 429, então o último candidato virou um modelo diferente.
const CANDIDATOS = [
  { model: 'gemini-3.1-flash-lite', reasoning_effort: 'low' },
  { model: 'gemini-3.5-flash', reasoning_effort: 'low' },
  { model: 'gemini-2.5-flash-lite', reasoning_effort: 'none' },
  { model: 'gemini-3.5-flash-lite' },
];

export const AI_MODEL = CANDIDATOS[0].model;

export function aiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RETRY_WAITS_MS = [3000, 8000];

// Link do protótipo por nicho. Serve de fallback: se o nicho no banco já tiver
// demo_url preenchido, ele ganha. A chave é o slug do nicho.
const DEMOS = {
  'clinica-odontologica': 'https://demo-odonto-eight.vercel.app',
  odontologia: 'https://demo-odonto-eight.vercel.app',
  'nail-design': 'https://demo-unhas.vercel.app',
  unhas: 'https://demo-unhas.vercel.app',
  sobrancelha: 'https://demo-sobrancelha.vercel.app',
  'design-sobrancelhas': 'https://demo-sobrancelha.vercel.app',
};

const SYSTEM_PROMPT = `Você escreve mensagens de primeiro contato para donos de pequenos negócios no
Brasil, oferecendo um serviço digital (site, automação de atendimento no
WhatsApp, ou os dois). Escreva como um brasileiro real digitando no celular:
direto, humano, sem cara de robô e sem cara de anúncio.

Você devolve DUAS mensagens, que serão enviadas uma logo depois da outra.

MENSAGEM 1 — "abertura" (4 a 6 linhas). Nesta ordem:
a) uma linha que prova que você olhou ESTE negócio: o nome dele, a nota, o
   número de avaliações, a cidade ou algo específico da categoria;
b) a DOR, escrita como consequência concreta do dia a dia dele, com a palavra
   que ele mesmo usaria. Diga o que ele está perdendo HOJE, em situação real.
   É PROIBIDO usar "presença digital", "visibilidade", "posicionamento",
   "alavancar", "potencializar", "destravar", "no mundo digital";
c) uma frase curta dizendo que você resolve exatamente isso;
d) uma pergunta leve, que dê pra responder com uma palavra.

MENSAGEM 2 — "demo" (3 a 5 linhas). Nesta ordem:
a) emenda na anterior, como um "ah, e...";
b) o marcador {LINK}, escrito exatamente assim, entre chaves. NUNCA escreva uma
   URL, nunca invente endereço de site: escreva só {LINK};
c) UM detalhe do protótipo que ataca justamente a dor citada na abertura, pra
   ele saber onde olhar quando abrir;
d) deixe claro que é um modelo e que o dele seria adaptado ao negócio dele;
e) termine perguntando o que ele achou.

Regras que valem para as duas mensagens:
- Comece pelo lado bom do negócio antes de apontar o que falta. Nunca abra
  criticando.
- Cite no máximo 1 dado de mercado, e só se reforçar o ponto.
- NÃO use travessão. NÃO escreva "espero que esteja bem", "venho por meio
  deste", "sei que seu tempo é valioso" nem qualquer clichê de IA.
- NÃO invente que já é cliente, NÃO prometa preço, NÃO prometa resultado em
  número ("dobrar", "300% a mais").
- No máximo um emoji, e só se couber natural.
- Nunca repita a mesma primeira frase de outra mensagem.
- O nome do negócio precisa aparecer.

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON.`;

const ANGULOS = ['elogio à reputação', 'observação sobre a categoria', 'pergunta direta', 'dado de mercado'];

const OFERTA_LABEL = {
  site: 'criação de um site profissional',
  automacao: 'automação de atendimento no WhatsApp com CRM e lembretes automáticos',
  completo: 'pacote completo: site profissional + automação de atendimento no WhatsApp com CRM e lembretes',
};

// Rede de segurança contra o vício de travessão do modelo.
function semTravessao(texto) {
  return String(texto)
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/[—–]/g, '-')
    .trim();
}

// A IA escreve {LINK}. Aqui o link real entra. Se ela esquecer o marcador, o
// link vai numa linha própria no fim, pra mensagem nunca sair sem link.
function aplicarLink(texto, url) {
  if (!texto) return '';
  const temMarcador = /\{LINK\}/i.test(texto);
  const pronto = temMarcador ? texto.replace(/\{LINK\}/gi, url) : `${texto}\n\n${url}`;
  return pronto.trim();
}

// lead: { name, category, city, rating, reviews_count, channel, oferta, niche_slug }
// niche: { slug, label, leitor, tom, solucao, elogio_sugestao, pedido_demo, demo_url, resumo } ou null
//
// Retorna { message, demo, demoUrl, subject, usage, model }.
//   message = mensagem de abertura (mantém o nome antigo, pra não quebrar quem já importa)
//   demo    = segunda mensagem, com o link do protótipo, ou null se o nicho não tiver demo
//   subject = assunto, só preenchido pra canal e-mail
export async function generateLeadMessage({ lead, niche, apiKey }) {
  const angulo = ANGULOS[Math.floor(Math.random() * ANGULOS.length)];
  const isEmail = lead.channel === 'email';
  const oferta = OFERTA_LABEL[lead.oferta] || OFERTA_LABEL.site;

  // Link do protótipo: primeiro o que estiver no nicho, depois o mapa local.
  const demoUrl = (niche?.demo_url || Dicho = [];
  if (niche?.leitor) partesNicho.push(`Quem provavelmente vai ler primeiro: ${niche.leitor}`);
  if (niche?.tom) partesNicho.push(`Tom de voz pra esse nicho: ${niche.tom}`);
  if (niche?.solucao) partesNicho.push(`Argumento/solução específica desse nicho: ${niche.solucao}`);
  if (niche?.elogio_sugestao) partesNicho.push(`Estrutura de elogio + sugestão: ${niche.elogio_sugestao}`);
  if (niche?.pedido_demo) partesNicho.push(`Sobre pedir demonstração grátis: ${niche.pedido_demo}`);
  if (partesNicho.length === 0 && niche?.resumo) partesNicho.push(niche.resumo);

  const contextoNicho = partesNicho.length > 0
    ? `Contexto do nicho "${niche.label}" (use pra calibrar tom, argumento e ângulo, não cite o texto literalmente):\n${partesNicho.join('\n')}`
    : '';

  const contextoDemo = querDemo
    ? 'O protótipo que você vai mandar na segunda mensagem é um site de exemplo pronto e navegável, feito para este nicho. Nele o visitante vê o negócio inteiro, os serviços e um formulário que cai direto no WhatsApp. Escolha UM ponto desse protótipo que resolva a dor que você citou na abertura e mande a pessoa reparar nele.'
    : '';

  const formatoJson = isEmail
    ? (querDemo
      ? 'Responda em JSON: {"subject": "assunto curto, 5 a 8 palavras, sem clickbait", "abertura": "corpo do e-mail", "demo": "parágrafo do protótipo, com {LINK}"}'
      : 'Responda em JSON: {"subject": "assunto curto, 5 a 8 palavras, sem clickbait", "abertura": "corpo do e-mail"}')
    : (querDemo
      ? 'Responda em JSON: {"abertura": "primeira mensagem de whatsapp", "demo": "segunda mensagem de whatsapp, com {LINK}"}'
      : 'Responda em JSON: {"abertura": "mensagem de whatsapp"}');

  const userPrompt = `Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Cidade: ${lead.city || 'não informado'}
Nota no Google: ${lead.rating ?? 'não informado'} (${lead.reviews_count ?? 0} avaliações)
Oferta desta mensagem: ${oferta}
${contextoNicho}
Ângulo desta mensagem: ${angulo}
Canal: ${isEmail ? 'e-mail' : 'whatsapp'}
${querDemo ? contextoDemo : 'NÃO existe protótipo para este nicho. Escreva SÓ a mensagem de abertura, sem prometer link nenhum.'}
${formatoJson}`;

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
      const valeRetry = resp.status === 429;
      if (!valeRetry || tentativa === RETRY_WAITS_MS.length) break;
      await sleep(RETRY_WAITS_MS[tentativa]);
    }

    if (!resp.ok) {
      tentativas.push(`${candidato.model} -> ${resp.status} ${errBody.slice(0, 120)}`);
      continue;
    }

    const json = await resp.json();
    const choice = json?.choices?.[0];
    const raw = choice?.message?.content;

    if (!raw) {
      tentativas.push(`${candidato.model} -> vazio (${choice?.finish_reason || 'sem finish_reason'})`);
      continue;
    }

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

    // "abertura" é o campo novo; "message" fica aceito pra não quebrar se o
    // modelo cair no formato antigo.
    const abertura = semTravessao(parsed.abertura || parsed.message || '');
    if (!abertura) {
      throw new Error(`A Gemini (${candidato.model}) respondeu sem o campo "abertura".`);
    }

    let demo = null;
    if (querDemo) {
      const bruto = semTravessao(parsed.demo || '');
      demo = bruto
        ? aplicarLink(bruto, demoUrl)
        : `Ah, e pra você não precisar imaginar, olha esse protótipo que eu montei pra esse tipo de negócio:\n\n${demoUrl}\n\nÉ um modelo. No seu entram suas fotos, seus serviços e o contato caindo direto no seu WhatsApp. Me diz o que achou?`;
    }

    return {
      message: abertura,
      demo,
      demoUrl: querDemo ? demoUrl : null,
      subject: isEmail ? semTravessao(parsed.subject || '') || null : null,
      usage: json.usage || null,
      model: candidato.model,
    };
  }

  throw new Error(`Nenhum modelo da Gemini respondeu. Tentativas: ${tentativas.join(' | ')}`);
}
