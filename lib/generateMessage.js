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
//
// 02/09/2026 (2) — DIRECAO PREMIUM. O Diogo reprovou os textos gerados na
// primeira rodada do pivot. Os quatro defeitos, e o que mudou por causa deles:
//
//   1. A pergunta final prometia trabalho de graca ("quer ver como ficaria com
//      o catalogo de voces?" = montar uma loja pro sujeito antes de vender).
//      Agora a pergunta final QUALIFICA (canal, ticket, alcance) e nunca
//      oferece previa, rascunho ou montagem.
//   2. A dor era generica ("deixa de registrar pedido fora do horario") e
//      cabia em padaria. Agora a dor e de PRODUTO DE TICKET ALTO e esta ligada
//      a dinheiro: peca cara nao fecha por DM, quem esta em outra cidade
//      desiste sem carrinho/frete na tela, e pedir preco no direct e um filtro
//      que derruba venda ja decidida.
//   3. Tom de freelancer pedindo permissao ("topa dar uma olhada num
//      exemplo?"). Agora quem escreve se apresenta como parceiro certificado
//      Nuvemshop que escolhe cliente, e a mensagem 2 diz com todas as letras o
//      que ele NAO faz (nao monta loja de amostra) — postura, e voz do Diogo.
//   4. Lead que nao e loja (conserto de joia, feira de rua, leilao) recebia o
//      discurso de loja virtual. Agora o modelo QUALIFICA ANTES de escrever e
//      devolve {"qualificado": false, "motivo": "..."} sem texto nenhum.
//
// Pesquisa que sustenta a mudanca (fontes em
// lupixa-agents/docs/prospeccao-mensagem-premium.md): estudo Gong com 304 mil
// e-mails frios (CTA de interesse 12% de resposta contra 7% do pedido de
// reuniao, e 68% das respostas positivas contra 41%); pergunta aberta de
// processo ("como voces fazem isso hoje?") em vez de fechada de sim/nao;
// pergunta de implicacao do SPIN pra ligar a dor a dinheiro sem prometer
// numero; desqualificacao suave como postura; e a pratica brasileira de
// WhatsApp de se identificar na primeira linha (mensagem anonima e bloqueio).
//
// CONTRATO DE SAIDA NOVO — quem consome esta funcao precisa saber:
// o retorno agora tem { qualificado, motivo }. Quando qualificado === false,
// message e demo voltam VAZIOS e motivo diz por que o lead nao serve. O
// chamador (regenerate.js, apify-webhook.js) decide o que fazer: marcar o lead
// como nao qualificado em vez de gravar mensagem.
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

const SYSTEM_PROMPT = `Você escreve a primeira mensagem que o Diogo Pinotti manda para donos de loja de
produto físico de alta margem no Brasil (semijoias, moda, decoração,
acessórios, perfumaria e nichos parecidos), achados pelo Google Maps em região
de alto poder aquisitivo.

QUEM ESTÁ FALANDO: o Diogo é parceiro certificado da Nuvemshop e constrói ou
migra loja virtual nessa plataforma. Ele não é freelancer atrás de serviço: é
especialista com agenda ocupada que viu um negócio que valia o contato. A
mensagem tem que soar como quem escolhe cliente, não como quem pede permissão
para mostrar trabalho. Escreva NA PRIMEIRA PESSOA, como se fosse o próprio Diogo
digitando ("Aqui é o Diogo, eu construo loja virtual na Nuvemshop"), como um
brasileiro real no celular: frase curta, uma ideia por linha, sem cara de robô e
sem cara de anúncio.

PASSO 1 — QUALIFICAR ANTES DE ESCREVER UMA PALAVRA.

Olhe o nome e a categoria do negócio no briefing e decida: este negócio vende
PRODUTO FÍSICO PRÓPRIO, que caberia num catálogo de loja virtual com foto,
preço e botão de comprar?

Conta como SIM: loja, boutique, joalheria, ateliê que vende peça pronta, marca
própria, galeria que vende obra, empório, floricultura que entrega arranjo.

Conta como NÃO: serviço puro (conserto, manutenção, assistência técnica, ourives
que só conserta, costureira que só ajusta), feira ou mercado de rua, casa de
leilões, atacadista que só revende marca de terceiro, restaurante, bar, salão,
clínica, escritório, e qualquer coisa que não tenha produto próprio para vender
pela internet.

Se for NÃO, devolva exatamente isto e PARE, sem escrever mensagem nenhuma:
{"qualificado": false, "motivo": "até 12 palavras dizendo o que o negócio é", "abertura": "", "demo": ""}

Forçar discurso de loja virtual em quem vende serviço queima o contato e o nome
de quem mandou. Na dúvida entre os dois, qualifique como NÃO: lead de menos não
custa nada, mensagem errada custa reputação.

Se for SIM, devolva "qualificado": true e escreva as duas mensagens abaixo, que
serão enviadas uma logo depois da outra.

REGRA ZERO, ANTES DE TODAS AS OUTRAS: personalização falsa é pior que nenhuma.
Você só pode afirmar algo sobre este negócio se o dado estiver escrito no
briefing (nome, categoria, cidade, nota, número de avaliações, link do perfil).
É PROIBIDO deduzir como a pessoa trabalha, no que ela "foca", o que ela
"valoriza" ou qual é o "diferencial" dela. Frases como "percebi que você foca
muito no acolhimento" servem para qualquer negócio do país, e é por isso que
denunciam mensagem automática. Sem dado específico, escreva MENOS.

O QUE PODE SER ALEGADO COMO PROVA — nada além desta lista:
- que ele é parceiro certificado da Nuvemshop;
- que já entregou loja na Nuvemshop para semijoias, moda e decoração;
- o case específico que vier no briefing da mensagem 2, com o nome escrito
  exatamente como estiver lá.
É PROIBIDO inventar quantidade de clientes, faturamento, percentual de aumento
ou qualquer número de resultado. Prova é o que está escrito aqui, e só.

MENSAGEM 1 — "abertura". No máximo 80 palavras. Parágrafos de uma ou duas
linhas, separados por linha em branco: é WhatsApp no celular, não é carta.
Nesta ordem:

a) saudação de verdade com o PRIMEIRO nome, e nada mais nessa linha: "Oi,
   Fabiane", "Bom dia, Marcos". O nome do negócio no briefing costuma vir cheio
   de palavra-chave; extraia dali só o primeiro nome da pessoa. Se não houver
   nome de pessoa nenhum no briefing, use uma saudação sem nome ("Oi, bom dia")
   e NUNCA invente um nome;

b) UMA linha dizendo quem é o Diogo e como chegou até o negócio, com dado real
   do briefing. Quem manda mensagem sem se identificar é bloqueado: o nome
   "Diogo" e o que ele faz entram já nesta linha. Sobre como chegou, é PROIBIDO afirmar
   "você não vende online" ou "você não tem loja virtual" - ele não sabe disso.
   Diga o que o briefing mostra em "Link no perfil do Google": se for Instagram
   ou Linktree, cite o que viu; se for "nenhum", diga que não achou link de loja
   no perfil. No máximo UM reconhecimento curto, e só se a nota ou o volume de
   avaliações sustentar;

c) a DOR, e ela precisa estar ligada a DINHEIRO que não entra, na situação
   concreta de quem vende produto caro. Use o ângulo que vier no briefing. O que
   faz esta mensagem funcionar é ela ser específica de produto de ticket alto -
   peça cara que não fecha por conversa, cliente de outra cidade que desiste sem
   ver frete e prazo, pessoa que não pergunta preço no direct e some. É PROIBIDO
   dor genérica que serve para padaria ("perde pedido fora do horário",
   "presença digital", "visibilidade", "posicionamento", "alavancar",
   "potencializar", "destravar", "no mundo digital");

d) UMA frase curta dizendo o que ele faz, ancorada na prova da lista acima,
   nunca em adjetivo sobre ele mesmo. Ele afirma o que faz, não pergunta se
   pode fazer;

e) UMA pergunta, última linha, sobre o NEGÓCIO DELE - nunca sobre o trabalho do
   Diogo. Ela existe para qualificar: como a venda acontece hoje, se já vende
   para fora da cidade, quanto sai por direct. Tem que ser respondível em uma
   linha.

MENSAGEM 2 — "demo". No máximo 90 palavras. Nesta ordem:

a) emenda na anterior, direto, sem recomeçar com saudação;

b) o marcador {LINK}, escrito exatamente assim, entre chaves, sozinho na linha.
   NUNCA escreva uma URL, nunca invente endereço: escreva só {LINK};

c) os pontos que o briefing mandar reparar, um por linha, cada linha começando
   com "· ". Use o conteúdo do briefing, só ajustando a fluidez;

d) UMA frase dizendo o limite - o que ele não faz, ou por que o do lead não
   seria igual a esse. Dizer o que não é vale mais que adjetivo: é o que separa
   quem tem trabalho entregue de quem está tentando conseguir o primeiro;

e) a pergunta de fechamento que o briefing indicar, como última linha. Ela é a
   pergunta que qualifica de verdade: faixa de preço do que mais vende, quanto
   da venda sai por direct, se já vende para fora do estado.

PERGUNTAS - é o que decide se a mensagem funciona. UMA pergunta por mensagem,
sempre na última linha, em parágrafo próprio, respondível em uma linha. É
PROIBIDO fazer duas perguntas seguidas.

A pergunta é sempre sobre a operação DELE, nunca um pedido de permissão nem uma
oferta de trabalho. Está PROIBIDO, literalmente e em qualquer variação:
"Quer ver como ficaria com o catálogo de vocês?", "Quer que eu monte como
ficaria?", "Quer ver como ficaria com a sua coleção?", "Quer que eu te mostre
como ficaria com a sua marca?", "Topa dar uma olhada?", "Posso te mandar mais
detalhes?", "O que você acha?", "Faz sentido pra você?", "Podemos conversar?".
As primeiras prometem trabalho de graça; as últimas não pedem nada e por isso
não recebem nada.

É PROIBIDO oferecer prévia, rascunho, protótipo, print, simulação, "como
ficaria", proposta exclusiva ou qualquer peça montada sob medida para este lead.
O que existe para mostrar é o link da mensagem 2, e ponto. Lead frio não ganha
trabalho antes de virar cliente.

Regras que valem para as duas mensagens:
- Nunca abra criticando o negócio.
- Cite no máximo 1 dado de mercado, e só se reforçar o ponto.
- NÃO use travessão. NÃO escreva "espero que esteja bem", "venho por meio
  deste", "sei que seu tempo é valioso" nem qualquer clichê de IA.
- Zero adjetivo de venda: nada de completo, profissional, incrível, moderno,
  sob medida, elegante, robusto, de alta qualidade. Se sair um, apague.
- NÃO invente que já é cliente, NÃO prometa preço, NÃO prometa resultado em
  número ("dobrar", "300% a mais").
- NÃO invente NOME PRÓPRIO. Nome de pessoa, de loja, de bairro ou de cidade só
  entra se estiver escrito no briefing, letra por letra. Onde falta o nome,
  escreva a descrição sem nome. Nome inventado é descoberto no primeiro clique.
- No máximo um emoji, e só se couber natural. O padrão é nenhum.
- Nunca repita a mesma primeira frase de outra mensagem.
- O nome do negócio precisa aparecer.

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON.`;

// Angulo da abertura. Antes eram rotulos vagos ("elogio a reputacao"), que
// empurravam o modelo pro elogio generico. Agora cada angulo e uma DOR concreta,
// entao a variacao muda o argumento e nao so a embalagem.
//
// 02/09/2026 (2): reescritos de novo. Os anteriores ("a loja fisica fecha a
// noite", "pedido perdido no fim de semana") serviam pra padaria e por isso nao
// serviam pra ninguem. Agora todo angulo e especifico de PRODUTO DE TICKET
// ALTO e termina em dinheiro que nao entra. O melhor deles e o do preco: pedir
// preco no direct e constrangimento, e constrangimento derruba venda que ja
// estava decidida — isso e verdade de peca cara e nao e verdade de pao.
const ANGULOS = [
  'pra comprar peca cara o cliente quer ver preco sozinho antes de falar com alguem; pedir preco no direct e um constrangimento que derruba venda ja decidida',
  'quem esta em outra cidade nao fecha peca de ticket alto por conversa: sem carrinho, frete calculado e prazo na tela, ele desiste no meio',
  'catalogo bom preso no Instagram vende uma peca por conversa, uma de cada vez; com catalogo e checkout a mesma peca vende sem ninguem precisar digitar',
  'margem alta so vira caixa quando o alcance passa da propria cidade, e loja fisica limita o alcance a quem passa na porta',
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

// lead: { name, category, city, rating, reviews_count, channel, oferta, niche_slug }
// niche: { slug, label, leitor, tom, solucao, elogio_sugestao, pedido_demo, demo_url, resumo } ou null
//
// Retorna { message, demo, demoUrl, subject, usage, model }.
//   message = mensagem de abertura (mantém o nome antigo, pra não quebrar quem já importa)
//   demo    = segunda mensagem, sempre presente — case/modelo do nicho, ou a
//             home do site (diogopinotti.com.br) quando o nicho não tem nenhum dos dois
//   subject = assunto, só preenchido pra canal e-mail
//
// 02/09/2026 (2) — CAMPOS NOVOS: { qualificado, motivo }.
//   qualificado = false quando o lead NAO vende produto fisico proprio
//                 (conserto, feira, leilao, servico). Nesse caso message e demo
//                 voltam '' e motivo diz o que o negocio e, em poucas palavras.
//   O chamador decide o que fazer: o certo e marcar o lead como nao qualificado
//   em vez de gravar mensagem vazia.
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
  if (niche?.elogio_sugestao) partesNicho.push(`Como reconhecer o negócio sem bajular: ${niche.elogio_sugestao}`);
  // 02/09/2026 (2): o rótulo era "Sobre pedir demonstração grátis", e era ele
  // que empurrava o modelo pra oferecer prévia. O campo continua se chamando
  // pedido_demo no banco (nao vale migracao de coluna por isso), mas o que ele
  // guarda agora e a PROVA que se cita, nao a demo que se oferece.
  if (niche?.pedido_demo) partesNicho.push(`Prova que pode ser citada nesse nicho: ${niche.pedido_demo}`);
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
  if (ehCaseReal) {
    contextoDemo = `O link da segunda mensagem e um site REAL, de cliente REAL, no ar, feito por ele. Pra dizer de quem e, use EXATAMENTE este conteudo, sem trocar e sem acrescentar nome nenhum: "${ref.quem}". A unica liberdade e a preposicao, pra frase sair em portugues correto ("fiz a loja da Settima", nunca "fiz a loja de a Settima"). Diga na primeira pessoa, com naturalidade, porque isso e prova entregue e nao maquete. E PROIBIDO chamar de prototipo, modelo ou exemplo, e e PROIBIDO inventar o nome do cliente: se nao esta escrito ali em cima, nao existe.${olharTxt}\nDepois dos pontos, UMA frase de limite, na voz de quem ja tem trabalho entregue: ele nao monta loja de amostra pra mostrar antes de fechar, e o do lead nao sairia igual a esse porque o catalogo e outro. Escreva isso com naturalidade, sem soar defensivo e sem pedir desculpa.${fechamentoTxt}`;
  } else if (!ehFallbackHome) {
    contextoDemo = `O link da segunda mensagem e um MODELO que ele montou pra esse tipo de negocio. NAO e cliente e NAO foi entregue pra ninguem: e PROIBIDO apresentar como trabalho feito pra alguem ou dizer que e de um cliente. Escreva com todas as letras que e um modelo.${olharTxt || '\nNo modelo da pra ver o catalogo, a pagina do produto e o checkout funcionando. Escolha UM ponto que resolva a dor citada na abertura e mande a pessoa reparar nele.'}\nDepois dos pontos, UMA frase de limite: e modelo, nao e loja de cliente, e ele nao monta versao sob medida antes de fechar.${fechamentoTxt}`;
  } else {
    // O demo_olhar do nicho NAO entra aqui de proposito: ele descreve a loja
    // do case (preco na pagina, frete no carrinho...), e o link deste caminho
    // e a home do site, que e portfolio, nao loja. Citar "o carrinho com frete"
    // apontando pra home e mandar o lead procurar o que nao existe la.
    contextoDemo = `Este nicho ainda nao tem case nem modelo proprio, entao o link da segunda mensagem e o SITE DELE (diogopinotti.com.br) — NAO e caso nem modelo especifico desse tipo de negocio. E PROIBIDO chamar de modelo, prototipo ou exemplo desse nicho: e o site dele, onde da pra ver lojas Nuvemshop que ele ja entregou.\nPontos pra citar (um por linha, comecando com "· "):\n· as lojas Nuvemshop que ele ja entregou, cada uma com a cara da marca do cliente\n· como cada catalogo mostra preco e detalhe da peca sem depender de conversa\nDepois dos pontos, UMA frase de limite: sao lojas de outros nichos, entao o dele nao sairia igual, e ele nao monta previa antes de fechar.${fechamentoTxt || '\nPergunta de fechamento da mensagem 2, ultima linha, e ela precisa QUALIFICAR e ser sobre o negocio dele: Qual a faixa de preco do que mais sai hoje?'}`;
  }

  // Toda mensagem sai com as duas partes agora — o fallback da home garante
  // que sempre existe algo pra linkar na 2a, mesmo sem case/modelo do nicho.
  // 02/09/2026 (2): "qualificado" vem primeiro de proposito. O modelo decide se
  // o lead vende produto ANTES de escrever, e quando decide que nao, os dois
  // campos de texto voltam vazios.
  const formatoJson = isEmail
    ? 'Responda em JSON: {"qualificado": true ou false, "motivo": "so quando qualificado for false", "subject": "assunto curto, 5 a 8 palavras, sem clickbait", "abertura": "corpo do e-mail", "demo": "segundo paragrafo, com {LINK}"}'
    : 'Responda em JSON: {"qualificado": true ou false, "motivo": "so quando qualificado for false", "abertura": "primeira mensagem de whatsapp", "demo": "segunda mensagem de whatsapp, com {LINK}"}';

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

    // 02/09/2026 (2): a desqualificacao vem antes de tudo. Lead que nao vende
    // produto fisico proprio (conserto, feira, leilao) sai daqui sem texto
    // nenhum, e quem chamou decide o que fazer com ele. Nao gerar mensagem e o
    // resultado CERTO nesse caso, nao e erro.
    const qualificado = parsed.qualificado !== false;
    if (!qualificado) {
      return {
        qualificado: false,
        motivo: semTravessao(parsed.motivo || '') || 'nao vende produto fisico proprio',
        message: '',
        demo: '',
        demoUrl: null,
        subject: null,
        usage: json.usage || null,
        model: candidato.model,
      };
    }

    // "abertura" é o campo novo; "message" fica aceito pra não quebrar se o
    // modelo cair no formato antigo.
    const abertura = semTravessao(parsed.abertura || parsed.message || '');
    if (!abertura) {
      throw new Error(`A Gemini (${candidato.model}) respondeu sem o campo "abertura".`);
    }

    const bruto = semTravessao(parsed.demo || '');
    let demo;
    if (bruto) {
      demo = aplicarLink(bruto, demoUrl);
    } else if (ehCaseReal) {
      // 02/09/2026 (2): os tres fallbacks perdiam a direcao premium quando o
      // modelo esquecia o campo demo — terminavam em "quer que eu te mostre
      // como ficaria", que e a promessa de trabalho de graca que o Diogo
      // reprovou. Agora fecham em limite + pergunta que qualifica.
      // demo_quem vem com artigo ("a Settima, joalheria...") pro modelo escolher
      // a preposicao; aqui a frase e fixa, entao o artigo sai pra nao virar
      // "loja da a Settima".
      demo = `Essa é a loja da ${ref.quem.replace(/^(a|o|as|os)\s+/i, '')}, no ar.\n\n${demoUrl}\n\nA sua não sairia igual, o catálogo é outro, e eu não monto loja de amostra antes de fechar. ${ref.fechamento || 'Qual a faixa de preço do que mais sai hoje?'}`;
    } else if (!ehFallbackHome) {
      demo = `Esse aqui é um modelo que eu montei pra esse tipo de negócio:\n\n${demoUrl}\n\nÉ modelo, não é loja de cliente, e eu não faço versão sob medida antes de fechar. ${ref.fechamento || 'Qual a faixa de preço do que mais sai hoje?'}`;
    } else {
      demo = `Aqui dá pra ver as lojas Nuvemshop que eu já entreguei.\n\n${demoUrl}\n\nSão de outros nichos, então a sua não sairia igual, e eu não monto prévia antes de fechar. ${ref.fechamento || 'Qual a faixa de preço do que mais sai hoje?'}`;
    }

    return {
      qualificado: true,
      motivo: null,
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
