import { supabaseAdmin, apiError } from '../../../../lib/supabaseAdmin';

const SYSTEM_PROMPT = `Você escreve mensagens curtas de primeiro contato para donos de pequenos
negócios no Brasil, oferecendo criação de site. Escreva como um brasileiro
real falando no WhatsApp: direto, natural, sem soar robô. Regras:
- 4 a 6 linhas, no máximo.
- Trate o negócio como único (use nome, categoria e reputação reais).
- Cite no máximo 1 dado de mercado, só se reforçar o ponto.
- NÃO use travessões, nem "espero que esteja bem", nem clichê de IA.
- NÃO invente que já é cliente nem prometa preço.
- Termine com uma pergunta leve que convide a responder.
- Nunca repita a mesma abertura de outra mensagem.`;

const ANGULOS = ['elogio à reputação', 'observação sobre a categoria', 'pergunta direta', 'dado de mercado'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  const { id } = req.query;
  if (!id || Number.isNaN(Number(id))) {
    return apiError(res, 400, 'ID de lead inválido.');
  }

  if (!process.env.OPENAI_API_KEY) {
    return apiError(
      res,
      501,
      'OPENAI_API_KEY não configurada. Escreva a mensagem manualmente por enquanto — assim que a chave for adicionada nas variáveis de ambiente da Vercel, a geração automática volta a funcionar.'
    );
  }

  try {
    const db = supabaseAdmin();
    const { data: lead, error: fetchErr } = await db.from('prospeccao_leads').select('*').eq('id', id).single();
    if (fetchErr || !lead) return apiError(res, 404, 'Lead não encontrado.');

    const angulo = ANGULOS[Math.floor(Math.random() * ANGULOS.length)];
    const userPrompt = `Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Cidade: ${lead.city || 'não informado'}
Nota no Google: ${lead.rating ?? 'não informado'} (${lead.reviews_count ?? 0} avaliações)
Ângulo desta mensagem: ${angulo}
Escreva a mensagem.`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return apiError(res, 502, `Falha ao chamar a OpenAI (${resp.status}): ${errBody.slice(0, 300)}`);
    }

    const json = await resp.json();
    const message = json?.choices?.[0]?.message?.content?.trim();
    if (!message) return apiError(res, 502, 'A OpenAI respondeu sem conteúdo de mensagem.');

    const field = lead.channel === 'email' ? 'message_email' : 'message_wa';
    const { data: updated, error: updateErr } = await db
      .from('prospeccao_leads')
      .update({ [field]: message, message_model: 'gpt-4o-mini' })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return apiError(res, 500, `Falha ao salvar mensagem gerada: ${updateErr.message}`);
    return res.status(200).json({ lead: updated });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado ao gerar mensagem.');
  }
}
