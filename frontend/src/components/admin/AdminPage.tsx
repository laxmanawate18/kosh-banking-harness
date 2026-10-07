import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, put } from '../../services/api';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { AnimatePresence, motion, DUR, EASE } from '../common/Animate';
import { formatDate, formatDateTime, humanizeCode } from '../common/Formatters';
import { ADMIN_NAV } from '../layout/Sidebar';
import { Attention, Bar, Empty, Kpi, Panel, Tag, rowMotion, channelName, domainName, processName, words, seconds, count, errorText } from '../officer/StaffKit';

/** The Admin Panel: governs Mitra and the platform. Bank officers never see it; the admin never sees banking work. */

const when = (iso?: string | null) => (iso ? formatDateTime(iso) : '—');
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
/** Sentences from the backend may carry snake_case names: "officer_copilot is 23/24" -> "Officer copilot is 23/24". */
const plain = (s: string) => s.replace(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g, m => humanizeCode(m));

function useData<T>(url: string): [T | null, () => void, string | null] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); get<T>(url).then(setData).catch(e => setError(errorText(e, 'Could not load'))); };
  useEffect(load, [url]);
  return [data, load, error];
}

const Loading: React.FC<{ error: string | null; retry: () => void }> = ({ error, retry }) => error
  ? <Attention tone="danger" title="This page could not load" actions={<button type="button" className="k-btn outline sm" onClick={retry}>Try again</button>}>{error}</Attention>
  : <section className="panel st-loading" aria-busy="true" aria-label="Loading"><i /><i /><i /></section>;

const Head: React.FC<{ tab: string; sub: ReactNode; actions?: ReactNode }> = ({ tab, sub, actions }) => (
  <PageHeader eyebrow="AI administration" title={ADMIN_NAV.flatMap(([, items]) => items).find(i => i.id === tab)?.title || 'Admin'}
    subtitle={sub} actions={actions} />
);

/** A required note, typed in place of window.prompt. Used for every decision the admin records. */
const NoteForm: React.FC<{ confirm: string; danger?: boolean; min?: number; placeholder?: string; onCancel?: () => void; run: (note: string) => Promise<unknown>; done: () => void }> = (
  { confirm, danger, min = 5, placeholder = 'What you checked before deciding.', onCancel, run, done }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = note.trim().length < min;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (short) { setError(`Write at least ${min} characters on what you reviewed.`); return; }
    setBusy(true); setError(null);
    try { await run(note.trim()); done(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <form className="st-note-form" onSubmit={submit} noValidate>
      <label className="k-field">Note on what you reviewed
        <textarea rows={3} value={note} maxLength={500} required aria-invalid={!!error} aria-describedby="st-note-hint"
          onChange={e => setNote(e.target.value)} placeholder={placeholder} />
        <small id="st-note-hint">Required, at least {min} characters. Saved in the audit trail with your name.</small>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="k-dialog-actions">
        {onCancel && <button type="button" className="k-btn outline sm" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="submit" className={`k-btn sm ${danger ? 'danger' : 'primary'}`} disabled={busy}>{busy ? 'Saving…' : confirm}</button>
      </div>
    </form>
  );
};

type Ask = { title: string; subtitle?: string; body?: ReactNode; confirm: string; danger?: boolean; placeholder?: string; run: (note: string) => Promise<unknown> };
const AskDialog: React.FC<{ ask: Ask | null; close: () => void; done: () => void }> = ({ ask, close, done }) => ask && (
  <Modal isOpen onClose={close} title={ask.title} subtitle={ask.subtitle}>
    {ask.body}
    <NoteForm confirm={ask.confirm} danger={ask.danger} placeholder={ask.placeholder} onCancel={close} run={ask.run} done={() => { close(); done(); }} />
  </Modal>
);

/* ---------------- Approvals ---------------- */
type Evaluation = { passed: number; total: number; pass_rate: number; at: string };
type Approvals = {
  prompt_versions: { id: string; version: string; model: string; evaluation: Evaluation | null; gate: string[];
    backup: { model: string; evaluation: Omit<Evaluation, 'at'> | null; gate: string[] } | null }[];
  processes: { id: string; name: string; kosh_status: string }[];
  deletions: { id: string; customer_id: string; status: string; requested_by: string; reason: string; created_at: string;
    decided_by: string | null; decision_note: string | null }[];
};

const ApprovalsTab: React.FC<{ go: (route: string) => void }> = ({ go }) => {
  const [data, load, error] = useData<Approvals>('/api/admin/approvals');
  const [ask, setAsk] = useState<Ask | null>(null);
  const head = <Head tab="admin-approvals" sub="Changes that need a second person before they reach customers. Each decision is saved with your note." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const ready = data.prompt_versions.filter(v => !v.gate.length);
  const blocked = data.prompt_versions.length - ready.length;
  const pending = data.deletions.filter(d => d.status === 'PENDING');
  const decided = data.deletions.filter(d => d.status !== 'PENDING');
  const waiting = ready.length + pending.length;

  const approvePrompt = (v: Approvals['prompt_versions'][number]) => setAsk({
    title: `Approve prompt version ${v.version}`,
    subtitle: `${v.model}${v.evaluation ? ` · ${v.evaluation.passed}/${v.evaluation.total} checks passed` : ''}`,
    body: <p className="st-dialog-text">Approving lets this version answer customers in production. The release gate has passed on its latest evaluation.</p>,
    confirm: 'Approve version', placeholder: 'e.g. Read the evaluation report: 304/304 passed, release gate clear.',
    run: note => post(`/api/admin/ai-registry/${v.id}/approve`, { note }),
  });
  const decide = (d: Approvals['deletions'][number], decision: 'APPROVE' | 'REJECT') => setAsk(decision === 'APPROVE' ? {
    title: `Approve deletion of ${d.customer_id}`, subtitle: `Asked by ${d.requested_by} · ${when(d.created_at)}`, danger: true,
    body: <div className="k-note warn st-dialog-text"><Icon name="alert" /><div><strong>The customer loses access at once.</strong> Removed: login, sessions, chats and contact details. Kept, as the bank must: accounts, transactions, KYC, service requests, consents and the audit trail.</div></div>,
    confirm: 'Approve deletion', placeholder: 'e.g. Checked the reason with the officer; the customer asked in writing.',
    run: note => post(`/api/admin/deletions/${d.id}/decision`, { decision, note }),
  } : {
    title: `Reject deletion of ${d.customer_id}`, subtitle: `Asked by ${d.requested_by}`,
    body: <p className="st-dialog-text">The customer keeps their access. The officer sees your note.</p>,
    confirm: 'Reject request', placeholder: 'e.g. The reason does not match a request from the customer.',
    run: note => post(`/api/admin/deletions/${d.id}/decision`, { decision, note }),
  });

  return (
    <>
      {head}
      <Attention tone={waiting ? 'warn' : 'ok'}
        title={waiting ? `${plural(waiting, 'decision')} waiting for you` : 'Nothing waits for your decision'}>
        {[ready.length && plural(ready.length, 'prompt version') + ' ready to approve',
          pending.length && plural(pending.length, 'customer deletion') + ' to decide',
          blocked && `${plural(blocked, 'version')} blocked by the release gate`].filter(Boolean).join(' · ') || 'New requests appear here.'}
      </Attention>

      <Panel title="Prompt versions" count={data.prompt_versions.length}
        sub="A version answers customers in production only after it passes the release gate and you approve it.">
        {data.prompt_versions.length ? (
          <div className="table-scroll"><table className="table st-cards st-sticky">
            <thead><tr><th>Version</th><th>Latest evaluation</th><th>Release gate</th><th>Backup model</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody><AnimatePresence>{data.prompt_versions.map((v, i) => (
              <motion.tr key={v.id} {...rowMotion(i)}>
                <td className="st-main"><code>{v.version}</code><span className="st-sub">{v.model}</span></td>
                <td data-label="Latest evaluation">{v.evaluation
                  ? <><Bar value={v.evaluation.pass_rate} max={100}>{v.evaluation.passed}/{v.evaluation.total} · {v.evaluation.pass_rate}%</Bar>
                    <span className="st-sub">{when(v.evaluation.at)}</span></>
                  : <span className="muted">Not evaluated</span>}</td>
                <td className="st-status">{v.gate.length
                  ? <><Tag tone="danger">Blocked</Tag><ul className="st-reasons">{v.gate.map(g => <li key={g}>{plain(g)}</li>)}</ul></>
                  : <Tag tone="success">Passes</Tag>}</td>
                <td data-label="Backup model">{!v.backup ? <span className="muted">None</span> : <>
                  {v.backup.model} <Tag tone={v.backup.gate.length ? 'warning' : 'success'}>{v.backup.gate.length ? 'Not cleared' : 'Cleared'}</Tag>
                  <span className="st-sub">{v.backup.gate.length
                    ? `Never answers customers: ${v.backup.gate.map(plain).join('; ')}`
                    : `Takes over when the main model is overloaded (${v.backup.evaluation?.passed}/${v.backup.evaluation?.total} passed)`}</span></>}</td>
                <td className="st-act"><div className="row-actions">{v.gate.length
                  ? <span className="muted st-nowrap">Fix the gate first</span>
                  : <button type="button" className="k-btn primary sm" onClick={() => approvePrompt(v)}>Approve…</button>}</div></td>
              </motion.tr>))}</AnimatePresence></tbody>
          </table></div>
        ) : <Empty title="No prompt version is waiting">A new version appears here after its evaluation run.</Empty>}
      </Panel>

      <Panel title="Customer deletions" count={pending.length}
        sub="An officer asked; you decide. Accounts, transactions, KYC, service requests, consents and the audit trail are always kept.">
        {pending.length ? (
          <div className="table-scroll"><table className="table st-cards st-sticky">
            <thead><tr><th>Customer</th><th>Asked by</th><th>Reason</th><th>Asked on</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody><AnimatePresence>{pending.map((d, i) => (
              <motion.tr key={d.id} {...rowMotion(i)}>
                <td className="st-main"><strong>{d.customer_id}</strong><span className="st-sub">Request {d.id}</span></td>
                <td data-label="Asked by">{d.requested_by}</td>
                <td data-label="Reason" className="st-wrap">{d.reason}</td>
                <td data-label="Asked on" className="st-nowrap">{when(d.created_at)}</td>
                <td className="st-act"><div className="row-actions">
                  <button type="button" className="k-btn outline sm" onClick={() => decide(d, 'REJECT')}>Reject…</button>
                  <button type="button" className="k-btn primary sm" onClick={() => decide(d, 'APPROVE')}>Approve…</button>
                </div></td>
              </motion.tr>))}</AnimatePresence></tbody>
          </table></div>
        ) : <Empty title="No deletion is waiting">When an officer asks to remove a customer's access, it appears here.</Empty>}
        {decided.length > 0 && (
          <details className="st-details">
            <summary><Icon name="chevron-right" />Decided requests ({decided.length})</summary>
            <div className="table-scroll"><table className="table st-cards">
              <thead><tr><th>Customer</th><th>Decision</th><th>Decided by</th><th>Note</th></tr></thead>
              <tbody>{decided.map(d => (
                <tr key={d.id}><td className="st-main"><strong>{d.customer_id}</strong><span className="st-sub">Request {d.id}</span></td>
                  <td className="st-status"><Badge status={d.status} /></td><td data-label="Decided by">{d.decided_by || '—'}</td>
                  <td data-label="Note" className="st-wrap">{d.decision_note || '—'}</td></tr>))}</tbody>
            </table></div>
          </details>)}
      </Panel>

      <Panel title="Ontology processes without approval" count={data.processes.length}
        sub="In production a process guides Mitra only once its current content is approved."
        actions={<button type="button" className="k-btn outline sm" onClick={() => go('admin-ontology')}>Review processes <Icon name="arrow-right" /></button>} />

      <AskDialog ask={ask} close={() => setAsk(null)} done={load} />
    </>
  );
};

/* ---------------- Ontology ---------------- */
type Process = { id: string; name: string; domain: string; kosh_status: string; file_status: string; channels: string[]; tools: string[];
  turns_7d: number; content_hash: string; approval: { by: string; at: string; note: string } | null; earlier_version_approved: boolean };
type OntologyList = { production: boolean; version: string; unrouted_turns_7d: number; processes: Process[] };
type ProcessDetail = { id: string; name: string; model_view: string; note: string; tables: string[]; services: string[]; care: string[]; activities: string[] };
const IN_KOSH: Record<string, ['success' | 'warning' | 'neutral', string]> = {
  implemented: ['success', 'In Kosh'], partial: ['warning', 'Partly in Kosh'], not_implemented: ['neutral', 'Not in Kosh'] };
const approvalState = (p: Process) => (p.approval ? 'approved' : p.earlier_version_approved ? 'changed' : 'none');
const ApprovalBadge: React.FC<{ p: Process }> = ({ p }) => {
  const s = approvalState(p);
  return s === 'approved' ? <Tag tone="success">Approved</Tag> : s === 'changed' ? <Tag tone="warning">Changed since approval</Tag>
    : <Tag tone="neutral">Not approved</Tag>;
};
const Chips: React.FC<{ items: string[]; format?: (s: string) => string }> = ({ items, format = s => s }) =>
  items.length ? <ul className="st-chips">{items.map(i => <li key={i}>{format(i)}</li>)}</ul> : <span className="muted">None</span>;

const ProcessDialog: React.FC<{ p: Process; close: () => void; done: () => void }> = ({ p, close, done }) => {
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { get<ProcessDetail>(`/api/admin/ontology/${encodeURIComponent(p.id)}`).then(setDetail).catch(e => setError(errorText(e, 'Could not load'))); }, [p.id]);
  return (
    <Modal isOpen wide onClose={close} title={p.name} subtitle={`${domainName(p.domain)} · ${p.id}`}>
      <div className="st-dialog-status"><ApprovalBadge p={p} /><Tag tone={IN_KOSH[p.kosh_status]?.[0]}>{IN_KOSH[p.kosh_status]?.[1] || humanizeCode(p.kosh_status)}</Tag>
        {p.approval && <span className="muted">by {p.approval.by} · {when(p.approval.at)}{p.approval.note ? ` · “${p.approval.note}”` : ''}</span>}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!detail ? !error && <div className="st-loading flat" aria-busy="true"><i /><i /></div> : <>
        <p className="st-dialog-text"><strong>Mitra's part in Kosh: </strong>{detail.note || 'Not available in Kosh chat.'}</p>
        <dl className="st-dl">
          <div><dt>Activities</dt><dd><Chips items={detail.activities} format={a => humanizeCode(a.replace(/^act\./, ''))} /></dd></div>
          <div><dt>Services</dt><dd><Chips items={detail.services} /></dd></div>
          <div><dt>Care requests</dt><dd><Chips items={detail.care} format={humanizeCode} /></dd></div>
          <div><dt>Channels</dt><dd><Chips items={p.channels} format={channelName} /></dd></div>
          <div className="wide"><dt>Tools ({p.tools.length})</dt><dd><Chips items={p.tools} format={humanizeCode} /></dd></div>
          <div className="wide"><dt>Tables (server only, never sent to the model)</dt><dd><Chips items={detail.tables} /></dd></div>
        </dl>
        <h3 className="st-h3">Exactly what the model reads when this process is selected</h3>
        <pre className="st-pre" tabIndex={0}>{detail.model_view}</pre>
        <h3 className="st-h3">Approve this content for production</h3>
        <NoteForm confirm="Approve this content" placeholder="e.g. Read the model view; steps and guardrails match bank policy." onCancel={close} done={() => { close(); done(); }}
          run={note => post(`/api/admin/ontology/${encodeURIComponent(p.id)}/approve`, { note })} />
      </>}
    </Modal>
  );
};

const OntologyTab: React.FC = () => {
  const [data, load, error] = useData<OntologyList>('/api/admin/ontology');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Process | null>(null);
  const head = <Head tab="admin-ontology" sub="The banking processes Mitra can follow. Review what the model reads, then approve it for production." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const by = (s: string) => data.processes.filter(p => approvalState(p) === s);
  const rows = filter === 'all' ? data.processes : by(filter);
  const maxTurns = Math.max(...data.processes.map(p => p.turns_7d), 0);
  return (
    <>
      {head}
      <div className="st-kpis">
        <Kpi label="Processes" value={data.processes.length} caption={`${data.processes.filter(p => p.kosh_status === 'implemented').length} fully in Kosh`} />
        <Kpi label="Approved for production" value={by('approved').length} caption={`of ${data.processes.length} processes`} />
        <Kpi label="Changed since approval" value={by('changed').length} tone="warn" caption={by('changed').length ? 'Needs a fresh approval' : 'No approved process changed'} />
        <Kpi label="Turns with no process" value={data.unrouted_turns_7d} caption="Last 7 days; Mitra answered from general guidance" />
      </div>
      <Panel title="Processes" count={rows.length}
        sub={<>Ontology version <code>{data.version}</code> · {data.production
          ? 'Production: only approved processes guide Mitra.' : 'Not production: every process may guide Mitra; approvals take effect in production.'}</>}
        actions={<FilterTabs name="ontology" label="Filter processes by approval" value={filter} onChange={setFilter} tabs={[
          { id: 'all', label: 'All', count: data.processes.length }, { id: 'none', label: 'Not approved', count: by('none').length },
          { id: 'changed', label: 'Changed', count: by('changed').length }, { id: 'approved', label: 'Approved', count: by('approved').length }]} />}>
        {rows.length ? (
          <div className="table-scroll"><table className="table st-cards st-sticky">
            <thead><tr><th>Process</th><th>In Kosh</th><th>Channels</th><th className="num">Tools</th><th className="num">Turns (7 days)</th><th>Approval</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody><AnimatePresence initial={false}>{rows.map((p, i) => (
              <motion.tr key={p.id} {...rowMotion(i)}>
                <td className="st-main"><strong>{p.name}</strong><span className="st-sub">{domainName(p.domain)}</span></td>
                <td data-label="In Kosh"><Tag tone={IN_KOSH[p.kosh_status]?.[0]}>{IN_KOSH[p.kosh_status]?.[1] || humanizeCode(p.kosh_status)}</Tag></td>
                <td data-label="Channels">{p.channels.map(channelName).join(', ') || '—'}</td>
                <td data-label="Tools" className="num st-hide-sm">{p.tools.length}</td>
                <td data-label="Turns (7 days)" className="num st-hide-sm"><Bar value={p.turns_7d} max={maxTurns}>{count(p.turns_7d)}</Bar></td>
                <td className="st-status"><ApprovalBadge p={p} />{p.approval && <span className="st-sub">{p.approval.by} · {formatDate(p.approval.at)}</span>}</td>
                <td className="st-act"><div className="row-actions">
                  <button type="button" className={`k-btn sm ${approvalState(p) === 'approved' ? 'outline' : 'primary'}`} onClick={() => setOpen(p)}>Review</button>
                </div></td>
              </motion.tr>))}</AnimatePresence></tbody>
          </table></div>
        ) : <Empty title="No process in this view" />}
      </Panel>
      {open && <ProcessDialog p={open} close={() => setOpen(null)} done={load} />}
    </>
  );
};

/* ---------------- Skills and tools ---------------- */
type Tool = { channel: string; name: string; description: string; effect: string; risk: string; approval: string; consent: string | null; model_view: string };
type Skills = { registry_version: string; disabled_tools: string[];
  skills: { id: string; name: string; kind: string; description: string; level: string | null; service_id: string | null; process: string | null; guide: boolean }[];
  tools: Tool[] };
const EFFECT: Record<string, ['neutral' | 'info' | 'warning', string]> = { read: ['neutral', 'Reads'], write: ['info', 'Changes records'], money: ['warning', 'Moves money'] };
const EffectBadge: React.FC<{ effect: string }> = ({ effect }) => <Tag tone={EFFECT[effect]?.[0] || 'neutral'}>{EFFECT[effect]?.[1] || humanizeCode(effect)}</Tag>;
const RiskBadge: React.FC<{ risk: string }> = ({ risk }) => <Badge status={risk}>{`${humanizeCode(risk)} risk`}</Badge>;
const APPROVAL: Record<string, string> = { none: 'None', customer: 'Customer confirms', officer: 'Officer decides' };
const LEVEL: Record<string, string> = { L2: 'Signed in', L3: 'Signed in + verified' };

const SkillsTab: React.FC = () => {
  const [data, load, error] = useData<Skills>('/api/admin/skills');
  const [channel, setChannel] = useState('customer');
  const [query, setQuery] = useState('');
  const head = <Head tab="admin-skills" sub="What Mitra can do: guided skills for customers, and the tools each channel may call." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const q = query.trim().toLowerCase();
  const tools = data.tools.filter(t => t.channel === channel && (!q || `${t.name} ${humanizeCode(t.name)} ${t.description}`.toLowerCase().includes(q)));
  const channels = ['customer', 'visitor', 'officer'];
  return (
    <>
      {head}
      <Panel title="Skills" count={data.skills.length} sub="Guided forms and chat guides. Each needs a SKILL.md guide that tells Mitra how to run it.">
        <div className="table-scroll"><table className="table st-cards">
          <thead><tr><th>Skill</th><th>Kind</th><th>Sign-in needed</th><th>Ontology process</th><th>Guide</th></tr></thead>
          <tbody>{data.skills.map((s, i) => (
            <motion.tr key={s.id} {...rowMotion(i)}>
              <td className="st-main"><strong>{s.name}</strong><span className="st-sub">{s.description}</span></td>
              <td data-label="Kind"><Tag tone={s.kind === 'Guided form' ? 'info' : 'neutral'}>{s.kind}</Tag></td>
              <td data-label="Sign-in needed">{s.level ? <>{LEVEL[s.level] || s.level}<span className="st-sub st-nowrap">Level {s.level.replace('L', '')}{s.service_id ? ` · service ${s.service_id}` : ''}</span></> : <span className="muted">Any</span>}</td>
              <td data-label="Ontology process">{s.process ? processName(s.process) : <span className="muted">Enquiry only</span>}</td>
              <td className="st-status">{s.guide ? <Tag tone="success">Guide present</Tag> : <Tag tone="danger">Guide missing</Tag>}</td>
            </motion.tr>))}</tbody>
        </table></div>
      </Panel>
      <Panel title="Tools" count={tools.length} sub={`Registry ${data.registry_version}. Pause a tool in Kill switches.`}
        actions={<FilterTabs name="tool-channel" label="Tools by channel" value={channel} onChange={setChannel}
          tabs={channels.map(c => ({ id: c, label: channelName(c), count: data.tools.filter(t => t.channel === c).length }))} />}>
        <div className="st-toolbar">
          <label className="st-search"><Icon name="search" /><span className="sr-only">Search tools</span>
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tools by name or purpose" /></label>
        </div>
        {tools.length ? (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>Tool</th><th>Effect</th><th>Risk</th><th>Who approves</th><th>Consent needed</th><th>Model reads</th><th>Switch</th></tr></thead>
            <tbody><AnimatePresence initial={false}>{tools.map((t, i) => (
              <motion.tr key={t.channel + t.name} {...rowMotion(i)}>
                <td className="st-main"><strong>{humanizeCode(t.name)}</strong><span className="st-sub">{t.description}</span></td>
                <td data-label="Effect"><EffectBadge effect={t.effect} /></td>
                <td data-label="Risk"><RiskBadge risk={t.risk} /></td>
                <td data-label="Who approves">{APPROVAL[t.approval] || humanizeCode(t.approval)}</td>
                <td data-label="Consent needed" className="st-hide-sm">{t.consent && t.consent !== 'none' ? humanizeCode(t.consent.replace(':', ' ')) : <span className="muted">None</span>}</td>
                <td data-label="Model reads" className="st-hide-sm">{t.model_view === 'public' ? 'Public facts only' : t.model_view}</td>
                <td className="st-status">{data.disabled_tools.includes(t.name) ? <Tag tone="danger">Paused</Tag> : <Tag tone="success">On</Tag>}</td>
              </motion.tr>))}</AnimatePresence></tbody>
          </table></div>
        ) : <Empty icon="search" title="No tool matches">Try another word, or another channel.</Empty>}
      </Panel>
    </>
  );
};

/* ---------------- Data sources ---------------- */
const SOURCE_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  connected: 'success', configured: 'info', on: 'success', sandbox: 'warning', off: 'neutral', 'not configured': 'neutral', unreachable: 'danger' };

const SourcesTab: React.FC = () => {
  const [data, load, error] = useData<{ sources: { name: string; kind: string; detail: string; status: string }[] }>('/api/admin/data-sources');
  const head = <Head tab="admin-sources" sub="The systems Kosh and Mitra connect to. Settings only; credentials and connection strings are never shown." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const n = (s: string[]) => data.sources.filter(x => s.includes(x.status)).length;
  return (
    <>
      {head}
      <Panel title="Connected systems" count={data.sources.length}
        sub={`${n(['connected', 'on'])} connected · ${n(['configured'])} configured · ${n(['sandbox'])} in sandbox · ${n(['off', 'not configured'])} off${n(['unreachable']) ? ` · ${n(['unreachable'])} unreachable` : ''}`}>
        <div className="table-scroll"><table className="table st-cards">
          <thead><tr><th>System</th><th>Configuration</th><th>Status</th></tr></thead>
          <tbody>{data.sources.map((s, i) => (
            <motion.tr key={s.name} {...rowMotion(i)}>
              <td className="st-main"><strong>{s.name}</strong><span className="st-sub">{s.kind}</span></td>
              <td data-label="Configuration" className="st-wrap">{s.detail}</td>
              <td className="st-status"><Tag tone={SOURCE_STATUS[s.status] || 'neutral'}>{humanizeCode(s.status)}</Tag></td>
            </motion.tr>))}</tbody>
        </table></div>
      </Panel>
    </>
  );
};

/* ---------------- Cost and latency ---------------- */
type Summary = { turns: number; input_tokens: number; output_tokens: number; cost: number | null; latency_ms: { p50: number | null; p95: number | null } };
type Row = Summary & { key: string };
type Usage = { days: number; currency: string; priced_models: string[]; total: Summary;
  by_day: Row[]; by_channel: Row[]; by_process: Row[]; by_model: Row[];
  slowest: { at: string; channel: string; process: string | null; outcome: string; model: string | null; latency_ms: number }[] };

const UsageTable: React.FC<{ title: string; column: string; rows: Row[]; name: (k: string) => string; money: (n: number) => string }> = (
  { title, column, rows, name, money }) => {
  const max = Math.max(...rows.map(r => r.turns), 0);
  const maxLatency = Math.max(...rows.map(r => r.latency_ms.p50 || 0), 0);
  return (
    <Panel title={title} count={rows.length}>
      {rows.length ? <div className="table-scroll"><table className="table st-cards">
        <thead><tr><th>{column}</th><th className="num">Turns</th><th className="num">Median reply</th><th className="num">p95</th>
          <th className="num">Tokens in</th><th className="num">Tokens out</th><th className="num">Estimated cost</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <motion.tr key={r.key} {...rowMotion(i)}>
            <td className="st-main"><strong>{name(r.key)}</strong></td>
            <td data-label="Turns" className="num"><Bar value={r.turns} max={max}>{count(r.turns)}</Bar></td>
            <td data-label="Median reply" className="num">{r.latency_ms.p50 == null ? '—' : <Bar value={r.latency_ms.p50} max={maxLatency}>{seconds(r.latency_ms.p50)}</Bar>}</td>
            <td data-label="p95" className="num st-hide-sm">{seconds(r.latency_ms.p95)}</td>
            <td data-label="Tokens in" className="num st-hide-sm">{count(r.input_tokens)}</td>
            <td data-label="Tokens out" className="num st-hide-sm">{count(r.output_tokens)}</td>
            <td data-label="Estimated cost" className="num">{r.cost == null ? <span className="muted" title="At least one turn used a model without a price">Not priced</span> : money(r.cost)}</td>
          </motion.tr>))}</tbody>
      </table></div> : <Empty icon="clock" title="No turns in this period" />}
    </Panel>
  );
};

const UsageTab: React.FC = () => {
  const [days, setDays] = useState('7');
  const [data, load, error] = useData<Usage>(`/api/admin/usage?days=${days}`);
  const head = <Head tab="admin-usage" sub="How much Mitra is used, how fast it replies, and what it costs."
    actions={<FilterTabs name="period" label="Period" value={days} onChange={setDays}
      tabs={[['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']].map(([id, label]) => ({ id, label }))} />} />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: data.currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n: number) => fmt.format(n);
  // The backend leaves the total empty when any turn used an unpriced model; the priced models still add up.
  const unpriced = data.by_model.filter(m => m.cost == null);
  const pricedCost = data.by_model.reduce((s, m) => s + (m.cost || 0), 0);
  const cost = data.total.cost ?? (data.by_model.length > unpriced.length ? pricedCost : null);
  const unpricedTurns = unpriced.reduce((s, m) => s + m.turns, 0);
  return (
    <>
      {head}
      <div className="st-kpis">
        <Kpi label="Turns" value={data.total.turns} caption={`Last ${plural(data.days, 'day')}`} />
        <Kpi label="Median reply time" value={data.total.latency_ms.p50} format={v => `${(v / 1000).toFixed(1)}\u00a0s`}
          caption={`95% of replies within ${seconds(data.total.latency_ms.p95)}`} />
        <Kpi label="Tokens in" value={data.total.input_tokens} caption={`${count(data.total.output_tokens)} tokens out`} />
        <Kpi label="Estimated cost" value={cost} format={money} tone={unpriced.length ? 'warn' : undefined}
          caption={!data.priced_models.length ? 'No model prices are set'
            : unpriced.length ? `Priced models only. ${count(unpricedTurns)} turns on ${unpriced.map(m => m.key).join(', ')} have no price.`
            : 'Tokens × the reviewed rates'} />
      </div>
      <div className="k-note"><Icon name="info" /><div>Counts Mitra's customer and visitor turns. Not included: the officer copilot, the process classifier, speech and OCR calls.
        Cost is tokens × the rates in <code>config/pricing.json</code>: an estimate, not your bill.{unpriced.length > 0 && <> Add rates for {unpriced.map(m => m.key).join(', ')} there to price every turn.</>}</div></div>
      <UsageTable title="By day" column="Day" rows={data.by_day} name={k => formatDate(k)} money={money} />
      <UsageTable title="By channel" column="Channel" rows={data.by_channel} name={channelName} money={money} />
      <UsageTable title="By model" column="Model" rows={data.by_model} name={k => (k === 'none' ? 'No model (not answered)' : k)} money={money} />
      <UsageTable title="By process" column="Process" rows={[...data.by_process].sort((a, b) => b.turns - a.turns)} name={processName} money={money} />
      <Panel title="Slowest turns" count={data.slowest.length} sub="The ten longest waits in this period.">
        <div className="table-scroll"><table className="table st-cards">
          <thead><tr><th>When</th><th>Channel</th><th>Process</th><th>Outcome</th><th>Model</th><th className="num">Reply time</th></tr></thead>
          <tbody>{data.slowest.map((s, i) => (
            <motion.tr key={s.at + i} {...rowMotion(i)}>
              <td className="st-main st-nowrap">{when(s.at)}</td><td data-label="Channel">{channelName(s.channel)}</td>
              <td data-label="Process">{processName(s.process)}</td><td data-label="Outcome">{OUTCOME[s.outcome] || humanizeCode(s.outcome)}</td>
              <td data-label="Model">{s.model || '—'}</td><td className="num st-status"><strong>{seconds(s.latency_ms)}</strong></td>
            </motion.tr>))}</tbody>
        </table></div>
      </Panel>
    </>
  );
};

/* ---------------- Mitra quality ---------------- */
type Quality = { days: number; turns: number; outcomes: Record<string, number>; channels: Record<string, number>; languages: Record<string, number>;
  fallback_rate: number; guarded_rate: number; error_rate: number; fallback_reasons: Record<string, number>; care_intents: Record<string, number>;
  latency_ms: { median: number; p90: number }; feedback: { up: number; down: number; recent_negative: { at: string; channel: string; comment: string | null; reply: string }[] };
  prompt_version: string | null; owner: string;
  registry: { id: string; version: string; model: string; active: boolean; approval: { by: string; at: string; note: string } | null;
    evaluations: Evaluation[] }[] };
const OUTCOME: Record<string, string> = { ANSWERED: 'Answered', AUTH_PROMPT: 'Asked to sign in', CARE_FRAUD: 'Fraud safety script', ERROR: 'Failed (error)',
  FALLBACK: 'Withheld by the safety check', GUARDED: 'Refused a prompt attack' };
const CARE: Record<string, string> = { FRAUD: 'Fraud', COMPLAINT: 'Complaint', HUMAN: 'Asked for a person', DISTRESS: 'Distress', SELF_HARM: 'Self-harm risk' };
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const language = (code: string) => { try { return languageNames.of(code) || code; } catch { return code; } };
const pct = (v: number) => `${v.toFixed(1)}%`;

const BarList: React.FC<{ title: string; sub?: string; data: Record<string, number>; label: (k: string) => string }> = ({ title, sub, data, label }) => {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return (
    <Panel title={title} sub={sub}>
      {rows.length ? <ul className="st-barlist">{rows.map(([k, v], i) => (
        <motion.li key={k} {...rowMotion(i)}>
          <span>{label(k)}</span>
          <Bar value={v} max={rows[0][1]}>{count(v)} <small>{total ? `${Math.round((100 * v) / total)}%` : ''}</small></Bar>
        </motion.li>))}</ul> : <Empty title="Nothing recorded" />}
    </Panel>
  );
};

const QualityTab: React.FC = () => {
  const [q, load, error] = useData<Quality>('/api/admin/quality?days=7');
  const head = <Head tab="admin-quality" sub="How Mitra answered customers and visitors over the last 7 days, and which prompt version is running." />;
  if (!q) return <>{head}<Loading error={error} retry={load} /></>;
  return (
    <>
      {head}
      <div className="st-kpis">
        <Kpi label="Turns" value={q.turns} caption={`Median reply ${seconds(q.latency_ms.median)} · 90% within ${seconds(q.latency_ms.p90)}`} />
        <Kpi label="Withheld replies" value={q.fallback_rate} format={pct} tone={q.fallback_rate >= 10 ? 'warn' : undefined}
          caption="Held back by the safety check. Aim: under 10%." />
        <Kpi label="Refused prompt attacks" value={q.guarded_rate} format={pct}
          caption="Jailbreak and prompt-probe attempts. High means attacks, not a fault." />
        <Kpi label="Errors" value={q.error_rate} format={pct} tone="warn" caption="Model or connection failures; the customer saw a fixed message." />
      </div>
      <div className="st-grid-2">
        <BarList title="Outcomes" sub="What happened on each turn." data={q.outcomes} label={k => OUTCOME[k] || humanizeCode(k)} />
        <BarList title="Why replies were withheld or failed" data={q.fallback_reasons} label={words} />
        <BarList title="Customer care requests" sub="Turns where Mitra followed a care script." data={q.care_intents} label={k => CARE[k] || humanizeCode(k)} />
        <div className="st-stack">
          <BarList title="Channels" data={q.channels} label={channelName} />
          <BarList title="Languages" data={q.languages} label={language} />
        </div>
      </div>
      <Panel title="Customer feedback" sub={`${q.feedback.up} rated a reply helpful · ${q.feedback.down} rated a reply not helpful`}>
        {q.feedback.recent_negative.length ? (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>When</th><th>Channel</th><th>Comment</th><th>Mitra said (masked)</th></tr></thead>
            <tbody>{q.feedback.recent_negative.map((f, i) => (
              <motion.tr key={i} {...rowMotion(i)}><td className="st-main st-nowrap">{when(f.at)}</td><td data-label="Channel">{channelName(f.channel)}</td>
                <td data-label="Comment">{f.comment || <span className="muted">No comment</span>}</td><td data-label="Mitra said" className="st-wrap">{f.reply}</td></motion.tr>))}</tbody>
          </table></div>
        ) : <Empty title="No negative feedback">Replies customers rate as not helpful appear here.</Empty>}
      </Panel>
      <Panel title="Prompt versions" count={q.registry.length} sub={`Owner: ${q.owner}`}>
        <div className="table-scroll"><table className="table st-cards">
          <thead><tr><th>Version</th><th>Status</th><th>Latest evaluation</th><th>Approval</th></tr></thead>
          <tbody>{q.registry.map((r, i) => {
            const ev = r.evaluations?.[r.evaluations.length - 1];
            return (
              <motion.tr key={r.id} {...rowMotion(i)}>
                <td className="st-main"><code>{r.version}</code>{r.version === q.prompt_version && <> <Tag tone="info">Running</Tag></>}<span className="st-sub">{r.model}</span></td>
                <td className="st-status"><Tag tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Retired'}</Tag></td>
                <td data-label="Latest evaluation">{ev ? <><Bar value={ev.pass_rate} max={100}>{ev.passed}/{ev.total} · {ev.pass_rate}%</Bar><span className="st-sub">{when(ev.at)} · {plural(r.evaluations.length, 'run')}</span></>
                  : <span className="muted">Not evaluated</span>}</td>
                <td data-label="Approval">{r.approval ? <><Tag tone="success">Approved</Tag><span className="st-sub">{r.approval.by} · {formatDate(r.approval.at)}{r.approval.note ? ` · ${r.approval.note}` : ''}</span></>
                  : <><Tag tone="warning">Not approved</Tag><span className="st-sub">Decide in Approvals</span></>}</td>
              </motion.tr>);
          })}</tbody>
        </table></div>
      </Panel>
    </>
  );
};

/* ---------------- Kill switches ---------------- */
type Controls = { disabled_channels: string[]; disabled_tools: string[]; reason?: string; updated_by?: string; updated_at?: string; channels: string[]; tools: string[] };
const CHANNEL_HELP: Record<string, string> = {
  VISITOR: 'Mitra on the public website, for people who are not signed in.',
  CUSTOMER: 'Mitra in the signed-in app: balances, payments and service requests.',
  MCP: 'Other AI assistants that connect with the customer’s permission.',
  OFFICER: 'The assistant in the bank officer console.',
};
const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const toggle = (list: string[], name: string) => (list.includes(name) ? list.filter(n => n !== name) : [...list, name]);

const ControlsTab: React.FC = () => {
  const [data, load, error] = useData<Controls>('/api/admin/controls');
  const [meta] = useData<Skills>('/api/admin/skills');
  const [draft, setDraft] = useState<{ channels: string[]; tools: string[] } | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  useEffect(() => { if (data) setDraft({ channels: data.disabled_channels ?? [], tools: data.disabled_tools ?? [] }); }, [data]);

  const tools = useMemo(() => (data?.tools ?? []).map(name => {
    const entries = meta?.tools.filter(t => t.name === name) ?? [];
    const e = entries[0];
    return { name, label: humanizeCode(name), description: e?.description || '', effect: e?.effect || 'read', risk: e?.risk || 'low',
      channels: entries.map(t => channelName(t.channel)) };
  }).sort((a, b) => (RISK_ORDER[a.risk] ?? 3) - (RISK_ORDER[b.risk] ?? 3) || a.label.localeCompare(b.label)), [data, meta]);

  const head = <Head tab="admin-controls" sub="Pause Mitra on a channel, or block single tools, at once. A paused channel answers with a fixed message; the fraud safety script still runs." />;
  if (!data || !draft) return <>{head}<Loading error={error} retry={load} /></>;

  const savedCh = data.disabled_channels ?? [], savedTools = data.disabled_tools ?? [];
  const newlyPaused = draft.channels.filter(c => !savedCh.includes(c));
  const changes = [
    ...newlyPaused.map(c => `Pause ${channelName(c)}`),
    ...savedCh.filter(c => !draft.channels.includes(c)).map(c => `Resume ${channelName(c)}`),
    ...draft.tools.filter(t => !savedTools.includes(t)).map(t => `Block ${humanizeCode(t)}`),
    ...savedTools.filter(t => !draft.tools.includes(t)).map(t => `Allow ${humanizeCode(t)}`),
  ];
  const reasonShort = reason.trim().length < 5;
  const save = async () => {
    setBusy(true); setSaveError(null);
    try {
      await put('/api/admin/controls', { disabled_channels: draft.channels, disabled_tools: draft.tools, reason: reason.trim() });
      setReason(''); setTouched(false); setConfirming(false); load();
    } catch (e) { setSaveError(errorText(e)); setConfirming(false); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (reasonShort) return;
    if (newlyPaused.length) setConfirming(true); else save();
  };

  const q = query.trim().toLowerCase();
  const effects: [string, string][] = [['money', 'Moves money'], ['write', 'Changes records'], ['read', 'Reads']];
  const shown = tools.filter(t => (view === 'all' || (view === 'blocked' ? draft.tools.includes(t.name) : t.effect === view))
    && (!q || `${t.name} ${t.label} ${t.description}`.toLowerCase().includes(q)));
  const lastChange = data.updated_at ? `Last change ${when(data.updated_at)} by ${data.updated_by || 'an admin'}${data.reason ? `: “${data.reason}”` : ''}` : 'No change recorded yet.';

  return (
    <>
      {head}
      {savedCh.length || savedTools.length ? (
        <Attention tone={savedCh.length ? 'danger' : 'warn'}
          title={[savedCh.length && `${savedCh.map(channelName).join(', ')} paused`, savedTools.length && `${plural(savedTools.length, 'tool')} blocked`].filter(Boolean).join(' · ')}>
          {lastChange}
        </Attention>
      ) : <Attention tone="ok" title="All channels live · no tools blocked">{lastChange}</Attention>}

      <form onSubmit={submit} className="k-page-stack">
        <Panel title="Channels" sub="Switch off to pause Mitra on that channel.">
          <div className="panel-body st-switches">{data.channels.map(c => {
            const live = !draft.channels.includes(c);
            return (
              <label key={c} className={`st-switch-row ${live ? '' : 'off'}`}>
                <span><strong>{channelName(c)}</strong><small>{CHANNEL_HELP[c] || ''}</small></span>
                <Tag tone={live ? 'success' : 'danger'}>{live ? 'Live' : 'Paused'}</Tag>
                <input type="checkbox" role="switch" className="k-switch" checked={live} aria-label={`${channelName(c)} live`}
                  onChange={() => setDraft({ ...draft, channels: toggle(draft.channels, c) })} />
              </label>);
          })}</div>
        </Panel>

        <Panel title="Tools" count={shown.length} sub="Switch off to block a single tool on every channel. Riskiest first."
          actions={<FilterTabs name="tool-effect" label="Tools by effect" value={view} onChange={setView} tabs={[
            { id: 'all', label: 'All', count: tools.length },
            ...effects.map(([id, label]) => ({ id, label, count: tools.filter(t => t.effect === id).length })),
            { id: 'blocked', label: 'Blocked', count: draft.tools.length }]} />}>
          <div className="st-toolbar">
            <label className="st-search"><Icon name="search" /><span className="sr-only">Search tools</span>
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tools by name or purpose" /></label>
          </div>
          {shown.length ? <div className="st-switches st-tool-list">
            <AnimatePresence initial={false}>{shown.map((t, i) => {
              const on = !draft.tools.includes(t.name);
              return (
                <motion.label key={t.name} className={`st-switch-row ${on ? '' : 'off'}`} {...rowMotion(i)}>
                  <span><strong>{t.label}</strong><small>{t.description || t.name}{t.channels.length ? ` · ${t.channels.join(', ')}` : ''}</small></span>
                  <span className="st-badges"><EffectBadge effect={t.effect} /><RiskBadge risk={t.risk} />{!on && <Tag tone="danger">Blocked</Tag>}</span>
                  <input type="checkbox" role="switch" className="k-switch" checked={on} aria-label={`${t.label} allowed`}
                    onChange={() => setDraft({ ...draft, tools: toggle(draft.tools, t.name) })} />
                </motion.label>);
            })}</AnimatePresence>
          </div> : <Empty icon="search" title="No tool matches" />}
        </Panel>

        <AnimatePresence>{changes.length > 0 && (
          <motion.div className="st-savebar" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            transition={{ duration: DUR.base, ease: EASE }} role="region" aria-label="Unsaved changes">
            <div className="st-savebar-changes"><strong>{plural(changes.length, 'unsaved change')}</strong><span>{changes.join(' · ')}</span></div>
            <label className="st-savebar-reason"><span className="sr-only">Reason</span>
              <input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} onBlur={() => setTouched(true)}
                aria-invalid={touched && reasonShort} aria-describedby="st-reason-hint" placeholder="Reason (required, saved in the audit trail)" />
              <small id="st-reason-hint" className={touched && reasonShort ? 'form-error' : ''}>
                {touched && reasonShort ? 'Give a reason of at least 5 characters.' : 'Who reads it: other admins and auditors.'}</small>
            </label>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <div className="st-savebar-actions">
              <button type="button" className="k-btn outline sm" disabled={busy}
                onClick={() => { setDraft({ channels: savedCh, tools: savedTools }); setTouched(false); setSaveError(null); }}>Discard</button>
              <button type="submit" className="k-btn primary sm" disabled={busy}>{busy ? 'Saving…' : 'Save switches'}</button>
            </div>
          </motion.div>)}</AnimatePresence>
      </form>

      {confirming && (
        <Modal isOpen onClose={() => !busy && setConfirming(false)} title={`Pause ${newlyPaused.map(channelName).join(' and ')}?`}
          subtitle="This takes effect at once for everyone on that channel.">
          <div className="k-note warn st-dialog-text"><Icon name="alert" /><div>Mitra stops answering on {newlyPaused.map(channelName).join(' and ')} and shows a fixed message instead.
            The fraud safety script still runs. Resume it here at any time.</div></div>
          <p className="st-dialog-text"><strong>Reason:</strong> {reason.trim()}</p>
          <div className="k-dialog-actions">
            <button type="button" className="k-btn outline sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="k-btn danger sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Pause and save'}</button>
          </div>
        </Modal>)}
    </>
  );
};

/* ---------------- Audit chain ---------------- */
type Verify = { valid: boolean; verified?: number; linked_only?: number; head?: string; broken_at?: string; reason?: string };

const AuditTab: React.FC = () => {
  const [result, setResult] = useState<(Verify & { at: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verify = () => {
    setBusy(true); setError(null);
    get<Verify>('/api/admin/audit/verify').then(r => setResult({ ...r, at: new Date().toISOString() }))
      .catch(e => setError(errorText(e, 'The check could not run'))).finally(() => setBusy(false));
  };
  return (
    <>
      <Head tab="admin-audit" sub="Every action in Kosh is written to a hash-linked audit record. A broken link means a record was changed or removed."
        actions={<button type="button" className="k-btn primary sm" disabled={busy} onClick={verify}>
          <Icon name="shield" />{busy ? 'Checking…' : result ? 'Check again' : 'Verify now'}</button>} />
      {error && <Attention tone="danger" title="The check could not run">{error}</Attention>}
      <AnimatePresence mode="wait">{result ? (
        <motion.div key={result.at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="k-page-stack">
          <Attention tone={result.valid ? 'ok' : 'danger'} title={result.valid ? 'The audit chain is intact' : 'The audit chain is broken'}>
            {result.valid ? `Every record links to the one before it. Checked ${when(result.at)}.`
              : `First bad record: ${result.broken_at} (${humanizeCode(result.reason)}). Checked ${when(result.at)}.`}
          </Attention>
          <div className="st-kpis">
            <Kpi label="Records verified" value={result.verified ?? null} caption="Content and link both re-checked" />
            <Kpi label="Checked by link only" value={result.linked_only ?? null} caption="Written before chain v2: the link is checked, the content cannot be" />
          </div>
          {result.head && <Panel title="Latest record hash" sub="Compare it with a copy kept elsewhere to prove nothing was rewritten.">
            <div className="panel-body st-tight"><code className="st-hash">{result.head}</code></div></Panel>}
        </motion.div>
      ) : (
        <motion.section key="idle" className="panel" exit={{ opacity: 0 }}>
          <Empty icon="lock" title="Not checked yet">Verification re-reads every record. It takes a few seconds.</Empty>
        </motion.section>)}
      </AnimatePresence>
    </>
  );
};

const TABS: Record<string, React.FC<{ go: (route: string) => void }>> = {
  'admin-approvals': ApprovalsTab, 'admin-ontology': OntologyTab, 'admin-skills': SkillsTab, 'admin-sources': SourcesTab,
  'admin-usage': UsageTab, 'admin-quality': QualityTab, 'admin-controls': ControlsTab, 'admin-audit': AuditTab,
};

export const AdminPage: React.FC<{ tab: string; onNavigate: (route: string) => void }> = ({ tab, onNavigate }) => {
  const Tab = TABS[tab];
  return <div className="k-page-stack st-page">{Tab ? <Tab go={onNavigate} /> : <Head tab={tab} sub="This page does not exist." />}</div>;
};
