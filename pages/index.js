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

  return (
    <div className="wrap">
      <header className="topbar">
        <h1>prospecção<span>.</span>gratuita</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn secondary" onClick={loadAll}>Atualizar</button>
          <button className="btn secondary" onClick={() => setShowRunForm(true)}>Nova prospecção</button>
          <button className="btn" onClick={() => setShowAddModal(true)}>+ Lead manual</button>
        </div>
      </header>

      {error && <div className="error-banner">⚠ {error}</div>}
      {info && <div className="info-banner">{info}</div>}

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
    </div>
  );
}

function AddLeadModal({ niches, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', category: '', city: '', niche_slug: '', channel: 'whatsapp',
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
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, city }),
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
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Disparando...' : 'Buscar leads'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
