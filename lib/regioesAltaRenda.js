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
    bairros: ['Jardins', 'Itaim Bibi', 'Vila Nova Conceição', 'Moema', 'Pinheiros', 'Alto de Pinheiros', 'Brooklin'],
  },
  {
    cidade: 'Barueri / Santana de Parnaíba, SP (Alphaville)',
    bairros: ['Alphaville', 'Tamboré'],
  },
  {
    cidade: 'Cotia, SP (Granja Viana)',
    bairros: ['Granja Viana'],
  },
  {
    cidade: 'Campinas, SP',
    bairros: ['Cambuí', 'Nova Campinas', 'Alphaville Campinas', 'Gramado'],
  },
  {
    cidade: 'Brasília, DF',
    bairros: ['Lago Sul', 'Lago Norte', 'Sudoeste', 'Park Way'],
  },
  {
    cidade: 'Belo Horizonte, MG',
    bairros: ['Savassi', 'Lourdes', 'Santo Agostinho', 'Belvedere'],
  },
  {
    cidade: 'Nova Lima, MG',
    bairros: ['Vila da Serra', 'Alphaville Lagoa dos Ingleses'],
  },
  {
    cidade: 'Rio de Janeiro, RJ',
    bairros: ['Leblon', 'Ipanema', 'Jardim Botânico', 'Barra da Tijuca'],
  },
  {
    cidade: 'Florianópolis, SC',
    bairros: ['Jurerê Internacional', 'Santo Antônio de Lisboa', 'Centro'],
  },
  {
    cidade: 'Balneário Camboriú, SC',
    bairros: ['Centro', 'Barra Sul'],
  },
  {
    cidade: 'Porto Alegre, RS',
    bairros: ['Moinhos de Vento', 'Bela Vista'],
  },
  {
    cidade: 'Curitiba, PR',
    bairros: ['Batel', 'Água Verde'],
  },
  {
    cidade: 'Vitória, ES',
    bairros: ['Praia do Canto', 'Enseada do Suá'],
  },
  {
    cidade: 'Goiânia, GO',
    bairros: ['Setor Bueno', 'Jardim Goiás', 'Alphaville Flamboyant'],
  },
  {
    cidade: 'Recife, PE',
    bairros: ['Boa Viagem'],
  },
  {
    cidade: 'Fortaleza, CE',
    bairros: ['Aldeota', 'Meireles'],
  },
  {
    cidade: 'Salvador, BA',
    bairros: ['Caminho das Árvores', 'Horto Florestal'],
  },
  {
    cidade: 'Ribeirão Preto, SP',
    bairros: ['Jardim Botânico', 'Alto da Boa Vista', 'Higienópolis'],
  },
  {
    cidade: 'Londrina, PR',
    bairros: ['Gleba Palhano', 'Country Club', 'Champagnat'],
  },
  {
    cidade: 'Joinville, SC',
    bairros: ['Atiradores', 'América', 'Saguaçu'],
  },
  {
    cidade: 'Uberlândia, MG',
    bairros: ['Santa Mônica', 'Jardim Karaíba', 'Morada da Colina'],
  },
];

export function encontrarRegiao(cidade) {
  return REGIOES_ALTA_RENDA.find((r) => r.cidade === cidade) || null;
}
