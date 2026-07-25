import { useEffect, useMemo, useState } from 'react';
import { STATUSES, statusLabel, statusColor, formatValor, computeStats, computeNicheStats } from '../lib/statuses';

const NICHE_FALLBACK = [];

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [niches, setNiches] = useState(NICHE_FALLBACK);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterNiche, setFilterNiche] = useState('');
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [showNicheManager, setShowNicheManager] = useState(false);
  const [editingLead, setEditingLead] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
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
    } catch (err) {
      setError(err.message || 'Falha ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const stats = useMemo(() => computeStats(leads), [leads]);
  const nicheStats = useMemo(() => computeNicheStats(leads, niches, runs), [leads, niches, runs]);
  const custoApifyTotal = useMemo(() => runs.reduce((s, r) => s + Number(r.cost_apify || 0), 0), [runs]);
  const custoOpenaiTotal = useMemo(() => runs.reduce((s, r) => s + Number(r.cost_openai || 0), 0), [runs]);
  const custoTotalGeral = custoApifyTotal + custoOpenaiTotal;
  const custoPorFechado = stats.closedCount > 0 ? custoTotalGeral / stats.closedCount : 0;

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filterStatus && l.status !== filterStatus) return false;
      if (filterChannel && l.channel !== filterChannel) return false;
      if (filterNiche && l.niche_slug !== filterNiche) return false;
      if (search && !String(l.name || '').toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [leads, filterStatus, filterChannel, filterNiche, search]);

  async function updateLead(id, patch) {
    setError(null);
    // Atualização otimista: já mostra na tela, mas reverte se a API rejeitar.
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

  async function deleteLead(id) {
    if (!confirm('Excluir este lead?')) return;
    try {
      const resp = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao excluir.');
      setLeads((cur) => cur.filter((l) => l.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function regenerate(id) {
    setError(null);
    try {
      const resp = await fetch(`/api/leads/${id}/regenerate`, { method: 'POST' });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao gerar mensagem.');
      setLeads((cur) => cur.map((l) => (l.id === id ? json.lead : l)));
      setInfo('Mensagem gerada.');
      setTimeout(() => setInfo(null), 2500);
    } catch (err) {
      setError(err.message);
    }
  }

  function copyMessage(lead) {
    const text = lead.channel === 'email'
      ? `${lead.email_subject || ''}\n\n${lead.message_email || ''}`
      : lead.message_wa || '';
    navigator.clipboard?.writeText(text);
    setInfo('Mensagem copiada.');
    setTimeout(() => setInfo(null), 2000);
  }

  // Abre o WhatsApp/e-mail já com o texto pronto (só falta apertar enviar lá) e
  // marca o lead como "enviado" — não tem como o painel saber se a mensagem
  // realmente saiu (isso acontece fora daqui, no app do WhatsApp/e-mail), então
  // clicar em "abrir" é o sinal disponível, igual funcionava na v1.
  function openAndMarkSent(lead) {
    if (lead.channel === 'whatsapp') {
      const digits = String(lead.whatsapp || lead.phone || '').replace(/\D/g, '');
      if (!digits) { setError('Esse lead não tem WhatsApp cadastrado.'); return; }
      const text = encodeURIComponent(lead.message_wa || '');
      window.open(`https://wa.me/${digits}?text=${text}`, '_blank');
    } else {
      const subject = encodeURIComponent(lead.email_subject || '');
      const body = encodeURIComponent(lead.message_email || '');
      window.open(`mailto:${lead.email || ''}?subject=${subject}&body=${body}`, '_blank');
    }
    if (lead.status === 'novo') {
      updateLead(lead.id, { status: 'enviado', sent_at: new Date().toISOString() });
    }
  }

  // Contador de segurança: quantos leads foram marcados como enviados hoje
  // (sent_at = hoje). Acima de 15/dia é risco real de bloqueio de número no
  // WhatsApp — por isso o alerta, não é só estética.
  const sentToday = useMemo(() => {
    const today = new Date().toDateString();
    return leads.filter((l) => l.sent_at && new Date(l.sent_at).toDateString() === today).length;
  }, [leads]);
  const LIMITE_DIARIO = 15;

  return (
    <div className="wrap">
      <header className="topbar">
        <h1>prospecção<span>.</span>gratuita</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={loadAll}>Atualizar</button>
          <button className="btn secondary" onClick={() => setShowNicheManager(true)}>Nichos</button>
          <button className="btn secondary" onClick={() => setShowAddModal(true)}>+ Lead manual</button>
          <button className="btn" onClick={() => setShowRunForm(true)}>Nova prospecção</button>
        </div>
      </header>

      {error && <div className="error-banner">⚠ {error}</div>}
      {info && <div className="info-banner">{info}</div>}
      {sentToday > LIMITE_DIARIO && (
        <div className="error-banner">
          ⚠ Você já marcou {sentToday} mensagens como enviadas hoje — acima de {LIMITE_DIARIO}/dia é risco real de bloqueio do número no WhatsApp. Considere parar por hoje.
        </div>
      )}

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Total de leads</div>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">Em negociação</div>
          <div className="value">{stats.byStatus.negociacao || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Fechados</div>
          <div className="value green">{stats.closedCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Valor fechado</div>
          <div className="value accent">{formatValor(stats.closedValue)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Taxa de resposta</div>
          <div className="value">{stats.responseRate.toFixed(0)}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Enviadas hoje</div>
          <div className={`value ${sentToday > LIMITE_DIARIO ? 'red' : ''}`} style={sentToday > LIMITE_DIARIO ? { color: 'var(--red)' } : undefined}>
            {sentToday}/{LIMITE_DIARIO}
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="label">Custo Apify</div>
          <div className="value">{formatValor(custoApifyTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Custo OpenAI</div>
          <div className="value">{formatValor(custoOpenaiTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Custo total</div>
          <div className="value">{formatValor(custoTotalGeral)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Custo por fechamento</div>
          <div className="value">{stats.closedCount > 0 ? formatValor(custoPorFechado) : '—'}</div>
        </div>
      </section>

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
                <tr>
                  <th>Nicho</th>
                  <th>Leads</th>
                  <th>Fechados</th>
                  <th>Taxa conversão</th>
                  <th>Valor fechado</th>
                  <th>Custo</th>
                  <th>Retorno líquido</th>
                </tr>
              </thead>
              <tbody>
                {nicheStats.map((n) => (
                  <tr key={n.slug}>
                    <td>{n.label}</td>
                    <td>{n.total}</td>
                    <td>{n.fechados}</td>
                    <td>{n.taxaConversao.toFixed(0)}%</td>
                    <td>{formatValor(n.valorFechado)}</td>
                    <td className="muted">{formatValor(n.custoTotal)}</td>
                    <td className={n.retornoLiquido >= 0 ? 'text-green' : 'text-red'}>{formatValor(n.retornoLiquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Leads</h2>
        <div className="filters">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
            <option value="">Todos os canais</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
          <select value={filterNiche} onChange={(e) => setFilterNiche(e.target.value)}>
            <option value="">Todos os nichos</option>
            {niches.map((n) => (
              <option key={n.slug} value={n.slug}>{n.label}</option>
            ))}
          </select>
          <input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="empty-state">Carregando...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="empty-state">Nenhum lead encontrado com esses filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Negócio</th>
                  <th>Canal</th>
                  <th>Mensagem</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{lead.name}</div>
                      <div className="muted">{[lead.category, lead.city].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>
                      {lead.channel === 'whatsapp' ? '📱 WhatsApp' : lead.channel === 'email' ? '✉️ E-mail' : '—'}
                      <div className="muted">{lead.whatsapp || lead.email || ''}</div>
                    </td>
                    <td>
                      <div className="msg-preview">
                        {(lead.channel === 'email' ? lead.message_email : lead.message_wa) || (
                          <span className="muted">sem mensagem ainda</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <select
                        value={lead.status}
                        onChange={(e) => updateLead(lead.id, { status: e.target.value })}
                        style={{ borderColor: statusColor(lead.status) }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        style={{ width: 90 }}
                        defaultValue={lead.valor ?? ''}
                        placeholder="R$"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== String(lead.valor ?? '')) {
                            updateLead(lead.id, { valor: v === '' ? null : v });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn secondary" onClick={() => setEditingLead(lead)}>Editar msg</button>
                        <button className="btn secondary" onClick={() => copyMessage(lead)}>Copiar</button>
                        <button className="btn secondary" onClick={() => regenerate(lead.id)}>Gerar</button>
                        {lead.status === 'novo' && (
                          <>
                            <button className="btn secondary" onClick={() => openAndMarkSent(lead)}>
                              {lead.channel === 'whatsapp' ? 'Abrir WhatsApp' : 'Abrir e-mail'}
                            </button>
                            <button
                              className="btn secondary"
                              onClick={() => updateLead(lead.id, { status: 'enviado', sent_at: new Date().toISOString() })}
                            >
                              Marcar enviado
                            </button>
                          </>
                        )}
                        {(lead.status === 'enviado' || lead.status === 'aguardando_resposta') && (
                          <>
                            <button className="btn secondary" onClick={() => updateLead(lead.id, { status: 'negociacao', replied: true })}>Respondeu</button>
                            <button className="btn secondary" onClick={() => updateLead(lead.id, { status: 'descartado' })}>Sem interesse</button>
                          </>
                        )}
                        <button className="btn danger" onClick={() => deleteLead(lead.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Histórico de rodadas</h2>
        {runs.length === 0 ? (
          <div className="empty-state muted">Nenhuma rodada de prospecção automática ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nicho</th>
                <th>Cidade</th>
                <th>Status</th>
                <th>Encontrados</th>
                <th>Salvos</th>
                <th>Custo</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.niche_slug}</td>
                  <td>{r.city}</td>
                  <td>{r.status}</td>
                  <td>{r.found}</td>
                  <td>{r.saved}</td>
                  <td>{formatValor((r.cost_apify || 0) + (r.cost_openai || 0))}</td>
                  <td className="muted">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddLeadModal
          niches={niches}
          onClose={() => setShowAddModal(false)}
          onCreated={(lead) => {
            setLeads((cur) => [lead, ...cur]);
            setShowAddModal(false);
          }}
        />
      )}

      {showRunForm && (
        <RunFormModal
          niches={niches}
          onClose={() => setShowRunForm(false)}
          onDone={(msg) => {
            setInfo(msg);
            setShowRunForm(false);
            setTimeout(() => setInfo(null), 4000);
          }}
          onError={(msg) => setError(msg)}
        />
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

      {showNicheManager && (
        <NicheManagerModal
          niches={niches}
          onClose={() => setShowNicheManager(false)}
          onChanged={(updated) => setNiches(updated)}
        />
      )}
    </div>
  );
}

function AddLeadModal({ niches, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', category: '', city: '', niche_slug: '', channel: 'whatsapp', oferta: 'site',
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
              <option value="site">Site profissional</option>
              <option value="automacao">Automação de WhatsApp (CRM + lembretes)</option>
              <option value="completo">Pacote completo (site + automação)</option>
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

function EditMessageModal({ lead, onClose, onSave }) {
  const isEmail = lead.channel === 'email';
  const [subject, setSubject] = useState(lead.email_subject || '');
  const [body, setBody] = useState((isEmail ? lead.message_email : lead.message_wa) || '');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const patch = isEmail
      ? { email_subject: subject, message_email: body }
      : { message_wa: body };
    await onSave(patch);
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Escrever mensagem — {lead.name}</h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 12.5 }}>
          Sem OPENAI_API_KEY configurada, a mensagem não é gerada sozinha — escreva aqui
          e o resto do fluxo (copiar, enviar manual) funciona igual.
        </p>
        <form onSubmit={submit}>
          {isEmail && (
            <div className="form-row">
              <label>Assunto do e-mail</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Uma ideia rápida para o site da {'{'}nome{'}'}" />
            </div>
          )}
          <div className="form-row">
            <label>{isEmail ? 'Corpo do e-mail' : 'Mensagem de WhatsApp'}</label>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isEmail ? 'Escreva o corpo do e-mail...' : 'Escreva a mensagem de WhatsApp...'}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar mensagem'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RunFormModal({ niches, onClose, onDone, onError }) {
  const [niche, setNiche] = useState(niches[0]?.slug || '');
  const [city, setCity] = useState('');
  const [oferta, setOferta] = useState('site');
  const [saving, setSaving] = useState(false);

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
      onDone('Rodada de prospecção disparada. Os leads vão aparecer aqui conforme a Apify terminar.');
    } catch (err) {
      onError(err.message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nova prospecção</h3>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Nicho</label>
            <select value={niche} onChange={(e) => setNiche(e.target.value)} required>
              <option value="">— selecionar —</option>
              {niches.map((n) => <option key={n.slug} value={n.slug}>{n.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Cidade</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Osasco, SP" required />
          </div>
          <div className="form-row">
            <label>Oferta</label>
            <select value={oferta} onChange={(e) => setOferta(e.target.value)}>
              <option value="site">Site profissional</option>
              <option value="automacao">Automação de WhatsApp (CRM + lembretes)</option>
              <option value="completo">Pacote completo (site + automação)</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Disparando...' : 'Buscar leads'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const NICHE_FIELD_LABELS = [
  { key: 'label', label: 'Nome de exibição', placeholder: 'Ex: Manicure / Nail designer' },
  { key: 'gmaps_query', label: 'Busca no Google Maps', placeholder: 'manicure em {cidade}' },
  { key: 'leitor', label: 'Quem lê primeiro', placeholder: 'Ex: a própria profissional, atende sozinha...' },
  { key: 'tom', label: 'Tom de voz', placeholder: 'Ex: informal, próximo, emoji ok' },
  { key: 'solucao', label: 'Solução / argumento', placeholder: 'Ex: portfólio visual + agendamento' },
  { key: 'elogio_sugestao', label: 'Elogio + sugestão', placeholder: 'Como elogiar antes de sugerir a melhoria' },
  { key: 'pedido_demo', label: 'Pedido de demo grátis', placeholder: 'Quando/como oferecer demonstração grátis' },
];

function NicheManagerModal({ niches, onClose, onChanged }) {
  const [editingId, setEditingId] = useState(null); // id do nicho em edição, ou 'new'
  const [err, setErr] = useState(null);

  async function refresh() {
    const json = await fetch('/api/niches').then((r) => r.json());
    onChanged(json.niches || []);
  }

  async function saveNiche(id, form) {
    setErr(null);
    try {
      if (id === 'new') {
        const resp = await fetch('/api/niches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Falha ao criar nicho.');
      } else {
        const resp = await fetch(`/api/niches/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Falha ao salvar nicho.');
      }
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3>Nichos</h3>
        {err && <div className="error-banner">{err}</div>}
        <p className="muted" style={{ marginBottom: 14, fontSize: 12.5 }}>
          Cada nicho calibra o jeito que a IA escreve a mensagem: quem lê primeiro, tom de voz, o argumento certo, como elogiar antes de sugerir, e quando pedir demonstração grátis.
        </p>

        {editingId === 'new' ? (
          <NicheForm initial={{}} onCancel={() => setEditingId(null)} onSave={(form) => saveNiche('new', form)} isNew />
        ) : (
          <button className="btn secondary" style={{ marginBottom: 14 }} onClick={() => setEditingId('new')}>+ Novo nicho</button>
        )}

        <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {niches.map((n) => (
            <div key={n.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              {editingId === n.id ? (
                <NicheForm initial={n} onCancel={() => setEditingId(null)} onSave={(form) => saveNiche(n.id, form)} />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{n.label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{n.slug}</div>
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

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function NicheForm({ initial, onSave, onCancel, isNew }) {
  const [form, setForm] = useState({
    slug: initial.slug || '',
    label: initial.label || '',
    gmaps_query: initial.gmaps_query || '',
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
          {f.key === 'label' || f.key === 'gmaps_query' ? (
            <input value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} required={f.key === 'label'} />
          ) : (
            <textarea rows={2} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
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
