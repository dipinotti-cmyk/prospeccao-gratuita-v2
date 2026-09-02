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

O que mudou:

- **10 nichos novos** em `schema.sql` (migração "02/09/2026 (2)"), 4 deles
  com case real (loja Nuvemshop já entregue) em vez de protótipo — mais forte
  na segunda mensagem. Os 26 nichos de serviço local antigos continuam no
  banco (não quebra histórico de lead), mas nenhuma rodada nova deveria
  escolher eles; apague pela aba **Nichos** do painel se quiser lista limpa.
- **`oferta` ganhou o valor `nuvemshop`**, e virou o padrão em toda tela e
  rota da API (era `site`).
- **Prompt da IA** (`lib/generateMessage.js`) reescrito pra vender loja
  virtual Nuvemshop pra dono de loja física, não site institucional.
- **Lista de regiões de alta renda** pra usar no campo "Cidade" de cada
  rodada, e o raciocínio completo por trás da escolha de nicho/região: ver
  `docs/prospeccao-ecommerce-alta-renda.md` no repo `lupixa-agents`.

**Antes de rodar a primeira prospecção com os nichos novos**, aplicar a
migração "02/09/2026" do `schema.sql` no SQL Editor do Supabase (rodar de
novo não faz mal — tudo é `if not exists` / `on conflict`).

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

## Setup

1. `npm install`
2. Rodar `schema.sql` no Supabase do projeto (SQL Editor).
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
- `pages/api/leads/[id]/regenerate.js` — geração de mensagem via OpenAI
- `pages/api/run.js` + `pages/api/apify-webhook.js` — busca automática via Apify
- `pages/api/cron-followups.js` — sinaliza leads com follow-up vencido (+48h), chamado pelo Vercel Cron
- `lib/statuses.js` — fonte única de verdade dos status (o coração da correção do bug)
- `schema.sql` — schema completo do Supabase
