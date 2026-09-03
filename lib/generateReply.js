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
vende há anos e não precisa impressionar: direto, seguro, curto.

Você responde o que ELE perguntou. Não é um roteiro de apresentação.

ESTRUTURA OBRIGATÓRIA — 4 blocos curtos, nesta ordem, cabendo numa tela de
celular sem rolar:

1) UMA frase de consequência ligada a dinheiro, específica do nicho dele: peça
   que não fecha no direct, cliente de outra cidade que desiste sem ver o
   frete na tela, pedido de madrugada que fica na fila até alguém acordar. Uma
   frase. Não é parágrafo, não é diagnóstico.

2) O preço do plano indicado, com o RESULTADO colado nele: o que muda na
   operação (preço na tela, frete calculado, catálogo organizado, pedido
   entrando sozinho). Use a palavra "investimento", nunca "custo". Sem lista
   de recursos.

3) Parcelamento, e abertura pra negociar a FORMA de pagamento e o TAMANHO do
   plano. Nunca abertura pra baixar o preço: não escreva "dá pra negociar o
   valor", "consigo um desconto", "fazemos um preço".

4) UMA pergunta curta e concreta que puxa o próximo passo: quantas peças ele
   tem, se quer a proposta, que dia dá pra uma call de 15 minutos.

PROIBIDO, sem exceção:
- parágrafo de contexto antes de responder o que foi perguntado;
- elogio genérico ("que legal seu trabalho", "adorei suas peças");
- mais de uma metáfora na mensagem inteira;
- adjetivo de venda: incrível, completo, profissional, premium, excelente,
  fantástico, exclusivo, robusto;
- lista de recursos/features;
- passar de 6 linhas no celular;
- prometer prazo de entrega (você não tem prazo confirmado);
- travessão, em qualquer lugar;
- inventar dado sobre o negócio dele que não esteja escrito no briefing.

PREÇO: use SÓ os números que vierem escritos no briefing, copiados letra por
letra. É PROIBIDO calcular parcela, somar, arredondar, dar desconto novo ou
citar valor de parcela em 10x (a taxa é da operadora e você não sabe qual é).
Se ele não disse quantas peças tem, não finja saber: ancore no plano indicado
do briefing e deixe a pergunta final resolver isso.

Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON:
{"mensagem": "o texto pronto pra colar no WhatsApp, com quebras de linha"}`;

// O texto aprovado pelo Diogo, no caso do plano Pro. Vai pro prompt como
// exemplo de FORMA (ritmo, tamanho, ordem), não de conteúdo pra copiar.
const EXEMPLO_APROVADO = `Cada "quanto custa?" no direct é uma venda esperando alguém responder. Na loja, ela fecha sozinha.

Loja com até 40 peças, Sacolinha do Instagram, Google Shopping e Nuvem Marketing: R$ 1.900. Pode ser em 3x de R$ 633 sem juros, R$ 1.805 à vista, ou em até 10x no cartão. Se quiser começar menor, com até 15 peças, R$ 1.300, em 3x de R$ 433 ou R$ 1.235 à vista, e depois a gente amplia.

Pra fechar, eu te mando uma proposta de uma página com tudo escrito, você decide com calma e a gente combina a forma de pagamento que couber no seu caixa.

Quantas peças você tem hoje?`;

// Trava contra preço inventado: qualquer "R$ x" que não esteja na tabela é
// motivo pra refazer a mensagem uma vez. Modelo pequeno adora calcular
// parcela sozinho, e preço errado no WhatsApp é o pior erro possível aqui.
function precosInventados(texto) {
  const permitidos = new Set(valoresPermitidos());
  const achados = String(texto).match(/R\$\s*[\d.,]+/g) || [];
  return achados
    .map((v) => v.replace(/^R\$\s*/, '').replace(/[.,]$/, ''))
    .filter((v) => !permitidos.has(v));
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

  const indicacao = quantidade
    ? `Ele falou em ${quantidade} peças/produtos, então o plano indicado é o ${plano.nome}.`
    : `Ele não disse quantas peças tem. Ancore no plano ${plano.nome} e use a pergunta final pra descobrir a quantidade.`;

  const degrau = menor && menor.preco
    ? `Se fizer sentido oferecer um degrau menor pra ele começar, o plano abaixo é o ${menor.nome}: ${menor.precoTexto}, até ${menor.ate} produtos, 3x de ${menor.parcela3x} sem juros, ${menor.aVista} à vista.`
    : 'Não existe plano menor pra oferecer como degrau neste caso.';

  const personalizado = plano.slug === 'personalizado'
    ? `ATENÇÃO: o plano indicado é o Personalizado (acima de ${PLANOS[PLANOS.length - 2].ate} produtos). Ele NÃO tem preço público nem parcelamento: diga que o valor sai sob consulta depois de ver o catálogo, e puxe a call ou a proposta na pergunta final. É PROIBIDO citar um número.`
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

Tabela de preço da Lupixa, a única que existe (copie os números daqui, letra por letra):
${tabelaPrecoTexto()}

Plano indicado desta mensagem: ${linhaPlano(plano)}
${indicacao}
${degrau}
${personalizado}

O que o plano entrega, se precisar dizer o resultado: loja virtual Nuvemshop com preço na tela, frete calculado no carrinho, catálogo organizado, Sacolinha do Instagram, Google Shopping e pedido entrando sozinho fora do horário da loja.

Exemplo de mensagem APROVADA pelo Diogo (é o padrão de ritmo, tamanho e ordem dos blocos — não copie o texto, escreva a desta conversa):
"""
${EXEMPLO_APROVADO}
"""

Responda em JSON: {"mensagem": "texto pronto pra colar no WhatsApp"}`;

  const avisos = [];
  let mensagem = '';
  // usage é acumulado: quando a trava de preço obriga a refazer, as DUAS
  // chamadas foram pagas, e o painel de custo tem que ver as duas.
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  let model = null;

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const reforco = tentativa === 0
      ? userPrompt
      : `${userPrompt}\n\nATENÇÃO: a tentativa anterior citou um valor em reais que NÃO está na tabela. Reescreva usando exclusivamente os números da tabela acima, sem calcular nada.`;

    const r = await chamarIAJson({ system: SYSTEM_PROMPT, user: reforco, apiKey, temperature: 0.8 });
    usage.prompt_tokens += Number(r.usage?.prompt_tokens || 0);
    usage.completion_tokens += Number(r.usage?.completion_tokens || 0);
    model = r.model;
    mensagem = semTravessao(r.parsed.mensagem || r.parsed.message || r.parsed.texto || '');
    if (!mensagem) throw new Error(`A Gemini (${r.model}) respondeu sem o campo "mensagem".`);

    const inventados = precosInventados(mensagem);
    if (inventados.length === 0) break;
    if (tentativa === 1) avisos.push(`Confira os valores: a IA citou ${inventados.map((v) => `R$ ${v}`).join(', ')}, que não está na tabela.`);
  }

  return { mensagem, plano: plano.slug, quantidade, usage, model, avisos };
}
