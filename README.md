# Prospecção Gratuita v2

Reconstrução completa da ferramenta, em 25/07/2026, depois que a versão
anterior (deployada direto na Vercel, sem repositório) apresentou um bug que
não era possível corrigir por falta de acesso ao código-fonte original.

## Pivot de 02/09/2026 — e-commerce de alta margem, região de alta renda

O app deixou de prospectar negócio local genérico (mecânica, barbearia,
nutricionista...) e passou a mirar **só** donos de loja de produto físico de
alta margem (semijoias, moda, decoração...), achados pelo Google Maps em
bairro/cidade de alto poder aquisitivo. É o funil que alimenta o
reposicionamento nacional do `diogopinotti.com.br` como especialista
Nuvemshop — a oferta da mensagem virou a loja virtual Nuvemshop, não mais
site institucional ou automação de WhatsApp.

Duas rodadas de mudança no mesmo dia — o Diogo pediu mais profundidade depois
da primeira (10 nichos, cidade digitada à mão):

**Rodada 1 — pivot inicial:**
- 10 nichos de e-commerce, `oferta = nuvemshop` como padrão, prompt da IA
  reescrito.

**Rodada 2 — expansão e limpeza de verdade:**
- **Base antiga LIMPA, não só ignorada.** Os 112 leads, 63 runs e o ledger de
  282 "já contatados" do processo velho foram **arquivados** (tabelas
  `prospeccao_leads_arquivo_20260902`, `prospeccao_runs_arquivo_20260902`,
  `prospeccao_contatados_arquivo_20260902` — mesmo padrão que já existia
  aqui) e **removidos das tabelas ativas**. Os 32 nichos de serviço local
  (os 26 do seed original + 6 de beleza que tinham sido adicionados direto no
  Supabase, nunca documentados neste arquivo) foram **apagados de vez** —
  não fazia sentido continuar ativos.
- **De 10 pra 26 nichos**, agrupados em joias/acessórios, moda (8 sub-nichos:
  boutique feminina, moda cristã, praia, infantil, masculina/alfaiataria,
  plus size autoral, lingerie, calçados), casa/decoração, beleza/bem-estar,
  gastronomia/presentes, pet/bebê, cozinha e arte/colecionáveis. Pesquisa e
  raciocínio completo: `docs/prospeccao-ecommerce-alta-renda.md` no repo
  `lupixa-agents`.
- **Cidade virou dropdown com bairros automáticos.** `lib/regioesAltaRenda.js`
  tem 21 cidades de alto poder aquisitivo com os bairros nobres de cada uma
  já mapeados — escolher a cidade na tela dispara a busca em TODOS os
  bairros dela numa rodada só (`searchStringsArray` da Apify aceita vários
  termos por chamada). "Outra cidade (digitar)" continua disponível pra
  cobertura fora da lista calibrada.
- **A 2ª mensagem nunca mais fica vazia.** Nicho sem case nem modelo próprio
  agora cai num fallback: o link vai pra **home do site**
  (`diogopinotti.com.br`), com um texto de portfólio genérico em vez de
  fingir ser exemplo daquele nicho específico. Antes, nicho sem `demo_url`
  saía só com a mensagem de abertura.

**Migração aplicada em produção em duas etapas** (projeto Supabase
`analisador-workana`, 02/09/2026): "02/09/2026 (1)/(2)" (rodada 1, 10 nichos)
e "02/09/2026 (3)" (rodada 2, limpeza + expansão pra 26). `schema.sql` fica
como registro/fonte de verdade pra um banco novo; rodar de novo não faz mal.

## O que mudou da v1 pra v2

- **Bug do status "Encerrado" corrigido de raiz.** A v1 tinha dois status
  diferentes pra "negócio fechado" (`Fechou Site` e `Encerrado`) e o cálculo
  do dashboard só conhecia um deles — o outro derrubava o cálculo inteiro e
  zerava todos os números. A v2 tem **um status fechado só** (`fechado`), com
  fonte única de verdade em `lib/statuses.js`, usada tanto no formulário
  quanto na agregação — não tem mais como os dois lados divergirem.
- **Cadastro manual de lead.** Antes só entrava lead via Apify. Agora dá pra
  cadastrar um lead na mão (como foi o caso da Francisca) sem depender de
  rodada de scraping.
- **E-mail também manual, igual o WhatsApp.** A v1 previa envio automático de
  e-mail via Gmail OAuth (client ID/secret/refresh token). Isso foi trocado
  por "gerar mensagem + copiar", no mesmo padrão do WhatsApp — reduz risco de
  reputação de envio e elimina uma dependência frágil (OAuth quebrando
  silenciosamente). Se quiser reativar o envio automático depois, dá pra
  adicionar.
- **Toda rota de API tem fallback seguro.** Se faltar `OPENAI_API_KEY` ou
  `APIFY_TOKEN`, a funcionalidade correspondente avisa com uma mensagem clara
  em vez de quebrar — o resto do painel continua funcionando normalmente.
- **Código versionado no GitHub desde o dia 1.** Zero ponto cego dessa vez.

## 03/09/2026 — resposta do lead vira mensagem, e lead de fora da região não passa mais

**1. O botão "Respondeu" escreve a próxima mensagem.** Na aba "Aguardando
resposta", ele agora abre um modal onde o Diogo cola o que o lead respondeu no
WhatsApp. A resposta vai pra `pages/api/leads/[id]/responder.js`, que chama
`lib/generateReply.js` — prompt PRÓPRIO, de vendedor sênior de loja premium,
nada a ver com o prompt de primeiro contato — e grava a mensagem pronta em
`mensagem_seguinte`. Só depois de gerar é que o lead vira negociação
(`replied: true`). A estrutura da mensagem é fixa e foi aprovada depois de três
textos genéricos reprovados: consequência em dinheiro, preço com o resultado
colado, parcelamento com abertura pra negociar forma e tamanho (nunca preço),
pergunta curta. A tabela de preço mora em `lib/planos.js`, fonte única — o
código nunca escreve valor à mão, e uma trava recusa mensagem com número que
não esteja lá.

Precisa da migração `migrations/2026-09-03-mensagem-seguinte.sql`.

**2. Lead de outro estado não recebe mais mensagem.** A busca do Google Maps
casa a PALAVRA do bairro, não a região: "Cotia, SP (Granja Viana)" trouxe uma
joalheria do Maranhão (DDD 98) só porque tinha "granja" no endereço.
`lib/regioesAltaRenda.js` ganhou a UF explícita de cada região, a tabela
DDD → UF e `leadForaDaRegiao()`. O webhook da Apify agora grava esse lead como
`descartado` com o motivo nas notas e **não gasta chamada da Gemini** com ele.
`GET /api/leads/checar-regiao` roda a mesma regra na base inteira e só LISTA
quem está fora (não apaga nada). No card, o DDD e a cidade/UF do endereço
aparecem ao lado do nome.

Regra, em ordem de confiança: endereço com UF diferente barra; endereço com a
UF certa passa mesmo com DDD de outro estado (aparece como aviso amarelo, não
como descarte — loja de Alphaville com celular do Paraná existe); sem UF no
endereço, o DDD decide. Falta de dado nunca barra.

## Setup

1. `npm install`
2. Rodar `schema.sql` no Supabase do projeto (SQL Editor) e, depois, os
   arquivos de `migrations/` em ordem de data.
3. Copiar `.env.example` pra `.env.local` e preencher pelo menos
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (painel Settings → API do
   Supabase). As outras três variáveis são opcionais — sem elas o painel
   funciona 100% pra cadastro manual e acompanhamento, só a busca automática
   de leads e a geração de mensagem por IA ficam desativadas até configurar.
4. `npm run dev` pra testar local, ou deploy direto na Vercel com as mesmas
   variáveis em Project Settings → Environment Variables.

## Estrutura

- `pages/index.js` — painel (dashboard, tabela de leads, cadastro manual, disparo de prospecção)
- `pages/api/leads/*` — CRUD de leads
- `pages/api/leads/[id]/regenerate.js` — geração da mensagem de primeiro contato (Gemini)
- `pages/api/leads/[id]/responder.js` — o lead respondeu: gera a mensagem seguinte (`lib/generateReply.js`) e move pra negociação
- `pages/api/leads/checar-regiao.js` — audita a base e lista quem está fora da região pesquisada (só lista, não apaga)
- `lib/planos.js` — tabela de preço (Start/Pro/Advanced/Personalizado), fonte única
- `pages/api/run.js` + `pages/api/apify-webhook.js` — busca automática via Apify
- `pages/api/cron-followups.js` — sinaliza leads com follow-up vencido (+48h), chamado pelo Vercel Cron
- `lib/statuses.js` — fonte única de verdade dos status (o coração da correção do bug)
- `lib/regioesAltaRenda.js` — cidades de alto poder aquisitivo + bairros nobres calibrados (dropdown de Cidade e expansão de busca em `pages/api/run.js`), UF por região, tabela DDD → UF e a checagem `leadForaDaRegiao()`
- `schema.sql` — schema completo do Supabase
