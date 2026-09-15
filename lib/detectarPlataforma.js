// Detecta em que plataforma de e-commerce um site roda, a partir do HTML e
// dos headers de resposta — mesma lógica que ferramentas tipo o detector de
// tecnologia da Koba usam (docs/ferramentas-gratuitas-lojas.md, repo
// lupixa-agents). Existe pra alimentar os dois modos novos de prospecção:
// "já tem Nuvemshop" (oferta diagnostico-nuvemshop) e "está em outra
// plataforma" (oferta migracao-plataforma) — ver pages/api/apify-webhook.js.
//
// 15/09/2026: criado. Nunca lançar erro pra quem chama — site fora do ar,
// bloqueando bot, redirecionando ou demorando demais são todos motivo de
// devolver 'desconhecida', não de derrubar o processamento do lead.

const TIMEOUT_MS = 8000;

// Ordem importa: checa da assinatura mais específica pra mais genérica.
// Cada entrada casa contra o HTML em minúsculas e (quando existir) contra um
// header de resposta específico daquela plataforma.
const ASSINATURAS = [
  {
    slug: 'nuvemshop',
    html: [/cdn\.nuvemshop\.com\.br/, /tiendanube\.com/, /\.lojavirtualnuvem\.com\.br/],
  },
  {
    slug: 'shopify',
    html: [/cdn\.shopify\.com/, /shopify\.theme/, /myshopify\.com/],
    header: (h) => Boolean(h.get('x-shopid') || h.get('x-shardid')),
  },
  {
    slug: 'vtex',
    html: [/vteximg\.com\.br/, /vtexassets\.com/, /vtex\.com\.br\/checkout/],
  },
  {
    slug: 'woocommerce',
    html: [/woocommerce/, /wp-content\/plugins\/woocommerce/],
  },
  {
    slug: 'wix',
    html: [/wixstatic\.com/, /wix\.com\/website/, /parastorage\.com/],
    header: (h) => Boolean(h.get('x-wix-request-id')),
  },
  {
    slug: 'loja-integrada',
    html: [/lojaintegrada\.com\.br/],
  },
  {
    slug: 'tray',
    html: [/img\.tray\.com\.br/, /tray\.com\.br\/checkout/],
  },
  {
    slug: 'magento',
    html: [/mage\.cookies/, /\/skin\/frontend\//, /magento_/i],
  },
];

// Plataformas que a oferta "migracao-plataforma" está preparada pra citar —
// qualquer outra coisa detectada (site próprio feito do zero, plataforma
// rara) cai em 'desconhecida' e o lead é descartado nesse modo: é melhor
// perder o lead do que mandar mensagem citando plataforma errada.
export const PLATAFORMAS_CONHECIDAS = ASSINATURAS.map((a) => a.slug);

export async function detectarPlataforma(url) {
  if (!url) return 'desconhecida';

  let alvo = url;
  if (!/^https?:\/\//i.test(alvo)) alvo = `https://${alvo}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(alvo, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // User-Agent de navegador real: alguns sites bloqueiam fetch sem UA
        // ou com UA de bot, devolvendo página de erro em vez do HTML real.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });

    if (!resp.ok) return 'desconhecida';

    const html = (await resp.text()).toLowerCase();

    for (const assinatura of ASSINATURAS) {
      const bateHtml = assinatura.html.some((re) => re.test(html));
      const bateHeader = assinatura.header ? assinatura.header(resp.headers) : false;
      if (bateHtml || bateHeader) return assinatura.slug;
    }

    return 'desconhecida';
  } catch {
    // timeout, DNS falhando, TLS quebrado, redirecionamento em loop — tudo
    // vira 'desconhecida'. Quem chama decide o que fazer (hoje: descarta).
    return 'desconhecida';
  } finally {
    clearTimeout(timer);
  }
}
