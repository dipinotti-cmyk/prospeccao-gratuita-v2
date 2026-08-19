// Fonte única de verdade para status de lead.
// A causa raiz do bug antigo (status "Encerrado" zerando o dashboard) era ter
// dois status diferentes pra "negócio fechado" (Fechou Site / Encerrado) e a
// lógica de agregação do dashboard só conhecer um deles — o outro caía num
// caminho não tratado e quebrava o cálculo inteiro.
//
// Aqui existe UM status fechado só, e toda leitura passa por STATUS_MAP com
// fallback seguro — nenhum valor desconhecido derruba o dashboard.

export const STATUSES = [
  { value: 'novo', label: 'Novo', color: '#94A3B8', isClosed: false },
  { value: 'enviado', label: 'Enviado', color: '#60A5FA', isClosed: false },
  { value: 'aguardando_resposta', label: 'Aguardando resposta', color: '#FBBF24', isClosed: false },
  { value: 'negociacao', label: 'Em negociação', color: '#A78BFA', isClosed: false },
  { value: 'fechado', label: 'Fechado', color: '#34D399', isClosed: true },
  // Prospeccao fria nao tem follow-up: 3 dias sem resposta e o cron
  // /api/cron-encerrar-frios move o lead pra ca sozinho.
  { value: 'sem_interesse', label: 'Sem interesse', color: '#A1A1AA', isClosed: true },
  { value: 'descartado', label: 'Descartado', color: '#F87171', isClosed: true },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

export function statusLabel(value) {
  return STATUS_MAP[value]?.label || value || 'Sem status';
}

export function statusColor(value) {
  return STATUS_MAP[value]?.color || '#71717A';
}

export function isClosedStatus(value) {
  return STATUS_MAP[value]?.isClosed ?? false;
}

export function isValidStatus(value) {
  return Boolean(STATUS_MAP[value]);
}

// Aceita "R$ 400,00", "400,00", "400.00", "400", null, undefined, número — sem nunca lançar erro.
export function parseValor(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  let s = String(raw).trim().replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatValor(raw) {
  const n = parseValor(raw);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Calcula as estatísticas do dashboard de forma defensiva: nunca lança
// exceção, nunca deixa um status desconhecido zerar o total.
export function computeStats(leads) {
  const byStatus = {};
  for (const s of STATUSES) byStatus[s.value] = 0;

  let total = 0;
  let closedCount = 0;
  let closedValue = 0;
  let byChannel = { whatsapp: 0, email: 0 };

  for (const lead of Array.isArray(leads) ? leads : []) {
    total += 1;
    const key = isValidStatus(lead?.status) ? lead.status : 'novo';
    byStatus[key] = (byStatus[key] || 0) + 1;

    if (lead?.channel === 'whatsapp' || lead?.channel === 'email') {
      byChannel[lead.channel] += 1;
    }

    // Corrigido em 25/07/2026: aqui tinha um bug sutil — usava isClosedStatus()
    // (que também é true pra "descartado", pois os dois são status "terminais"
    // pra fins de follow-up) em vez de checar especificamente status==='fechado'.
    // Na prática um lead descartado quase nunca tem valor, então passava batido,
    // mas ainda assim inflava a contagem de "Fechados" com leads perdidos.
    if (lead?.status === 'fechado') {
      closedCount += 1;
      closedValue += parseValor(lead?.valor);
    }
  }

  const responseRate = total > 0
    ? ((byStatus.negociacao + closedCount + byStatus.aguardando_resposta) / total) * 100
    : 0;

  return { total, byStatus, byChannel, closedCount, closedValue, responseRate };
}

// Desempenho por nicho — cruza leads (conversão, valor fechado) com o custo
// real de cada rodada (Apify + OpenAI, gravado em prospeccao_runs) pra mostrar
// qual nicho realmente dá retorno, não só qual gera mais volume de lead.
// Ordenado por retorno líquido (valor fechado − custo), do melhor pro pior.
export function computeNicheStats(leads, niches, runs) {
  const nicheLabel = Object.fromEntries((Array.isArray(niches) ? niches : []).map((n) => [n.slug, n.label]));
  const bySlug = {};

  function bucket(slug) {
    const key = slug || 'sem-nicho';
    if (!bySlug[key]) {
      bySlug[key] = {
        slug: key,
        label: key === 'sem-nicho' ? 'Sem nicho' : (nicheLabel[key] || key),
        total: 0,
        fechados: 0,
        valorFechado: 0,
        custoApify: 0,
        custoOpenai: 0,
      };
    }
    return bySlug[key];
  }

  for (const lead of Array.isArray(leads) ? leads : []) {
    const b = bucket(lead?.niche_slug);
    b.total += 1;
    if (lead?.status === 'fechado') {
      b.fechados += 1;
      b.valorFechado += parseValor(lead?.valor);
    }
  }

  for (const run of Array.isArray(runs) ? runs : []) {
    const b = bucket(run?.niche_slug);
    b.custoApify += Number(run?.cost_apify || 0);
    b.custoOpenai += Number(run?.cost_openai || 0);
  }

  return Object.values(bySlug)
    .map((b) => {
      const custoTotal = b.custoApify + b.custoOpenai;
      return {
        ...b,
        custoTotal,
        taxaConversao: b.total > 0 ? (b.fechados / b.total) * 100 : 0,
        retornoLiquido: b.valorFechado - custoTotal,
      };
    })
    .sort((a, b) => b.retornoLiquido - a.retornoLiquido);
}
