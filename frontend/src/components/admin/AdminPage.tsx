import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { get, post, put } from '../../services/api';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { SkeletonRows } from '../common/Skeleton';
import { ApprovalSeal } from '../common/ApprovalSeal';
import { useToast } from '../common/Toast';
import { AnimatePresence, motion, DUR, EASE } from '../common/Animate';
import { formatDate, formatDateTime, humanizeCode } from '../common/Formatters';
import { ADMIN_NAV } from '../layout/Sidebar';
import { Attention, Bar, Empty, Kpi, Paged, Panel, Tag, rowMotion, channelName, domainName, processName, words, seconds, count, errorText } from '../officer/StaffKit';

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
  : <section className="panel"><SkeletonRows rows={4} /></section>;

const Head: React.FC<{ tab: string; sub: ReactNode; actions?: ReactNode }> = ({ tab, sub, actions }) => (
  <PageHeader title={ADMIN_NAV.flatMap(([, items]) => items).find(i => i.id === tab)?.title || 'Admin'}
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

type Ask = { title: string; subtitle?: string; body?: ReactNode; confirm: string; danger?: boolean; placeholder?: string; run: (note: string) => Promise<unknown>;
  saved: string };
/** A recorded decision closes the dialog, the row folds away and a toast confirms it. No undo: decisions are audited. */
const AskDialog: React.FC<{ ask: Ask | null; close: () => void; done: () => void }> = ({ ask, close, done }) => {
  const toast = useToast();
  return ask && (
    <Modal isOpen onClose={close} title={ask.title} subtitle={ask.subtitle}>
      {ask.body}
      <NoteForm confirm={ask.confirm} danger={ask.danger} placeholder={ask.placeholder} onCancel={close} run={ask.run}
        done={() => { close(); done(); toast({ message: ask.saved }); }} />
    </Modal>
  );
};

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
    run: note => post(`/api/admin/ai-registry/${v.id}/approve`, { note }), saved: `Prompt version ${v.version} approved`,
  });
  const decide = (d: Approvals['deletions'][number], decision: 'APPROVE' | 'REJECT') => setAsk(decision === 'APPROVE' ? {
    title: `Approve deletion of ${d.customer_id}`, subtitle: `Asked by ${d.requested_by} · ${when(d.created_at)}`, danger: true,
    body: <div className="k-note warn st-dialog-text"><Icon name="alert" /><div><strong>The customer loses access at once.</strong> Removed: login, sessions, chats and contact details. Kept, as the bank must: accounts, transactions, KYC, service requests, consents and the audit trail.</div></div>,
    confirm: 'Approve deletion', placeholder: 'e.g. Checked the reason with the officer; the customer asked in writing.',
    run: note => post(`/api/admin/deletions/${d.id}/decision`, { decision, note }), saved: `Deletion of ${d.customer_id} approved`,
  } : {
    title: `Reject deletion of ${d.customer_id}`, subtitle: `Asked by ${d.requested_by}`,
    body: <p className="st-dialog-text">The customer keeps their access. The officer sees your note.</p>,
    confirm: 'Reject request', placeholder: 'e.g. The reason does not match a request from the customer.',
    run: note => post(`/api/admin/deletions/${d.id}/decision`, { decision, note }), saved: `Deletion of ${d.customer_id} rejected`,
  });

  return (
    <>
      {head}
      <Attention tone={waiting || blocked ? 'warn' : 'ok'}
        title={waiting ? `${plural(waiting, 'decision')} waiting for you` : blocked ? 'Nothing is ready to approve yet' : 'Nothing waits for your decision'}>
        {[ready.length && plural(ready.length, 'prompt version') + ' ready to approve',
          pending.length && plural(pending.length, 'customer deletion') + ' to decide',
          blocked && `${plural(blocked, 'version')} blocked by the release gate: see the reasons in the table below`].filter(Boolean).join(' · ') || 'New requests appear here.'}
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
                  ? <><Tag tone="danger">Blocked</Tag><ul className="st-reasons" id={`gate-${v.id}`}>{v.gate.map(g => <li key={g}>{plain(g)}</li>)}</ul></>
                  : <Tag tone="success">Passes</Tag>}</td>
                <td data-label="Backup model">{!v.backup ? <span className="muted">None</span> : <>
                  {v.backup.model} <Tag tone={v.backup.gate.length ? 'warning' : 'success'}>{v.backup.gate.length ? 'Not cleared' : 'Cleared'}</Tag>
                  <span className="st-sub">{v.backup.gate.length
                    ? `Never answers customers: ${v.backup.gate.map(plain).join('; ')}`
                    : `Takes over when the main model is overloaded (${v.backup.evaluation?.passed}/${v.backup.evaluation?.total} passed)`}</span></>}</td>
                <td className="st-act"><div className="row-actions">{v.gate.length
                  ? <button type="button" className="k-btn outline sm" disabled aria-describedby={`gate-${v.id}`} title="Blocked by the release gate. The reasons are listed in the Release gate column.">Approve…</button>
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

      <Panel title="Banking processes without approval" count={data.processes.length}
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

type Step = { n: string; name: string; text: string };
/** "How the bank runs it", read from the model view itself ("1. Name: what happens. Approval: …"), so the flow shows what the model reads. */
const flowSteps = (view: string): Step[] => {
  const lines = view.split('\n');
  const from = lines.indexOf('How the bank runs it:'), to = lines.indexOf('Exceptions:');
  return from < 0 ? [] : lines.slice(from + 1, to > from ? to : undefined).flatMap(line => {
    const m = /^(\d+)\. ([^:]+): (.+)$/.exec(line);
    return m ? [{ n: m[1], name: m[2], text: m[3] }] : [];
  });
};

/** The process as connected steps that draw in once. Each step is a button that opens its details (one at a time). */
const Flow: React.FC<{ steps: Step[] }> = ({ steps }) => {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <motion.div className="st-flow-wrap" initial="hidden" whileInView="shown" viewport={{ once: true }}>
      <motion.span className="st-flow-line" aria-hidden="true"
        variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: { duration: 0.25 + steps.length * 0.06, ease: EASE } } }} />
      <ol className="st-flow" aria-label="Process steps">{steps.map((s, i) => {
        const [what, approval] = s.text.split(' Approval: ');
        return (
          <motion.li key={s.n} variants={{ hidden: { opacity: 0, x: -6 }, shown: { opacity: 1, x: 0, transition: { duration: DUR.base, ease: EASE, delay: i * 0.06 } } }}>
            <button type="button" className="st-flow-node" aria-expanded={open === i} aria-controls={`${id}-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
              <span className="st-flow-n" aria-hidden="true">{s.n}</span>
              <span className="st-flow-name"><span className="sr-only">Step {s.n}: </span>{s.name}</span>
              {approval && <Tag tone="warning">Needs approval</Tag>}
            </button>
            {open === i && <motion.div id={`${id}-${i}`} className="st-flow-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p>{what}</p>{approval && <p><strong>Approval: </strong>{approval}</p>}
            </motion.div>}
          </motion.li>);
      })}</ol>
    </motion.div>
  );
};

const ProcessDialog: React.FC<{ p: Process; close: () => void; done: () => void }> = ({ p, close, done }) => {
  const toast = useToast();
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { get<ProcessDetail>(`/api/admin/ontology/${encodeURIComponent(p.id)}`).then(setDetail).catch(e => setError(errorText(e, 'Could not load'))); }, [p.id]);
  const steps = detail ? flowSteps(detail.model_view) : [];
  return (
    <Modal isOpen wide onClose={close} title={p.name} subtitle={`${domainName(p.domain)} · ${p.id}`}>
      <div className="st-dialog-status"><ApprovalBadge p={p} /><Tag tone={IN_KOSH[p.kosh_status]?.[0]}>{IN_KOSH[p.kosh_status]?.[1] || humanizeCode(p.kosh_status)}</Tag>
        {p.approval && <span className="muted">by {p.approval.by} · {when(p.approval.at)}{p.approval.note ? ` · “${p.approval.note}”` : ''}</span>}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!detail ? !error && <SkeletonRows rows={3} /> : <>
        <p className="st-dialog-text"><strong>Mitra's part in Kosh: </strong>{detail.note || 'Not available in Kosh chat.'}</p>
        <dl className="st-dl">
          <div><dt>Activities</dt><dd><Chips items={detail.activities} format={a => humanizeCode(a.replace(/^act\./, ''))} /></dd></div>
          <div><dt>Services</dt><dd><Chips items={detail.services} /></dd></div>
          <div><dt>Care requests</dt><dd><Chips items={detail.care} format={humanizeCode} /></dd></div>
          <div><dt>Channels</dt><dd><Chips items={p.channels} format={channelName} /></dd></div>
          <div className="wide"><dt>Tools ({p.tools.length})</dt><dd><Chips items={p.tools} format={humanizeCode} /></dd></div>
          <div className="wide"><dt>Tables (server only, never sent to the model)</dt><dd><Chips items={detail.tables} /></dd></div>
        </dl>
        {steps.length > 0 && <><h3 className="st-h3">How the bank runs it</h3><Flow steps={steps} /></>}
        <h3 className="st-h3">Exactly what the model reads when this process is selected</h3>
        <pre className="st-pre" tabIndex={0}>{detail.model_view}</pre>
        <h3 className="st-h3">Approve this content for production</h3>
        <NoteForm confirm="Approve this content" placeholder="e.g. Read the model view; steps and guardrails match bank policy." onCancel={close}
          done={() => { close(); done(); toast({ message: `${p.name} approved for production` }); }}
          run={note => post(`/api/admin/ontology/${encodeURIComponent(p.id)}/approve`, { note })} />
      </>}
    </Modal>
  );
};

/* ---------------- Ontology Mapping, Graph, Simulator & Governance ---------------- */
type GraphNode = { id: string; label: string; type: string; domain?: string; kosh_status?: string | null; channels?: string[]; tools_count?: number };
type OntologyNode = GraphNode;
type GraphEdge = { source: string; relation: string; target: string };
type OntologyGraph = {
  focused_process: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    total_raw_edges?: number;
    processes_count?: number;
    activities_count?: number;
    tools_count?: number;
    policies_count?: number;
    implemented_count?: number;
  };
};

type SimulationResult = {
  prompt: string;
  channel: string;
  matched_process_id: string | null;
  rule_matched: string;
  rule_explanation: string;
  process_name: string | null;
  domain: string | null;
  kosh_status: string | null;
  allowed_tools: string[];
  activities: string[];
  tables: string[];
  governing_policies: string[];
  usable_in_production: boolean;
  model_view_preview: string;
};

type PolicyParameter = {
  id: string;
  name: string;
  value: any;
  unit: string;
  owner: string;
  description: string;
  enforced_in: string;
  is_set: boolean;
};

type StateMachine = {
  name: string;
  states: string[];
  initial: string;
  terminal: string[];
  transitions: Record<string, string[]>;
  description: string;
};

const OntologyMappingView: React.FC<{ processes: Process[] }> = ({ processes }) => {
  const [selectedProcess, setSelectedProcess] = useState<string>('proc.account_opening');
  const [graphData, setGraphData] = useState<OntologyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<OntologyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadGraph = () => {
    setLoading(true);
    setError(null);
    const url = selectedProcess ? `/api/admin/ontology/graph?process_id=${encodeURIComponent(selectedProcess)}` : '/api/admin/ontology/graph';
    get<OntologyGraph>(url)
      .then(d => { setGraphData(d); setError(null); })
      .catch(e => setError(errorText(e, 'Failed to load ontology graph')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGraph();
    setActiveNode(null);
  }, [selectedProcess]);

  const p = processes.find(x => x.id === selectedProcess);
  const q = searchQuery.trim().toLowerCase();

  const filterNodes = (nodes: OntologyNode[]) => {
    if (!q) return nodes;
    return nodes.filter(n => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.type.toLowerCase().includes(q));
  };

  const allTriggers = graphData?.nodes.filter(n => n.type === 'event' || n.type === 'care') || [];
  const allActivities = graphData?.nodes.filter(n => n.type === 'activity' || n.type === 'step') || [];
  const allTools = graphData?.nodes.filter(n => n.type === 'tool') || [];
  const allTables = graphData?.nodes.filter(n => n.type === 'table') || [];
  const allPolicies = graphData?.nodes.filter(n => n.type === 'policy') || [];

  const triggers = filterNodes(allTriggers);
  const activities = filterNodes(allActivities);
  const tools = filterNodes(allTools);
  const tables = filterNodes(allTables);
  const policies = filterNodes(allPolicies);

  const relatedEdges = useMemo(() => {
    if (!activeNode || !graphData) return [];
    return graphData.edges.filter(e => e.source === activeNode.id || e.target === activeNode.id);
  }, [activeNode, graphData]);

  return (
    <div className="ont-mapping-view">
      {/* Educational Guide Banner */}
      <div className="ont-info-banner">
        <div className="ont-info-header">
          <div className="ont-info-icon"><Icon name="book" /></div>
          <div className="ont-info-text">
            <strong>How Mitra uses banking processes:</strong>
            <p>
              This map shows the rules Mitra follows. Mitra reads it to know which banking process applies to a customer's question, which tools it may call, which data it may read, and which RBI and bank policies apply.
            </p>
          </div>
        </div>
        <div className="ont-legend-chips">
          <span className="ont-legend-chip trigger"><span className="ont-legend-dot" /> 1. What the customer asks</span>
          <span className="ont-legend-chip core"><span className="ont-legend-dot" /> 2. The process</span>
          <span className="ont-legend-chip activity"><span className="ont-legend-dot" /> 3. Steps</span>
          <span className="ont-legend-chip tool"><span className="ont-legend-dot" /> 4. Tools and data</span>
          <span className="ont-legend-chip guardrail"><span className="ont-legend-dot" /> 5. Policies</span>
        </div>
      </div>

      <div className="ont-selector-bar">
        <label htmlFor="ont-process-picker"><strong>Focus Business Process:</strong></label>
        <select id="ont-process-picker" value={selectedProcess} onChange={e => setSelectedProcess(e.target.value)}>
          {processes.map(pr => (
            <option key={pr.id} value={pr.id}>{pr.name} ({pr.id})</option>
          ))}
        </select>
        {p && <Tag tone={IN_KOSH[p.kosh_status]?.[0]}>{IN_KOSH[p.kosh_status]?.[1] || humanizeCode(p.kosh_status)}</Tag>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search nodes in graph…"
            className="form-input"
            style={{ minWidth: '220px', padding: '6px 12px', fontSize: '13px' }}
          />
          <button type="button" className="k-btn outline sm" onClick={loadGraph} title="Reload graph">
            <Icon name="timer" /> Refresh
          </button>
        </div>
      </div>

      {graphData && (
        <div className="st-kpis">
          <Kpi label="Steps and rules" value={graphData.stats.total_nodes} caption="In this process" />
          <Kpi label="Links between them" value={graphData.stats.total_edges} caption="How steps and rules connect" />
          <Kpi label="Tools Mitra can use" value={allTools.length} caption={`${allTools.length} authorized tools`} />
          <Kpi label="Policies that apply" value={allPolicies.length} caption="Limits Mitra must respect" />
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <Attention
          tone="danger"
          title="Could not load ontology graph"
          actions={<button type="button" className="k-btn outline sm" onClick={loadGraph}>Try again</button>}
        >
          {error}
        </Attention>
      ) : (
        <>
          {/* Active Node Inspector Card */}
          {activeNode && (
            <div className="ont-inspector-box">
              <div className="ont-inspector-head">
                <div>
                  <span className="ont-inspector-title">{activeNode.label}</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <code>{activeNode.id}</code>
                    <Tag tone="info">{activeNode.type.toUpperCase()}</Tag>
                  </div>
                </div>
                <button type="button" className="k-btn outline sm" onClick={() => setActiveNode(null)}>Close Inspector</button>
              </div>
              {relatedEdges.length > 0 ? (
                <div>
                  <strong style={{ fontSize: '12.5px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                    Connected Graph Relationships ({relatedEdges.length}):
                  </strong>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {relatedEdges.map((re, idx) => (
                      <span key={idx} className="ont-edge-tag">
                        {re.source === activeNode.id ? `➔ ${re.relation} ➔ ${re.target}` : `⬅ ${re.relation} ⬅ ${re.source}`}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <small className="muted">Directly connected to root process hub.</small>
              )}
            </div>
          )}

          <div className="ont-swimlanes">
            {/* Lane 1: Triggers & Entry */}
            <div className="ont-lane">
              <div className="ont-lane-title">
                <span>1. What the customer asks</span>
                <Tag tone="neutral">{triggers.length}</Tag>
              </div>
              {triggers.length ? triggers.map(t => (
                <div
                  key={t.id}
                  className={`ont-node-card ${activeNode?.id === t.id ? 'selected' : ''}`}
                  onClick={() => setActiveNode(t)}
                  title="Click to inspect this trigger"
                >
                  <div className="ont-node-head">
                    <span className="ont-node-title">{t.label}</span>
                    <Tag tone="info">Trigger</Tag>
                  </div>
                  <span className="ont-node-sub">{t.id}</span>
                </div>
              )) : (
                <div className="ont-node-card">
                  <span className="ont-node-title">Direct Intent Routing</span>
                  <span className="ont-node-sub">Customer chat message</span>
                </div>
              )}
            </div>

            {/* Lane 2: Process Core */}
            <div className="ont-lane">
              <div className="ont-lane-title">
                <span>2. The process</span>
                <Tag tone="success">Core</Tag>
              </div>
              {p && (
                <div
                  className={`ont-node-card ${activeNode?.id === p.id ? 'selected' : ''}`}
                  style={{ borderColor: 'var(--accent)' }}
                  onClick={() => setActiveNode({ id: p.id, label: p.name, type: 'process' })}
                  title="Click to inspect process hub"
                >
                  <div className="ont-node-head">
                    <span className="ont-node-title">{p.name}</span>
                    <ApprovalBadge p={p} />
                  </div>
                  <span className="ont-node-sub">{p.id}</span>
                  <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', margin: '4px 0' }}>Domain: {domainName(p.domain)}</p>
                  <span className="ont-edge-tag">Channels: {p.channels.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Lane 3: Activities & Steps */}
            <div className="ont-lane">
              <div className="ont-lane-title">
                <span>3. Steps</span>
                <Tag tone="neutral">{activities.length}</Tag>
              </div>
              {activities.length ? activities.slice(0, 10).map(a => (
                <div
                  key={a.id}
                  className={`ont-node-card ${activeNode?.id === a.id ? 'selected' : ''}`}
                  onClick={() => setActiveNode(a)}
                  title="Click to inspect this activity"
                >
                  <div className="ont-node-head">
                    <span className="ont-node-title">{a.label}</span>
                    <Tag tone="neutral">{a.type}</Tag>
                  </div>
                  <span className="ont-node-sub">{a.id}</span>
                </div>
              )) : <span className="muted" style={{ padding: '8px' }}>No separate activities</span>}
            </div>

            {/* Lane 4: Executable Tools & Tables */}
            <div className="ont-lane">
              <div className="ont-lane-title">
                <span>4. Tools and data</span>
                <Tag tone="warning">{tools.length + tables.length}</Tag>
              </div>
              {tools.map(tl => (
                <div
                  key={tl.id}
                  className={`ont-node-card ${activeNode?.id === tl.id ? 'selected' : ''}`}
                  onClick={() => setActiveNode(tl)}
                  title="Click to inspect this tool"
                >
                  <div className="ont-node-head">
                    <span className="ont-node-title">{tl.label}</span>
                    <Tag tone="warning">Tool</Tag>
                  </div>
                  <span className="ont-node-sub">{tl.id}</span>
                </div>
              ))}
              {tables.map(tb => (
                <div
                  key={tb.id}
                  className={`ont-node-card ${activeNode?.id === tb.id ? 'selected' : ''}`}
                  onClick={() => setActiveNode(tb)}
                  title="Click to inspect this database table"
                >
                  <div className="ont-node-head">
                    <span className="ont-node-title">{tb.label}</span>
                    <Tag tone="info">DB Table</Tag>
                  </div>
                  <span className="ont-node-sub">{tb.id}</span>
                </div>
              ))}
            </div>

            {/* Lane 5: Governing Policies */}
            <div className="ont-lane">
              <div className="ont-lane-title">
                <span>5. Policies</span>
                <Tag tone="danger">{policies.length}</Tag>
              </div>
              {policies.map(po => (
                <div
                  key={po.id}
                  className={`ont-node-card ${activeNode?.id === po.id ? 'selected' : ''}`}
                  onClick={() => setActiveNode(po)}
                  title="Click to inspect this guardrail policy"
                >
                  <div className="ont-node-head">
                    <span className="ont-node-title">{po.label}</span>
                    <Tag tone="danger">Guardrail</Tag>
                  </div>
                  <span className="ont-node-sub">{po.id}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Semantic Triples Table */}
          {graphData && graphData.edges.length > 0 && (
            <Panel title="Semantic Triples & Edge Relationships" count={graphData.edges.length}
              sub="Formal RDF/Graph edge mappings connecting this process to activities, tools, tables and policies.">
              <div className="table-scroll"><table className="table st-cards">
                <thead><tr><th>Subject (Source)</th><th>Predicate (Relation)</th><th>Object (Target)</th></tr></thead>
                <tbody>{graphData.edges.slice(0, 15).map((e, idx) => (
                  <tr key={idx}>
                    <td><code>{e.source}</code></td>
                    <td><Tag tone="info">{e.relation}</Tag></td>
                    <td><code>{e.target}</code></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
};

const OntologySimulatorView: React.FC = () => {
  const [prompt, setPrompt] = useState('please block my lost card');
  const [channel, setChannel] = useState('customer');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    { label: 'Lost card', text: 'please block my lost card immediately', ch: 'customer' },
    { label: 'Send UPI money', text: 'Transfer ₹5,000 to Vikram via UPI', ch: 'customer' },
    { label: 'High-value RTGS', text: 'I want to transfer ₹15,00,000 to supplier via RTGS', ch: 'customer' },
    { label: 'Apply Personal Loan', text: 'I want to apply for a personal loan of ₹3 Lakhs', ch: 'visitor' },
    { label: 'Fraud emergency', text: 'Unauthorized transaction of ₹22,000 seen on my account', ch: 'customer' },
    { label: 'Change mobile', text: 'Update my registered mobile number to 9876543210', ch: 'customer' },
    { label: 'FD interest rate', text: 'What is the senior citizen interest rate on 1 year fixed deposit?', ch: 'customer' },
    { label: 'Officer AML review', text: 'Review AML alert for transaction tx.99021 flagged suspicious', ch: 'officer' },
  ];

  const runSimulation = async (testPrompt?: string, testChannel?: string) => {
    const pText = testPrompt !== undefined ? testPrompt : prompt;
    const cVal = testChannel !== undefined ? testChannel : channel;
    setBusy(true); setError(null);
    try {
      const res = await post<SimulationResult>('/api/admin/ontology/simulate', { prompt: pText, channel: cVal });
      setResult(res);
    } catch (e: any) {
      setError(errorText(e, 'Simulation failed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="ont-sim-box">
      <div className="ont-info-banner">
        <div className="ont-info-header">
          <div className="ont-info-icon"><Icon name="sparkles" /></div>
          <div className="ont-info-text">
            <strong>Try a message:</strong>
            <p>
              Simulate any user query or officer command in real time. This shows how Mitra's intent classifier matches the query to an ontology process, which tools are granted, which security policies govern execution, and what prompt instructions are injected into the LLM context.
            </p>
          </div>
        </div>
      </div>

      <div className="ont-sim-input-wrap">
        <label htmlFor="sim-prompt-input"><strong>Customer message to try:</strong></label>
        <textarea
          id="sim-prompt-input"
          rows={2}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter what a visitor, customer, or officer says..."
          className="form-input"
          style={{ width: '100%' }}
        />

        <div className="ont-sim-presets">
          <span>Quick Banking Scenarios:</span>
          {presets.map(ps => (
            <button key={ps.label} type="button" className="ont-sim-preset-btn" onClick={() => {
              setPrompt(ps.text);
              setChannel(ps.ch);
              runSimulation(ps.text, ps.ch);
            }}>{ps.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px' }}>
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span>Channel:</span>
            <select value={channel} onChange={e => setChannel(e.target.value)} className="form-input">
              <option value="customer">Customer (Signed In)</option>
              <option value="visitor">Visitor (Public Web)</option>
              <option value="officer">Officer Copilot (Staff)</option>
            </select>
          </label>
          <button type="button" className="k-btn primary sm" disabled={busy} onClick={() => runSimulation()}>
            {busy ? 'Simulating…' : 'Simulate Route'}
          </button>
        </div>
      </div>

      {error && (
        <Attention
          tone="danger"
          title="Simulation failed"
          actions={<button type="button" className="k-btn outline sm" onClick={() => runSimulation()}>Retry</button>}
        >
          {error}
        </Attention>
      )}

      {result && (
        <div className="ont-sim-result">
          {/* Visual Step-by-Step Pipeline */}
          <div className="ont-sim-pipeline">
            <div className="ont-pipeline-step">
              <small>1. User Input</small>
              <span>{channelName(result.channel)} Channel</span>
            </div>
            <span className="ont-pipeline-arrow">➔</span>
            <div className="ont-pipeline-step">
              <small>2. Matched Process</small>
              <span>{result.process_name || 'General Guidance'}</span>
            </div>
            <span className="ont-pipeline-arrow">➔</span>
            <div className="ont-pipeline-step">
              <small>3. Decision Gate</small>
              <span>Rule: {result.rule_matched.toUpperCase()}</span>
            </div>
            <span className="ont-pipeline-arrow">➔</span>
            <div className="ont-pipeline-step">
              <small>4. Permitted Tools</small>
              <span>{result.allowed_tools.length} Authorized</span>
            </div>
          </div>

          <div className="ont-sim-header">
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                <span className="ont-sim-process">{result.process_name || 'General Guidance (No Process Matched)'}</span>
                {result.matched_process_id && <Tag tone="info">{result.matched_process_id}</Tag>}
                {result.kosh_status && <Tag tone={IN_KOSH[result.kosh_status]?.[0]}>{IN_KOSH[result.kosh_status]?.[1]}</Tag>}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Channel: <strong>{result.channel}</strong> · Domain: <strong>{domainName(result.domain || 'general')}</strong>
              </div>
            </div>
            <Tag tone="success">Rule: {result.rule_matched.toUpperCase()}</Tag>
          </div>

          <div className="ont-sim-explanation">
            <strong>Decision Rationale: </strong>{result.rule_explanation}
          </div>

          <div className="ont-sim-grid">
            <div className="ont-sim-card">
              <strong>Permitted Tools ({result.allowed_tools.length})</strong>
              <Chips items={result.allowed_tools} format={humanizeCode} />
            </div>
            <div className="ont-sim-card">
              <strong>Governing Policies ({result.governing_policies.length})</strong>
              <Chips items={result.governing_policies} format={humanizeCode} />
            </div>
            <div className="ont-sim-card">
              <strong>Database Tables ({result.tables.length})</strong>
              <Chips items={result.tables} />
            </div>
            <div className="ont-sim-card">
              <strong>Production Usability</strong>
              <div>
                <Tag tone={result.usable_in_production ? 'success' : 'warning'}>
                  {result.usable_in_production ? 'Active in Production' : 'Unapproved / Fallback Mode'}
                </Tag>
              </div>
            </div>
          </div>

          {result.model_view_preview && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--ink)' }}>
                View Injected Process Guide Preview (What the LLM receives in system prompt)
              </summary>
              <pre className="st-pre" tabIndex={0} style={{ marginTop: '8px', maxHeight: '240px' }}>
                {result.model_view_preview}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

const OntologyGovernanceView: React.FC = () => {
  const [paramsData, loadParams, pError] = useData<{ parameters: PolicyParameter[] }>('/api/admin/ontology/parameters');
  const [smData, loadSm, sError] = useData<{ state_machines: Record<string, StateMachine> }>('/api/admin/ontology/state-machines');

  const [testEntity, setTestEntity] = useState('obj.account');
  const [fromState, setFromState] = useState('OPEN');
  const [toState, setToState] = useState('FROZEN');
  const [checkResult, setCheckResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const checkTransition = () => {
    if (!smData?.state_machines) return;
    const sm = smData.state_machines[testEntity];
    if (!sm) { setCheckResult({ ok: false, msg: 'Unknown entity' }); return; }
    const allowed = sm.transitions[fromState] || [];
    if (allowed.includes(toState)) {
      setCheckResult({ ok: true, msg: `Valid transition: ${testEntity} can transition from ${fromState} to ${toState}.` });
    } else {
      setCheckResult({ ok: false, msg: `Illegal transition: ${testEntity} cannot transition from ${fromState} to ${toState}. Allowed: [${allowed.join(', ') || 'None (terminal)'}].` });
    }
  };

  return (
    <div className="ont-sm-container">
      {/* 10 Governed Policy Parameters */}
      <Panel title="Banking rules" count={paramsData?.parameters.length || 0}
        sub="The 10 formal policy parameters defined in config/ontology/policies/approval-matrix.md and bound to config/harness/policy.json.">
        {pError && <p className="form-error">{pError}</p>}
        {paramsData ? (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Owner</th><th>Enforced In</th><th>Description</th></tr></thead>
            <tbody>{paramsData.parameters.map(p => (
              <tr key={p.id}>
                <td className="st-main"><code>{p.id}</code><span className="st-sub">{p.name}</span></td>
                <td><strong>{String(p.value)}</strong></td>
                <td><Tag tone="neutral">{p.unit}</Tag></td>
                <td>{p.owner}</td>
                <td><Tag tone="info">{p.enforced_in}</Tag></td>
                <td className="st-wrap">{p.description}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <SkeletonRows rows={5} />}
      </Panel>

      {/* Entity State Machines & Transition Guardrail Sandbox */}
      <Panel title="Formal Entity State Machines" count={smData ? Object.keys(smData.state_machines).length : 0}
        sub="Strict state machines that prevent illegal entity transitions (e.g. executing payments without authorization, or reopening closed accounts).">
        {sError && <p className="form-error">{sError}</p>}
        {smData && (
          <>
            {/* Interactive Transition Test Bench */}
            <div style={{ padding: '16px', background: 'var(--surface-2)', borderRadius: 'var(--r-field)', display: 'grid', gap: '10px', marginBottom: '16px' }}>
              <strong>Symbolic Transition Validator Sandbox:</strong>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={testEntity} onChange={e => {
                  setTestEntity(e.target.value);
                  const newSm = smData.state_machines[e.target.value];
                  if (newSm) {
                    setFromState(newSm.states[0] || '');
                    setToState(newSm.states[1] || newSm.states[0] || '');
                  }
                  setCheckResult(null);
                }} className="form-input">
                  {Object.entries(smData.state_machines).map(([k, v]) => (
                    <option key={k} value={k}>{v.name} ({k})</option>
                  ))}
                </select>
                <span>From State:</span>
                <select value={fromState} onChange={e => { setFromState(e.target.value); setCheckResult(null); }} className="form-input">
                  {smData.state_machines[testEntity]?.states.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <span>To State:</span>
                <select value={toState} onChange={e => { setToState(e.target.value); setCheckResult(null); }} className="form-input">
                  {smData.state_machines[testEntity]?.states.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <button type="button" className="k-btn primary sm" onClick={checkTransition}>Check Transition</button>
              </div>
              {checkResult && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: checkResult.ok ? 'var(--ok-bg)' : 'var(--danger-bg)', color: checkResult.ok ? 'var(--ok)' : 'var(--danger)', fontWeight: 600, fontSize: '13.5px' }}>
                  {checkResult.msg}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {Object.entries(smData.state_machines).map(([id, sm]) => (
                <div key={id} className="ont-sm-card">
                  <div className="ont-sm-head">
                    <strong>{sm.name}</strong>
                    <code>{id}</code>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>{sm.description}</p>
                  <div>
                    <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>Allowed States:</div>
                    <div className="ont-sm-states">
                      {sm.states.map(s => (
                        <Tag key={s} tone={s === sm.initial ? 'info' : sm.terminal.includes(s) ? 'neutral' : 'success'}>
                          {s} {s === sm.initial ? '(Initial)' : sm.terminal.includes(s) ? '(Terminal)' : ''}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  <table className="ont-sm-transition-table">
                    <thead><tr><th>Current State</th><th>Allowed Transitions</th></tr></thead>
                    <tbody>{Object.entries(sm.transitions).map(([f, tos]) => (
                      <tr key={f}>
                        <td><strong>{f}</strong></td>
                        <td>{tos.length ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px' }}>{tos.map(t => <Tag key={t} tone="neutral">{t}</Tag>)}</span> : <span className="muted">None (Terminal)</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

const OntologyTab: React.FC = () => {
  const [data, load, error] = useData<OntologyList>('/api/admin/ontology');
  const [subView, setSubView] = useState<'processes' | 'mapping' | 'simulator' | 'governance'>('processes');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Process | null>(null);
  const head = <Head tab="admin-ontology" sub="The banking processes Mitra can follow. Review what the model reads, explore relationship mappings, and test routing." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const by = (s: string) => data.processes.filter(p => approvalState(p) === s);
  const rows = filter === 'all' ? data.processes : by(filter);
  const maxTurns = Math.max(...data.processes.map(p => p.turns_7d), 0);
  return (
    <>
      {head}
      <div className="ont-subnav">
        <button type="button" className={subView === 'processes' ? 'active' : ''} onClick={() => setSubView('processes')}>
          Processes & Approvals ({data.processes.length})
        </button>
        <button type="button" className={subView === 'mapping' ? 'active' : ''} onClick={() => setSubView('mapping')}>
          Process map
        </button>
        <button type="button" className={subView === 'simulator' ? 'active' : ''} onClick={() => setSubView('simulator')}>
          Try a message
        </button>
        <button type="button" className={subView === 'governance' ? 'active' : ''} onClick={() => setSubView('governance')}>
          Rules and statuses
        </button>
      </div>

      {subView === 'processes' && (
        <>
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
            {rows.length ? <Paged rows={rows} reset={filter}>{shown => (
              <div className="table-scroll"><table className="table st-cards st-sticky">
                <thead><tr><th>Process</th><th>In Kosh</th><th>Channels</th><th className="num">Tools</th><th className="num">Turns (7 days)</th><th>Approval</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody><AnimatePresence initial={false}>{shown.map((p, i) => (
                  <motion.tr key={p.id} {...rowMotion(i % 20)}>
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
              </table></div>)}</Paged>
            : <Empty title="No process in this view" />}
          </Panel>
          {open && <ProcessDialog p={open} close={() => setOpen(null)} done={load} />}
        </>
      )}

      {subView === 'mapping' && <OntologyMappingView processes={data.processes} />}
      {subView === 'simulator' && <OntologySimulatorView />}
      {subView === 'governance' && <OntologyGovernanceView />}
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
      <Panel title="Skills" count={data.skills.length} sub="Guided forms and chat guides. Each needs a guide that tells Mitra how to run it.">
        <div className="table-scroll"><table className="table st-cards">
          <thead><tr><th>Skill</th><th>Kind</th><th>Sign-in needed</th><th>Banking process</th><th>Guide</th></tr></thead>
          <tbody>{data.skills.map((s, i) => (
            <motion.tr key={s.id} {...rowMotion(i)}>
              <td className="st-main"><strong>{s.name}</strong><span className="st-sub">{s.description}</span></td>
              <td data-label="Kind"><Tag tone={s.kind === 'Guided form' ? 'info' : 'neutral'}>{s.kind}</Tag></td>
              <td data-label="Sign-in needed">{s.level ? <>{LEVEL[s.level] || s.level}<span className="st-sub st-nowrap">Level {s.level.replace('L', '')}{s.service_id ? ` · service ${s.service_id}` : ''}</span></> : <span className="muted">Any</span>}</td>
              <td data-label="Banking process">{s.process ? processName(s.process) : <span className="muted">Enquiry only</span>}</td>
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
        {tools.length ? <Paged rows={tools} reset={`${channel}|${q}`}>{shown => (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>Tool</th><th>Effect</th><th>Risk</th><th>Who approves</th><th>Consent needed</th><th>Model reads</th><th>Switch</th></tr></thead>
            <tbody><AnimatePresence initial={false}>{shown.map((t, i) => (
              <motion.tr key={t.channel + t.name} {...rowMotion(i % 20)}>
                <td className="st-main"><strong>{humanizeCode(t.name)}</strong><span className="st-sub">{t.description}</span></td>
                <td data-label="Effect"><EffectBadge effect={t.effect} /></td>
                <td data-label="Risk"><RiskBadge risk={t.risk} /></td>
                <td data-label="Who approves">{APPROVAL[t.approval] || humanizeCode(t.approval)}</td>
                <td data-label="Consent needed" className="st-hide-sm">{t.consent && t.consent !== 'none' ? humanizeCode(t.consent.replace(':', ' ')) : <span className="muted">None</span>}</td>
                <td data-label="Model reads" className="st-hide-sm">{t.model_view === 'public' ? 'Public facts only' : t.model_view}</td>
                <td className="st-status">{data.disabled_tools.includes(t.name) ? <Tag tone="danger">Paused</Tag> : <Tag tone="success">On</Tag>}</td>
              </motion.tr>))}</AnimatePresence></tbody>
          </table></div>)}</Paged>
        : <Empty icon="search" title="No tool matches">Try another word, or another channel.</Empty>}
      </Panel>
    </>
  );
};

/* ---------------- Data sources & Google Cloud DLP ---------------- */
const SOURCE_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  connected: 'success', configured: 'info', on: 'success', sandbox: 'warning', off: 'neutral', 'not configured': 'neutral', unreachable: 'danger' };

type DlpStatus = {
  status: string;
  service: string;
  project_id: string;
  live_api_ready: boolean;
  supported_infotypes: string[];
  custom_infotypes: string[];
  features: string[];
};

type DlpFinding = {
  info_type: string;
  likelihood: string;
  quote?: string;
  engine: string;
};

type DlpInspectResult = {
  text: string;
  deidentified: string;
  findings: DlpFinding[];
  total_findings: number;
  engine: string;
};

const DlpInspectorPanel: React.FC = () => {
  const [dlpStatus] = useData<DlpStatus>('/api/admin/dlp/status');
  const [inputText, setInputText] = useState(
    'Customer PAN ABCDE1234F requested transfer of ₹25,000 via UPI aarav@okhdfcbank to IFSC HDFC0001234. Contact mobile 9876543210 or email aarav@example.com.'
  );
  const [result, setResult] = useState<DlpInspectResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const samples = [
    {
      label: 'Identity (PAN & Aadhaar)',
      text: 'Customer PAN ABCDE1234F and Aadhaar 1234 5678 9012 verified for retail savings onboarding.',
    },
    {
      label: 'UPI & IFSC Rails',
      text: 'Send money to UPI priya@okaxis linked to IFSC SBIN0001234 with debit card 4111 1111 1111 1111.',
    },
    {
      label: 'Contacts & Account',
      text: 'Savings account 109200482112 registered to mobile 9820515974 and email aarav@example.com.',
    },
  ];

  const handleScan = async () => {
    if (!inputText.trim()) return;
    setScanning(true);
    setScanError(null);
    try {
      const res = await post<DlpInspectResult>('/api/admin/dlp/inspect', { text: inputText });
      setResult(res);
    } catch (err) {
      setScanError(errorText(err, 'DLP inspection failed'));
    } finally {
      setScanning(false);
    }
  };

  const isLive = dlpStatus?.live_api_ready;

  return (
    <Panel
      title="Sensitive Data Protection (Google Cloud DLP)"
      sub="Enterprise PII discovery, infoType classification, and reversible token vault for Indian banking rails"
      actions={
        <Tag tone={isLive ? 'success' : 'info'}>
          {isLive ? 'Live Cloud DLP API Active' : 'Dual-Engine Fallback Active'}
        </Tag>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {dlpStatus && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--k-muted)' }}>Project:</span>
            <code style={{ fontSize: '0.8125rem', padding: '0.125rem 0.375rem', background: 'var(--k-surface-alt)', borderRadius: '4px' }}>
              {dlpStatus.project_id}
            </code>
            <span style={{ fontSize: '0.8125rem', color: 'var(--k-muted)', marginLeft: '0.5rem' }}>Governed InfoTypes:</span>
            {dlpStatus.supported_infotypes.concat(dlpStatus.custom_infotypes).map((it) => (
              <Tag key={it} tone="neutral">{it}</Tag>
            ))}
          </div>
        )}

        <div className="k-field" style={{ margin: 0 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Test Text for PII Inspection &amp; Redaction</span>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {samples.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="k-btn outline sm"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                  onClick={() => setInputText(s.text)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </label>
          <textarea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type or paste text with Indian PAN, Aadhaar, Card, UPI, IFSC, or phone numbers..."
            style={{ width: '100%', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="k-btn primary sm"
            disabled={scanning || !inputText.trim()}
            onClick={handleScan}
          >
            {scanning ? 'Inspecting with Cloud DLP...' : 'Scan & De-identify Text'}
          </button>
          {scanError && <span style={{ color: 'var(--k-danger)', fontSize: '0.8125rem' }}>{scanError}</span>}
        </div>

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              padding: '1rem',
              background: 'var(--k-surface-alt)',
              borderRadius: '8px',
              border: '1px solid var(--k-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong>DLP Findings:</strong>
                <Tag tone={result.total_findings > 0 ? 'warning' : 'success'}>
                  {result.total_findings === 1 ? '1 sensitive entity' : `${result.total_findings} sensitive entities`}
                </Tag>
                <span style={{ fontSize: '0.75rem', color: 'var(--k-muted)' }}>
                  (Engine: {result.engine})
                </span>
              </div>
            </div>

            {result.findings.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {result.findings.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.25rem 0.5rem',
                      background: 'var(--k-card-bg)',
                      border: '1px solid var(--k-border)',
                      borderRadius: '4px',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <Tag tone="danger">{f.info_type}</Tag>
                    <code>{f.quote || 'entity'}</code>
                    <span style={{ fontSize: '0.7rem', color: 'var(--k-muted)' }}>{f.likelihood}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.8125rem', color: 'var(--k-muted)' }}>No sensitive PII discovered in sample text.</div>
            )}

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--k-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                De-identified / Redacted Output (Sanitized for Storage &amp; Safety Net):
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '0.75rem',
                  background: 'var(--k-card-bg)',
                  border: '1px solid var(--k-border)',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {result.deidentified}
              </pre>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--k-muted)' }}>
              Note: In live chat, Vault swaps these identifiers for reversible tokens ([PAN_1], [AADHAAR_1]) before reaching Gemini, and stored transcripts in Cloud SQL are permanently de-identified.
            </div>
          </motion.div>
        )}
      </div>
    </Panel>
  );
};

const SourcesTab: React.FC = () => {
  const [data, load, error] = useData<{ sources: { name: string; kind: string; detail: string; status: string }[] }>('/api/admin/data-sources');
  const head = <Head tab="admin-sources" sub="The systems Kosh and Mitra connect to. Settings only; credentials and connection strings are never shown." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const n = (s: string[]) => data.sources.filter(x => s.includes(x.status)).length;
  return (
    <>
      {head}
      <DlpInspectorPanel />
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
        Cost is tokens × the pricing rates (<code>config/pricing.json</code>): an estimate, not your bill.{unpriced.length > 0 && <> Add rates for {unpriced.map(m => m.key).join(', ')} there to price every turn.</>}</div></div>
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
const HOLD_MS = 1500;

/**
 * One kill switch. Pausing needs a 1.5 s press-and-hold (mouse, touch, or Space/Enter held down) so a slip never takes Mitra
 * down: a ring fills while held and letting go early cancels. Resuming is a plain click. Either way the change is a draft until Save.
 */
const SwitchRow: React.FC<{ on: boolean; label: string; name: string; flip: () => void; index?: number; children: ReactNode }> = (
  { on, label, name, flip, index, children }) => {
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const held = useRef(false);  // the click that ends a completed hold must not flip the switch back
  const keyed = useRef(false);  // Space/Enter went down here, so the click that follows is the keyboard's, not a screen reader's
  const hint = useId();
  const stop = () => { window.clearTimeout(timer.current); timer.current = 0; setHolding(false); };
  const start = () => {
    held.current = false;
    if (!on || timer.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => { timer.current = 0; held.current = true; setHolding(false); flip(); }, HOLD_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const isKey = (e: React.KeyboardEvent) => e.key === ' ' || e.key === 'Enter';
  return (
    <motion.label className={`st-switch-row ${on ? '' : 'off'}`} {...(index == null ? {} : rowMotion(index))}
      onPointerDown={e => { if (e.button === 0) start(); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={e => { if (timer.current) e.preventDefault(); }}>
      {children}
      <span className="st-hold-col">
      <span className="st-hold">
        <input type="checkbox" role="switch" className="k-switch" checked={on} aria-label={label} aria-describedby={hint} onChange={() => undefined}
          // Screen readers in browse mode send one click with no pointer and no key press; they can't hold, so that click
          // pauses too. It is still only a draft: the reason, Save and (for channels) the confirmation dialog follow.
          onClick={e => { if (!held.current && (!on || (e.detail === 0 && !keyed.current))) flip(); held.current = false; keyed.current = false; }}
          onKeyDown={e => { if (!isKey(e)) return; keyed.current = true; if (e.key === 'Enter') e.preventDefault(); if (!e.repeat) start(); }}
          onKeyUp={e => { if (!isKey(e)) return; stop(); if (e.key === 'Enter') keyed.current = false; }} onBlur={() => { stop(); keyed.current = false; }} />
        <svg className="st-hold-ring" viewBox="0 0 64 44" preserveAspectRatio="none" aria-hidden="true">
          <motion.rect x="2" y="2" width="60" height="40" rx="20" initial={false} animate={{ pathLength: holding ? 1 : 0, opacity: holding ? 1 : 0 }}
            transition={holding ? { duration: HOLD_MS / 1000, ease: 'linear' } : { duration: DUR.fast }} />
        </svg>
      </span>
      {on && <small className="st-hold-label" aria-hidden="true">Hold to pause</small>}
      </span>
      <span id={hint} className="sr-only">{on ? `Press and hold to pause ${name}: hold Space for 1.5 seconds; letting go early cancels. With a screen reader, activate it once. You confirm when you save.`
        : `Paused. Press Space to turn ${name} back on.`}</span>
    </motion.label>
  );
};

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
  const [said, setSaid] = useState('');
  const toast = useToast();
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
      toast({ message: 'Kill switches saved. They apply at once.' });
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
  const flip = (kind: 'channels' | 'tools', name: string, label: string) => {
    setDraft(d => d && { ...d, [kind]: toggle(d[kind], name) });
    if (!draft[kind].includes(name)) setSaid(`${label} set to pause. Give a reason and save to apply.`);
  };
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
        <p className="sr-only" aria-live="polite">{said}</p>
        <Panel title="Channels" sub="Press and hold a switch for 1.5 seconds to pause Mitra on that channel; a tap does nothing. Tap a paused one to resume.">
          <div className="panel-body st-switches">{data.channels.map(c => {
            const live = !draft.channels.includes(c);
            return (
              <SwitchRow key={c} on={live} label={`${channelName(c)} live`} name={channelName(c)} flip={() => flip('channels', c, channelName(c))}>
                <span><strong>{channelName(c)}</strong><small>{CHANNEL_HELP[c] || ''}</small></span>
                <Tag tone={live ? 'success' : 'danger'}>{live ? 'Live' : 'Paused'}</Tag>
              </SwitchRow>);
          })}</div>
        </Panel>

        <Panel title="Tools" count={shown.length} sub="Press and hold a switch to block a single tool on every channel. Riskiest first."
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
                <SwitchRow key={t.name} index={i} on={on} label={`${t.label} allowed`} name={t.label} flip={() => flip('tools', t.name, t.label)}>
                  <span><strong>{t.label}</strong><small>{t.description || t.name}{t.channels.length ? ` · ${t.channels.join(', ')}` : ''}</small></span>
                  <span className="st-badges"><EffectBadge effect={t.effect} /><RiskBadge risk={t.risk} />{!on && <Tag tone="danger">Blocked</Tag>}</span>
                </SwitchRow>);
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
const LINKS = 12;
const BREAK = LINKS - 4;  // where a broken chain is drawn: checked links, the bad one, then links never reached. The words give the facts.

const AuditTab: React.FC = () => {
  const reduce = useReducedMotion();
  const [result, setResult] = useState<(Verify & { at: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);  // the links finished lighting up (about 0.7 s after the real answer)
  const verify = () => {
    setBusy(true); setError(null); setResult(null); setShown(false);
    get<Verify>('/api/admin/audit/verify')
      .then(r => { setResult({ ...r, at: new Date().toISOString() }); window.setTimeout(() => setShown(true), reduce ? 0 : LINKS * 50 + 150); })
      .catch(e => setError(errorText(e, 'The check could not run'))).finally(() => setBusy(false));
  };
  const state = busy ? 'checking' : !result ? 'idle' : result.valid ? 'ok' : 'broken';
  const link = (i: number) => (state === 'ok' || (state === 'broken' && i < BREAK) ? 'good' : state === 'broken' && i === BREAK ? 'bad' : '');
  return (
    <>
      <Head tab="admin-audit" sub="Every action in Kosh is written to a hash-linked audit record. A broken link means a record was changed or removed."
        actions={<button type="button" className="k-btn primary sm" disabled={busy} onClick={verify}>
          <Icon name="shield" />{busy ? 'Checking…' : result ? 'Check again' : 'Verify now'}</button>} />
      {error && <Attention tone="danger" title="The check could not run">{error}</Attention>}
      <section className="panel st-chain-panel" aria-label="Audit chain" aria-busy={busy}>
        <div className={`st-chain ${state}`} aria-hidden="true">
          {Array.from({ length: LINKS }, (_, i) => <span key={i} className={link(i)} style={{ '--i': i } as React.CSSProperties} />)}
        </div>
        {result && shown && result.valid
          ? <ApprovalSeal title="Intact" subtitle={`Every record links to the one before it. ${count(result.verified)} records verified, ${count(result.linked_only)} by link only. Checked ${when(result.at)}.`} />
          : <p className="st-chain-caption">{busy ? 'Re-reading every record and its link…' : result && !result.valid && shown
            ? `The chain breaks at ${result.broken_at}.` : result ? 'Checking the links…'
            : 'Not checked yet. Verification re-reads every record; it takes a few seconds.'}</p>}
      </section>
      <AnimatePresence>{result && shown && (
        <motion.div key={result.at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: DUR.fast } }} className="k-page-stack">
          {!result.valid && <Attention tone="danger" title="The audit chain is broken">
            First bad record: <code>{result.broken_at}</code> ({humanizeCode(result.reason)}). {count(result.verified)} records before it were fully verified. Checked {when(result.at)}.
          </Attention>}
          <div className="st-kpis">
            <Kpi label="Records verified" value={result.verified ?? null} caption={result.valid ? 'Content and link both re-checked' : 'Before the broken link'} />
            {result.valid && <Kpi label="Checked by link only" value={result.linked_only ?? null} caption="Written before chain v2: the link is checked, the content cannot be" />}
          </div>
          {result.head && <Panel title="Latest record hash" sub="Compare it with a copy kept elsewhere to prove nothing was rewritten.">
            <div className="panel-body st-tight"><code className="st-hash">{result.head}</code></div></Panel>}
        </motion.div>)}
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
