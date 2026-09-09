-- Prospecção Gratuita v2 — schema Supabase
-- Reconstruído em 25/07/2026 a partir do PRD original + comportamento
-- confirmado do app em produção (schema via API) + correção do bug de status.
--
-- Tabelas com prefixo "prospeccao_" de propósito: este schema é aplicado
-- dentro do projeto Supabase compartilhado "analisador-workana" (pra não
-- esbarrar no limite de 2 projetos free da conta), então o prefixo evita
-- qualquer colisão de nome com as tabelas que já existem lá (crm, perfil,
-- wa_leads, etc.) e deixa claro no painel do Supabase o que pertence a quem.

create table if not exists prospeccao_niches (
  id            bigint generated always as identity primary key,
  slug          text unique not null,
  label         text not null,
  gmaps_query   text not null,
  resumo        text,               -- contexto de tom/argumento pro prompt da OpenAI (add. 25/07/2026)
  leitor          text,
  tom             text,
  solucao         text,
  elogio_sugestao text,
  pedido_demo     text,
  -- Segunda mensagem: o link que vai depois da abertura (add. 19/08/2026).
  demo_url        text,
  demo_tipo       text,               -- 'cliente' (site real entregue) | 'modelo' (prototipo)
  demo_quem       text,               -- de quem e o site, quando demo_tipo = 'cliente'
  demo_olhar      text,               -- um ponto por linha, o que mandar reparar no link
  demo_fechamento text,               -- pergunta que fecha a segunda mensagem
  created_at    timestamptz default now()
);

create table if not exists prospeccao_runs (
  id            bigint generated always as identity primary key,
  niche_slug    text not null,
  city          text,
  quantity      int not null default 10,
  source        text default 'manual',
  status        text default 'running',
  apify_run_id  text,
  found         int default 0,
  qualified     int default 0,
  saved         int default 0,
  duplicados    int default 0,   -- leads que o Google reachou mas ja estavam na base (add. 19/08/2026)
  cost_apify    numeric default 0,
  cost_openai   numeric default 0,
  tokens_in     int default 0,
  tokens_out    int default 0,
  error         text,
  created_at    timestamptz default now()
);

-- status: novo | enviado | aguardando_resposta | negociacao | fechado | descartado
-- (ver lib/statuses.js — fonte única de verdade, usada tanto no front quanto
-- na agregação do dashboard, pra nunca mais divergir)
create table if not exists prospeccao_leads (
  id              bigint generated always as identity primary key,
  run_id          bigint references prospeccao_runs(id) on delete set null,
  place_id        text unique,
  name            text not null,
  category        text,
  niche_slug      text,
  city            text,
  address         text,
  rating          numeric,
  reviews_count   int,
  phone           text,
  whatsapp        text,
  email           text,
  website         text,
  site_tipo       text,
  gmaps_url       text,
  channel         text,               -- 'whatsapp' | 'email'
  message_wa      text,
  message_demo    text,               -- 2a mensagem, a do link (add. 19/08/2026)
  -- Mensagem SEGUINTE: a que vai depois que o lead responde (add. 03/09/2026,
  -- migrations/2026-09-03-mensagem-seguinte.sql)
  resposta_lead        text,          -- o que o lead respondeu no WhatsApp, colado pelo Diogo
  mensagem_seguinte    text,          -- mensagem gerada a partir dessa resposta
  mensagem_seguinte_at timestamptz,   -- quando foi gerada
  email_subject   text,
  message_email   text,
  followup_wa     text,
  followup_email  text,
  message_model   text,
  status          text default 'novo' not null,
  valor           numeric,            -- valor fechado, quando status = 'fechado'
  origem_manual   boolean default false,  -- true = lead criado à mão no painel, não via Apify
  sent_at         timestamptz,
  followup_due_at timestamptz,
  followup_sent_at timestamptz,
  replied         boolean default false,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_prospeccao_leads_status on prospeccao_leads (status);
create index if not exists idx_prospeccao_leads_niche on prospeccao_leads (niche_slug);
create index if not exists idx_prospeccao_leads_created on prospeccao_leads (created_at);
create index if not exists idx_prospeccao_leads_followup on prospeccao_leads (followup_due_at) where status in ('enviado', 'aguardando_resposta');

-- Seed de nichos: expandido em 25/07/2026 de 6 pra 26 nichos, cada um com
-- "resumo" (contexto de tom/argumento que a IA usa pra calibrar a mensagem
-- por tipo de negócio). Lista completa aplicada via migration
-- "prospeccao_niches_resumo_e_expansao" diretamente no Supabase — ver ali
-- pro texto de cada resumo. Abaixo, só a forma mínima de referência:
insert into prospeccao_niches (slug, label, gmaps_query) values
  ('clinica-psicologia', 'Clínica de psicologia', 'clínica de psicologia em {cidade}'),
  ('mecanica', 'Mecânica', 'mecânica em {cidade}'),
  ('barbearia', 'Barbearia', 'barbearia em {cidade}'),
  ('salao-beleza', 'Salão de beleza', 'salão de beleza em {cidade}'),
  ('estetica', 'Clínica de estética', 'clínica de estética em {cidade}'),
  ('advocacia', 'Escritório de advocacia', 'advocacia em {cidade}'),
  ('nutricionista', 'Nutricionista', 'nutricionista em {cidade}'),
  ('dentista', 'Consultório odontológico', 'dentista em {cidade}'),
  ('petshop', 'Pet shop', 'pet shop em {cidade}'),
  ('contabilidade', 'Escritório de contabilidade', 'contabilidade em {cidade}'),
  ('imobiliaria', 'Imobiliária', 'imobiliária em {cidade}'),
  ('academia', 'Academia', 'academia em {cidade}'),
  ('fisioterapia', 'Clínica de fisioterapia', 'fisioterapia em {cidade}'),
  ('arquitetura', 'Escritório de arquitetura', 'escritório de arquitetura em {cidade}'),
  ('buffet-eventos', 'Buffet e eventos', 'buffet de eventos em {cidade}'),
  ('floricultura', 'Floricultura', 'floricultura em {cidade}'),
  ('loja-roupas', 'Loja de roupas', 'loja de roupas em {cidade}'),
  ('restaurante', 'Restaurante', 'restaurante em {cidade}'),
  ('pizzaria', 'Pizzaria', 'pizzaria em {cidade}'),
  ('padaria', 'Padaria e confeitaria', 'padaria em {cidade}'),
  ('marcenaria', 'Marcenaria', 'marcenaria em {cidade}'),
  ('autoescola', 'Autoescola', 'autoescola em {cidade}'),
  ('funilaria', 'Funilaria e pintura automotiva', 'funilaria e pintura automotiva em {cidade}'),
  ('chaveiro', 'Chaveiro', 'chaveiro em {cidade}'),
  ('veterinaria', 'Clínica veterinária', 'clínica veterinária em {cidade}'),
  ('escola-idiomas', 'Escola de idiomas', 'escola de idiomas em {cidade}')
on conflict (slug) do nothing;

-- Trigger simples pra manter updated_at em dia (nome namespaced de propósito,
-- pra nunca colidir/substituir uma função existente de outro projeto)
create or replace function prospeccao_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prospeccao_leads_set_updated_at on prospeccao_leads;
create trigger prospeccao_leads_set_updated_at
  before update on prospeccao_leads
  for each row execute function prospeccao_set_updated_at();

-- RLS: ativado, sem policy pra usuário anônimo — só a Service Role key
-- (usada pelo backend do Next.js) consegue ler/escrever.
alter table prospeccao_niches enable row level security;
alter table prospeccao_runs enable row level security;
alter table prospeccao_leads enable row level security;


-- ---------------------------------------------------------------------------
-- MIGRACAO 19/08/2026 — rode este bloco no SQL Editor do Supabase.
--
-- Por que: o painel ja tinha o campo "Link do prototipo" na tela de nichos, mas
-- a coluna nunca existiu no banco e o PATCH da API descartava o valor. Resultado:
-- o link sumia toda vez que era salvo, e a segunda mensagem nunca era gerada.
-- Rodar duas vezes nao faz mal — tudo aqui e "if not exists".
-- ---------------------------------------------------------------------------
alter table prospeccao_niches add column if not exists leitor          text;
alter table prospeccao_niches add column if not exists tom             text;
alter table prospeccao_niches add column if not exists solucao         text;
alter table prospeccao_niches add column if not exists elogio_sugestao text;
alter table prospeccao_niches add column if not exists pedido_demo     text;
alter table prospeccao_niches add column if not exists demo_url        text;
alter table prospeccao_niches add column if not exists demo_tipo       text;
alter table prospeccao_niches add column if not exists demo_quem       text;
alter table prospeccao_niches add column if not exists demo_olhar      text;
alter table prospeccao_niches add column if not exists demo_fechamento text;
alter table prospeccao_leads  add column if not exists message_demo    text;
alter table prospeccao_runs   add column if not exists duplicados      int default 0;

-- ---------------------------------------------------------------------------
-- MIGRACAO 19/08/2026 (2) — ledger de contatados.
-- Quem ja entrou na prospeccao uma vez nunca mais aparece numa busca, mesmo
-- que a linha em prospeccao_leads seja apagada depois.
-- ---------------------------------------------------------------------------
create table if not exists prospeccao_contatados (
  place_id    text primary key,
  name        text,
  city        text,
  niche_slug  text,
  first_seen  timestamptz default now()
);
alter table prospeccao_contatados enable row level security;

insert into prospeccao_contatados (place_id, name, city, niche_slug, first_seen)
select place_id, name, city, niche_slug, created_at from prospeccao_leads where place_id is not null
on conflict (place_id) do nothing;


-- ---------------------------------------------------------------------------
-- MIGRACAO 02/09/2026 (1) — colunas que a producao ja usa e este arquivo
-- nunca declarou.
--
-- pages/api/run.js, pages/api/leads/index.js, pages/api/leads/[id].js e
-- pages/api/apify-webhook.js gravam e leem "oferta" em prospeccao_runs e
-- prospeccao_leads, e "canal_envio" em prospeccao_leads. As duas colunas
-- foram criadas direto no Supabase em algum momento (mesmo padrao do aviso
-- ja registrado acima sobre a expansao de nichos) e nunca voltaram pra este
-- arquivo. Documentando agora pra este schema.sql voltar a ser fonte de
-- verdade de um banco novo. "if not exists" — rodar de novo nao faz mal.
-- ---------------------------------------------------------------------------
alter table prospeccao_runs  add column if not exists oferta       text default 'nuvemshop';
alter table prospeccao_leads add column if not exists oferta       text default 'nuvemshop';
alter table prospeccao_leads add column if not exists canal_envio  text;


-- ---------------------------------------------------------------------------
-- MIGRACAO 02/09/2026 (2) — pivot de nicho: e-commerce de produto fisico de
-- alta margem, em regiao de alto poder aquisitivo.
--
-- Contexto completo (por que o pivot, os 26 nichos antigos de negocio local
-- generico, a lista de regioes/cidades pra usar no campo "Cidade" de cada
-- rodada) esta em docs/prospeccao-ecommerce-alta-renda.md, no repo
-- lupixa-agents. Resumo: o app deixou de prospectar servico local (mecanica,
-- barbearia, nutricionista...) e passou a mirar SO donos de loja de produto
-- fisico de alta margem, achados pelo Google Maps em bairro/cidade de renda
-- alta — o funil que alimenta o reposicionamento nacional do
-- diogopinotti.com.br como especialista Nuvemshop.
--
-- Os 26 nichos antigos NAO foram apagados (lead ja gerado com aqueles slugs
-- continua correto no historico, e nao ha FK travando a exclusao se um dia
-- quiser limpar). Pra nao aparecerem mais nas rodadas novas, apague-os pela
-- propria aba "Nichos" do painel (a exclusao ja existe em
-- pages/api/niches/[id].js) quando quiser uma lista limpa.
--
-- 4 dos 10 nichos abaixo usam CASE REAL (demo_tipo=cliente) — lojas
-- Nuvemshop que a Lupixa ja entregou e que estao no ar hoje: Settima
-- (semijoias/joias), Joley/Adriana Sabatine (boutique de moda feminina),
-- Avina (moda crista) e Ceramica Reserva (decoracao). Os outros 6 ficam sem
-- demo_url ate existir um case real ou um modelo pronto pro nicho — o app ja
-- trata isso: sai so a mensagem de abertura, sem prometer link nenhum.
-- ---------------------------------------------------------------------------
insert into prospeccao_niches
  (slug, label, gmaps_query, resumo, leitor, tom, solucao, elogio_sugestao, pedido_demo,
   demo_url, demo_tipo, demo_quem, demo_olhar, demo_fechamento)
values
  (
    'semijoias-joias', 'Semijoias e joalheria',
    'loja de semijoias ou joalheria em {cidade}',
    'Loja de semijoias/joias: ticket alto (R$150 a R$5.000+), compra de presente ou autopresente, decide sozinho(a).',
    'dono(a) de loja de semijoias ou joalheria, ticket alto, publico compra presente ou autopresente, decide sozinho(a)',
    'elegante e direto, sem intimidade forcada — quem compra joia valoriza confianca e acabamento, nao desconto',
    'loja Nuvemshop com foto de detalhe (zoom), carrinho e frete calculado — reduz a dependencia de fechar peca por peca no WhatsApp e pega quem pesquisa preco de madrugada',
    'reconhecer nota alta ou volume de avaliacoes se houver, sem exagerar; nunca supor material ou preco da peca',
    'oferecer mostrar a loja da Settima, joalheria de ouro 18k que ja migrou pra Nuvemshop',
    'https://joalheriasettima.com.br', 'cliente', 'a Settima, joalheria de ouro 18k',
    '· como cada peca tem foto de detalhe e o preco junto, sem precisar perguntar no WhatsApp
· o carrinho e o frete calculado automatico
· a categoria organizada por tipo de peca',
    'Quer ver como ficaria com o catalogo de voces?'
  ),
  (
    'boutique-moda-feminina', 'Boutique de moda feminina',
    'boutique de moda feminina em {cidade}',
    'Boutique de roupa feminina que ja vende bem na loja fisica e no Instagram, decide rapido quando ve prova.',
    'dona de boutique de roupa feminina, ja vende bem na loja fisica e no Instagram, decide rapido quando ve prova',
    'proximo, sem giria de vendedor, falando com quem ja vende bastante mas so localmente',
    'loja Nuvemshop puxando o catalogo que ja existe no Instagram, vendendo pro Brasil inteiro e nao so pra quem entra na loja',
    'citar avaliacoes ou reputacao se aparecerem no briefing, nunca inventar volume de venda',
    'mostrar a loja da Joley (Adriana Sabatine Boutique), com frete regional gratis e catalogo completo',
    'https://adrianasabatineboutique.com.br', 'cliente', 'a Joley, boutique de moda feminina em Paulinia',
    '· o frete gratis regional destacado na barra do topo
· cada peca com varias fotos e tabela de medidas
· o catalogo puxando direto pro Instagram Shopping',
    'Quer que eu monte como ficaria com as suas pecas?'
  ),
  (
    'moda-crista', 'Moda crista',
    'loja de moda crista em {cidade}',
    'Marca de moda crista (moletom/camiseta bordada), ticket medio, publico fiel e engajado.',
    'dono(a) de marca de moda crista, ticket medio de moletom ou camiseta bordada, publico fiel e engajado',
    'respeitoso e direto, sem jargao religioso forcado — fala do negocio, nao da fe',
    'loja propria fora do Instagram, com checkout e frete automatico, sem depender de mensagem direta pra fechar venda',
    'reconhecer a identidade da marca se estiver visivel (nome, bordado, colecao), nunca supor detalhe de fe',
    'mostrar a loja da Avina, moda crista com moletons bordados',
    'https://avinaoficial.com.br', 'cliente', 'a Avina, moda crista com moletons bordados',
    '· o carrossel de pecas na home
· o checkout com frete gratis a partir de um valor
· o catalogo organizado por colecao',
    'Quer ver como ficaria com a sua colecao?'
  ),
  (
    'decoracao-casa', 'Decoracao e casa',
    'loja de decoracao e casa em {cidade}',
    'Loja de decoracao/casa (ceramica, artesanato, objetos), ticket medio-alto, comprador presenteia ou reforma.',
    'dono(a) de loja de decoracao ou casa (ceramica, artesanato, objetos), ticket medio-alto, comprador presenteia ou esta reformando',
    'sobrio, sem adjetivo de venda, deixa a peca falar',
    'loja online com foto de ambiente, nao so do produto isolado, pra vender o estilo e nao so o objeto',
    'reconhecer variedade ou acabamento se visivel no perfil, nunca inventar material',
    'mostrar a loja da Ceramica Reserva',
    'https://ceramicareserva.com.br', 'cliente', 'a Ceramica Reserva',
    '· as fotos mostrando a peca dentro do ambiente, nao so isolada
· as categorias organizadas por comodo ou uso
· o carrinho e o frete calculado na hora',
    'Quer ver como ficaria com as suas pecas?'
  ),
  (
    'moda-praia', 'Moda praia',
    'loja de moda praia em {cidade}',
    'Loja de moda praia ou fitness, produto sazonal, ticket medio R$80 a R$300.',
    'dono(a) de loja de moda praia ou fitness, produto sazonal, ticket medio R$80 a R$300',
    'leve e direto, sem forcar estacao',
    'loja Nuvemshop vendendo o ano inteiro pro Brasil inteiro, nao so quem passa na rua no verao',
    'reconhecer variedade de colecao se visivel, nunca inventar tecido ou lancamento',
    'sem case proprio ainda pro nicho — nao promete link, so a mensagem de abertura',
    null, null, null, null, null
  ),
  (
    'bolsas-e-acessorios', 'Bolsas e acessorios',
    'loja de bolsas e acessorios em {cidade}',
    'Loja de bolsas, cintos e acessorios de couro ou material nobre, ticket medio-alto, publico repete compra.',
    'dono(a) de loja de bolsas e acessorios, ticket medio-alto, publico que repete compra por colecao',
    'direto, valorizando acabamento e material sem adjetivo vazio',
    'loja Nuvemshop com fotos de detalhe do material e do fecho, vendendo pra quem nao mora perto da loja',
    'reconhecer material ou marca propria se estiver no perfil, nunca inventar procedencia',
    'sem case proprio ainda pro nicho — nao promete link, so a mensagem de abertura',
    null, null, null, null, null
  ),
  (
    'perfumaria-cosmeticos', 'Perfumaria e cosmeticos',
    'perfumaria em {cidade}',
    'Perfumaria ou loja de cosmeticos importados/nichados, recompra frequente, margem alta por unidade.',
    'dono(a) de perfumaria ou loja de cosmeticos importados/nichados, cliente recompra com frequencia',
    'confiante e informativo, sem prometer resultado do produto (regulamentacao de cosmetico)',
    'loja Nuvemshop com assinatura ou recompra facilitada, sem depender de o cliente lembrar de voltar na loja',
    'reconhecer curadoria ou marcas exclusivas se citadas no perfil, nunca inventar linha de produto',
    'sem case proprio ainda pro nicho — nao promete link, so a mensagem de abertura',
    null, null, null, null, null
  ),
  (
    'moda-infantil-premium', 'Moda infantil',
    'loja de roupa infantil em {cidade}',
    'Loja de roupa infantil de grife ou autoral, presente comum, publico e mae/pai ou avo.',
    'dono(a) de loja de roupa infantil de grife ou autoral, produto vira presente com frequencia, publico e mae/pai ou avo',
    'caloroso mas objetivo, sem infantilizar o texto pra quem decide (o adulto)',
    'loja Nuvemshop com filtro por idade/tamanho e opcao de presente, vendendo pra fora da cidade tambem',
    'reconhecer variedade de tamanho ou colecao se visivel, nunca inventar marca',
    'sem case proprio ainda pro nicho — nao promete link, so a mensagem de abertura',
    null, null, null, null, null
  ),
  (
    'pet-shop-premium', 'Pet shop premium',
    'pet shop em {cidade}',
    'Pet shop com racao/acessorio premium, recompra mensal previsivel, ticket medio-alto.',
    'dono(a) de pet shop com produto premium (racao, acessorio, roupa de pet), recompra mensal previsivel',
    'caloroso, sem infantilizar o pet, focado em praticidade pra quem tutora',
    'loja Nuvemshop com assinatura de recompra (racao todo mes), tirando do tutor a tarefa de lembrar de voltar na loja',
    'reconhecer marcas premium ou variedade se citadas no perfil, nunca inventar servico (banho e tosa) que nao esteja escrito',
    'sem case proprio ainda pro nicho — nao promete link, so a mensagem de abertura',
    null, null, null, null, null
  ),
  (
    'emporio-gourmet', 'Emporio gourmet e vinhos',
    'emporio gourmet em {cidade}',
    'Emporio de vinhos, queijos e produtos gourmet, ticket alto, presente ou consumo proprio de ocasiao.',
    'dono(a) de emporio gourmet (vinhos, queijos, azeites), ticket alto, produto de ocasiao ou presente',
    'sofisticado sem exagero, informativo sobre origem/curadoria quando o dado existir',
    'loja Nuvemshop com kit-presente e frete para todo o Brasil, sem depender de quem mora perto da loja',
    'reconhecer curadoria ou premiacao se citada no perfil, nunca inventar rotulo ou safra',
    'sem case proprio ainda pro nicho — nao promete link, so a mensagem de abertura',
    null, null, null, null, null
  )
on conflict (slug) do update set
  label            = excluded.label,
  gmaps_query      = excluded.gmaps_query,
  resumo           = excluded.resumo,
  leitor           = excluded.leitor,
  tom              = excluded.tom,
  solucao          = excluded.solucao,
  elogio_sugestao  = excluded.elogio_sugestao,
  pedido_demo      = excluded.pedido_demo,
  demo_url         = excluded.demo_url,
  demo_tipo        = excluded.demo_tipo,
  demo_quem        = excluded.demo_quem,
  demo_olhar       = excluded.demo_olhar,
  demo_fechamento  = excluded.demo_fechamento;


-- ---------------------------------------------------------------------------
-- MIGRACAO 02/09/2026 (3) — novo processo: limpa a base antiga de vez e
-- expande de 10 pra 26 nichos.
--
-- Pedido do Diogo no mesmo dia da migracao (2): "começaremos um novo
-- processo, não faz sentido manter coisa velha guardada" — e achar que 10
-- nichos era pouco. Duas coisas nesta migracao:
--
-- 1. ARQUIVA (nao apaga) leads, runs e o ledger de contatados do processo
--    antigo (negocio local generico) em tabelas "_arquivo_20260902", mesmo
--    padrao que ja existia aqui (prospeccao_leads_arquivo_20260819), e
--    ESVAZIA as tabelas ativas. Isso inclui limpar prospeccao_contatados —
--    decisao deliberada: como o publico e a oferta mudaram por completo
--    (loja Nuvemshop pra e-commerce de alta renda, nao mais site
--    institucional pra servico local), nao faz sentido um negocio ficar
--    banido de reaparecer numa busca nova so porque foi escaneado uma vez
--    sob uma pergunta antiga e irrelevante.
-- 2. Apaga os nichos de servico local (26 do seed original + 6 de beleza
--    adicionados direto no Supabase em algum momento, nunca documentados
--    aqui) e substitui a lista de e-commerce por uma expandida: de 10 pra
--    26 nichos, agrupados em joias/acessorios, moda, casa/decoracao,
--    beleza/bem-estar, gastronomia/presentes, pet/bebe e arte/colecionaveis.
--    Pesquisa e agrupamento completo em
--    docs/prospeccao-ecommerce-alta-renda.md, repo lupixa-agents.
--
-- Os 4 nichos com case real (Settima, Joley, Avina, Ceramica Reserva) da
-- migracao (2) sao MANTIDOS aqui (mesmo slug, "on conflict do update") — os
-- 16 novos entram sem link, no fallback da home (ver lib/generateMessage.js).
-- ---------------------------------------------------------------------------
-- "create table as" nao aceita "if not exists" combinado com "with no data"
-- de forma idempotente do jeito que este arquivo usa em outro lugar, entao
-- aqui o "if not exists" fica só no nome da tabela em si — rodar a migração
-- inteira de novo com as tabelas ativas já vazias é inofensivo (arquiva 0
-- linhas, trunca 0 linhas).
create table if not exists prospeccao_leads_arquivo_20260902 as table prospeccao_leads;
create table if not exists prospeccao_runs_arquivo_20260902 as table prospeccao_runs;
create table if not exists prospeccao_contatados_arquivo_20260902 as table prospeccao_contatados;
alter table prospeccao_leads_arquivo_20260902 enable row level security;
alter table prospeccao_runs_arquivo_20260902 enable row level security;
alter table prospeccao_contatados_arquivo_20260902 enable row level security;

truncate table prospeccao_leads, prospeccao_runs;
truncate table prospeccao_contatados;

alter table prospeccao_runs add column if not exists areas_buscadas text;

delete from prospeccao_niches where slug in (
  'barbearia','mecanica','advocacia','clinica-psicologia','estetica','salao-beleza',
  'restaurante','dentista','fisioterapia','petshop','veterinaria','arquitetura',
  'marcenaria','contabilidade','imobiliaria','funilaria','academia','autoescola',
  'escola-idiomas','buffet-eventos','floricultura','padaria','pizzaria','loja-roupas',
  'chaveiro','nutricionista','sobrancelha','depilacao','maquiagem','unhas',
  'micropigmentacao','cilios'
);

insert into prospeccao_niches
  (slug, label, gmaps_query, resumo, leitor, tom, solucao, elogio_sugestao, pedido_demo,
   demo_url, demo_tipo, demo_quem, demo_olhar, demo_fechamento)
values
  (
    'semijoias-joias', 'Semijoias e joalheria',
    'loja de semijoias ou joalheria em {cidade}',
    'Loja de semijoias/joias: ticket alto (R$150 a R$5.000+), compra de presente ou autopresente, decide sozinho(a).',
    'dono(a) de loja de semijoias ou joalheria, ticket alto, publico compra presente ou autopresente, decide sozinho(a)',
    'elegante e direto, sem intimidade forcada — quem compra joia valoriza confianca e acabamento, nao desconto',
    'loja Nuvemshop com foto de detalhe (zoom), carrinho e frete calculado — reduz a dependencia de fechar peca por peca no WhatsApp e pega quem pesquisa preco de madrugada',
    'reconhecer nota alta ou volume de avaliacoes se houver, sem exagerar; nunca supor material ou preco da peca',
    'oferecer mostrar a loja da Settima, joalheria de ouro 18k que ja migrou pra Nuvemshop',
    'https://joalheriasettima.com.br', 'cliente', 'a Settima, joalheria de ouro 18k',
    '· como cada peca tem foto de detalhe e o preco junto, sem precisar perguntar no WhatsApp
· o carrinho e o frete calculado automatico
· a categoria organizada por tipo de peca',
    'Quer ver como ficaria com o catalogo de voces?'
  ),
  (
    'boutique-moda-feminina', 'Boutique de moda feminina',
    'boutique de moda feminina em {cidade}',
    'Boutique de roupa feminina que ja vende bem na loja fisica e no Instagram, decide rapido quando ve prova.',
    'dona de boutique de roupa feminina, ja vende bem na loja fisica e no Instagram, decide rapido quando ve prova',
    'proximo, sem giria de vendedor, falando com quem ja vende bastante mas so localmente',
    'loja Nuvemshop puxando o catalogo que ja existe no Instagram, vendendo pro Brasil inteiro e nao so pra quem entra na loja',
    'citar avaliacoes ou reputacao se aparecerem no briefing, nunca inventar volume de venda',
    'mostrar a loja da Joley (Adriana Sabatine Boutique), com frete regional gratis e catalogo completo',
    'https://adrianasabatineboutique.com.br', 'cliente', 'a Joley, boutique de moda feminina em Paulinia',
    '· o frete gratis regional destacado na barra do topo
· cada peca com varias fotos e tabela de medidas
· o catalogo puxando direto pro Instagram Shopping',
    'Quer que eu monte como ficaria com as suas pecas?'
  ),
  (
    'moda-crista', 'Moda crista',
    'loja de moda crista em {cidade}',
    'Marca de moda crista (moletom/camiseta bordada), ticket medio, publico fiel e engajado.',
    'dono(a) de marca de moda crista, ticket medio de moletom ou camiseta bordada, publico fiel e engajado',
    'respeitoso e direto, sem jargao religioso forcado — fala do negocio, nao da fe',
    'loja propria fora do Instagram, com checkout e frete automatico, sem depender de mensagem direta pra fechar venda',
    'reconhecer a identidade da marca se estiver visivel (nome, bordado, colecao), nunca supor detalhe de fe',
    'mostrar a loja da Avina, moda crista com moletons bordados',
    'https://avinaoficial.com.br', 'cliente', 'a Avina, moda crista com moletons bordados',
    '· o carrossel de pecas na home
· o checkout com frete gratis a partir de um valor
· o catalogo organizado por colecao',
    'Quer ver como ficaria com a sua colecao?'
  ),
  (
    'decoracao-casa', 'Decoracao e casa',
    'loja de decoracao e casa em {cidade}',
    'Loja de decoracao/casa (ceramica, artesanato, objetos), ticket medio-alto, comprador presenteia ou reforma.',
    'dono(a) de loja de decoracao ou casa (ceramica, artesanato, objetos), ticket medio-alto, comprador presenteia ou esta reformando',
    'sobrio, sem adjetivo de venda, deixa a peca falar',
    'loja online com foto de ambiente, nao so do produto isolado, pra vender o estilo e nao so o objeto',
    'reconhecer variedade ou acabamento se visivel no perfil, nunca inventar material',
    'mostrar a loja da Ceramica Reserva',
    'https://ceramicareserva.com.br', 'cliente', 'a Ceramica Reserva',
    '· as fotos mostrando a peca dentro do ambiente, nao so isolada
· as categorias organizadas por comodo ou uso
· o carrinho e o frete calculado na hora',
    'Quer ver como ficaria com as suas pecas?'
  ),
  (
    'moda-praia', 'Moda praia',
    'loja de moda praia em {cidade}',
    'Loja de moda praia ou fitness, produto sazonal, ticket medio R$80 a R$300.',
    'dono(a) de loja de moda praia ou fitness, produto sazonal, ticket medio R$80 a R$300',
    'leve e direto, sem forcar estacao',
    'loja Nuvemshop vendendo o ano inteiro pro Brasil inteiro, nao so quem passa na rua no verao',
    'reconhecer variedade de colecao se visivel, nunca inventar tecido ou lancamento',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'bolsas-e-acessorios', 'Bolsas e acessorios',
    'loja de bolsas e acessorios em {cidade}',
    'Loja de bolsas, cintos e acessorios de couro ou material nobre, ticket medio-alto, publico repete compra.',
    'dono(a) de loja de bolsas e acessorios, ticket medio-alto, publico que repete compra por colecao',
    'direto, valorizando acabamento e material sem adjetivo vazio',
    'loja Nuvemshop com fotos de detalhe do material e do fecho, vendendo pra quem nao mora perto da loja',
    'reconhecer material ou marca propria se estiver no perfil, nunca inventar procedencia',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'perfumaria-cosmeticos', 'Perfumaria e cosmeticos',
    'perfumaria em {cidade}',
    'Perfumaria ou loja de cosmeticos importados/nichados, recompra frequente, margem alta por unidade.',
    'dono(a) de perfumaria ou loja de cosmeticos importados/nichados, cliente recompra com frequencia',
    'confiante e informativo, sem prometer resultado do produto (regulamentacao de cosmetico)',
    'loja Nuvemshop com assinatura ou recompra facilitada, sem depender de o cliente lembrar de voltar na loja',
    'reconhecer curadoria ou marcas exclusivas se citadas no perfil, nunca inventar linha de produto',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'moda-infantil-premium', 'Moda infantil',
    'loja de roupa infantil em {cidade}',
    'Loja de roupa infantil de grife ou autoral, presente comum, publico e mae/pai ou avo.',
    'dono(a) de loja de roupa infantil de grife ou autoral, produto vira presente com frequencia, publico e mae/pai ou avo',
    'caloroso mas objetivo, sem infantilizar o texto pra quem decide (o adulto)',
    'loja Nuvemshop com filtro por idade/tamanho e opcao de presente, vendendo pra fora da cidade tambem',
    'reconhecer variedade de tamanho ou colecao se visivel, nunca inventar marca',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'pet-shop-premium', 'Pet shop premium',
    'pet shop em {cidade}',
    'Pet shop com racao/acessorio premium, recompra mensal previsivel, ticket medio-alto.',
    'dono(a) de pet shop com produto premium (racao, acessorio, roupa de pet), recompra mensal previsivel',
    'caloroso, sem infantilizar o pet, focado em praticidade pra quem tutora',
    'loja Nuvemshop com assinatura de recompra (racao todo mes), tirando do tutor a tarefa de lembrar de voltar na loja',
    'reconhecer marcas premium ou variedade se citadas no perfil, nunca inventar servico (banho e tosa) que nao esteja escrito',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'emporio-gourmet', 'Emporio gourmet e vinhos',
    'emporio gourmet em {cidade}',
    'Emporio de vinhos, queijos e produtos gourmet, ticket alto, presente ou consumo proprio de ocasiao.',
    'dono(a) de emporio gourmet (vinhos, queijos, azeites), ticket alto, produto de ocasiao ou presente',
    'sofisticado sem exagero, informativo sobre origem/curadoria quando o dado existir',
    'loja Nuvemshop com kit-presente e frete para todo o Brasil, sem depender de quem mora perto da loja',
    'reconhecer curadoria ou premiacao se citada no perfil, nunca inventar rotulo ou safra',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'relojoaria', 'Relojoaria',
    'relojoaria em {cidade}',
    'Loja de relogios de marca (nacional ou importado), ticket alto, presente ou autopresente marcante.',
    'dono(a) de relojoaria, ticket alto, publico compra presente marcante ou colecionador',
    'tecnico e confiante, sem exagero, valorizando precisao e garantia',
    'loja Nuvemshop com garantia e nota fiscal em destaque, vendendo pra quem pesquisa marca especifica antes de decidir',
    'reconhecer marcas trabalhadas se estiverem no perfil, nunca inventar autorizacao de marca',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'oticas-oculos', 'Óticas e oculos de sol',
    'otica ou loja de oculos de sol em {cidade}',
    'Otica ou loja de oculos de sol de grife, recompra por moda/grau, ticket medio-alto.',
    'dono(a) de otica ou loja de oculos de sol, publico repete compra por lancamento de marca',
    'moderno e direto, sem jargao de saude (grau e assunto do exame, nao da loja)',
    'loja Nuvemshop com filtro por marca/formato de rosto, vendendo oculos de sol pro Brasil inteiro',
    'reconhecer marcas exclusivas se citadas no perfil, nunca prometer resultado de grau/visao',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'moda-masculina-alfaiataria', 'Moda masculina e alfaiataria',
    'alfaiataria ou loja de moda masculina em {cidade}',
    'Alfaiataria ou loja de moda masculina de grife, ticket alto, publico decide por ocasiao (casamento, trabalho).',
    'dono(a) de alfaiataria ou loja de moda masculina, ticket alto, publico decide por ocasiao',
    'sobrio e tecnico, valorizando corte e tecido sem adjetivo vazio',
    'loja Nuvemshop com linha pronta entrega vendendo online, mesmo que o sob medida continue so presencial',
    'reconhecer tradicao ou anos de casa se citados no perfil, nunca inventar tecido ou grife',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'moda-plus-size-autoral', 'Moda plus size autoral',
    'loja de moda plus size em {cidade}',
    'Marca autoral de moda plus size, publico fiel, nicho crescente e mal atendido por grife tradicional.',
    'dona de marca de moda plus size autoral, publico fiel que valoriza representatividade',
    'acolhedor e direto, sem estereotipo, tratando moda plus size como moda, nao como categoria a parte',
    'loja Nuvemshop com grade de tamanho clara e fotos reais, vendendo pra quem nao e atendido no shopping da cidade',
    'reconhecer identidade da marca ou colecao se visivel, nunca supor tamanho ou corpo do publico',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'lingerie-moda-intima', 'Lingerie e moda intima',
    'loja de lingerie em {cidade}',
    'Loja de lingerie ou moda intima de marca, ticket medio-alto, recompra por colecao/estacao.',
    'dono(a) de loja de lingerie, publico feminino que recompra por colecao',
    'discreto e elegante, sem apelo, focado em caimento e qualidade',
    'loja Nuvemshop com guia de tamanho e compra discreta (embalagem neutra), vendendo sem depender da vitrine fisica',
    'reconhecer variedade ou marca propria se visivel, nunca inventar tecido ou composicao',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'calcados-premium', 'Calcados de grife e couro',
    'loja de calcados de grife em {cidade}',
    'Loja de calcados de couro/grife (nao outlet), ticket medio-alto, recompra por colecao.',
    'dono(a) de loja de calcados de grife ou couro, ticket medio-alto',
    'direto, valorizando material e conforto sem adjetivo vazio',
    'loja Nuvemshop com guia de numeracao e fotos de detalhe do couro, vendendo pra fora da cidade',
    'reconhecer marca propria ou material se citado no perfil, nunca inventar numeracao disponivel',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'iluminacao-decorativa', 'Iluminacao decorativa',
    'loja de iluminacao decorativa em {cidade}',
    'Loja de lustres, pendentes e luminarias decorativas, ticket alto, compra ligada a reforma/decoracao.',
    'dono(a) de loja de iluminacao decorativa, ticket alto, cliente reformando ou decorando',
    'sofisticado e tecnico, falando de estilo e voltagem sem exagero',
    'loja Nuvemshop com foto de ambiente iluminado, nao so a peca isolada, vendendo pro Brasil com frete calculado pra peca fragil',
    'reconhecer variedade de estilo (classico, moderno) se visivel, nunca inventar voltagem ou material',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'cama-mesa-banho-premium', 'Cama, mesa e banho premium',
    'loja de enxoval cama mesa banho em {cidade}',
    'Loja de enxoval fino (linho, algodao egipcio), ticket medio-alto, presente de casamento/casa nova.',
    'dono(a) de loja de cama mesa e banho fino, publico presenteia casamento ou casa nova',
    'elegante e sensorial (fio, textura), sem exagero',
    'loja Nuvemshop com filtro por fio/material e opcao de presente com embalagem, vendendo pro Brasil inteiro',
    'reconhecer marcas ou linha propria se visivel, nunca inventar contagem de fios',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'papelaria-personalizada', 'Papelaria fina e personalizada',
    'papelaria personalizada em {cidade}',
    'Papelaria fina/personalizada e presentes de escritorio, marca autoral, ticket medio, recompra por consumo.',
    'dona de marca de papelaria personalizada, publico presenteia ou recompra por consumo',
    'leve e caloroso, valorizando o toque pessoal da personalizacao',
    'loja Nuvemshop com campo de personalizacao no proprio produto, vendendo pro Brasil sem depender de feira ou bazar',
    'reconhecer estilo/traco proprio se visivel, nunca inventar material do papel',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'suplementos-nutricao-premium', 'Suplementos e nutricao premium',
    'loja de suplementos em {cidade}',
    'Loja de suplementos/nutricao premium (nao rede de academia), recompra mensal previsivel, margem alta.',
    'dono(a) de loja de suplementos premium, recompra mensal previsivel do publico fiel',
    'confiante e tecnico, sem prometer resultado de saude/estetica (regulamentacao)',
    'loja Nuvemshop com assinatura de recompra mensal, tirando do cliente a tarefa de lembrar de voltar na loja',
    'reconhecer marcas trabalhadas se citadas no perfil, nunca prometer resultado ou efeito',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'chocolateria-doces-finos', 'Chocolateria e doces finos',
    'chocolateria artesanal em {cidade}',
    'Chocolateria/doceria artesanal, ticket alto por ocasiao (data comemorativa, presente corporativo), sazonal.',
    'dono(a) de chocolateria artesanal, ticket alto em data comemorativa e presente corporativo',
    'caloroso e sensorial, sem prometer prazo de validade que nao esteja escrito',
    'loja Nuvemshop com kit-presente e frete rapido pra nao derreter, vendendo pro Brasil inteiro em datas-chave',
    'reconhecer premiacao ou selo artesanal se citado no perfil, nunca inventar ingrediente',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'presentes-curadoria', 'Presentes e curadoria de design',
    'loja de presentes de design em {cidade}',
    'Loja de presentes com curadoria de design (objetos, arte utilitaria), ticket medio-alto, comprador presenteia.',
    'dono(a) de loja de presentes com curadoria, publico presenteia com bom gosto',
    'sofisticado, deixando o objeto falar, sem adjetivo de venda',
    'loja Nuvemshop com opcao de embrulho pra presente e cartao, vendendo pra quem mora longe e quer mandar direto',
    'reconhecer curadoria ou marcas exclusivas se citadas no perfil, nunca inventar origem do objeto',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'enxoval-bebe-luxo', 'Enxoval de bebe de luxo',
    'enxoval de bebe em {cidade}',
    'Loja de enxoval de bebe de luxo/personalizado, ticket alto, presente de cha de bebe.',
    'dono(a) de loja de enxoval de bebe de luxo, ticket alto, publico presenteia cha de bebe',
    'caloroso e cuidadoso, sem prometer seguranca/saude do produto alem do que estiver escrito',
    'loja Nuvemshop com lista de cha de bebe integrada e opcao de personalizacao com nome, vendendo pro Brasil inteiro',
    'reconhecer variedade ou personalizacao se visivel, nunca inventar certificacao de seguranca',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'utensilios-cozinha-premium', 'Utensilios de cozinha premium',
    'loja de utensilios de cozinha em {cidade}',
    'Loja de utensilios/cutelaria de cozinha premium, ticket medio-alto, publico entusiasta ou presenteia quem cozinha.',
    'dono(a) de loja de utensilios de cozinha premium, publico entusiasta de cozinha ou compra presente',
    'tecnico e direto, valorizando material e origem sem exagero',
    'loja Nuvemshop com fotos de uso (nao so o objeto parado) e lista de casamento integrada, vendendo pro Brasil inteiro',
    'reconhecer marcas trabalhadas se citadas no perfil, nunca inventar material da lamina/panela',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'arte-antiguidades-galeria', 'Arte, antiguidades e galeria',
    'galeria de arte ou loja de antiguidades em {cidade}',
    'Galeria de arte ou loja de antiguidades/objetos de decoracao autoral, ticket alto, peca unica ou edicao limitada.',
    'dono(a) de galeria de arte ou loja de antiguidades, ticket alto, peca unica ou limitada',
    'culto e sobrio, deixando a peca e a historia dela falarem',
    'loja Nuvemshop com ficha tecnica por peca (autor, ano, procedencia quando existir), vendendo pra colecionador fora da cidade',
    'reconhecer curadoria ou artistas representados se citados no perfil, nunca inventar autoria ou procedencia',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  ),
  (
    'floricultura-eventos-luxo', 'Floricultura de alto padrao',
    'floricultura de luxo em {cidade}',
    'Floricultura de alto padrao (arranjo/evento), ticket alto, compra por ocasiao (data comemorativa, evento).',
    'dono(a) de floricultura de alto padrao, ticket alto por ocasiao ou evento',
    'elegante e sensorial, sem prometer durabilidade que nao esteja escrita',
    'loja Nuvemshop com catalogo de arranjos por ocasiao e entrega agendada, vendendo pra quem manda flor de longe',
    'reconhecer especialidade (casamento, corporativo) se citada no perfil, nunca inventar tipo de flor disponivel',
    'sem case proprio ainda — a mensagem 2 usa o link da home do site como fallback',
    null, null, null, null, null
  )
on conflict (slug) do update set
  label            = excluded.label,
  gmaps_query      = excluded.gmaps_query,
  resumo           = excluded.resumo,
  leitor           = excluded.leitor,
  tom              = excluded.tom,
  solucao          = excluded.solucao,
  elogio_sugestao  = excluded.elogio_sugestao,
  pedido_demo      = excluded.pedido_demo,
  demo_url         = excluded.demo_url,
  demo_tipo        = excluded.demo_tipo,
  demo_quem        = excluded.demo_quem,
  demo_olhar       = excluded.demo_olhar,
  demo_fechamento  = excluded.demo_fechamento;


-- ---------------------------------------------------------------------------
-- MIGRACAO 02/09/2026 (4) -- pergunta de fechamento mais forte nos 4 nichos
-- com case real.
--
-- Achado real em producao (Diogo, ao vivo): a IA ignorava 100% das vezes a
-- pergunta de fechamento configurada aqui e caia sempre em "qual a faixa de
-- preco das pecas que mais saem hoje" -- pergunta administrativa fraca, sem
-- gancho. lib/generateMessage.js parou de deixar a IA escrever essa parte
-- (ver comentario no topo da funcao generateLeadMessage) -- agora usa este
-- campo de forma DETERMINISTICA, sempre verbatim. As perguntas abaixo atacam
-- a dor central do reposicionamento: venda que hoje so fecha por perto/por
-- DM, sem alcancar quem mora longe -- mesmo angulo que ja funciona bem na
-- mensagem 1 (ver ANGULOS em lib/generateMessage.js).
-- ---------------------------------------------------------------------------
update prospeccao_niches set demo_fechamento = 'Hoje, como fica quando alguém de fora quer fechar a compra de uma peça?' where slug = 'semijoias-joias';
update prospeccao_niches set demo_fechamento = 'Hoje, como fica quando alguém de fora quer comprar uma peça que viu no Instagram?' where slug = 'boutique-moda-feminina';
update prospeccao_niches set demo_fechamento = 'Hoje, como fica quando alguém de fora quer comprar um moletom que viu no Instagram?' where slug = 'moda-crista';
update prospeccao_niches set demo_fechamento = 'Hoje, como fica quando alguém de fora quer comprar uma peça que viu no Instagram?' where slug = 'decoracao-casa';
