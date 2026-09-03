import { useEffect, useMemo, useRef, useState } from 'react';
import { STATUSES, statusLabel, statusColor, formatValor, parseValor, computeStats, computeNicheStats } from '../lib/statuses';
import {
  REGIOES_ALTA_RENDA,
  encontrarRegiao,
  leadForaDaRegiao,
  dddDivergente,
  dddDoTelefone,
  estadoDoTelefone,
  estadoDoEndereco,
} from '../lib/regioesAltaRenda';

const CIDADE_MANUAL = '__manual__';

// Painel reconstruído em 25/07/2026 seguindo as telas reais da v1 (prints do
// Diogo): navegação por abas, cards de lead com a mensagem inteira visível,
// contador "Enviados hoje: N/15" com alerta, seletor "Enviar como", banner de
// prospecção em execução com auto-refresh (60s normal, 15s com rodada rodando),
// dashboard com funil/cidades/canal/custo. Melhorias da v2 mantidas: oferta
// configurável (site/automação/completo), desempenho por nicho com custo real,
// nichos 100% editáveis na aba própria.
//
// 04/08/2026: cada lead passou a ter DUAS mensagens. A primeira é a abertura,
// que ataca a dor. A segunda leva o link do protótipo e vai logo em seguida,
// no mesmo fluxo que já era feito na mão. Os dois textos aparecem no card, têm
// botão de copiar próprio e são editáveis no mesmo modal.
const LIMITE_DIARIO = 15;

const TABS = [
  { key: 'nova', label: 'Nova prospecção' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'aguardando', label: 'Aguardando resposta' },
  { key: 'negociacao', label: 'Negociação' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'respostas', label: 'Respostas prontas' },
  { key: 'nichos', label: 'Nichos' },
  { key: 'historico', label: 'Histórico' },
];

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [niches, setNiches] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState('nova');
  const [enviarComo, setEnviarComo] = useState('pessoal');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [notesLead, setNotesLead] = useState(null);
  const [respondeuLead, setRespondeuLead] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const loadingRef = useRef(false);

  async function loadAll(silent) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const [leadsRes, nichesRes, runsRes] = await Promise.all([
        fetch('/api/leads').then((r) => r.json()),
        fetch('/api/niches').then((r) => r.json()),
        fetch('/api/runs').then((r) => r.json()),
      ]);
      if (leadsRes.error) throw new Error(leadsRes.error);
      setLeads(leadsRes.leads || []);
      setNiches(nichesRes.niches || []);
      setRuns(runsRes.runs || []);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || 'Falha ao carregar dados.');
    } finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const runningRun = useMemo(() => runs.find((r) => r.status === 'running'), [runs]);
  const lastDoneRun = useMemo(() => runs.find((r) => r.status === 'done'), [runs]);

  // Auto-refresh: 60s no uso normal, 15s enquanto tem prospecção rodando —
  // mesmo comportamento da v1 ("enquanto roda, atualizo a cada 15s").
  useEffect(() => {
    const ms = runningRun ? 15000 : 60000;
    const id = setInterval(() => loadAll(true), ms);
    return () => clearInterval(id);
  }, [runningRun]);

  const stats = useMemo(() => computeStats(leads), [leads]);
  const nicheStats = useMemo(() => computeNicheStats(leads, niches, runs), [leads, niches, runs]);

  const sentToday = useMemo(() => {
    const today = new Date().toDateString();
    return leads.filter((l) => l.sent_at && new Date(l.sent_at).toDateString() === today).length;
  }, [leads]);

  const buckets = useMemo(() => ({
    whatsapp: leads.filter((l) => l.channel === 'whatsapp' && l.status === 'novo'),
    email: leads.filter((l) => l.channel === 'email' && l.status === 'novo'),
    aguardando: leads.filter((l) => l.status === 'enviado' || l.status === 'aguardando_resposta'),
    // Quem acabou de ganhar mensagem seguinte vai pro topo: é o lead que o
    // Diogo está respondendo agora, e no celular ninguém rola atrás dele.
    negociacao: leads
      .filter((l) => l.status === 'negociacao')
      .sort((a, b) => new Date(b.mensagem_seguinte_at || 0) - new Date(a.mensagem_seguinte_at || 0)),
  }), [leads]);

  const tabCounts = {
    whatsapp: buckets.whatsapp.length,
    email: buckets.email.length,
    aguardando: buckets.aguardando.length,
    negociacao: buckets.negociacao.length,
  };

  async function updateLead(id, patch) {
    setError(null);
    const prev = leads;
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      const resp = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao atualizar.');
      setLeads((cur) => cur.map((l) => (l.id === id ? json.lead : l)));
    } catch (err) {
      setLeads(prev);
      setError(err.message);
    }
  }

  async function regenerate(id) {
    setError(null);
    setInfo('Gerando mensagem...');
    try {
      const resp = await fetch(`/api/leads/${id}/regenerate`, { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao gerar mensagem.');
      setLeads((cur) => cur.map((l) => (l.id === id ? json.lead : l)));
      flash('Mensagens geradas.');
    } catch (err) {
      setInfo(null);
      setError(err.message);
    }
  }

  function flash(msg) {
    setInfo(msg);
    setTimeout(() => setInfo(null), 3000);
  }

  // O lead respondeu: o texto dele vira a mensagem SEGUINTE, gerada pela IA
  // (vendedor sênior, com preço na mesa) e gravada no lead. Só depois de gerar
  // é que o lead vira negociação — quem faz isso é a rota (03/09/2026).
  async function responder(id, respostaLead) {
    setError(null);
    setInfo('Escrevendo a próxima mensagem...');
    const resp = await fetch(`/api/leads/${id}/responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respostaLead }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      setInfo(null);
      throw new Error(json.error || 'Falha ao gerar a próxima mensagem.');
    }
    setLeads((cur) => cur.map((l) => (l.id === id ? json.lead : l)));
    // O lead acabou de sair desta aba (virou negociação). Sem trocar de aba, a
    // lista encolhe embaixo do dedo e a tela cai num card qualquer, como se
    // tivesse dado erro — a mensagem que ele quer está na outra aba.
    setTab('negociacao');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    const avisos = (json.avisos || []).join(' ');
    flash(`Próxima mensagem de ${json.lead?.name || 'lead'} pronta, é só copiar.${avisos ? ` ⚠ ${avisos}` : ''}`);
  }

  function copyProxima(lead) {
    if (!lead.mensagem_seguinte) return;
    navigator.clipboard?.writeText(lead.mensagem_seguinte);
    flash('Próxima mensagem copiada.');
  }

  // Primeira mensagem: a abertura. É ela que abre a conversa.
  function copyMessage(lead) {
    const text = lead.channel === 'email'
      ? `${lead.email_subject || ''}\n\n${lead.message_email || ''}`
      : lead.message_wa || '';
    navigator.clipboard?.writeText(text);
    flash('Abertura copiada.');
  }

  // Segunda mensagem: a do protótipo. Vai logo depois da abertura, na mesma
  // conversa. Só existe quando o nicho tem link de demonstração cadastrado.
  function copyDemo(lead) {
    if (!lead.message_demo) return;
    navigator.clipboard?.writeText(lead.message_demo);
    flash('Mensagem do protótipo copiada. Manda logo depois da abertura.');
  }

  function markSent(lead) {
    updateLead(lead.id, {
      status: 'enviado',
      sent_at: new Date().toISOString(),
      canal_envio: enviarComo,
      // Sem prazo de follow-up: prospeccao fria nao tem segunda cobranca.
      // Passados 3 dias sem resposta o cron move o lead pra "sem interesse".
      followup_due_at: null,
    });
  }

  function openWhatsApp(lead) {
    const digits = String(lead.whatsapp || lead.phone || '').replace(/\D/g, '');
    if (!digits) { setError('Esse lead não tem WhatsApp cadastrado.'); return; }
    const text = encodeURIComponent(lead.message_wa || '');
    window.open(`https://wa.me/${digits}?text=${text}`, '_blank');
    // O WhatsApp só aceita uma mensagem por link. Então a segunda já vai
    // pro clipboard aqui, pronta pra colar assim que a primeira for enviada.
    if (lead.message_demo) {
      navigator.clipboard?.writeText(lead.message_demo);
      flash('Abertura foi pro WhatsApp. A 2ª mensagem já está copiada, é só colar depois de enviar a 1ª.');
    }
  }

  function openEmail(lead) {
    const subject = encodeURIComponent(lead.email_subject || '');
    // No e-mail as duas partes cabem na mesma mensagem, então já vão juntas.
    const corpo = [lead.message_email || '', lead.message_demo || ''].filter(Boolean).join('\n\n');
    const body = encodeURIComponent(corpo);
    window.open(`mailto:${lead.email || ''}?subject=${subject}&body=${body}`, '_blank');
  }

  function fechou(lead) {
    const raw = window.prompt('Valor fechado (R$):', lead.valor || '');
    if (raw === null) return;
    updateLead(lead.id, { status: 'fechado', valor: raw });
  }

  const runningMinutes = runningRun
    ? Math.max(1, Math.round((Date.now() - new Date(runningRun.created_at).getTime()) / 60000))
    : 0;

  return (
    <div className="wrap">
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>Prospecção Gratuita</h1>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          Acha negócios sem site, gera mensagem única e dispara. Lupixa / Diogo Pinotti
        </p>
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => loadAll()}>Atualizar agora</button>
      </header>

      <div className="panel">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 19, fontWeight: 700 }}>
            Enviados hoje: <span style={{ color: sentToday > LIMITE_DIARIO ? 'var(--red)' : 'var(--green)' }}>{sentToday}</span> / {LIMITE_DIARIO}
          </span>
          <span className="muted" style={{ fontSize: 13 }}>Limite sugerido para proteger o número.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <span className="muted" style={{ fontSize: 13 }}>Enviar como</span>
          <select value={enviarComo} onChange={(e) => setEnviarComo(e.target.value)}>
            <option value="pessoal">Pessoal</option>
            <option value="lupixa">Lupixa</option>
          </select>
        </div>
        {sentToday > LIMITE_DIARIO && (
          <div className="error-banner" style={{ marginTop: 12, marginBottom: 0 }}>
            Você já bateu {sentToday} envios hoje. Pega leve para não arriscar o número.
          </div>
        )}
      </div>

      {runningRun && (
        <div className="info-banner" style={{ borderColor: 'rgba(251,191,36,0.4)', color: 'var(--yellow)' }}>
          ● Prospecção #{runningRun.id} ({runningRun.niche_slug} em {runningRun.city}) em execução há {runningMinutes} min. Os leads aparecem sozinhos quando terminar.
        </div>
      )}

      {!runningRun && lastDoneRun && (
        <p style={{ marginBottom: 14, fontSize: 13.5 }}>
          Última prospecção: #{lastDoneRun.id} · {lastDoneRun.niche_slug} em {lastDoneRun.city} —{' '}
          <span style={{ color: lastDoneRun.saved > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
            {lastDoneRun.saved} leads novos
          </span>
          {lastDoneRun.duplicados > 0 && (
            <> · <span style={{ color: 'var(--amber, #d98a00)', fontWeight: 600 }}>{lastDoneRun.duplicados} já estavam na base</span></>
          )}
          {' '}(de {lastDoneRun.found} achados).
          {lastDoneRun.saved === 0 && lastDoneRun.duplicados > 0 && (
            <div style={{ marginTop: 4 }}>
              Essa busca não trouxe ninguém novo: o Google devolve as mesmas empresas para o mesmo nicho e cidade.
              Troque a cidade ou o nicho antes de rodar de novo, senão você paga a Apify por lead repetido.
            </div>
          )}
        </p>
      )}

      {error && <div className="error-banner">⚠ {error}</div>}
      {info && <div className="info-banner">{info}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className="btn secondary"
            style={tab === t.key ? { borderColor: 'var(--green)', color: 'var(--green)' } : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}{t.key in tabCounts ? ` (${tabCounts[t.key]})` : ''}
          </button>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Atualiza sozinho a cada {runningRun ? '15s' : '60s'}
        {lastUpdate ? ` · última atualização ${lastUpdate.toLocaleTimeString('pt-BR')}` : ''}
      </p>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : (
        <>
          {tab === 'nova' && (
            <NovaProspeccao
              niches={niches}
              onStarted={(runId) => {
                flash(`Prospecção iniciada (run #${runId}). Acompanhe o andamento no aviso no topo da tela; enquanto roda, atualizo a cada 15s.`);
                loadAll(true);
              }}
              onError={(msg) => setError(msg)}
              onOpenAddModal={() => setShowAddModal(true)}
            />
          )}

          {(tab === 'whatsapp' || tab === 'email') && (
            <LeadCardList
              leads={tab === 'whatsapp' ? buckets.whatsapp : buckets.email}
              emptyText={`Nenhum lead novo de ${tab === 'whatsapp' ? 'WhatsApp' : 'e-mail'} no momento. Rode uma Nova prospecção.`}
              renderActions={(lead) => (
                <>
                  <button className="btn secondary" onClick={() => copyMessage(lead)}>
                    {lead.message_demo ? 'Copiar 1ª (abertura)' : 'Copiar'}
                  </button>
                  {lead.message_demo && (
                    <button className="btn secondary" onClick={() => copyDemo(lead)}>Copiar 2ª (protótipo)</button>
                  )}
                  {lead.channel === 'whatsapp' ? (
                    <button className="btn" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => openWhatsApp(lead)}>Abrir WhatsApp</button>
                  ) : (
                    <button className="btn" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => openEmail(lead)}>Abrir e-mail</button>
                  )}
                  <button className="btn secondary" onClick={() => setEditingLead(lead)}>Editar</button>
                  <button className="btn secondary" onClick={() => regenerate(lead.id)}>Regerar</button>
                  <button className="btn" style={{ background: 'var(--green)', color: '#0A0A0A' }} onClick={() => markSent(lead)}>Marcar como enviada</button>
                  <button className="btn secondary" onClick={() => updateLead(lead.id, { status: 'descartado' })}>Sem interesse</button>
                </>
              )}
            />
          )}

          {tab === 'aguardando' && (
            <LeadCardList
              leads={buckets.aguardando}
              emptyText="Nenhum lead aguardando resposta."
              renderActions={(lead) => (
                <>
                  <button className="btn" style={{ background: 'var(--green)', color: '#0A0A0A' }} onClick={() => setRespondeuLead(lead)}>Respondeu</button>
                  <button className="btn secondary" onClick={() => updateLead(lead.id, { status: 'descartado' })}>Sem interesse</button>
                  <button className="btn secondary" onClick={() => setNotesLead(lead)}>Anotações</button>
                </>
              )}
            />
          )}

          {tab === 'negociacao' && (
            <LeadCardList
              leads={buckets.negociacao}
              emptyText="Nenhum lead em negociação no momento."
              renderActions={(lead) => (
                <>
                  {lead.mensagem_seguinte && (
                    <button className="btn secondary" onClick={() => copyProxima(lead)}>Copiar próxima mensagem</button>
                  )}
                  <button className="btn" style={{ background: 'var(--green)', color: '#0A0A0A' }} onClick={() => fechou(lead)}>Fechou</button>
                  <button className="btn secondary" onClick={() => updateLead(lead.id, { status: 'descartado' })}>Recusou proposta</button>
                  <button className="btn secondary" onClick={() => setNotesLead(lead)}>Anotações</button>
                </>
              )}
            />
          )}

          {tab === 'dashboard' && <DashboardTab leads={leads} stats={stats} nicheStats={nicheStats} runs={runs} />}
          {tab === 'respostas' && <RespostasTab />}
          {tab === 'nichos' && (
            <NichosTab niches={niches} onChanged={(updated) => setNiches(updated)} />
          )}
          {tab === 'historico' && <HistoricoTab runs={runs} />}
        </>
      )}

      {editingLead && (
        <EditMessageModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSave={async (patch) => {
            await updateLead(editingLead.id, patch);
            setEditingLead(null);
          }}
        />
      )}

      {notesLead && (
        <NotesModal
          lead={notesLead}
          onClose={() => setNotesLead(null)}
          onSave={async (patch) => {
            await updateLead(notesLead.id, patch);
            setNotesLead(null);
          }}
        />
      )}

      {respondeuLead && (
        <RespostaLeadModal
          lead={respondeuLead}
          onClose={() => setRespondeuLead(null)}
          onGerar={async (texto) => {
            await responder(respondeuLead.id, texto);
            setRespondeuLead(null);
          }}
          onSoMover={async () => {
            await updateLead(respondeuLead.id, { status: 'negociacao', replied: true });
            setRespondeuLead(null);
          }}
        />
      )}

      {showAddModal && (
        <AddLeadModal
          niches={niches}
          onClose={() => setShowAddModal(false)}
          onCreated={(lead) => {
            setLeads((cur) => [lead, ...cur]);
            setShowAddModal(false);
            flash('Lead cadastrado.');
          }}
        />
      )}
    </div>
  );
}

// ————— Cards de lead (modelo da v1: mensagem inteira + botões grandes) —————
// Nome curto do que está no campo website do Google. O lead quase nunca tem
// site de verdade ali: é Instagram, Linktree ou Doctoralia. Saber QUAL muda o
// texto da resposta.
function rotuloLink(url) {
  const u = String(url).toLowerCase();
  if (u.includes('instagram')) return 'Instagram';
  if (u.includes('linktr')) return 'Linktree';
  if (u.includes('doctoralia')) return 'Doctoralia';
  if (u.includes('facebook')) return 'Facebook';
  if (u.includes('ifood')) return 'iFood';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// Cidade e UF como estão escritas no endereço do Google ("... - Cohama, São
// Luís - MA, 65074-000" vira "São Luís - MA"). Serve pro Diogo bater o olho:
// o Maps casa a palavra do bairro, não a região, e já mandou joalheria do
// Maranhão numa busca de Cotia/SP.
function cidadeUfDoEndereco(address) {
  const uf = estadoDoEndereco(address);
  if (!uf) return null;
  const m = String(address).match(new RegExp(`([^,\\-]{2,40}?)\\s*-\\s*${uf}(?:[^A-Za-zÀ-ÿ]|$)`));
  const cidade = m ? m[1].trim() : null;
  return cidade ? `${cidade} - ${uf}` : uf;
}

function LeadCardList({ leads, emptyText, renderActions }) {
  if (!leads.length) return <div className="empty-state">{emptyText}</div>;

  const caixa = {
    background: '#0F0F0F', border: '1px solid var(--border)', borderRadius: 10,
    padding: 14, marginTop: 12, fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.5,
  };
  const etiqueta = {
    fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
    fontWeight: 700, color: 'var(--muted)', marginBottom: 8,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {leads.map((lead) => {
        const principal = lead.channel === 'email' ? lead.message_email : lead.message_wa;
        const temDuas = Boolean(principal && lead.message_demo);

        const telefone = lead.whatsapp || lead.phone;
        const ddd = dddDoTelefone(telefone);
        const ufTelefone = estadoDoTelefone(telefone);
        const localEndereco = cidadeUfDoEndereco(lead.address);
        const regiao = encontrarRegiao(lead.city || '');
        const motivoFora = regiao ? leadForaDaRegiao({ address: lead.address, phone: telefone }, regiao) : null;
        const avisoDdd = regiao && !motivoFora ? dddDivergente({ address: lead.address, phone: telefone }, regiao) : null;

        return (
          <div className="panel" key={lead.id} style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{lead.name}</span>
              <span className="badge" style={{ border: '1px solid var(--green)', color: 'var(--green)' }}>
                {lead.channel === 'email' ? 'E-mail' : 'WhatsApp'}
              </span>
              {/* Onde esse lead fica DE VERDADE: DDD do telefone e cidade/UF do
                  endereço do Google. Fica ao lado do nome de propósito — é o
                  que denuncia o lead de outro estado antes de mandar mensagem. */}
              {(ddd || localEndereco) && (
                <span
                  className="badge"
                  title={lead.address || ''}
                  style={{
                    border: `1px solid ${motivoFora ? 'var(--red)' : avisoDdd ? 'var(--yellow)' : 'var(--border)'}`,
                    color: motivoFora ? 'var(--red)' : avisoDdd ? 'var(--yellow)' : 'var(--muted)',
                  }}
                >
                  {[ddd ? `DDD ${ddd}${ufTelefone ? `/${ufTelefone}` : ''}` : null, localEndereco].filter(Boolean).join(' · ')}
                </span>
              )}
              {lead.site_tipo === 'social' && (
                <span className="badge" style={{ border: '1px solid var(--yellow)', color: 'var(--yellow)' }}>só rede social</span>
              )}
              {lead.canal_envio && (
                <span className="badge" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>via {lead.canal_envio}</span>
              )}
              <span style={{ marginLeft: 'auto', color: statusColor(lead.status), fontWeight: 600, fontSize: 13 }}>
                {statusLabel(lead.status)}
              </span>
            </div>

            <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {[lead.category, lead.city, lead.rating ? `nota ${lead.rating} (${lead.reviews_count || 0} avaliações)` : null, lead.whatsapp || lead.email]
                .filter(Boolean).join(' · ')}
            </p>

            {/* O que o perfil do Google dele aponta. É o único fato sobre "site"
                que dá pra afirmar sem checar — e é o que decide qual variante da
                resposta "já tenho site" usar. Sem isso na tela, o Diogo chuta. */}
            <p className="muted" style={{ marginTop: 2, fontSize: 13 }}>
              Link no perfil do Google:{' '}
              {lead.website ? (
                <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green)' }}>
                  {rotuloLink(lead.website)}
                </a>
              ) : (
                <b style={{ color: 'var(--ink)' }}>nenhum</b>
              )}
            </p>

            {principal ? (
              <div style={caixa}>
                {temDuas && <div style={etiqueta}>1ª mensagem · abertura</div>}
                {lead.channel === 'email' && lead.email_subject ? (
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{lead.email_subject}</div>
                ) : null}
                {principal}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Sem mensagem ainda — use Regerar ou Editar.</p>
            )}

            {lead.message_demo && (
              <div style={{ ...caixa, borderColor: 'rgba(59,130,246,0.35)' }}>
                <div style={{ ...etiqueta, color: 'var(--blue)' }}>
                  2ª mensagem · protótipo {lead.channel === 'whatsapp' ? '(mandar logo depois da 1ª)' : '(vai junto no mesmo e-mail)'}
                </div>
                {lead.message_demo}
              </div>
            )}

            {motivoFora && (
              <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--red)' }}>
                ⚠ Fora da região pesquisada: {motivoFora}
              </p>
            )}

            {avisoDdd && (
              <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--yellow)' }}>
                Confira antes de mandar: {avisoDdd}.
              </p>
            )}

            {lead.resposta_lead && (
              <div style={{ ...caixa, borderColor: 'var(--border)' }}>
                <div style={etiqueta}>o que ele respondeu</div>
                {lead.resposta_lead}
              </div>
            )}

            {lead.mensagem_seguinte && (
              <div style={{ ...caixa, borderColor: 'rgba(34,197,94,0.35)' }}>
                <div style={{ ...etiqueta, color: 'var(--green)' }}>
                  próxima mensagem · resposta com preço
                  {lead.mensagem_seguinte_at ? ` (gerada em ${new Date(lead.mensagem_seguinte_at).toLocaleDateString('pt-BR')})` : ''}
                </div>
                {lead.mensagem_seguinte}
              </div>
            )}

            {lead.notes && (
              <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>📝 {lead.notes}{lead.valor ? ` · Proposta: ${formatValor(lead.valor)}` : ''}</p>
            )}

            <div className="row-actions" style={{ marginTop: 12 }}>
              {renderActions(lead)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ————— Aba Nova prospecção —————
function NovaProspeccao({ niches, onStarted, onError, onOpenAddModal }) {
  const [niche, setNiche] = useState('');
  const [cidadeSelecionada, setCidadeSelecionada] = useState(REGIOES_ALTA_RENDA[0]?.cidade || CIDADE_MANUAL);
  const [cidadeManual, setCidadeManual] = useState('');
  const [oferta, setOferta] = useState('nuvemshop');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!niche && niches.length) setNiche(niches[0].slug);
  }, [niches, niche]);

  const regiao = REGIOES_ALTA_RENDA.find((r) => r.cidade === cidadeSelecionada) || null;
  // "city" que vai pro backend: a cidade calibrada (expande em todos os
  // bairros dela automaticamente, pages/api/run.js) ou o texto digitado à
  // mão quando o Diogo escolhe "Outra cidade".
  const city = cidadeSelecionada === CIDADE_MANUAL ? cidadeManual.trim() : cidadeSelecionada;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, city, oferta }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao disparar a busca.');
      onStarted(json.run?.id);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const nichoAtual = niches.find((n) => n.slug === niche);

  return (
    <div className="panel">
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Nicho</label>
            <select value={niche} onChange={(e) => setNiche(e.target.value)} required>
              {niches.map((n) => <option key={n.slug} value={n.slug}>{n.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Cidade</label>
            <select value={cidadeSelecionada} onChange={(e) => setCidadeSelecionada(e.target.value)} required>
              {REGIOES_ALTA_RENDA.map((r) => <option key={r.cidade} value={r.cidade}>{r.cidade}</option>)}
              <option value={CIDADE_MANUAL}>Outra cidade (digitar)</option>
            </select>
          </div>
        </div>

        {regiao ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Vai buscar em {regiao.bairros.length} bairro{regiao.bairros.length > 1 ? 's' : ''} de uma vez: {regiao.bairros.join(', ')}.
          </p>
        ) : (
          <div className="form-row" style={{ marginTop: 6, marginBottom: 0 }}>
            <label>Cidade/bairro (texto livre)</label>
            <input
              value={cidadeManual}
              onChange={(e) => setCidadeManual(e.target.value)}
              placeholder="São Paulo, SP"
              required
            />
          </div>
        )}

        <div className="form-row" style={{ marginTop: 12 }}>
          <label>Oferta desta rodada</label>
          <select value={oferta} onChange={(e) => setOferta(e.target.value)}>
            <option value="nuvemshop">Loja virtual Nuvemshop</option>
            <option value="site">Site profissional (legado)</option>
            <option value="automacao">Automação de WhatsApp (legado)</option>
            <option value="completo">Pacote completo (legado)</option>
          </select>
        </div>

        {nichoAtual && !nichoAtual.demo_url && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 4, color: 'var(--yellow)' }}>
            Este nicho ainda não tem case ou modelo próprio — a 2ª mensagem vai linkar a home do
            site (diogopinotti.com.br) em vez de um exemplo específico do nicho. Preencha o campo
            "Link do protótipo" na aba Nichos quando tiver um case pra esse tipo de loja.
          </p>
        )}

        <button
          type="submit"
          className="btn"
          disabled={saving}
          style={{ background: 'var(--green)', color: '#0A0A0A', width: '100%', padding: '13px 16px', fontSize: 15, marginTop: 6 }}
        >
          {saving ? 'Disparando...' : 'Buscar (10 e-mail + 10 WhatsApp)'}
        </button>
      </form>

      <p className="muted" style={{ fontSize: 13, marginTop: 14, lineHeight: 1.6 }}>
        Fluxo: envio → <b style={{ color: 'var(--ink)' }}>Aguardando resposta</b> → Respondeu vira <b style={{ color: 'var(--ink)' }}>Negociação</b> (Fechou / Recusou proposta / Sem interesse). Análise na aba <b style={{ color: 'var(--ink)' }}>Dashboard</b>.
      </p>

      <button className="btn secondary" style={{ marginTop: 12 }} onClick={onOpenAddModal}>+ Cadastrar lead manualmente</button>
    </div>
  );
}

// ————— Aba Dashboard —————
function DashboardTab({ leads, stats, nicheStats, runs }) {
  const enviadas = leads.filter((l) => l.sent_at || !['novo'].includes(l.status)).length;
  const responderam = leads.filter((l) => l.replied || ['negociacao', 'fechado'].includes(l.status)).length;
  const fecharam = stats.closedCount;
  const pctResponderam = enviadas > 0 ? Math.round((responderam / enviadas) * 100) : 0;
  const pctFecharam = responderam > 0 ? Math.round((fecharam / responderam) * 100) : 0;

  const emNegociacaoValor = leads
    .filter((l) => l.status === 'negociacao')
    .reduce((s, l) => s + parseValor(l.valor), 0);

  const custoTotalUsd = runs.reduce((s, r) => s + Number(r.cost_apify || 0) + Number(r.cost_openai || 0), 0);
  const custoPorFechadoUsd = fecharam > 0 ? custoTotalUsd / fecharam : null;

  // Por cidade
  const byCity = {};
  for (const l of leads) {
    const c = l.city || '?';
    if (!byCity[c]) byCity[c] = { leads: 0, enviadas: 0, respostas: 0, fechados: 0, valor: 0 };
    byCity[c].leads += 1;
    if (l.sent_at || l.status !== 'novo') byCity[c].enviadas += 1;
    if (l.replied || ['negociacao', 'fechado'].includes(l.status)) byCity[c].respostas += 1;
    if (l.status === 'fechado') { byCity[c].fechados += 1; byCity[c].valor += parseValor(l.valor); }
  }

  // Por canal
  const canal = { whatsapp: { enviadas: 0, respostas: 0 }, email: { enviadas: 0, respostas: 0 } };
  for (const l of leads) {
    if (l.channel !== 'whatsapp' && l.channel !== 'email') continue;
    if (l.sent_at || l.status !== 'novo') canal[l.channel].enviadas += 1;
    if (l.replied || ['negociacao', 'fechado'].includes(l.status)) canal[l.channel].respostas += 1;
  }

  const funil = [
    { label: 'Enviadas', valor: enviadas, cor: 'var(--green)', pct: 100 },
    { label: 'Responderam', valor: responderam, cor: 'var(--blue)', pct: enviadas ? (responderam / enviadas) * 100 : 0, extra: `${pctResponderam}%` },
    { label: 'Fecharam', valor: fecharam, cor: 'var(--accent)', pct: enviadas ? (fecharam / enviadas) * 100 : 0 },
  ];

  return (
    <>
      <section className="stats-grid">
        <div className="stat-card">
          <div className="value green">{enviadas}</div>
          <div className="label" style={{ marginTop: 6, marginBottom: 0 }}>Enviadas</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--blue)' }}>{responderam} ({pctResponderam}%)</div>
          <div className="label" style={{ marginTop: 6, marginBottom: 0 }}>Responderam</div>
        </div>
        <div className="stat-card">
          <div className="value green">{fecharam} ({pctFecharam}% de quem respondeu)</div>
          <div className="label" style={{ marginTop: 6, marginBottom: 0 }}>Fecharam</div>
        </div>
        <div className="stat-card">
          <div className="value accent">{formatValor(stats.closedValue)}</div>
          <div className="label" style={{ marginTop: 6, marginBottom: 0 }}>Fechado em R$</div>
        </div>
        <div className="stat-card">
          <div className="value accent">{formatValor(emNegociacaoValor)}</div>
          <div className="label" style={{ marginTop: 6, marginBottom: 0 }}>Em negociação R$</div>
        </div>
      </section>

      <div className="panel">
        <h2>Funil geral</h2>
        {funil.map((f) => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span style={{ width: 120, fontSize: 13 }}>{f.label}</span>
            <div style={{ flex: 1, background: '#0F0F0F', borderRadius: 999, height: 14, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(2, f.pct)}%`, background: f.cor, height: '100%', borderRadius: 999 }} />
            </div>
            <span style={{ width: 70, textAlign: 'right', fontSize: 13 }}>{f.valor}{f.extra ? ` · ${f.extra}` : ''}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Por cidade</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Cidade</th><th>Leads</th><th>Enviadas</th><th>Respostas</th><th>Fechados</th><th>R$ fechado</th></tr>
            </thead>
            <tbody>
              {Object.entries(byCity).sort((a, b) => b[1].leads - a[1].leads).map(([c, d]) => (
                <tr key={c}>
                  <td>{c}</td><td>{d.leads}</td><td>{d.enviadas}</td><td>{d.respostas}</td><td>{d.fechados}</td><td>{formatValor(d.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Por canal</h2>
        {(['whatsapp', 'email']).map((c) => {
          const d = canal[c];
          const pct = d.enviadas > 0 ? Math.round((d.respostas / d.enviadas) * 100) : 0;
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ width: 100, fontSize: 13 }}>{c === 'whatsapp' ? 'WhatsApp' : 'E-mail'}</span>
              <div style={{ flex: 1, background: '#0F0F0F', borderRadius: 999, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, pct)}%`, background: c === 'whatsapp' ? 'var(--green)' : 'var(--blue)', height: '100%', borderRadius: 999 }} />
              </div>
              <span style={{ width: 90, textAlign: 'right', fontSize: 13 }}>{pct}% · {d.respostas}/{d.enviadas}</span>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>Desempenho por nicho</h2>
        <p className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>
          Ordenado por retorno líquido (valor fechado menos custo de Apify + OpenAI) — os nichos que mais valem a pena aparecem primeiro.
        </p>
        {nicheStats.length === 0 ? (
          <div className="empty-state muted">Ainda sem dados suficientes.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Nicho</th><th>Leads</th><th>Fechados</th><th>Conversão</th><th>Valor fechado</th><th>Custo</th><th>Retorno líquido</th></tr>
              </thead>
              <tbody>
                {nicheStats.map((n) => (
                  <tr key={n.slug}>
                    <td>{n.label}</td>
                    <td>{n.total}</td>
                    <td>{n.fechados}</td>
                    <td>{n.taxaConversao.toFixed(0)}%</td>
                    <td>{formatValor(n.valorFechado)}</td>
                    <td className="muted">US$ {n.custoTotal.toFixed(2)}</td>
                    <td className={n.retornoLiquido >= 0 ? 'text-green' : 'text-red'}>{formatValor(n.valorFechado)} − US$ {n.custoTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Custo e retorno</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>US$ {custoTotalUsd.toFixed(2)}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>custo total (Apify + OpenAI)</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{custoPorFechadoUsd !== null ? `US$ ${custoPorFechadoUsd.toFixed(2)}` : '—'}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>custo por cliente fechado</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{formatValor(stats.closedValue)}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>receita fechada registrada</div>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          Preencha o campo "Valor da proposta" nas Anotações de cada lead em negociação pra estes números fazerem sentido.
        </p>
      </div>
    </>
  );
}

// ————— Aba Respostas prontas —————
//
// Prospeccao fria nao tem follow-up, mas tem RESPOSTA a objecao — e a objecao
// vem sempre nas mesmas 5 formas. Ter o texto pronto e a diferenca entre
// responder em 40 segundos e deixar a conversa esfriar.
//
// Regra que vale pra todas: nao afirmar o que nao da pra verificar. Ofereca
// checar. Um diagnostico gratuito e concreto abre mais porta do que um palpite
// que pode estar errado — e se estiver errado, queima a conversa inteira.
const RESPOSTAS = [
  {
    objecao: 'Já tenho site',
    porque: 'A mais comum. Não discuta: o site existir não quer dizer que ele traga paciente. Ofereça olhar, nunca afirme que está ruim. ATENÇÃO: escolha a variante pelo campo "Link no perfil" que aparece no card do lead — dizer "vai pro Instagram" pra quem não tem link nenhum é errar feio na frente do cliente.',
    variantes: [
      {
        quando: 'O card do lead mostra Instagram, Facebook, Linktree ou Doctoralia',
        texto: 'Ah, que bom! Me manda o link que eu dou uma olhada.\n\nPergunto porque cheguei em você pelo Google Maps, e no seu perfil de lá o link vai pro Instagram, não pro site. Quem te procura pelo mapa acaba não chegando nele.\n\nSe quiser, eu vejo também em que posição ele aparece quando alguém busca o seu serviço na sua cidade, e te falo o que dá pra ajustar. Sem custo e sem compromisso.',
      },
      {
        quando: 'O card do lead não mostra link nenhum (o caso mais comum)',
        texto: 'Ah, que bom! Me manda o link que eu dou uma olhada.\n\nPergunto porque cheguei em você pelo Google Maps e no seu perfil de lá não tem o endereço do site cadastrado. Quem te procura pelo mapa não encontra ele.\n\nIsso é rápido de resolver, e é de graça. Se quiser eu vejo também em que posição seu site aparece quando alguém busca o seu serviço na sua cidade, e te falo o que dá pra ajustar. Sem compromisso.',
      },
    ],
  },
  {
    objecao: 'Quanto custa?',
    porque: 'Responder com preço mostra que existe preço e filtra quem não tem orçamento. Fugir da pergunta mata a conversa. Tabela de 03/09/2026 (lib/planos.js) — o botão "Respondeu", na aba Aguardando resposta, escreve essa mesma resposta adaptada ao que o lead perguntou.',
    texto: 'Cada "quanto custa?" no direct é uma venda esperando alguém responder. Na loja, ela fecha sozinha.\n\nLoja com até 40 peças, Sacolinha do Instagram, Google Shopping e Nuvem Marketing: R$ 1.900. Pode ser em 3x de R$ 633 sem juros, R$ 1.805 à vista, ou em até 10x no cartão. Se quiser começar menor, com até 15 peças, R$ 1.300, em 3x de R$ 433 ou R$ 1.235 à vista, e depois a gente amplia.\n\nPra fechar, eu te mando uma proposta de uma página com tudo escrito, você decide com calma e a gente combina a forma de pagamento que couber no seu caixa.\n\nQuantas peças você tem hoje?',
  },
  {
    objecao: 'Vou pensar / depois eu vejo',
    porque: 'Não insista e não marque follow-up. Deixe uma porta aberta que não exige resposta e encerre com elegância.',
    texto: 'Tranquilo, sem pressa nenhuma.\n\nDeixo o link do modelo salvo aqui pra você olhar com calma quando der. Se em algum momento fizer sentido, é só me chamar nesse mesmo número que eu retomo de onde paramos.\n\nBom trabalho por aí!',
  },
  {
    objecao: 'Uso só o Instagram',
    porque: 'Não ataque o Instagram — ele funciona. Mostre o que ele não faz: aparecer pra quem busca no Google e não segue você.',
    texto: 'Faz sentido, o Instagram funciona bem pra quem já te conhece.\n\nO site resolve o outro lado: quem digita o seu serviço no Google e ainda não te segue. Essa pessoa não chega no seu perfil, ela chega em quem tem site.\n\nOs dois juntos funcionam melhor que qualquer um sozinho — o site inclusive puxa pro seu Instagram. Quer ver como fica?',
  },
  {
    objecao: 'Já tentei com outro e não deu certo',
    porque: 'Ouro. Quem já tentou tem orçamento e tem dor. Descubra o que deu errado antes de vender qualquer coisa.',
    texto: 'Entendo, e infelizmente é comum.\n\nMe conta o que aconteceu: não ficou pronto, ficou pronto e não trouxe cliente, ou você não conseguiu mais falar com a pessoa depois?\n\nPergunto porque cada um desses tem uma solução diferente, e não faz sentido eu te oferecer nada antes de saber qual foi.',
  },
];

function RespostasTab() {
  const [copiada, setCopiada] = useState(null);

  function copiar(r, i) {
    navigator.clipboard?.writeText(r.texto);
    setCopiada(i);
    setTimeout(() => setCopiada((atual) => (atual === i ? null : atual)), 2000);
  }

  return (
    <div className="panel">
      <h2>Respostas prontas</h2>
      <p className="muted" style={{ marginTop: 4 }}>
        Prospecção fria não tem follow-up, mas tem resposta a objeção. Copie, ajuste o nome e responda
        na hora. Nenhuma delas afirma algo que você não checou: todas oferecem olhar antes de opinar.
      </p>
      <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        {RESPOSTAS.map((r, i) => (
          <div key={r.objecao} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <strong>“{r.objecao}”</strong>
                <div className="muted" style={{ fontSize: 13, marginTop: 2, maxWidth: '60ch' }}>{r.porque}</div>
              </div>
              {!r.variantes && (
                <button className="btn secondary" onClick={() => copiar(r, i)}>
                  {copiada === i ? 'Copiado ✓' : 'Copiar resposta'}
                </button>
              )}
            </div>
            {(r.variantes || [{ quando: null, texto: r.texto }]).map((v, k) => (
              <div key={k} style={{ marginTop: 12 }}>
                {v.quando && (
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    ▸ {v.quando}
                    <button
                      className="btn secondary"
                      style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}
                      onClick={() => copiar(v, r.objecao + k)}
                    >
                      {copiada === r.objecao + k ? 'Copiado ✓' : 'Copiar'}
                    </button>
                  </div>
                )}
                <pre style={{
                  whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.55,
                  background: 'var(--bg)', borderRadius: 8, padding: 12, margin: 0,
                }}>{v.texto}</pre>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ————— Aba Nichos —————
const NICHE_FIELD_LABELS = [
  { key: 'label', tipo: 'input', label: 'Nome de exibição', placeholder: 'Ex: Manicure / Nail designer' },
  { key: 'gmaps_query', tipo: 'input', label: 'Busca no Google Maps', placeholder: 'manicure em {cidade}' },
  {
    key: 'demo_url',
    tipo: 'url',
    label: 'Link da 2ª mensagem',
    placeholder: 'https://sindynutricionista.com.br',
    ajuda: 'O site que você manda logo depois da abertura. Sem link aqui, o nicho gera só a mensagem de abertura.',
  },
  {
    key: 'demo_tipo',
    tipo: 'select',
    label: 'Esse link é o quê?',
    opcoes: [
      { valor: 'modelo', texto: 'Um modelo/protótipo que eu montei' },
      { valor: 'cliente', texto: 'Site de um cliente meu, no ar' },
    ],
    ajuda: 'Muda o texto inteiro da 2ª mensagem. Cliente real vira prova ("fiz o site de..."); modelo é apresentado como modelo. Chamar modelo de cliente derruba a venda na primeira pergunta.',
  },
  {
    key: 'demo_quem',
    tipo: 'input',
    label: 'De quem é esse site',
    placeholder: 'uma nutricionista em Florianópolis',
    ajuda: 'Só usado quando o link é de cliente. Vira a frase "fiz o site de ___". Escreva sem o nome da pessoa, só quem é e onde.',
  },
  {
    key: 'demo_olhar',
    tipo: 'textarea',
    label: 'O que mandar reparar no link',
    placeholder: 'Um por linha. Ex:\no CRN aparece no topo e no rodapé\nos depoimentos ficam na página, não só no Google',
    ajuda: 'Um por linha. É o que faz a pessoa abrir o link e olhar o lugar certo em vez de passar o olho.',
  },
  {
    key: 'demo_fechamento',
    tipo: 'input',
    label: 'Pergunta que fecha a 2ª mensagem',
    placeholder: 'Você atende só presencial ou também online?',
    ajuda: 'Uma pergunta que ela responde em uma linha e que já te diz o escopo. Nada de "o que achou?".',
  },
  { key: 'leitor', tipo: 'textarea', label: 'Quem lê primeiro', placeholder: 'Ex: a própria profissional, atende sozinha...' },
  { key: 'tom', tipo: 'textarea', label: 'Tom de voz', placeholder: 'Ex: informal, próximo, emoji ok' },
  { key: 'solucao', tipo: 'textarea', label: 'Solução / argumento', placeholder: 'Ex: portfólio visual + agendamento' },
  { key: 'elogio_sugestao', tipo: 'textarea', label: 'Elogio + sugestão', placeholder: 'Como elogiar antes de sugerir a melhoria' },
  { key: 'pedido_demo', tipo: 'textarea', label: 'Pedido de demo grátis', placeholder: 'Quando/como oferecer demonstração grátis' },
];

function NichosTab({ niches, onChanged }) {
  const [editingId, setEditingId] = useState(null);
  const [err, setErr] = useState(null);

  async function refresh() {
    const json = await fetch('/api/niches').then((r) => r.json());
    onChanged(json.niches || []);
  }

  async function saveNiche(id, form) {
    setErr(null);
    try {
      const resp = id === 'new'
        ? await fetch('/api/niches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch(`/api/niches/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao salvar nicho.');
      await refresh();
      setEditingId(null);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function deleteNiche(id) {
    if (!confirm('Excluir este nicho?')) return;
    setErr(null);
    try {
      const resp = await fetch(`/api/niches/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao excluir nicho.');
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="panel">
      <h2>Nichos</h2>
      {err && <div className="error-banner">{err}</div>}
      <p className="muted" style={{ marginBottom: 14, fontSize: 12.5 }}>
        Cada nicho calibra o jeito que a IA escreve a mensagem: quem lê primeiro, tom de voz, o argumento certo, como elogiar antes de sugerir, e quando pedir demonstração grátis. O <b>Link do protótipo</b> é o que faz a 2ª mensagem existir — sem ele, o lead sai só com a abertura. Tudo editável.
      </p>

      {editingId === 'new' ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <NicheForm initial={{}} onCancel={() => setEditingId(null)} onSave={(form) => saveNiche('new', form)} isNew />
        </div>
      ) : (
        <button className="btn secondary" style={{ marginBottom: 14 }} onClick={() => setEditingId('new')}>+ Novo nicho</button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {niches.map((n) => (
          <div key={n.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            {editingId === n.id ? (
              <NicheForm initial={n} onCancel={() => setEditingId(null)} onSave={(form) => saveNiche(n.id, form)} />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {n.label}
                    {!n.demo_url && (
                      <span className="badge" style={{ border: '1px solid var(--yellow)', color: 'var(--yellow)', marginLeft: 8 }}>sem protótipo</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{n.slug}{n.tom ? ` · ${n.tom.slice(0, 60)}${n.tom.length > 60 ? '…' : ''}` : ''}</div>
                </div>
                <div className="row-actions">
                  <button className="btn secondary" onClick={() => setEditingId(n.id)}>Editar</button>
                  <button className="btn danger" onClick={() => deleteNiche(n.id)}>Excluir</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NicheForm({ initial, onSave, onCancel, isNew }) {
  const [form, setForm] = useState({
    slug: initial.slug || '',
    label: initial.label || '',
    gmaps_query: initial.gmaps_query || '',
    demo_url: initial.demo_url || '',
    demo_tipo: initial.demo_tipo || 'modelo',
    demo_quem: initial.demo_quem || '',
    demo_olhar: initial.demo_olhar || '',
    demo_fechamento: initial.demo_fechamento || '',
    leitor: initial.leitor || '',
    tom: initial.tom || '',
    solucao: initial.solucao || '',
    elogio_sugestao: initial.elogio_sugestao || '',
    pedido_demo: initial.pedido_demo || '',
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {isNew && (
        <div className="form-row">
          <label>Slug (identificador único)</label>
          <input value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="Ex: personal-trainer" required />
        </div>
      )}
      {NICHE_FIELD_LABELS.map((f) => (
        <div className="form-row" key={f.key}>
          <label>{f.label}</label>
          {f.ajuda && <small className="muted" style={{ display: 'block', marginBottom: 4 }}>{f.ajuda}</small>}
          {f.tipo === 'select' ? (
            <select value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}>
              {f.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>{o.texto}</option>
              ))}
            </select>
          ) : f.tipo === 'textarea' ? (
            <textarea rows={f.key === 'demo_olhar' ? 3 : 2} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
          ) : (
            <input
              type={f.tipo === 'url' ? 'url' : 'text'}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              required={f.key === 'label'}
            />
          )}
        </div>
      ))}
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar nicho'}</button>
      </div>
    </form>
  );
}

// ————— Aba Histórico —————
function HistoricoTab({ runs }) {
  return (
    <div className="panel">
      <h2>Histórico de rodadas</h2>
      {runs.length === 0 ? (
        <div className="empty-state muted">Nenhuma rodada de prospecção automática ainda.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Nicho</th><th>Cidade</th><th>Oferta</th><th>Status</th>
                <th>Achados</th><th>Salvos</th><th>Custo (US$)</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.niche_slug}</td>
                  <td>{r.city}</td>
                  <td>{r.oferta || 'nuvemshop'}</td>
                  <td style={{ color: r.status === 'done' ? 'var(--green)' : r.status === 'error' ? 'var(--red)' : 'var(--yellow)' }}>{r.status}</td>
                  <td>{r.found}</td>
                  <td>{r.saved}</td>
                  <td className="muted">{(Number(r.cost_apify || 0) + Number(r.cost_openai || 0)).toFixed(2)}</td>
                  <td className="muted">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ————— Modais —————
function EditMessageModal({ lead, onClose, onSave }) {
  const isEmail = lead.channel === 'email';
  const [subject, setSubject] = useState(lead.email_subject || '');
  const [body, setBody] = useState((isEmail ? lead.message_email : lead.message_wa) || '');
  const [demo, setDemo] = useState(lead.message_demo || '');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const patch = isEmail
      ? { email_subject: subject, message_email: body, message_demo: demo || null }
      : { message_wa: body, message_demo: demo || null };
    await onSave(patch);
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Editar mensagens — {lead.name}</h3>
        <form onSubmit={submit}>
          {isEmail && (
            <div className="form-row">
              <label>Assunto do e-mail</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          <div className="form-row">
            <label>1ª mensagem · {isEmail ? 'corpo do e-mail' : 'abertura no WhatsApp'}</label>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isEmail ? 'Escreva o corpo do e-mail...' : 'Escreva a mensagem de abertura...'}
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>2ª mensagem · protótipo (deixe vazio se não for mandar)</label>
            <textarea
              rows={6}
              value={demo}
              onChange={(e) => setDemo(e.target.value)}
              placeholder="Ah, e pra você não precisar imaginar, olha esse protótipo que eu montei: https://..."
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar mensagens'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// O que o lead respondeu no WhatsApp entra aqui, colado. Sai a mensagem
// seguinte, escrita pelo prompt de vendedor sênior (lib/generateReply.js) —
// era isso que o Diogo escrevia na mão toda vez (03/09/2026).
function RespostaLeadModal({ lead, onClose, onGerar, onSoMover }) {
  const [texto, setTexto] = useState(lead.resposta_lead || '');
  const [gerando, setGerando] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!texto.trim()) { setErr('Cola o que ele respondeu — é isso que a mensagem responde.'); return; }
    setGerando(true);
    try {
      await onGerar(texto.trim());
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={gerando ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>O que ele respondeu? — {lead.name}</h3>
        {err && <div className="error-banner">{err}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Cole aqui a resposta dele, do jeito que veio no WhatsApp</label>
            <textarea
              rows={6}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="quanto custa?"
              autoFocus
              disabled={gerando}
            />
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>
            A próxima mensagem sai com o preço do plano indicado, o parcelamento e uma pergunta de
            fechamento. O lead vai pra Negociação só depois que ela for gerada.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={gerando}>Cancelar</button>
            <button type="button" className="btn secondary" onClick={onSoMover} disabled={gerando}>
              Só mover pra negociação
            </button>
            <button type="submit" className="btn" disabled={gerando}>
              {gerando ? 'Escrevendo...' : 'Gerar próxima mensagem'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NotesModal({ lead, onClose, onSave }) {
  const [notes, setNotes] = useState(lead.notes || '');
  const [valor, setValor] = useState(lead.valor || '');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ notes, valor: valor === '' ? null : valor });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Anotações — {lead.name}</h3>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Valor da proposta (R$)</label>
            <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 400,00" />
          </div>
          <div className="form-row">
            <label>Anotações</label>
            <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto da conversa, próximos passos..." autoFocus />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddLeadModal({ niches, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', category: '', city: '', niche_slug: '', channel: 'whatsapp', oferta: 'nuvemshop',
    whatsapp: '', email: '', status: 'novo', valor: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.name.trim()) { setErr('Nome do negócio é obrigatório.'); return; }
    if (!form.whatsapp && !form.email) { setErr('Informe WhatsApp ou e-mail.'); return; }
    setSaving(true);
    try {
      const resp = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao criar lead.');
      onCreated(json.lead);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Adicionar lead manualmente</h3>
        {err && <div className="error-banner">{err}</div>}
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Nome do negócio *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Categoria</label>
            <input value={form.category} onChange={(e) => set('category', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Cidade</label>
            <input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Nicho</label>
            <select value={form.niche_slug} onChange={(e) => set('niche_slug', e.target.value)}>
              <option value="">— selecionar —</option>
              {niches.map((n) => <option key={n.slug} value={n.slug}>{n.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Canal principal</label>
            <select value={form.channel} onChange={(e) => set('channel', e.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
            </select>
          </div>
          <div className="form-row">
            <label>Oferta</label>
            <select value={form.oferta} onChange={(e) => set('oferta', e.target.value)}>
              <option value="nuvemshop">Loja virtual Nuvemshop</option>
              <option value="site">Site profissional (legado)</option>
              <option value="automacao">Automação de WhatsApp (legado)</option>
              <option value="completo">Pacote completo (legado)</option>
            </select>
          </div>
          <div className="form-row">
            <label>WhatsApp</label>
            <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="5511999999999" />
          </div>
          <div className="form-row">
            <label>E-mail</label>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="form-row">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Valor (se já fechado)</label>
            <input value={form.valor} onChange={(e) => set('valor', e.target.value)} placeholder="R$ 400,00" />
          </div>
          <div className="form-row">
            <label>Notas</label>
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar lead'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
