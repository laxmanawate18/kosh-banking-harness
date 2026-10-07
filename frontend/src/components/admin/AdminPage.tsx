import React, { useEffect, useState } from 'react';
import { get, post, put } from '../../services/api';
import { Badge } from '../common/Badge';
import { ADMIN_NAV } from '../layout/Sidebar';

/** The Admin Panel: governs Mitra and the platform. Bank officers never see it; the admin never sees banking work. */

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const seconds = (ms?: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const number = (n?: number | null) => (n == null ? '—' : n.toLocaleString('en-IN'));
const askNote = (what: string) => {
  const note = window.prompt(`${what}\nNote what you reviewed (required):`);
  return note && note.trim().length >= 5 ? note.trim() : null;
};

function useData<T>(url: string): [T | null, () => void, string | null] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); get<T>(url).then(setData).catch(e => setError(e?.detail?.toString?.() || e?.message || 'Could not load')); };
  useEffect(load, [url]);
  return [data, load, error];
}

const Loading: React.FC<{ error: string | null }> = ({ error }) =>
  <section className="panel"><p>{error ? `Could not load: ${error}` : 'Loading…'}</p></section>;

async function act(call: () => Promise<unknown>, done: () => void) {
  try { await call(); done(); } catch (e: any) { window.alert(e?.detail?.toString?.() || e?.message || 'The action failed'); }
}

/* ---------------- Approvals ---------------- */
type Approvals = {
  prompt_versions: { id: string; version: string; model: string; evaluation: { passed: number; total: number; pass_rate: number; at: string } | null; gate: string[] }[];
  processes: { id: string; name: string; kosh_status: string }[];
  deletions: { id: string; customer_id: string; status: string; requested_by: string; reason: string; created_at: string;
    decided_by: string | null; decision_note: string | null }[];
};

const ApprovalsTab: React.FC<{ go: (route: string) => void }> = ({ go }) => {
  const [data, load, error] = useData<Approvals>('/api/admin/approvals');
  if (!data) return <Loading error={error} />;
  const approvePrompt = (id: string) => { const note = askNote(`Approve prompt version ${id}?`); if (note) act(() => post(`/api/admin/ai-registry/${id}/approve`, { note }), load); };
  const decide = (id: string, decision: 'APPROVE' | 'REJECT') => {
    const note = askNote(decision === 'APPROVE'
      ? 'Approve: the customer loses access and contact details are removed. Accounts, transactions, KYC and audit are kept.'
      : 'Reject this deletion request?');
    if (note) act(() => post(`/api/admin/deletions/${id}/decision`, { decision, note }), load);
  };
  const pending = data.deletions.filter(d => d.status === 'PENDING');
  return (
    <>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Prompt versions waiting for approval</h2>
        {data.prompt_versions.length ? (
          <table className="table"><thead><tr><th>Version</th><th>Model</th><th>Latest evaluation</th><th>Release gate</th><th /></tr></thead>
            <tbody>{data.prompt_versions.map(v => (
              <tr key={v.id}>
                <td><code>{v.version}</code></td><td>{v.model}</td>
                <td>{v.evaluation ? `${v.evaluation.passed}/${v.evaluation.total} (${v.evaluation.pass_rate}%) · ${when(v.evaluation.at)}` : 'Not evaluated'}</td>
                <td>{v.gate.length ? <span style={{ color: '#b91c1c' }}>{v.gate.join('; ')}</span> : <Badge variant="success">Passes</Badge>}</td>
                <td>{!v.gate.length && <button type="button" className="button primary" onClick={() => approvePrompt(v.id)}>Approve</button>}</td>
              </tr>))}</tbody></table>
        ) : <p>Nothing waiting.</p>}
      </section>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Customer deletions waiting for a second person</h2>
        <p>An officer asked; you decide. Approving removes logins, sessions, chats and contact details. Accounts, transactions, KYC, service requests, consents and the audit trail are kept, as the bank must retain them.</p>
        {pending.length ? (
          <table className="table"><thead><tr><th>Request</th><th>Customer</th><th>Asked by</th><th>Reason</th><th>When</th><th /></tr></thead>
            <tbody>{pending.map(d => (
              <tr key={d.id}><td><code>{d.id}</code></td><td>{d.customer_id}</td><td>{d.requested_by}</td><td style={{ maxWidth: 360 }}>{d.reason}</td><td>{when(d.created_at)}</td>
                <td><button type="button" className="button primary" onClick={() => decide(d.id, 'APPROVE')}>Approve</button>{' '}
                  <button type="button" className="button" onClick={() => decide(d.id, 'REJECT')}>Reject</button></td></tr>))}</tbody></table>
        ) : <p>Nothing waiting.</p>}
        {data.deletions.length > pending.length && (
          <details><summary>Decided requests</summary>
            <table className="table"><thead><tr><th>Request</th><th>Customer</th><th>Status</th><th>Decided by</th><th>Note</th></tr></thead>
              <tbody>{data.deletions.filter(d => d.status !== 'PENDING').map(d => (
                <tr key={d.id}><td><code>{d.id}</code></td><td>{d.customer_id}</td><td><Badge status={d.status} /></td><td>{d.decided_by}</td><td>{d.decision_note}</td></tr>))}</tbody></table>
          </details>)}
      </section>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Ontology processes not approved for production</h2>
        <p>{data.processes.length} of the processes have no approval for their current content. In production a process guides Mitra only once approved.</p>
        <button type="button" className="button primary" onClick={() => go('admin-ontology')}>Review processes</button>
      </section>
    </>
  );
};

/* ---------------- Ontology ---------------- */
type OntologyList = { production: boolean; version: string; unrouted_turns_7d: number;
  processes: { id: string; name: string; domain: string; kosh_status: string; file_status: string; channels: string[]; tools: string[];
    turns_7d: number; content_hash: string; approval: { by: string; at: string; note: string } | null; earlier_version_approved: boolean }[] };
type ProcessDetail = { id: string; name: string; model_view: string; note: string; tables: string[]; services: string[]; care: string[]; activities: string[] };
const KOSH_STATUS: Record<string, 'success' | 'warning' | 'neutral'> = { implemented: 'success', partial: 'warning', not_implemented: 'neutral' };

const OntologyTab: React.FC = () => {
  const [data, load, error] = useData<OntologyList>('/api/admin/ontology');
  const [open, setOpen] = useState<ProcessDetail | null>(null);
  if (!data) return <Loading error={error} />;
  const show = (id: string) => get<ProcessDetail>(`/api/admin/ontology/${encodeURIComponent(id)}`).then(setOpen);
  const approve = (id: string) => { const note = askNote(`Approve ${id} for Mitra in production, for its current content?`); if (note) act(() => post(`/api/admin/ontology/${id}/approve`, { note }), load); };
  return (
    <>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Business ontology</h2>
        <p>Always on · ontology version <code>{data.version}</code>{data.production ? ' · production: only approved processes guide Mitra' : ' · not production: every process may guide Mitra'} · {data.unrouted_turns_7d} turns in 7 days matched no process.</p>
        <div className="table-scroll"><table className="table">
          <thead><tr><th>Domain</th><th>Process</th><th>In Kosh</th><th>Channels</th><th>Tools</th><th>Turns (7d)</th><th>Approval</th><th /></tr></thead>
          <tbody>{data.processes.map(p => (
            <tr key={p.id}>
              <td>{p.domain}</td><td><b>{p.name}</b><br /><small><code>{p.id}</code></small></td>
              <td><Badge variant={KOSH_STATUS[p.kosh_status]}>{p.kosh_status.replace('_', ' ')}</Badge></td>
              <td>{p.channels.join(', ')}</td><td>{p.tools.length}</td><td>{p.turns_7d}</td>
              <td>{p.approval ? <>{p.approval.by}<br /><small>{when(p.approval.at)}</small></>
                : p.earlier_version_approved ? <span style={{ color: '#b45309' }}>Changed since approval</span> : 'Not approved'}</td>
              <td><button type="button" className="button" onClick={() => show(p.id)}>Review</button></td>
            </tr>))}</tbody></table></div>
      </section>
      {open && (
        <section className="panel" aria-label={`Process ${open.name}`}>
          <h2 style={{ marginTop: 0 }}>{open.name} <small><code>{open.id}</code></small></h2>
          <p><b>Mitra's part in Kosh:</b> {open.note || 'Not available in Kosh chat.'}</p>
          <p><b>Activities:</b> {open.activities.join(', ') || '—'}<br /><b>Services:</b> {open.services.join(', ') || '—'} · <b>Care intents:</b> {open.care.join(', ') || '—'}<br />
            <b>Tables (server only, never sent to the model):</b> {open.tables.join(', ') || '—'}</p>
          <h3>Exactly what the model reads when this process is selected</h3>
          <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto', background: 'rgba(127, 127, 127, 0.12)', color: 'inherit', borderRadius: 8, padding: 12, fontSize: 12 }}>{open.model_view}</pre>
          <button type="button" className="button primary" onClick={() => approve(open.id)}>Approve this content</button>{' '}
          <button type="button" className="button" onClick={() => setOpen(null)}>Close</button>
        </section>)}
    </>
  );
};

/* ---------------- Skills and tools ---------------- */
type Skills = { registry_version: string; disabled_tools: string[];
  skills: { id: string; name: string; kind: string; description: string; level: string | null; service_id: string | null; process: string | null; guide: boolean }[];
  tools: { channel: string; name: string; description: string; effect: string; risk: string; approval: string; consent: string | null; model_view: string }[] };

const SkillsTab: React.FC = () => {
  const [data, , error] = useData<Skills>('/api/admin/skills');
  const [channel, setChannel] = useState('customer');
  if (!data) return <Loading error={error} />;
  return (
    <>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Skills · {data.skills.length}</h2>
        <table className="table"><thead><tr><th>Skill</th><th>Kind</th><th>Assurance</th><th>Service</th><th>Ontology process</th><th>Guide</th></tr></thead>
          <tbody>{data.skills.map(s => (
            <tr key={s.id}><td><b>{s.name}</b><br /><small>{s.description}</small></td><td>{s.kind}</td><td>{s.level || '—'}</td>
              <td>{s.service_id || '—'}</td><td>{s.process ? <code>{s.process}</code> : 'Enquiry'}</td><td>{s.guide ? 'SKILL.md' : 'Missing'}</td></tr>))}</tbody></table>
      </section>
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Tools · registry {data.registry_version}</h2>
        <div className="filters">{['customer', 'visitor', 'officer'].map(c => (
          <button key={c} type="button" className={`filter ${channel === c ? 'active' : ''}`} onClick={() => setChannel(c)}>{c}</button>))}</div>
        <table className="table"><thead><tr><th>Tool</th><th>Effect</th><th>Risk</th><th>Approval</th><th>Consent</th><th>Model reads</th><th>Switch</th></tr></thead>
          <tbody>{data.tools.filter(t => t.channel === channel).map(t => (
            <tr key={t.name}><td><code>{t.name}</code><br /><small>{t.description}</small></td><td>{t.effect}</td><td>{t.risk}</td><td>{t.approval}</td>
              <td>{t.consent || '—'}</td><td>{t.model_view}</td><td>{data.disabled_tools.includes(t.name) ? <Badge variant="danger">Paused</Badge> : 'On'}</td></tr>))}</tbody></table>
      </section>
    </>
  );
};

/* ---------------- Data sources ---------------- */
const SOURCE_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  connected: 'success', configured: 'info', on: 'success', sandbox: 'warning', off: 'neutral', 'not configured': 'neutral', unreachable: 'danger' };

const SourcesTab: React.FC = () => {
  const [data, , error] = useData<{ sources: { name: string; kind: string; detail: string; status: string }[] }>('/api/admin/data-sources');
  if (!data) return <Loading error={error} />;
  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Connected systems</h2>
      <p>Settings only; credentials and connection strings are never shown.</p>
      <table className="table"><thead><tr><th>System</th><th>Kind</th><th>Configuration</th><th>Status</th></tr></thead>
        <tbody>{data.sources.map(s => (
          <tr key={s.name}><td><b>{s.name}</b></td><td>{s.kind}</td><td>{s.detail}</td><td><Badge variant={SOURCE_STATUS[s.status] || 'neutral'}>{s.status}</Badge></td></tr>))}</tbody></table>
    </section>
  );
};

/* ---------------- Cost and latency ---------------- */
type Summary = { turns: number; input_tokens: number; output_tokens: number; cost: number | null; latency_ms: { p50: number | null; p95: number | null } };
type Usage = { days: number; currency: string; priced_models: string[]; total: Summary;
  by_day: (Summary & { key: string })[]; by_channel: (Summary & { key: string })[]; by_process: (Summary & { key: string })[]; by_model: (Summary & { key: string })[];
  slowest: { at: string; channel: string; process: string | null; outcome: string; model: string | null; latency_ms: number }[] };

const UsageTable: React.FC<{ title: string; rows: (Summary & { key: string })[]; money: (n: number | null) => string }> = ({ title, rows, money }) => (
  <>
    <h3>{title}</h3>
    <table className="table"><thead><tr><th>{title.replace('By ', '')}</th><th>Turns</th><th>Median</th><th>p95</th><th>Input tokens</th><th>Output tokens</th><th>Estimated cost</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.key}><td>{r.key}</td><td>{r.turns}</td><td>{seconds(r.latency_ms.p50)}</td><td>{seconds(r.latency_ms.p95)}</td>
          <td>{number(r.input_tokens)}</td><td>{number(r.output_tokens)}</td><td>{money(r.cost)}</td></tr>))}</tbody></table>
  </>
);

const UsageTab: React.FC = () => {
  const [days, setDays] = useState(7);
  const [data, , error] = useData<Usage>(`/api/admin/usage?days=${days}`);
  if (!data) return <Loading error={error} />;
  const money = (n: number | null) => (n == null ? '—' : `${data.currency} ${n.toFixed(2)}`);
  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Cost and latency · last {data.days} days</h2>
      <div className="filters">{[1, 7, 30, 90].map(d => (
        <button key={d} type="button" className={`filter ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>{d === 1 ? 'Today' : `${d} days`}</button>))}</div>
      <div className="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div className="metric"><span>Turns</span><strong>{number(data.total.turns)}</strong></div>
        <div className="metric"><span>Reply time median / p95</span><strong>{seconds(data.total.latency_ms.p50)} / {seconds(data.total.latency_ms.p95)}</strong></div>
        <div className="metric"><span>Tokens in / out</span><strong>{number(data.total.input_tokens)} / {number(data.total.output_tokens)}</strong></div>
        <div className="metric"><span>Estimated cost</span><strong>{money(data.total.cost)}</strong></div>
      </div>
      {!data.priced_models.length && <p style={{ color: '#b45309' }}>No model prices are set, so no cost is shown. Add them to <code>config/pricing.json</code> (reviewed like code).</p>}
      <p><small>Mitra's customer and visitor turns. Not included: the officer copilot, the process classifier, speech and OCR calls. Cost is tokens × the rates in config/pricing.json, an estimate, not your bill.</small></p>
      <UsageTable title="By day" rows={data.by_day} money={money} />
      <UsageTable title="By channel" rows={data.by_channel} money={money} />
      <UsageTable title="By process" rows={data.by_process} money={money} />
      <UsageTable title="By model" rows={data.by_model} money={money} />
      <h3>Slowest turns</h3>
      <table className="table"><thead><tr><th>When</th><th>Channel</th><th>Process</th><th>Outcome</th><th>Model</th><th>Time</th></tr></thead>
        <tbody>{data.slowest.map((s, i) => (
          <tr key={i}><td>{when(s.at)}</td><td>{s.channel}</td><td>{s.process || '—'}</td><td>{s.outcome}</td><td>{s.model || '—'}</td><td>{seconds(s.latency_ms)}</td></tr>))}</tbody></table>
    </section>
  );
};

/* ---------------- Mitra quality ---------------- */
type Quality = { days: number; turns: number; outcomes: Record<string, number>; channels: Record<string, number>; languages: Record<string, number>;
  fallback_rate: number; guarded_rate: number; error_rate: number; fallback_reasons: Record<string, number>; care_intents: Record<string, number>;
  latency_ms: { median: number; p90: number }; feedback: { up: number; down: number; recent_negative: { at: string; channel: string; comment: string | null; reply: string }[] };
  prompt_version: string | null; owner: string;
  registry: { id: string; version: string; model: string; active: boolean; approval: { by: string; at: string; note: string } | null;
    evaluations: { at: string; passed: number; total: number; pass_rate: number }[] }[] };
const pairs = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ') || '—';

const QualityTab: React.FC = () => {
  const [q, , error] = useData<Quality>('/api/admin/quality?days=7');
  if (!q) return <Loading error={error} />;
  return (
    <section className="panel" aria-label="Mitra quality">
      <h2 style={{ marginTop: 0 }}>Mitra quality · last {q.days} days</h2>
      <div className="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div className="metric"><span>Turns</span><strong>{q.turns}</strong></div>
        <div className="metric"><span>Withheld replies</span><strong>{q.fallback_rate}%</strong></div>
        <div className="metric"><span>Jailbreak / probe refusals</span><strong>{q.guarded_rate}%</strong></div>
        <div className="metric"><span>Errors</span><strong>{q.error_rate}%</strong></div>
        <div className="metric"><span>Feedback</span><strong>👍 {q.feedback.up} · 👎 {q.feedback.down}</strong></div>
      </div>
      <p><b>Outcomes:</b> {pairs(q.outcomes)}<br /><b>Why replies were withheld:</b> {pairs(q.fallback_reasons)}<br />
        <b>Care:</b> {pairs(q.care_intents)}<br /><b>Channels:</b> {pairs(q.channels)} · <b>Languages:</b> {pairs(q.languages)}</p>
      <h3>Recent 👎 feedback</h3>
      {q.feedback.recent_negative.length ? (
        <table className="table"><thead><tr><th>When</th><th>Channel</th><th>Comment</th><th>Mitra said (masked)</th></tr></thead>
          <tbody>{q.feedback.recent_negative.map((f, i) => (
            <tr key={i}><td>{when(f.at)}</td><td>{f.channel}</td><td>{f.comment || '—'}</td><td style={{ maxWidth: 480 }}>{f.reply}</td></tr>))}</tbody></table>
      ) : <p>No negative feedback.</p>}
      <h3>Prompt versions · owner: {q.owner}</h3>
      <table className="table"><thead><tr><th>Version</th><th>Model</th><th>Status</th><th>Evaluation</th><th>Approval</th></tr></thead>
        <tbody>{q.registry.map(r => {
          const ev = r.evaluations?.[r.evaluations.length - 1];
          return (
            <tr key={r.id}><td><code>{r.version}</code>{r.version === q.prompt_version ? ' (running)' : ''}</td><td>{r.model}</td><td>{r.active ? 'Active' : 'Retired'}</td>
              <td>{ev ? `${ev.passed}/${ev.total} (${ev.pass_rate}%) · ${new Date(ev.at).toLocaleDateString()}` : 'Not evaluated'}</td>
              <td>{r.approval ? `${r.approval.by} · ${new Date(r.approval.at).toLocaleDateString()}${r.approval.note ? ` · ${r.approval.note}` : ''}` : 'Not approved (see Approvals)'}</td></tr>);
        })}</tbody></table>
    </section>
  );
};

/* ---------------- Kill switches ---------------- */
type Controls = { disabled_channels: string[]; disabled_tools: string[]; reason?: string; updated_by?: string; updated_at?: string; channels: string[]; tools: string[] };

const ControlsTab: React.FC = () => {
  const [data, load, error] = useData<Controls>('/api/admin/controls');
  const [draft, setDraft] = useState<{ channels: string[]; tools: string[] } | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => { if (data) setDraft({ channels: data.disabled_channels, tools: data.disabled_tools }); }, [data]);
  if (!data || !draft) return <Loading error={error} />;
  const toggle = (list: 'channels' | 'tools', name: string) =>
    setDraft({ ...draft, [list]: draft[list].includes(name) ? draft[list].filter(n => n !== name) : [...draft[list], name] });
  const save = () => act(() => put('/api/admin/controls', { disabled_channels: draft.channels, disabled_tools: draft.tools, reason }), () => { setReason(''); load(); });
  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Kill switches</h2>
      <p>Pause Mitra on a channel, or block single tools, at once. A paused channel answers with a fixed message; the fraud safety script still runs. Last change: {data.updated_by || '—'} · {when(data.updated_at)}{data.reason ? ` · ${data.reason}` : ''}</p>
      <h3>Pause Mitra on</h3>
      {data.channels.map(c => (
        <label key={c} style={{ marginRight: 16 }}><input type="checkbox" checked={draft.channels.includes(c)} onChange={() => toggle('channels', c)} /> {c}</label>))}
      <h3>Block tools</h3>
      <div style={{ columns: 3 }}>{data.tools.map(t => (
        <label key={t} style={{ display: 'block' }}><input type="checkbox" checked={draft.tools.includes(t)} onChange={() => toggle('tools', t)} /> <code>{t}</code></label>))}</div>
      <p><input className="input" style={{ width: '60%' }} placeholder="Reason (required, recorded in the audit trail)" value={reason} onChange={e => setReason(e.target.value)} />{' '}
        <button type="button" className="button primary" disabled={reason.trim().length < 5} onClick={save}>Save switches</button></p>
    </section>
  );
};

/* ---------------- Audit chain ---------------- */
const AuditTab: React.FC = () => {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const verify = () => { setBusy(true); get('/api/admin/audit/verify').then(setResult).finally(() => setBusy(false)); };
  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Audit chain</h2>
      <p>Re-checks every hash-linked audit record. A broken link means a record was changed or removed.</p>
      <button type="button" className="button primary" disabled={busy} onClick={verify}>{busy ? 'Checking…' : 'Verify now'}</button>
      {result && <p style={{ marginTop: 12 }}>{result.valid ? <Badge variant="success">Intact</Badge> : <Badge variant="danger">Broken</Badge>}{' '}
        {Object.entries(result).filter(([k]) => k !== 'valid').map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</p>}
    </section>
  );
};

export const AdminPage: React.FC<{ tab: string; onNavigate: (route: string) => void }> = ({ tab, onNavigate }) => {
  const title = ADMIN_NAV.flatMap(([, items]) => items).find(i => i.id === tab)?.title || 'Admin';
  return (
    <>
      <header className="page-heading"><div><h1>{title}</h1><p>Governs Mitra and the platform. Bank officers do not see this panel.</p></div></header>
      {tab === 'admin-approvals' && <ApprovalsTab go={onNavigate} />}
      {tab === 'admin-ontology' && <OntologyTab />}
      {tab === 'admin-skills' && <SkillsTab />}
      {tab === 'admin-sources' && <SourcesTab />}
      {tab === 'admin-usage' && <UsageTab />}
      {tab === 'admin-quality' && <QualityTab />}
      {tab === 'admin-controls' && <ControlsTab />}
      {tab === 'admin-audit' && <AuditTab />}
    </>
  );
};
