// Geração de mensagem por IA — usada tanto na primeira leva automática
// (apify-webhook, assim que os leads chegam) quanto no botão "Gerar" manual
// (regenerate.js). Centralizada aqui pra nunca divergir entre os dois lugares.

const SYSTEM_PROMPT = `Você escreve mensagens curtas de primeiro contato para donos de pequenos
negócios no Brasil, oferecendo um serviço digital (site, automação de
atendimento no WhatsApp, ou os dois). Escreva como um brasileiro real
falando no WhatsApp: direto, natural, sem soar robô. Regras:
- 4 a 6 linhas na mensagem principal.
- Trate o negócio como único (use nome, categoria, cidade e reputação reais quando fizer sentido).
- Comece elogiando um ponto real do negócio antes de sugerir a melhoria — nunca abra criticando.
- Cite no máximo 1 dado de mercado, só se reforçar o ponto.
- NÃO use travessões, nem "espero que esteja bem", nem clichê de IA.
- NÃO invente que já é cliente nem prometa preço.
- Termine com uma pergunta leve que convide a responder.
- Nunca repita a mesma abertura de outra mensagem.
Responda SEMPRE em JSON válido, sem nenhum texto fora do JSON.`;

const ANGULOS = ['elogio à reputação', 'observação sobre a categoria', 'pergunta direta', 'dado de mercado'];

const OFERTA_LABEL = {
  site: 'criação de um site profissional',
  automacao: 'automação de atendimento no WhatsApp com CRM e lembretes automáticos',
  completo: 'pacote completo: site profissional + automação de atendimento no WhatsApp com CRM e lembretes',
};

// lead: { name, category, city, rating, reviews_count, channel, oferta }
// niche: { label, leitor, tom, solucao, elogio_sugestao, pedido_demo, resumo } ou null
// Retorna { message, subject, usage } — subject só vem preenchido pra canal e-mail.
// Lança erro (com mensagem já pronta pra mostrar ao usuário) se a OpenAI falhar.
export async function generateLeadMessage({ lead, niche, apiKey }) {
  const angulo = ANGULOS[Math.floor(Math.random() * ANGULOS.length)];
  const isEmail = lead.channel === 'email';
  const oferta = OFERTA_LABEL[lead.oferta] || OFERTA_LABEL.site;

  // Nicho estruturado (25/07/2026): em vez de um "resumo" solto, cada componente
  // vira uma instrução específica pro prompt — mais fácil de editar na tela e
  // mais fácil da IA seguir de forma consistente. "resumo" fica como fallback
  // pra nicho antigo que ainda não foi migrado pra estrutura nova.
  const partesNicho = [];
  if (niche?.leitor) partesNicho.push(`Quem provavelmente vai ler primeiro: ${niche.leitor}`);
  if (niche?.tom) partesNicho.push(`Tom de voz pra esse nicho: ${niche.tom}`);
  if (niche?.solucao) partesNicho.push(`Argumento/solução específica desse nicho: ${niche.solucao}`);
  if (niche?.elogio_sugestao) partesNicho.push(`Estrutura de elogio + sugestão: ${niche.elogio_sugestao}`);
  if (niche?.pedido_demo) partesNicho.push(`Sobre pedir demonstração grátis: ${niche.pedido_demo}`);
  if (partesNicho.length === 0 && niche?.resumo) partesNicho.push(niche.resumo);
  const contextoNicho = partesNicho.length > 0
    ? `Contexto do nicho "${niche.label}" (use pra calibrar tom, argumento e ângulo — não cite o texto literalmente):\n${partesNicho.join('\n')}`
    : '';

  const userPrompt = `Negócio: ${lead.name}
Categoria: ${lead.category || 'não informado'}
Cidade: ${lead.city || 'não informado'}
Nota no Google: ${lead.rating ?? 'não informado'} (${lead.reviews_count ?? 0} avaliações)
Oferta desta mensagem: ${oferta}
${contextoNicho}
Ângulo desta mensagem: ${angulo}
Canal: ${isEmail ? 'e-mail' : 'whatsapp'}
${isEmail
    ? 'Responda em JSON: {"subject": "assunto curto, 5 a 8 palavras, sem clickbait", "message": "corpo do e-mail"}'
    : 'Responda em JSON: {"message": "texto da mensagem de whatsapp"}'}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Falha ao chamar a OpenAI (${resp.status}): ${errBody.slice(0, 300)}`);
  }

  const json = await resp.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('A OpenAI respondeu sem conteúdo de mensagem.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('A OpenAI respondeu num formato inesperado (não veio JSON válido).');
  }

  const message = String(parsed.message || '').trim();
  if (!message) throw new Error('A OpenAI respondeu sem o campo "message".');

  return {
    message,
    subject: isEmail ? String(parsed.subject || '').trim() : null,
    usage: json.usage || null,
  };
}
