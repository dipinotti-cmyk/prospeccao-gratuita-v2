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
