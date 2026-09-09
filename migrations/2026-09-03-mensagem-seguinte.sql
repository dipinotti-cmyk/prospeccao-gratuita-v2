-- 03/09/2026 — mensagem SEGUINTE (a que vai depois que o lead responde).
--
-- O botão "Respondeu" (aba "Aguardando resposta") deixou de só mudar o status:
-- agora o Diogo cola o que o lead respondeu no WhatsApp e o app gera a próxima
-- mensagem com a IA (pages/api/leads/[id]/responder.js + lib/generateReply.js).
-- Estas três colunas guardam esse ciclo.
--
-- Rodar no SQL Editor do Supabase (projeto compartilhado "analisador-workana").
-- Idempotente: pode rodar duas vezes sem quebrar nada.

alter table prospeccao_leads
  add column if not exists resposta_lead        text,        -- o que o lead respondeu, colado pelo Diogo
  add column if not exists mensagem_seguinte    text,        -- a mensagem gerada pra mandar em seguida
  add column if not exists mensagem_seguinte_at timestamptz; -- quando foi gerada

comment on column prospeccao_leads.resposta_lead is 'Texto que o lead respondeu no WhatsApp, colado no modal "Respondeu".';
comment on column prospeccao_leads.mensagem_seguinte is 'Mensagem seguinte gerada pela IA (vendedor sênior, com preço) a partir da resposta do lead.';
comment on column prospeccao_leads.mensagem_seguinte_at is 'Quando a mensagem seguinte foi gerada.';
