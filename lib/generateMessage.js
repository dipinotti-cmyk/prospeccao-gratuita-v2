// Geração de mensagem por IA — usada tanto na primeira leva automática
// (apify-webhook, assim que os leads chegam) quanto no botão "Gerar" manual
// (regenerate.js). Centralizada aqui pra nunca divergir entre os dois lugares.
//
// 30/07/2026: migrado da OpenAI para a Gemini (free tier), pelo endpoint de
// compatibilidade OpenAI do Google. A chave é lida de GEMINI_API_KEY e, se não
// existir, o app avisa que ela falta.
//
// 04/08/2026: a IA passou a devolver DUAS mensagens, não uma. É o fluxo que já
// é usado na mão: manda a abertura atacando a dor e, logo em seguida, manda o
// protótipo. A segunda mensagem só é gerada quando existe link de demonstração
// pro nicho, e o link NUNCA é escrito pela IA (ela escreve o marcador {LINK} e
// o código troca) — modelo de linguagem inventa URL.
//
// 02/09/2026: reposicionamento completo. O app deixou de prospectar negócio
// local genérico (mecânica, barbearia, nutricionista...) e passou a mirar
// SÓ donos de loja de produto físico de alta margem (semijoias, moda,
// decoração...) achados pelo Google Maps em região de alto poder aquisitivo —
// o funil que alimenta o novo posicionamento nacional do diogopinotti.com.br
// como especialista Nuvemshop. A oferta virou a loja virtual Nuvemshop, não
// mais site institucional ou automação de WhatsApp. Contexto completo e a
// lista de nichos/regiões em docs/prospeccao-ecommerce-alta-renda.md, no
// repo lupixa-agents.
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
  // Sem fallback pra OPENAI_API_KEY: naquele nome mora uma chave da OpenAI
  // de verdade, e manda-la pro endpoint da Gemini so gera erro enganoso.
  return process.env.GEMINI_API_KEY || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RETRY_WAITS_MS = [3000, 8000];

// A segunda mensagem — o link que vai depois da abertura — e configurada por
// nicho na aba Nichos do painel, e fica no banco. Nao existe mais mapa de
// fallback aqui: ter link em dois lugares garante que um dia os dois discordem,
// e o errado e o que vai pro cliente.
//
// O que o banco guarda por nicho:
//   demo_url        link do modelo ou do site do cliente
//   demo_tipo       'cliente' (site real entregue) | 'modelo' (prototipo)
//   demo_quem       de quem e o site, quando for cliente
//   demo_olhar      pontos pra mandar o lead reparar, um por linha
//   demo_fechamento pergunta que fecha a segunda mensagem
//
// Nicho sem demo_url gera so a mensagem de abertura, e a tela avisa isso.

const SYSTEM_PROMPT = `Você escreve mensagens de primeiro contato para donos de loja de produto
físico de alta margem no Brasil (semijoias, moda, decoração, acessórios,
perfumaria e nichos parecidos), encontrados pelo Google Maps numa região de
alto poder aquisitivo. Você oferece a criação (ou reformulação) da loja
virtual deles na Nuvemshop — não site institucional, não automação de
WhatsApp. Escreva como um brasileiro real digitando no celular: direto,
humano, sem cara de robô e sem cara de anúncio.

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
a) saudação de verdade com o PRIMEIRO nome, e nada mais nessa linha: "Oi, Fabiane",
   "Olá, Estefany", "Bom dia, Marcos". O nome do negócio no briefing costuma vir
   completo e cheio de palavra-chave ("Nutricionista Fabiane Saldanha Sperb -
   Emagrecimento"); extraia dali só o primeiro nome da pessoa. Abrir a mensagem com
   o nome sozinho, sem saudação, parece etiqueta de crachá e entrega automação;
b) UMA linha dizendo como você chegou até ele, com dado real do briefing
   (categoria, cidade, avaliações), e o fato que motivou o contato. Sobre esse
   fato, cuidado: é PROIBIDO afirmar "você não vende online" ou "você não tem
   loja virtual". Você não sabe disso — sabe apenas o que está no perfil do
   Google dele, e tem gente que vende por fora sem linkar lá. Diga o que o
   briefing mostra em "Link no perfil do Google": se for Instagram, Linktree
   ou WhatsApp, cite o que viu ("no seu perfil do Google o link vai pro
   Instagram"); se for "nenhum", diga que não achou link de loja no perfil. É
   a mesma informação, só que verificável — e se ele já vender online, você
   não passa por quem não pesquisou. No máximo UM reconhecimento curto, e só se houver nota ou
   volume de avaliações que sustente. Elogio empilhado em duas frases seguidas
   soa a vendedor e queima a mensagem;
c) a DOR, como consequência concreta do dia a dia dele, com a palavra que ele
   mesmo usaria. Diga o que ele está perdendo HOJE, em situação real — venda
   que só acontece quando alguém entra na loja ou manda DM, alcance travado
   na própria cidade, pedido perdido fora do horário de atendimento. É
   PROIBIDO "presença digital", "visibilidade", "posicionamento", "alavancar",
   "potencializar", "destravar", "no mundo digital";
d) uma frase curta dizendo que você resolve exatamente isso, ancorada no que
   você já entregou, nunca em adjetivo sobre você mesmo;
e) UMA pergunta, última linha, respondível com uma palavra.

MENSAGEM 2 — campo "demo_intro". No máximo 50 palavras. Nesta ordem, e SÓ
isto — a frase final e a pergunta de fechamento são escritas por outro
processo, depois do seu texto, então não escreva nenhuma das duas:
a) emenda na anterior, direto, sem recomeçar com saudação;
b) o marcador {LINK}, escrito exatamente assim, entre chaves, sozinho na linha.
   NUNCA escreva uma URL, nunca invente endereço: escreva só {LINK};
c) os pontos que o briefing mandar ele reparar, um por linha, cada linha
   começando com "· ". Use o conteúdo do briefing, só ajustando a fluidez.
NÃO feche a mensagem, NÃO faça pergunta, NÃO escreva frase de encerramento
nem nada sobre "o seu não seria igual" — isso não é seu trabalho aqui.

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
- É PROIBIDO qualquer frase no molde "eu não faço/crio/monto X antes de Y"
  ("não crio prévia antes de fechar", "não faço protótipo sem compromisso"),
  em QUALQUER lugar da mensagem. Frase assim é recusa, soa sovina, e
  contradiz o próprio argumento de venda dele, que É fazer prévia sem
  pedirem. Você nunca precisa dizer o que não vai fazer — só venda o que já
  fez.
- No máximo um emoji, e só se couber natural.
- Nunca repita a mesma primeira frase de outra mensagem.
- O nome do negócio precisa aparecer.

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON.`;

// Angulo da abertura. Antes eram rotulos vagos ("elogio a reputacao"), que
// empurravam o modelo pro elogio generico. Agora cada angulo e uma DOR concreta,
// entao a variacao muda o argumento e nao so a embalagem.
//
// 02/09/2026: reescritos pro reposicionamento e-commerce/Nuvemshop — a dor
// deixou de ser "nao tem site" e passou a ser "so vende dentro da loja
// fisica ou por DM no Instagram", que e a dor real de quem tem produto bom
// e alta margem mas alcance travado na propria cidade.
const ANGULOS = [
  'a loja fisica fecha a noite e no feriado; uma loja virtual continua vendendo',
  'quem pesquisa o produto no Google antes de comprar nao encontra quem so vende na loja e no Instagram',
  'toda venda hoje depende de alguem entrar na loja ou mandar DM; carrinho com frete calculado e PIX fecha sozinho',
  'concorrente do mesmo nicho ja vende pro Brasil inteiro numa loja virtual, enquanto o alcance daqui e so quem passa na porta',
];

// 02/09/2026: 'nuvemshop' e a oferta central do reposicionamento — loja
// virtual de e-commerce, nao mais site institucional. site/automacao/completo
// ficam como legado (nao apagar: leads antigos no banco ainda usam esses
// valores), mas nenhuma rodada nova deveria escolhe-los pra este app.
const OFERTA_LABEL = {
  nuvemshop: 'criação (ou reformulação) da loja virtual completa na Nuvemshop, com catálogo, pagamento e frete integrados',
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

// 02/09/2026 (2): pega qualquer paragrafo em que a IA tenha desobedecido a
// instrucao e escrito frase de recusa mesmo assim ("nao crio previa antes
// de fechar", "nao ofereco protótipo sem compromisso"...). Defesa em
// profundidade: o prompt já pede pra IA nunca escrever isso, mas veio
// escrito mesmo assim em producao (achado real, ver pendencia 76 em
// data/pendencias.md do repo lupixa-agents) — então o código também filtra.
const PADRAO_RECUSA = /\bn[ãa]o\s+\w+(\s+\w+){0,4}\s+(pr[ée]via|prot[óo]tipo|rascunho|amostra|simula[çc][ãa]o|layout)\b/i;

function semParagrafosDeRecusa(texto) {
  return String(texto)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !PADRAO_RECUSA.test(p))
    .join('\n\n');
}

// A frase que fecha a segunda mensagem antes da pergunta. Deixou de ser
// trabalho da IA (ela nunca escrevia igual ao pedido, e às vezes ainda
// escrevia recusa mesmo proibida) — sempre positiva, sempre determinística.
function fraseNaoSeriaIgual({ ehCaseReal, ehFallbackHome }) {
  if (ehCaseReal) {
    return 'A sua ficaria com a cara do seu negócio: os produtos, as fotos e o catálogo são todos seus.';
  }
  if (ehFallbackHome) {
    return 'A sua ficaria com a identidade da sua marca, não com a de mais ninguém: os produtos e as fotos são seus.';
  }
  return 'A sua entraria com as suas fotos, os seus produtos e o seu contato: feita pro seu negócio, não genérica.';
}

// 02/09/2026 (2): a pergunta de fechamento também deixou de ser trabalho da
// IA — ela ignorava a pergunta configurada por nicho 100% das vezes num
// teste real (33 de 33 leads caíram em "qual a faixa de preço das peças
// que mais saem hoje", uma pergunta administrativa fraca). Agora é sempre
// a pergunta configurada no nicho (ref.fechamento) ou este padrão — nunca
// escrita pela IA. O padrão ataca a dor central do reposicionamento: venda
// que hoje só fecha por perto/por DM, sem alcançar quem mora longe.
const FECHAMENTO_PADRAO = 'Hoje, como vocês fecham uma venda com alguém que mora longe?';

// lead: { name, category, city, rating, reviews_count, channel, oferta, niche_slug }
// niche: { slug, label, leitor, tom, solucao, elogio_sugestao, pedido_demo, demo_url, resumo } ou null
//
// Retorna { message, demo, demoUrl, subject, usage, model }.
//   message = mensagem de abertura (mantém o nome antigo, pra não quebrar quem já importa)
//   demo    = segunda mensagem, sempre presente — case/modelo do nicho, ou a
//             home do site (diogopinotti.com.br) quando o nicho não tem nenhum dos dois
//   subject = assunto, só preenchido pra canal e-mail
export async function generateLeadMessage({ lead, niche, apiKey }) {
  const angulo = ANGULOS[Math.floor(Math.random() * ANGULOS.length)];
  const isEmail = lead.channel === 'email';
  const oferta = OFERTA_LABEL[lead.oferta] || OFERTA_LABEL.nuvemshop;

  // 02/09/2026: todo lead agora sai com as DUAS mensagens, sempre. Nicho com
  // case real ou modelo usa o link dele; nicho sem nenhum dos dois cai no
  // fallback da HOME do site (diogopinotti.com.br) — nunca fica sem 2a
  // mensagem. Se um dia existir uma landing dedicada de Nuvemshop confirmada
  // no ar, trocar so esta constante.
  const HOME_FALLBACK_URL = 'https://diogopinotti.com.br';

  const nicheDemoUrl = String(niche?.demo_url || '').trim();
  const demoUrl = nicheDemoUrl || HOME_FALLBACK_URL;
  const ehCaseReal = Boolean(nicheDemoUrl) && niche?.demo_tipo === 'cliente';
  const ehFallbackHome = !nicheDemoUrl;

  const ref = {
    quem: String(niche?.demo_quem || '').trim() || 'um cliente meu',
    olhar: String(niche?.demo_olhar || '').split('\n').map((l) => l.trim()).filter(Boolean),
    fechamento: String(niche?.demo_fechamento || '').trim(),
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

  // 02/09/2026 (2): a IA repetidamente ignorava as instrucoes pra 2a metade
  // da mensagem 2 -- mesmo PROIBIDO explicitamente, continuava escrevendo
  // frase de recusa ("nao crio previa antes de fechar") e, pior, IGNORAVA
  // por completo a pergunta de fechamento configurada por nicho, sempre
  // caindo em "qual a faixa de preco das pecas que mais saem hoje" (achado
  // real: 33 de 33 leads testados). Modelo pequeno (Gemini flash-lite) nao
  // tem fidelidade suficiente pra essas duas frases especificas. Solucao:
  // pararam de ser trabalho da IA. Ela so escreve o "demo_intro" (emenda +
  // {LINK} + pontos pra reparar); a frase de "nao seria igual" e a pergunta
  // de fechamento sao montadas AQUI, deterministicas, no fim da funcao --
  // ver fraseNaoSeriaIgual() e FECHAMENTO_PADRAO.
  const olharTxt = ref.olhar.length
    ? `\nPontos pra mandar ele reparar quando abrir (um por linha, comecando com "\u00b7 "):\n${ref.olhar.map((x) => `\u00b7 ${x}`).join('\n')}`
    : '';

  let contextoDemo = '';
  if (ehCaseReal) {
    contextoDemo = `O link da segunda mensagem e um site REAL, de cliente REAL, no ar, feito por voce. Pra dizer de quem e, use EXATAMENTE este conteudo, sem trocar e sem acrescentar nome nenhum: "${ref.quem}". A unica liberdade e a preposicao, pra frase sair em portugues correto ("fiz o site da Dra. Sindy", nunca "fiz o site de a Dra. Sindy"). Diga na primeira pessoa, com naturalidade, porque isso e prova entregue e nao maquete. E PROIBIDO chamar de prototipo, modelo ou exemplo, e e PROIBIDO inventar o nome do cliente: se nao esta escrito ali em cima, nao existe.${olharTxt}`;
  } else if (!ehFallbackHome) {
    contextoDemo = `O link da segunda mensagem e um MODELO que voce montou pra esse tipo de negocio. NAO e cliente e NAO foi entregue pra ninguem: e PROIBIDO apresentar como trabalho feito pra alguem ou dizer que e de um cliente. Escreva com todas as letras que e um modelo.${olharTxt || '\nNo modelo o visitante ve o negocio inteiro, os servicos e um formulario que cai direto no WhatsApp. Escolha UM ponto que resolva a dor citada na abertura e mande a pessoa reparar nele.'}`;
  } else {
    contextoDemo = `Este nicho ainda nao tem case nem modelo proprio, entao o link da segunda mensagem e a HOME do site profissional (diogopinotti.com.br) -- NAO e caso nem modelo especifico desse tipo de negocio. E PROIBIDO chamar de modelo, prototipo ou exemplo desse nicho: e simplesmente o site dele, onde da pra ver outros projetos de loja virtual ja entregues.${olharTxt || '\nPontos pra citar (um por linha, comecando com "\u00b7 "):\n\u00b7 outros projetos de loja virtual que ele ja entregou\n\u00b7 cada loja com a cara da marca do cliente, sem parecer modelo pronto'}`;
  }

  const formatoJson = isEmail
    ? 'Responda em JSON: {"subject": "assunto curto, 5 a 8 palavras, sem clickbait", "abertura": "corpo do e-mail", "demo_intro": "emenda + {LINK} + pontos pra reparar, SEM fechar a mensagem"}'
    : 'Responda em JSON: {"abertura": "primeira mensagem de whatsapp", "demo_intro": "emenda + {LINK} + pontos pra reparar, SEM fechar a mensagem"}';

  const userPrompt = `Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Cidade: ${lead.city || 'não informado'}
Nota no Google: ${lead.rating ?? 'não informado'} (${lead.reviews_count ?? 0} avaliações)
Link no perfil do Google: ${lead.website || 'nenhum'}
Oferta desta mensagem: ${oferta}
${contextoNicho}
Ângulo desta mensagem: ${angulo}
Canal: ${isEmail ? 'e-mail' : 'whatsapp'}
${contextoDemo}
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

    // 02/09/2026 (2): só a intro (emenda + link + pontos) vem da IA agora.
    // "demo_intro" é o campo novo; "demo" fica aceito como fallback pra não
    // quebrar se algum candidato de modelo ainda responder no formato
    // antigo. semParagrafosDeRecusa() é a segunda trava contra frase de
    // recusa, além do prompt já não pedir mais isso.
    const introBruto = semParagrafosDeRecusa(semTravessao(parsed.demo_intro || parsed.demo || ''));
    let intro;
    if (introBruto) {
      intro = aplicarLink(introBruto, demoUrl);
    } else if (ehCaseReal) {
      intro = aplicarLink(`Ah, e pra você não precisar imaginar: esse aqui é um site que eu fiz, da ${ref.quem}.\n\n{LINK}`, demoUrl);
    } else if (!ehFallbackHome) {
      intro = aplicarLink('Ah, e pra você não precisar imaginar, olha esse modelo que eu montei pra esse tipo de negócio:\n\n{LINK}', demoUrl);
    } else {
      intro = aplicarLink('Ah, e de quebra: aqui você vê outros projetos de loja virtual que eu já entreguei.\n\n{LINK}', demoUrl);
    }

    // Frase de "não seria igual" e pergunta de fechamento: sempre
    // determinísticas, nunca escritas pela IA (ver comentário acima de
    // FECHAMENTO_PADRAO).
    const demo = [intro, fraseNaoSeriaIgual({ ehCaseReal, ehFallbackHome }), ref.fechamento || FECHAMENTO_PADRAO]
      .filter(Boolean)
      .join('\n\n');

    return {
      message: abertura,
      demo,
      demoUrl,
      subject: isEmail ? semTravessao(parsed.subject || '') || null : null,
      usage: json.usage || null,
      model: candidato.model,
    };
  }

  throw new Error(`Nenhum modelo da Gemini respondeu. Tentativas: ${tentativas.join(' | ')}`);
}
