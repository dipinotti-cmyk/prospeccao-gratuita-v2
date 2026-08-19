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

// Segunda mensagem: o link que o Diogo manda logo depois da abertura.
//
// Duas naturezas MUITO diferentes, e a mensagem muda conforme a natureza:
//
//   tipo 'cliente' — site real, de cliente real, no ar, com o nome do Diogo no
//                    rodape. Vale mais que qualquer prototipo, porque e prova
//                    e nao maquete. A mensagem pode dizer que ele FEZ aquilo.
//   tipo 'modelo'  — prototipo generico que o Diogo montou pro nicho. NUNCA
//                    pode ser apresentado como cliente: a mensagem diz com
//                    todas as letras que e um modelo.
//
// Mentir sobre isso derruba a venda no primeiro "de quem e esse site?" — e
// nao tem volta. Por isso a distincao esta no codigo, nao no julgamento da IA.
const REFERENCIAS = {
  nutricionista: {
    tipo: 'cliente',
    url: 'https://sindynutricionista.com.br',
    quem: 'a Dra. Sindy, nutricionista em Florianopolis',
    olhar: [
      'o CRN aparece no topo e no rodape, que e o que faz o paciente confiar antes de conhecer',
      'os depoimentos ficam na pagina dela, nao so no Google',
      'o botao de WhatsApp ja abre a conversa com nome e motivo preenchidos, entao quem clica chega pronto pra marcar',
    ],
    fechamento: 'Voce atende so presencial ou tambem online? Isso muda o que o site precisa ter.',
  },
  'clinica-odontologica': {
    tipo: 'modelo',
    url: 'https://demo-odonto-eight.vercel.app',
    olhar: [
      'os convenios atendidos ficam listados, que e a primeira pergunta de quem liga',
      'cada procedimento tem a sua propria explicacao, entao o paciente chega sabendo o que quer',
      'o formulario cai direto no WhatsApp da clinica, ja com o procedimento escolhido',
    ],
    fechamento: 'Voces atendem convenio ou so particular? Isso muda bastante o que a pagina precisa mostrar.',
  },
  'nail-design': {
    tipo: 'modelo',
    url: 'https://demo-unhas.vercel.app',
    olhar: [
      'a tabela de servicos com preco fica na pagina, entao some a enxurrada de "quanto e?" no direct',
      'as fotos ficam separadas por tipo de trabalho, nao misturadas no feed',
      'o agendamento cai no WhatsApp ja com o servico escolhido',
    ],
    fechamento: 'Voce atende em salao ou a domicilio? Muda o que a pagina precisa deixar claro.',
  },
  sobrancelha: {
    tipo: 'modelo',
    url: 'https://demo-sobrancelha.vercel.app',
    olhar: [
      'o antes e depois fica numa galeria propria, que e o que decide a cliente',
      'cada tecnica tem a sua explicacao, entao ela chega sabendo o que quer',
      'o agendamento cai no WhatsApp ja com a tecnica escolhida',
    ],
    fechamento: 'Voce trabalha mais com henna ou com design puro? Isso muda o que precisa aparecer primeiro.',
  },
};
// Apelidos: o mesmo nicho aparece com mais de um slug no banco.
REFERENCIAS.odontologia = REFERENCIAS['clinica-odontologica'];
// 'dentista' e o slug que existe de verdade no banco (label "Consultorio
// odontologico"). O mapa antigo so tinha 'clinica-odontologica', que nao casa
// com nicho nenhum — o link de odonto nunca era encontrado.
REFERENCIAS.dentista = REFERENCIAS['clinica-odontologica'];
REFERENCIAS.unhas = REFERENCIAS['nail-design'];
REFERENCIAS['design-sobrancelhas'] = REFERENCIAS.sobrancelha;

const SYSTEM_PROMPT = `Você escreve mensagens de primeiro contato para donos de pequenos negócios no
Brasil, oferecendo um serviço digital (site, automação de atendimento no
WhatsApp, ou os dois). Escreva como um brasileiro real digitando no celular:
direto, humano, sem cara de robô e sem cara de anúncio.

Você devolve DUAS mensagens, que serão enviadas uma logo depois da outra.

REGRA ZERO, ANTES DE TODAS AS OUTRAS: personalização falsa é pior que nenhuma.
Você só pode afirmar algo sobre este negócio se o dado estiver escrito no
briefing (nome, categoria, cidade, nota, número de avaliações). É PROIBIDO
deduzir como a pessoa trabalha, no que ela "foca", o que ela "valoriza" ou qual
é o "diferencial" dela. Frases como "percebi que você foca muito no acolhimento"
ou "vi que seu atendimento é humanizado" servem para qualquer negócio do país, e
é exatamente por isso que denunciam mensagem automática. Sem dado específico,
escreva MENOS: uma abertura curta e honesta vence um parágrafo de elogio
inventado.

MENSAGEM 1 — "abertura". No máximo 80 palavras. Parágrafos de uma ou duas
linhas, separados por linha em branco: é WhatsApp no celular, não é carta.
Nesta ordem:
a) saudação com o nome, e nada mais nessa linha;
b) UMA linha dizendo como você chegou até ele, com dado real do briefing
   (categoria, cidade, avaliações), registrando o fato que motivou o contato:
   ele não tem site. No máximo UM reconhecimento curto, e só se houver nota ou
   volume de avaliações que sustente. Elogio empilhado em duas frases seguidas
   soa a vendedor e queima a mensagem;
c) a DOR, como consequência concreta do dia a dia dele, com a palavra que ele
   mesmo usaria. Diga o que ele está perdendo HOJE, em situação real. É
   PROIBIDO "presença digital", "visibilidade", "posicionamento", "alavancar",
   "potencializar", "destravar", "no mundo digital";
d) uma frase curta dizendo que você resolve exatamente isso, ancorada no que
   você já entregou, nunca em adjetivo sobre você mesmo;
e) UMA pergunta, última linha, respondível com uma palavra.

MENSAGEM 2 — "demo". No máximo 90 palavras. Nesta ordem:
a) emenda na anterior, direto, sem recomeçar com saudação;
b) o marcador {LINK}, escrito exatamente assim, entre chaves, sozinho na linha.
   NUNCA escreva uma URL, nunca invente endereço: escreva só {LINK};
c) os pontos que o briefing mandar ele reparar, um por linha, cada linha
   começando com "· ". Use o conteúdo do briefing, só ajustando a fluidez;
d) uma frase dizendo que o dele não seria igual, e por quê;
e) a pergunta de fechamento que o briefing indicar, como última linha.

PERGUNTAS — é o que decide se a mensagem funciona. UMA pergunta por mensagem,
sempre a última linha, em parágrafo próprio, respondível em uma palavra ou uma
linha. É PROIBIDO fazer duas perguntas seguidas. É PROIBIDO fechar com pergunta
vazia: "O que você acha?", "Faz sentido pra você?", "Podemos conversar?",
"Posso te mandar mais detalhes?". Pergunta vazia não pede nada, e por isso não
recebe nada.

Regras que valem para as duas mensagens:
- Nunca abra criticando o negócio.
- Cite no máximo 1 dado de mercado, e só se reforçar o ponto.
- NÃO use travessão. NÃO escreva "espero que esteja bem", "venho por meio
  deste", "sei que seu tempo é valioso" nem qualquer clichê de IA.
- NÃO invente que já é cliente, NÃO prometa preço, NÃO prometa resultado em
  número ("dobrar", "300% a mais").
- NÃO invente NOME PRÓPRIO. Nome de pessoa, de clínica, de estúdio, de bairro
  ou de cidade só entra na mensagem se estiver escrito no briefing, letra por
  letra. Onde falta o nome, escreva a descrição sem nome ("uma nutricionista
  em Florianópolis") — nunca preencha o buraco com um nome plausível. Um nome
  inventado é descoberto no primeiro clique e derruba a conversa inteira.
- NÃO prometa montar rascunho, protótipo, print ou proposta exclusiva pra ele.
  O que existe pra mostrar é o link da mensagem 2, e só. Prometer peça sob
  medida pra lead frio vira trabalho de graça e promessa que não se cumpre.
- No máximo um emoji, e só se couber natural.
- Nunca repita a mesma primeira frase de outra mensagem.
- O nome do negócio precisa aparecer.

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON.`;

// Angulo da abertura. Antes eram rotulos vagos ("elogio a reputacao"), que
// empurravam o modelo pro elogio generico. Agora cada angulo e uma DOR concreta,
// entao a variacao muda o argumento e nao so a embalagem.
const ANGULOS = [
  'quem procura no Google abre duas ou tres opcoes e decide ali mesmo; sem site, ele fica de fora dessa comparacao',
  'a pergunta que ele responde toda semana no WhatsApp e que uma pagina responderia sozinha',
  'a mensagem que chega fora do horario e so e respondida no dia seguinte, quando a pessoa ja resolveu com outro',
  'quem chega pelo Google nao acha preco, servico nem horario, e desiste antes de perguntar',
];

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
  // Referencia da 2a mensagem. O que o Diogo preencheu no painel manda; o mapa
  // REFERENCIAS aqui embaixo e so o padrao de fabrica dos nichos que ja existiam.
  const padrao = REFERENCIAS[lead.niche_slug] || REFERENCIAS[niche?.slug] || null;
  const doPainel = String(niche?.demo_url || '').trim();
  const demoUrl = doPainel || padrao?.url || '';
  const querDemo = Boolean(demoUrl);

  // Natureza do link. Vale a do painel quando o link veio de la; senao, a do
  // padrao. Trocar 'modelo' por 'cliente' e mentir pro lead, entao na duvida
  // (link novo, tipo em branco) o padrao seguro e 'modelo'.
  const tipo = doPainel ? (niche?.demo_tipo || 'modelo') : (padrao?.tipo || 'modelo');
  const ehCaseReal = querDemo && tipo === 'cliente';

  const olharPainel = String(niche?.demo_olhar || '')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const ref = {
    quem: (niche?.demo_quem || '').trim() || (doPainel ? '' : padrao?.quem) || 'um cliente meu',
    olhar: olharPainel.length ? olharPainel : (doPainel ? [] : padrao?.olhar || []),
    fechamento: (niche?.demo_fechamento || '').trim() || (doPainel ? '' : padrao?.fechamento || ''),
  };

  const partesNicho = [];
  if (niche?.leitor) partesNicho.push(`Quem provavelmente vai ler primeiro: ${niche.leitor}`);
  if (niche?.tom) partesNicho.push(`Tom de voz pra esse nicho: ${niche.tom}`);
  if (niche?.solucao) partesNicho.push(`Argumento/solução específica desse nicho: ${niche.solucao}`);
  if (niche?.elogio_sugestao) partesNicho.push(`Estrutura de elogio + sugestão: ${niche.elogio_sugestao}`);
  if (niche?.pedido_demo) partesNicho.push(`Sobre pedir demonstração grátis: ${niche.pedido_demo}`);
  if (partesNicho.length === 0 && niche?.resumo) partesNicho.push(niche.resumo);

  const contextoNicho = partesNicho.length > 0
    ? `Contexto do nicho "${niche.label}" (use pra calibrar tom, argumento e ângulo, não cite o texto literalmente):\n${partesNicho.join('\n')}`
    : '';

  // O texto da segunda mensagem depende da NATUREZA do link. Site de cliente
  // real e prova; prototipo e maquete. Trocar um pelo outro e mentir, entao a
  // decisao e do codigo e nao do modelo.
  const olharTxt = ref.olhar.length
    ? `\nPontos pra mandar ele reparar quando abrir (um por linha, comecando com "\u00b7 "):\n${ref.olhar.map((x) => `\u00b7 ${x}`).join('\n')}`
    : '';
  const fechamentoTxt = ref.fechamento
    ? `\nPergunta de fechamento da mensagem 2, ultima linha (use esta ideia, pode ajustar as palavras): ${ref.fechamento}`
    : '';

  let contextoDemo = '';
  if (querDemo && ehCaseReal) {
    contextoDemo = `O link da segunda mensagem e um site REAL, de cliente REAL, no ar, feito por voce. Pra dizer de quem e, use EXATAMENTE estas palavras, sem trocar e sem acrescentar nome nenhum: "${ref.quem}". Diga na primeira pessoa, com naturalidade ("fiz o site de ..."), porque isso e prova entregue e nao maquete. E PROIBIDO chamar de prototipo, modelo ou exemplo, e e PROIBIDO inventar o nome do cliente: se nao esta escrito ali em cima, nao existe.${olharTxt}\nDepois dos pontos, uma frase dizendo que o dele nao seria igual, porque o negocio e outro.${fechamentoTxt}`;
  } else if (querDemo) {
    contextoDemo = `O link da segunda mensagem e um MODELO que voce montou pra esse tipo de negocio. NAO e cliente e NAO foi entregue pra ninguem: e PROIBIDO apresentar como trabalho feito pra alguem ou dizer que e de um cliente. Escreva com todas as letras que e um modelo.${olharTxt || '\nNo modelo o visitante ve o negocio inteiro, os servicos e um formulario que cai direto no WhatsApp. Escolha UM ponto que resolva a dor citada na abertura e mande a pessoa reparar nele.'}\nDeixe claro que no dele entram as fotos, os servicos e o contato dele.${fechamentoTxt}`;
  }

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
        : (ehCaseReal
          ? `Ah, e pra você não precisar imaginar: esse aqui é um site que eu fiz, de ${ref.quem}.\n\n${demoUrl}\n\nO seu não seria igual, porque o seu público é outro. ${ref.fechamento || 'Quer que eu te mostre como ficaria com o seu conteúdo?'}`
          : `Ah, e pra você não precisar imaginar, olha esse modelo que eu montei pra esse tipo de negócio:\n\n${demoUrl}\n\nÉ um modelo, não é de cliente. No seu entram suas fotos, seus serviços e o contato caindo direto no seu WhatsApp. ${ref.fechamento || 'Me diz o que achou?'}`);
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
