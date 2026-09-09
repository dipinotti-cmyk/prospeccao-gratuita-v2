// Mensagem SEGUINTE: a que vai depois que o lead responde a abertura.
//
// 03/09/2026: nasceu porque o Diogo escrevia essa mensagem na mão toda vez, e
// porque a IA da primeira mensagem NÃO serve aqui — ela é prompt de primeiro
// contato (qualificar, apresentar, achar a dor). Quando o lead já respondeu, o
// jogo é outro: é vendedor sênior de loja premium respondendo o que foi
// perguntado, com preço na mesa. Três textos genéricos foram reprovados num
// lead real (JEJE_JOIAS, perguntou "quanto custa?") antes de a estrutura
// abaixo ser aprovada — ela é a regra, não uma sugestão.
//
// 03/09/2026 (2), depois do primeiro teste real em 3 leads:
//   - os três abriram com a MESMA frase ("cada cliente que desiste no direct
//     sem ver o frete..."). Uma frase que se repete em todo lead é assinatura
//     de robô. Agora o ângulo da consequência, a ponte do fechamento e a
//     pergunta final são sorteados de listas (ANGULOS/PONTES/PERGUNTAS), do
//     mesmo jeito que a primeira mensagem já fazia com ANGULOS em
//     generateMessage.js;
//   - os três escreveram "plano Pro" e "plano Start" pro cliente. Nome de
//     plano é vocabulário interno, e cliente que ouve "plano Pro" começa a
//     comparar tabela em vez de comprar. O preço agora é ancorado no TAMANHO
//     da loja ("loja com até 40 peças"), como no texto que o Diogo aprovou;
//   - nenhum citou o que a loja leva junto (Sacolinha do Instagram, Google
//     Shopping, Nuvem Marketing). Agora dois desses itens vão escolhidos no
//     briefing, pra dar concretude sem virar lista de recursos.
//
// A tabela de preço NUNCA é escrita aqui: vem de lib/planos.js, fonte única.
// A IA recebe os números já prontos e é proibida de calcular qualquer coisa —
// modelo de linguagem erra parcela e inventa desconto.
import { chamarIAJson, semTravessao } from './generateMessage';
import {
  PLANOS,
  PLANO_PADRAO,
  planoPorQuantidade,
  planoAnterior,
  linhaPlano,
  tabelaPrecoTexto,
  valoresPermitidos,
  detectarQuantidade,
} from './planos';

const SYSTEM_PROMPT = `Você é um VENDEDOR SÊNIOR de loja premium respondendo, pelo WhatsApp, um dono de
loja física de produto de alta margem (joia, moda, decoração) que JÁ respondeu
sua primeira mensagem. Ele está do outro lado agora. Escreva como gente que
vende há anos e não precisa impressionar: direto, seguro, curto. Vendedor
sênior não pede desculpa por cobrar, não enrola antes de dar o preço e não
repete o que o cliente acabou de dizer.

Você responde o que ELE perguntou. Não é um roteiro de apresentação.

ESTRUTURA OBRIGATÓRIA — 4 blocos curtos, nesta ordem, separados por linha em
branco, cabendo numa tela de celular sem rolar:

1) UMA frase de consequência ligada a dinheiro, específica do negócio dele. O
   briefing traz o ângulo desta mensagem: use ELE, escrito com as suas
   palavras. Uma frase. Não é parágrafo, não é diagnóstico, não é pergunta.

2) O preço, ancorado no TAMANHO da loja, com o resultado colado nele: o que
   muda na operação (preço na tela, frete calculado no carrinho, catálogo
   organizado, pedido entrando sozinho de madrugada). Diga "loja com até N
   peças: R$ X", como quem já vendeu isso muitas vezes. Cite os dois itens que
   o briefing mandar citar, na mesma frase do preço, sem transformar em lista.
   Use a palavra "investimento" no máximo uma vez, e nunca "custo".

3) Parcelamento e a ponte de fechamento que o briefing indicar: abertura pra
   negociar a FORMA de pagamento e o TAMANHO da loja. Nunca abertura pra
   baixar o preço: é PROIBIDO escrever "dá pra negociar o valor", "consigo um
   desconto", "fazemos um preço", "cabe no seu bolso".

4) A pergunta final que o briefing indicar, adaptada com as suas palavras.
   UMA pergunta, última linha, respondível em uma linha.

PROIBIDO, sem exceção:
- escrever o NOME do plano ou a palavra "plano" ("plano Pro", "plano Start",
  "nosso plano"). Isso é vocabulário interno. Fale em "loja com até 40 peças",
  "a versão menor, até 15 peças". Cliente que ouve nome de plano começa a
  comparar tabela em vez de comprar;
- parágrafo de contexto antes de responder o que foi perguntado;
- elogio genérico ("que legal seu trabalho", "adorei suas peças");
- repetir a pergunta dele antes de responder ("você perguntou quanto custa");
- mais de uma metáfora na mensagem inteira;
- adjetivo de venda: incrível, completo, profissional, premium, excelente,
  fantástico, exclusivo, robusto, poderoso;
- lista de recursos/features, com ou sem marcador;
- passar de 6 linhas no celular (mensagem inteira abaixo de 900 caracteres);
- prometer prazo de entrega (você não tem prazo confirmado);
- travessão, em qualquer lugar;
- inventar dado sobre o negócio dele que não esteja escrito no briefing.

PREÇO: use SÓ os números que vierem escritos no briefing, copiados letra por
letra. É PROIBIDO calcular parcela, somar, arredondar, dar desconto novo ou
citar valor de parcela em 10x (a taxa é da operadora e você não sabe qual é).
Se ele não disse quantas peças tem, não finja saber: ancore no tamanho de loja
indicado no briefing e deixe a pergunta final resolver isso.

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON:
{"mensagem": "o texto pronto pra colar no WhatsApp, com quebras de linha"}`;

// O texto aprovado pelo Diogo. Vai pro prompt como exemplo de FORMA (ritmo,
// tamanho, ordem dos blocos), não de conteúdo pra copiar.
const EXEMPLO_APROVADO = `Cada "quanto custa?" no direct é uma venda esperando alguém responder. Na loja, ela fecha sozinha.

Loja com até 40 peças, Sacolinha do Instagram, Google Shopping e Nuvem Marketing: R$ 1.900. Pode ser em 3x de R$ 633 sem juros, R$ 1.805 à vista, ou em até 10x no cartão. Se quiser começar menor, com até 15 peças, R$ 1.300, em 3x de R$ 433 ou R$ 1.235 à vista, e depois a gente amplia.

Pra fechar, eu te mando uma proposta de uma página com tudo escrito, você decide com calma e a gente combina a forma de pagamento que couber no seu caixa.

Quantas peças você tem hoje?`;

// ————— Variação —————
//
// Sem isso, todo lead recebe a mesma primeira frase (aconteceu nos 3 primeiros
// testes reais). Cada lista é uma forma DIFERENTE de perder dinheiro, de
// fechar e de puxar o próximo passo: a variação muda o argumento, não só a
// embalagem.
const ANGULOS = [
  'a peça que o cliente pergunta no direct e não fecha, porque ninguém respondeu a tempo',
  'o cliente de outra cidade que gosta da peça, não vê o frete na tela e desiste calado',
  'o pedido que chega de madrugada e fica na fila até alguém acordar pra responder',
  'a venda que hoje depende de alguém entrar na loja, num dia de chuva ou feriado',
  'o cliente que pesquisa a peça no Google antes de comprar e acha o concorrente, não ela',
  'a peça de ticket mais alto, que o cliente não fecha por mensagem sem ver preço, frete e pagamento na tela',
  'o tempo que a equipe gasta respondendo preço e frete um por um no direct, em vez de vender',
];

const PONTES = [
  'oferecer uma proposta de uma página, com tudo escrito, pra ele decidir com calma, e combinar a forma de pagamento depois',
  'dizer que dá pra ajustar o tamanho da loja e a forma de pagamento pro que couber no caixa dele neste mês',
  'dizer que dá pra começar com a loja menor agora e ampliar depois, sem refazer nada, e que a forma de pagamento vocês combinam',
  'dizer que o parcelamento é escolha dele, e que o tamanho da loja se ajusta ao catálogo que ele tiver hoje',
];

const PERGUNTAS = [
  'quantas peças ele tem hoje pra colocar na loja',
  'se quer que você mande a proposta de uma página agora',
  'que dia desta semana dá pra uma conversa de 15 minutos',
  'quantas peças ele quer no ar já no primeiro mês',
  'se prefere começar pela loja menor ou já com o catálogo inteiro',
];

// O que a loja leva junto. Dois por mensagem, escolhidos aqui, pra dar
// concretude sem virar lista de features (o Diogo reprovou lista).
const ENTREGAS = [
  'Sacolinha do Instagram',
  'Google Shopping',
  'Nuvem Marketing',
  'frete calculado no carrinho',
  'Pix e cartão já integrados',
  'catálogo organizado por categoria',
];

function sorteia(lista, quantos = 1) {
  const copia = [...lista];
  const saida = [];
  for (let i = 0; i < quantos && copia.length; i += 1) {
    saida.push(...copia.splice(Math.floor(Math.random() * copia.length), 1));
  }
  return quantos === 1 ? saida[0] : saida;
}

// ————— Travas de qualidade —————
//
// O prompt já proíbe tudo isto, mas modelo pequeno desobedece: a primeira
// leva real escreveu "plano Pro" nas três mensagens mesmo com a estrutura
// mandando ancorar no tamanho da loja. Então o código confere e manda refazer.

// Qualquer "R$ x" que não esteja na tabela de lib/planos.js.
function precosInventados(texto) {
  const permitidos = new Set(valoresPermitidos());
  const achados = String(texto).match(/R\$\s*[\d.,]+/g) || [];
  return achados
    .map((v) => v.replace(/^R\$\s*/, '').replace(/[.,]$/, ''))
    .filter((v) => !permitidos.has(v));
}

const ADJETIVOS_PROIBIDOS = /\b(incr[íi]ve(l|is)|complet[oa]s?|profissional|premium|excelente|fant[áa]stic[oa]s?|exclusiv[oa]s?|robust[oa]s?|poderos[oa]s?)\b/i;
const LIMITE_CARACTERES = 900;

// Devolve a lista de problemas do texto. Vazia = pode mandar pro Diogo.
function problemasDoTexto(texto) {
  const problemas = [];

  const inventados = precosInventados(texto);
  if (inventados.length) {
    problemas.push(`citou ${inventados.map((v) => `R$ ${v}`).join(', ')}, que não está na tabela de preço`);
  }
  if (/\bplanos?\b/i.test(texto)) {
    problemas.push('escreveu a palavra "plano" (o preço tem que ser ancorado no tamanho da loja: "loja com até 40 peças")');
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

// lead: { name, category, niche_slug, city, ... } — o que já está gravado
// respostaLead: o que ele respondeu no WhatsApp, colado pelo Diogo
// niche: linha de prospeccao_niches, ou null
//
// Retorna { mensagem, plano, quantidade, usage, model, avisos }.
export async function gerarMensagemSeguinte({ lead, respostaLead, niche, apiKey }) {
  const texto = String(respostaLead || '').trim();
  if (!texto) throw new Error('Sem o texto que o lead respondeu não dá pra escrever a próxima mensagem.');

  const quantidade = detectarQuantidade(texto);
  const plano = planoPorQuantidade(quantidade) || PLANO_PADRAO;
  const menor = planoAnterior(plano);

  const angulo = sorteia(ANGULOS);
  const ponte = sorteia(PONTES);
  const pergunta = sorteia(PERGUNTAS);
  const entregas = sorteia(ENTREGAS, 2);

  const indicacao = quantidade
    ? `Ele falou em ${quantidade} peças/produtos, então o tamanho de loja indicado é o de até ${plano.ate} produtos.`
    : `Ele não disse quantas peças tem. Ancore na loja de até ${plano.ate} produtos e use a pergunta final pra descobrir a quantidade.`;

  const degrau = menor && menor.preco
    ? `Se couber oferecer um degrau menor pra ele começar, a loja menor é a de até ${menor.ate} peças: ${menor.precoTexto}, 3x de ${menor.parcela3x} sem juros, ${menor.aVista} à vista.`
    : 'Não existe tamanho menor pra oferecer como degrau neste caso.';

  const personalizado = plano.slug === 'personalizado'
    ? `ATENÇÃO: o catálogo dele passa de ${PLANOS[PLANOS.length - 2].ate} produtos, e acima disso o valor sai sob consulta: NÃO existe preço público nem parcelamento. É PROIBIDO citar qualquer número. Diga que o valor sai depois de ver o catálogo e puxe a call ou a proposta na pergunta final.`
    : '';

  const userPrompt = `O que o lead respondeu no WhatsApp, palavra por palavra (responda ISTO, não invente outra pergunta):
"""
${texto}
"""

Briefing do lead (só o que está escrito aqui é verdade sobre ele):
Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Nicho: ${niche?.label || lead.niche_slug || 'não informado'}
Cidade: ${lead.city || 'não informado'}

Tabela de preço da Lupixa, a única que existe (copie os números daqui, letra por letra, e NUNCA escreva o nome do plano pro cliente):
${tabelaPrecoTexto()}

Tamanho de loja indicado nesta mensagem: até ${plano.ate} produtos, ${plano.precoTexto}${plano.parcela3x ? `, 3x de ${plano.parcela3x} sem juros, ${plano.aVista} à vista no Pix` : ''}.
${indicacao}
${degrau}
${personalizado}

ÂNGULO da frase de consequência desta mensagem (bloco 1), escreva com as suas palavras e não copie: ${angulo}.
PONTE de fechamento desta mensagem (bloco 3): ${ponte}.
PERGUNTA final desta mensagem (bloco 4), adapte a redação: ${pergunta}.
CITE ESTES DOIS ITENS junto do preço, na mesma frase, sem virar lista: ${entregas.join(' e ')}.

O que a loja entrega, se precisar dizer o resultado: preço na tela, frete calculado no carrinho, catálogo organizado e pedido entrando sozinho fora do horário da loja.

Exemplo de mensagem APROVADA pelo Diogo (é o padrão de ritmo, tamanho e ordem dos blocos — não copie o texto nem o ângulo, escreva a desta conversa):
"""
${EXEMPLO_APROVADO}
"""

Responda em JSON: {"mensagem": "texto pronto pra colar no WhatsApp"}`;

  const avisos = [];
  let mensagem = '';
  // usage é acumulado: quando uma trava obriga a refazer, as DUAS chamadas
  // foram pagas, e o painel de custo tem que ver as duas.
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

  // Sobrou aviso: as duas tentativas falharam na mesma trava. A mensagem vai
  // pro Diogo mesmo assim (melhor editar uma mensagem quase pronta do que não
  // ter nenhuma), mas com o defeito escrito na tela.
  const avisosFinais = avisos.length
    ? [`Confira antes de mandar: a IA ${avisos.join('; e ')}.`]
    : [];

  return { mensagem, plano: plano.slug, quantidade, usage, model, avisos: avisosFinais };
}
