import { supabaseAdmin, apiError } from '../../../lib/supabaseAdmin';
import { encontrarRegiao, leadForaDaRegiao, dddDivergente, dddDoTelefone, estadoDoTelefone } from '../../../lib/regioesAltaRenda';

// Auditoria dos leads QUE JÁ ESTÃO GRAVADOS (03/09/2026).
//
// A checagem de região nasceu depois que a base já tinha lead de fora dentro
// dela (a joalheria do Maranhão que entrou numa busca de Cotia/SP). Esta rota
// roda a mesma regra em tudo que está salvo e devolve a LISTA de quem está
// fora. Não apaga, não muda status, não mexe em nada: quem decide o que fazer
// com cada um é o Diogo, depois de ver a lista.
//
// Só olha lead cuja cidade bate numa região calibrada de lib/regioesAltaRenda
// (a UF da rodada é o que dá pra comparar). Lead de cidade digitada à mão fica
// de fora da auditoria, e o total dele aparece em "sem_regiao_calibrada".
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return apiError(res, 405, `Método ${req.method} não permitido.`);
  }

  try {
    const db = supabaseAdmin();

    const { data: leads, error } = await db
      .from('prospeccao_leads')
      .select('id, name, city, address, phone, whatsapp, status, niche_slug, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) return apiError(res, 500, `Falha ao buscar leads: ${error.message}`);

    const fora = [];
    const alertaDdd = [];
    let checados = 0;
    let semRegiao = 0;

    for (const lead of leads || []) {
      const regiao = encontrarRegiao(lead.city || '');
      if (!regiao) { semRegiao += 1; continue; }
      checados += 1;

      const telefone = lead.whatsapp || lead.phone;
      const motivo = leadForaDaRegiao({ address: lead.address, phone: telefone }, regiao);
      if (!motivo) {
        // Passou, mas com DDD de outro estado: vale o Diogo dar uma olhada
        // antes de mandar mensagem. Não entra na lista de "fora".
        const alerta = dddDivergente({ address: lead.address, phone: telefone }, regiao);
        if (alerta) {
          alertaDdd.push({
            id: lead.id,
            nome: lead.name,
            endereco: lead.address || null,
            telefone: telefone || null,
            ddd: dddDoTelefone(telefone),
            uf_telefone: estadoDoTelefone(telefone),
            cidade_pesquisada: lead.city,
            status: lead.status,
            motivo: alerta,
          });
        }
        continue;
      }

      fora.push({
        id: lead.id,
        nome: lead.name,
        endereco: lead.address || null,
        telefone: telefone || null,
        ddd: dddDoTelefone(telefone),
        uf_telefone: estadoDoTelefone(telefone),
        cidade_pesquisada: lead.city,
        uf_pesquisada: regiao.estado,
        status: lead.status,
        niche_slug: lead.niche_slug,
        motivo,
      });
    }

    return res.status(200).json({
      total_leads: (leads || []).length,
      checados,
      sem_regiao_calibrada: semRegiao,
      fora_da_regiao: fora.length,
      leads: fora,
      // Só aviso: endereço bate com a região, mas o DDD é de outro estado.
      ddd_de_outro_estado: alertaDdd.length,
      leads_ddd_de_outro_estado: alertaDdd,
    });
  } catch (err) {
    return apiError(res, 500, err.message || 'Erro inesperado ao checar região.');
  }
}
