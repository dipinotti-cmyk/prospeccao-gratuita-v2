// Tabela de preço da Lupixa — fonte ÚNICA de verdade, vale de 03/09/2026 em
// diante. Qualquer número de preço em outro lugar do código (texto de resposta
// pronta, prompt de IA) tem que sair daqui, nunca escrito à mão: preço
// duplicado é preço que um dia diverge, e o errado é o que vai pro cliente.
//
// O parcelamento em até 10x no cartão existe, mas NUNCA com valor de parcela:
// a taxa é da operadora e muda. Só o 3x sem juros e o à vista (Pix, -5%) têm
// número fechado.
export const PLANOS = [
  {
    slug: 'start',
    nome: 'Start',
    ate: 15,
    preco: 1300,
    precoTexto: 'R$ 1.300',
    parcela3x: 'R$ 433',
    aVista: 'R$ 1.235',
  },
  {
    slug: 'pro',
    nome: 'Pro',
    ate: 40,
    preco: 1900,
    precoTexto: 'R$ 1.900',
    parcela3x: 'R$ 633',
    aVista: 'R$ 1.805',
  },
  {
    slug: 'advanced',
    nome: 'Advanced',
    ate: 100,
    preco: 2900,
    precoTexto: 'R$ 2.900',
    parcela3x: 'R$ 966',
    aVista: 'R$ 2.755',
  },
  {
    slug: 'personalizado',
    nome: 'Personalizado',
    ate: Infinity,
    preco: null,
    precoTexto: 'sob consulta',
    parcela3x: null,
    aVista: null,
  },
];

export const PLANO_PADRAO = PLANOS.find((p) => p.slug === 'pro');

// Plano indicado pela quantidade de peças/produtos que o lead disser ter.
// Sem quantidade conhecida, quem chama decide o que fazer (o gerador da
// mensagem seguinte usa o Pro como âncora e pergunta a quantidade).
export function planoPorQuantidade(qtd) {
  const n = Number(qtd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return PLANOS.find((p) => n <= p.ate) || PLANOS[PLANOS.length - 1];
}

export function planoAnterior(plano) {
  if (!plano) return null;
  const i = PLANOS.findIndex((p) => p.slug === plano.slug);
  return i > 0 ? PLANOS[i - 1] : null;
}

// Uma linha por plano, do jeito que pode ser dito pro cliente. É este texto
// que vai pro prompt da IA — assim ela copia número, nunca calcula.
export function linhaPlano(plano) {
  if (!plano) return '';
  if (!plano.preco) {
    return `${plano.nome}: acima de ${PLANOS[PLANOS.length - 2].ate} produtos, preço sob consulta (não existe parcelamento público pra esse)`;
  }
  return `${plano.nome}: até ${plano.ate} produtos, ${plano.precoTexto}, em 3x de ${plano.parcela3x} sem juros, ${plano.aVista} à vista no Pix (5% de desconto), ou até 10x no cartão com juros da operadora (NUNCA diga o valor da parcela de 10x)`;
}

export function tabelaPrecoTexto() {
  return PLANOS.map((p) => `- ${linhaPlano(p)}`).join('\n');
}

// Todos os valores em reais que PODEM aparecer numa mensagem. Serve de trava
// contra o modelo inventar preço ou parcela — ver lib/generateReply.js.
export function valoresPermitidos() {
  const vals = [];
  PLANOS.forEach((p) => {
    if (!p.preco) return; // Personalizado não tem número nenhum liberado
    [p.precoTexto, p.parcela3x, p.aVista].forEach((v) => {
      if (v) vals.push(v.replace(/^R\$\s*/, ''));
    });
  });
  return vals;
}

// Quantidade de peças/produtos citada pelo lead ("tenho uns 30 modelos",
// "umas 120 peças"). Só serve pra ESCOLHER o plano — o texto do lead vai
// inteiro pro prompt de qualquer jeito. Devolve null quando não dá pra saber.
export function detectarQuantidade(texto) {
  if (!texto) return null;
  const t = String(texto).toLowerCase().replace(/\./g, '');
  const re = /(\d{1,5})\s*(?:mil\s*)?(?:pe[çc]as?|produtos?|itens?|sku|modelos?|refer[êe]ncias?|c[óo]digos?)/g;
  let m;
  let achado = null;
  while ((m = re.exec(t)) !== null) {
    const n = Number(m[1]);
    const mil = /mil/.test(m[0]);
    const valor = mil ? n * 1000 : n;
    if (Number.isFinite(valor) && valor > 0) achado = achado === null ? valor : Math.max(achado, valor);
  }
  return achado;
}
