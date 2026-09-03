// Cidades de alto poder aquisitivo pré-calibradas, com os bairros nobres de
// cada uma já mapeados. Existe pra o Diogo não digitar bairro por bairro
// toda vez: ele escolhe a cidade na tela (pages/index.js) e a rodada busca
// automaticamente em TODOS os bairros listados aqui, numa chamada só à
// Apify (searchStringsArray aceita vários termos por run — ver uso em
// pages/api/run.js).
//
// 02/09/2026: as primeiras 16 cidades vêm do Mapa da Riqueza (FGV), do
// rendimento domiciliar per capita do IBGE (2025) e de ranking de
// valorização imobiliária 2025-2026 — fontes e raciocínio completo em
// docs/prospeccao-ecommerce-alta-renda.md, repo lupixa-agents. As 5 últimas
// (Campinas, Ribeirão Preto, Londrina, Joinville, Uberlândia) vieram de
// conhecimento geral de mercado, não da mesma pesquisa primária das
// outras — bom ponto de partida, mas cabe revisar/trocar bairro se o
// retorno de leads for fraco numa delas.
//
// "cidade" é o rótulo mostrado na tela e gravado em prospeccao_runs.city.
// Precisa bater exatamente com o valor que o front manda — pages/api/run.js
// faz o match por igualdade de string nesta lista.
export const REGIOES_ALTA_RENDA = [
  {
    cidade: 'São Paulo, SP',
    estado: 'SP',
    bairros: ['Jardins', 'Itaim Bibi', 'Vila Nova Conceição', 'Moema', 'Pinheiros', 'Alto de Pinheiros', 'Brooklin'],
  },
  {
    cidade: 'Barueri / Santana de Parnaíba, SP (Alphaville)',
    estado: 'SP',
    bairros: ['Alphaville', 'Tamboré'],
  },
  {
    cidade: 'Cotia, SP (Granja Viana)',
    estado: 'SP',
    bairros: ['Granja Viana'],
  },
  {
    cidade: 'Campinas, SP',
    estado: 'SP',
    bairros: ['Cambuí', 'Nova Campinas', 'Alphaville Campinas', 'Gramado'],
  },
  {
    cidade: 'Brasília, DF',
    estado: 'DF',
    bairros: ['Lago Sul', 'Lago Norte', 'Sudoeste', 'Park Way'],
  },
  {
    cidade: 'Belo Horizonte, MG',
    estado: 'MG',
    bairros: ['Savassi', 'Lourdes', 'Santo Agostinho', 'Belvedere'],
  },
  {
    cidade: 'Nova Lima, MG',
    estado: 'MG',
    bairros: ['Vila da Serra', 'Alphaville Lagoa dos Ingleses'],
  },
  {
    cidade: 'Rio de Janeiro, RJ',
    estado: 'RJ',
    bairros: ['Leblon', 'Ipanema', 'Jardim Botânico', 'Barra da Tijuca'],
  },
  {
    cidade: 'Florianópolis, SC',
    estado: 'SC',
    bairros: ['Jurerê Internacional', 'Santo Antônio de Lisboa', 'Centro'],
  },
  {
    cidade: 'Balneário Camboriú, SC',
    estado: 'SC',
    bairros: ['Centro', 'Barra Sul'],
  },
  {
    cidade: 'Porto Alegre, RS',
    estado: 'RS',
    bairros: ['Moinhos de Vento', 'Bela Vista'],
  },
  {
    cidade: 'Curitiba, PR',
    estado: 'PR',
    bairros: ['Batel', 'Água Verde'],
  },
  {
    cidade: 'Vitória, ES',
    estado: 'ES',
    bairros: ['Praia do Canto', 'Enseada do Suá'],
  },
  {
    cidade: 'Goiânia, GO',
    estado: 'GO',
    bairros: ['Setor Bueno', 'Jardim Goiás', 'Alphaville Flamboyant'],
  },
  {
    cidade: 'Recife, PE',
    estado: 'PE',
    bairros: ['Boa Viagem'],
  },
  {
    cidade: 'Fortaleza, CE',
    estado: 'CE',
    bairros: ['Aldeota', 'Meireles'],
  },
  {
    cidade: 'Salvador, BA',
    estado: 'BA',
    bairros: ['Caminho das Árvores', 'Horto Florestal'],
  },
  {
    cidade: 'Ribeirão Preto, SP',
    estado: 'SP',
    bairros: ['Jardim Botânico', 'Alto da Boa Vista', 'Higienópolis'],
  },
  {
    cidade: 'Londrina, PR',
    estado: 'PR',
    bairros: ['Gleba Palhano', 'Country Club', 'Champagnat'],
  },
  {
    cidade: 'Joinville, SC',
    estado: 'SC',
    bairros: ['Atiradores', 'América', 'Saguaçu'],
  },
  {
    cidade: 'Uberlândia, MG',
    estado: 'MG',
    bairros: ['Santa Mônica', 'Jardim Karaíba', 'Morada da Colina'],
  },
];

export function encontrarRegiao(cidade) {
  return REGIOES_ALTA_RENDA.find((r) => r.cidade === cidade) || null;
}

// ————— Checagem de região (03/09/2026) —————
//
// Bug real: a busca "Cotia, SP (Granja Viana)" trouxe a JEJE_JOIAS, que tem
// "granja" no nome/endereço mas fica no MARANHÃO (telefone DDD 98). O Google
// Maps casa a PALAVRA do bairro, não a região — então quem confere é o app,
// antes de gastar uma chamada de IA e antes de o Diogo trabalhar o lead como
// se fosse vizinho.
//
// A checagem só barra quando existe CONTRADIÇÃO concreta (UF no endereço ou
// DDD do telefone apontando pra outro estado). Falta de dado nunca barra: lead
// sem UI legível no endereço e sem DDD válido passa.

// DDD → UF. É fixo desde sempre, não muda com o tempo.
export const DDD_UF = {
  11: 'SP', 12: 'SP', 13: 'SP', 14: 'SP', 15: 'SP', 16: 'SP', 17: 'SP', 18: 'SP', 19: 'SP',
  21: 'RJ', 22: 'RJ', 24: 'RJ',
  27: 'ES', 28: 'ES',
  31: 'MG', 32: 'MG', 33: 'MG', 34: 'MG', 35: 'MG', 37: 'MG', 38: 'MG',
  41: 'PR', 42: 'PR', 43: 'PR', 44: 'PR', 45: 'PR', 46: 'PR',
  47: 'SC', 48: 'SC', 49: 'SC',
  51: 'RS', 53: 'RS', 54: 'RS', 55: 'RS',
  61: 'DF',
  62: 'GO', 64: 'GO',
  63: 'TO',
  65: 'MT', 66: 'MT',
  67: 'MS',
  68: 'AC',
  69: 'RO',
  71: 'BA', 73: 'BA', 74: 'BA', 75: 'BA', 77: 'BA',
  79: 'SE',
  81: 'PE', 87: 'PE',
  82: 'AL',
  83: 'PB',
  84: 'RN',
  85: 'CE', 88: 'CE',
  86: 'PI', 89: 'PI',
  91: 'PA', 93: 'PA', 94: 'PA',
  92: 'AM', 97: 'AM',
  95: 'RR',
  96: 'AP',
  98: 'MA', 99: 'MA',
};

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

// DDD de um telefone, em texto ou já formatado. Tira o +55/55 do começo e fica
// com os dois primeiros dígitos do que sobrar. Devolve null quando não dá.
export function dddDoTelefone(telefone) {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return null;
  // +55 na frente: some quando o que sobra ainda tem DDD + número (10 ou 11
  // dígitos). "5511987654321" -> "11987654321"; "5598999999999" -> "98999999999".
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    digitos = digitos.slice(2);
  }
  if (digitos.length !== 10 && digitos.length !== 11) return null; // fixo sem DDD, ramal, lixo: não dá pra afirmar nada
  const ddd = Number(digitos.slice(0, 2));
  return DDD_UF[ddd] ? ddd : null;
}

export function estadoDoTelefone(telefone) {
  const ddd = dddDoTelefone(telefone);
  return ddd ? DDD_UF[ddd] : null;
}

// UFs escritas no endereço do Google Maps ("Rua X, 12 - Centro, Cotia - SP,
// 06700-000"). Só conta sigla em MAIÚSCULA e isolada: assim "Al." (alameda) e
// "Pr." não viram AL e PR, que é o falso positivo óbvio aqui.
export function ufsDoEndereco(endereco) {
  const txt = String(endereco || '');
  if (!txt) return [];
  const achadas = new Set();
  UFS.forEach((uf) => {
    const re = new RegExp(`(^|[^A-Za-zÀ-ÿ])${uf}([^A-Za-zÀ-ÿ]|$)`, 'g');
    if (re.test(txt)) achadas.add(uf);
  });
  return [...achadas];
}

export function estadoDoEndereco(endereco) {
  const achadas = ufsDoEndereco(endereco);
  return achadas.length ? achadas[0] : null;
}

// Devolve o MOTIVO (string) de o lead estar fora da região pesquisada, ou null
// quando está tudo certo — ou quando não há dado suficiente pra afirmar.
//
// Ordem de confiança, testada contra a base real de 03/09/2026:
//   1. endereço com UF diferente  -> fora (foi assim que a JEJE_JOIAS, do MA,
//      entrou numa busca de Cotia/SP);
//   2. endereço com a UF CERTA    -> dentro, e o DDD não derruba. Loja de
//      Alphaville com celular de DDD 42 existe (dono trouxe o número de
//      outro estado), e barrar ela seria jogar fora lead bom em silêncio —
//      pior que deixar passar um lead ruim, que a tela mostra;
//   3. endereço sem UF legível    -> aí sim o DDD decide.
export function leadForaDaRegiao({ address, phone } = {}, regiao) {
  const uf = regiao?.estado;
  if (!uf) return null; // rodada de cidade digitada à mão: não dá pra conferir

  const ufsEndereco = ufsDoEndereco(address);
  if (ufsEndereco.length > 0) {
    if (ufsEndereco.includes(uf)) return null;
    return `endereço no Google Maps aponta ${ufsEndereco.join('/')}, e a busca foi em ${regiao.cidade} (${uf}): "${String(address).trim()}"`;
  }

  const ufTelefone = estadoDoTelefone(phone);
  if (ufTelefone && ufTelefone !== uf) {
    return `endereço sem UF no Google Maps e telefone com DDD ${dddDoTelefone(phone)} (${ufTelefone}), enquanto a busca foi em ${regiao.cidade} (${uf})`;
  }

  return null;
}

// Lead que PASSOU na checagem mas tem DDD de outro estado. Não barra nada —
// só existe pra aparecer na tela e na auditoria, porque às vezes é endereço
// de fachada e às vezes é só o dono com número antigo. Quem julga é o Diogo.
export function dddDivergente({ address, phone } = {}, regiao) {
  const uf = regiao?.estado;
  if (!uf) return null;
  const ufTelefone = estadoDoTelefone(phone);
  if (!ufTelefone || ufTelefone === uf) return null;
  if (leadForaDaRegiao({ address, phone }, regiao)) return null; // já barrado, não é "só um alerta"
  return `telefone com DDD ${dddDoTelefone(phone)} (${ufTelefone}), mas o endereço é ${uf}`;
}
