import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
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
type DiffEntry = {
  type: 'add' | 'del' | 'same';
  old_line: number | null;
  new_line: number | null;
  text: string;
};

type DiffSummary = {
  additions: number;
  deletions: number;
  total_changes: number;
};

type ProcessDetail = {
  id: string;
  name: string;
  domain?: string;
  status?: string;
  kosh_status?: string;
  channels?: string[];
  tools?: string[];
  services: string[];
  care: string[];
  tables: string[];
  activities: string[];
  note: string;
  model_view: string;
  raw_markdown?: string;
  approved_markdown?: string | null;
  content_hash?: string;
  is_approved?: boolean;
  diff?: DiffEntry[];
  diff_summary?: DiffSummary;
};

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

type DialogSubTab = 'overview' | 'diff' | 'editor' | 'copilot';

const ProcessDialog: React.FC<{ p: Process; close: () => void; done: () => void }> = ({ p, close, done }) => {
  const toast = useToast();
  const [subTab, setSubTab] = useState<DialogSubTab>('overview');
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editor states
  const [editorText, setEditorText] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorApproveNote, setEditorApproveNote] = useState('');
  const [showApprovePrompt, setShowApprovePrompt] = useState(false);

  // Diff states
  const [onlyChanges, setOnlyChanges] = useState(true);

  // Copilot states
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; risk?: string }>>([]);

  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const loadDetail = () => {
    get<ProcessDetail>(`/api/admin/ontology/${encodeURIComponent(p.id)}`)
      .then(d => {
        setDetail(d);
        setEditorText(d.raw_markdown || '');
        if ((d.diff_summary?.total_changes || 0) === 0) {
          setOnlyChanges(false);
        }
      })
      .catch(e => setError(errorText(e, 'Could not load process details')));
  };

  useEffect(() => { loadDetail(); }, [p.id]);

  const steps = detail ? flowSteps(detail.model_view) : [];
  const diffEntries = detail?.diff || [];
  const diffSummary = detail?.diff_summary || { additions: 0, deletions: 0, total_changes: 0 };
  const visibleDiff = onlyChanges ? diffEntries.filter(e => e.type !== 'same') : diffEntries;

  const copyModelView = async () => {
    if (!detail?.model_view) return;
    try {
      await navigator.clipboard.writeText(detail.model_view);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
      toast({ message: 'Model view prompt copied to clipboard' });
    } catch {}
  };

  const handleSaveEditor = async (approve: boolean) => {
    setEditorSaving(true);
    try {
      const res = await put<ProcessDetail>(`/api/admin/ontology/${encodeURIComponent(p.id)}`, {
        content: editorText,
        approve,
        note: approve ? (editorApproveNote.trim() || 'Reviewed and approved by admin in editor') : undefined,
      });
      setDetail(res);
      setEditorText(res.raw_markdown || editorText);
      setShowApprovePrompt(false);
      done();
      toast({
        message: approve ? `${p.name} updated and approved for production` : `${p.name} draft saved successfully`,
      });
      if (approve) setSubTab('overview');
    } catch (e: any) {
      toast({ message: errorText(e, 'Could not save process changes') });
    } finally {
      setEditorSaving(false);
    }
  };

  const askCopilot = async (messageText?: string, quickAction?: string) => {
    const textToSend = (messageText || copilotInput).trim();
    if (!textToSend && !quickAction) return;

    const userLabel = quickAction
      ? (quickAction === 'compliance_audit' ? '🛡️ Compliance Audit' : quickAction === 'risk_detection' ? '⚠️ Risk Assessment' : quickAction === 'explain_diff' ? '📝 Explain Changes' : '💡 Suggest Guardrails')
      : textToSend;

    setCopilotMessages(prev => [...prev, { role: 'user', text: userLabel }]);
    setCopilotInput('');
    setCopilotBusy(true);

    try {
      const res = await post<{ reply: string; risk_level?: string }>(`/api/admin/ontology/${encodeURIComponent(p.id)}/copilot`, {
        message: textToSend,
        quick_action: quickAction,
      });
      setCopilotMessages(prev => [...prev, { role: 'assistant', text: res.reply, risk: res.risk_level }]);
    } catch (e: any) {
      setCopilotMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Copilot encountered an error: ${errorText(e, 'Could not process review request')}` }]);
    } finally {
      setCopilotBusy(false);
    }
  };

  return (
    <Modal isOpen wide onClose={close} title={p.name} subtitle={`${domainName(p.domain)} · ${p.id}`}>
      <div className="st-dialog-status">
        <ApprovalBadge p={p} />
        <Tag tone={IN_KOSH[p.kosh_status]?.[0]}>{IN_KOSH[p.kosh_status]?.[1] || humanizeCode(p.kosh_status)}</Tag>
        {p.approval && <span className="muted">Approved by {p.approval.by} · {when(p.approval.at)}{p.approval.note ? ` · “${p.approval.note}”` : ''}</span>}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="st-dialog-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={subTab === 'overview'} className={`st-dialog-tab ${subTab === 'overview' ? 'active' : ''}`} onClick={() => setSubTab('overview')}>
          <Icon name="overview" /> Overview & Flow
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'diff'} className={`st-dialog-tab ${subTab === 'diff' ? 'active' : ''}`} onClick={() => setSubTab('diff')}>
          <Icon name="search" /> Changes & Diff
          {diffSummary.total_changes > 0 && <span className="st-tab-count changed">{diffSummary.total_changes}</span>}
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'editor'} className={`st-dialog-tab ${subTab === 'editor' ? 'active' : ''}`} onClick={() => setSubTab('editor')}>
          <Icon name="settings" /> Edit Process
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'copilot'} className={`st-dialog-tab ${subTab === 'copilot' ? 'active' : ''}`} onClick={() => setSubTab('copilot')}>
          <Icon name="ai-banker" /> Compliance Copilot
        </button>
      </div>

      {!detail ? !error && <SkeletonRows rows={4} /> : (
        <>
          {/* TAB 1: OVERVIEW & FLOW */}
          {subTab === 'overview' && (
            <div>
              <p className="st-dialog-text"><strong>Mitra's part in Kosh: </strong>{detail.note || 'Not available in Kosh chat.'}</p>
              <dl className="st-dl">
                <div><dt>Activities</dt><dd><Chips items={detail.activities} format={a => humanizeCode(a.replace(/^act\./, ''))} /></dd></div>
                <div><dt>Services</dt><dd><Chips items={detail.services} /></dd></div>
                <div><dt>Care requests</dt><dd><Chips items={detail.care} format={humanizeCode} /></dd></div>
                <div><dt>Channels</dt><dd><Chips items={p.channels} format={channelName} /></dd></div>
                <div className="wide"><dt>Tools ({p.tools.length})</dt><dd><Chips items={p.tools} format={humanizeCode} /></dd></div>
                <div className="wide"><dt>Tables (server only, never sent to the model)</dt><dd><Chips items={detail.tables} /></dd></div>
              </dl>

              {steps.length > 0 && (
                <>
                  <h3 className="st-h3">How the bank runs it</h3>
                  <Flow steps={steps} />
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
                <h3 className="st-h3" style={{ margin: 0 }}>Exactly what the model reads when this process is selected</h3>
                <button type="button" className="k-btn outline sm" onClick={copyModelView}>
                  <Icon name={copiedPrompt ? 'check' : 'copy'} /> {copiedPrompt ? 'Copied' : 'Copy Prompt'}
                </button>
              </div>
              <pre className="st-pre" tabIndex={0} style={{ marginTop: '8px' }}>{detail.model_view}</pre>

              <h3 className="st-h3">Approve this content for production</h3>
              <NoteForm confirm="Approve this content" placeholder="e.g. Read the model view; steps and guardrails match bank policy." onCancel={close}
                done={() => { close(); done(); toast({ message: `${p.name} approved for production` }); }}
                run={note => post(`/api/admin/ontology/${encodeURIComponent(p.id)}/approve`, { note })} />
            </div>
          )}

          {/* TAB 2: VISUAL DIFF VIEWER */}
          {subTab === 'diff' && (
            <div>
              <div className="st-diff-header">
                <div className="st-diff-stats">
                  <span>Line Changes:</span>
                  <span className="st-diff-add-pill">+{diffSummary.additions} added</span>
                  <span className="st-diff-del-pill">-{diffSummary.deletions} removed</span>
                </div>
                <label className="st-diff-filter-label">
                  <input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />
                  <span>Show modified lines only</span>
                </label>
              </div>

              {diffSummary.total_changes === 0 && !onlyChanges ? (
                <div className="st-diff-container" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                  ✅ Current draft matches the approved production baseline. There are no unapproved changes.
                </div>
              ) : visibleDiff.length === 0 ? (
                <div className="st-diff-container" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
                  No modified lines to display. Uncheck "Show modified lines only" to view all lines.
                </div>
              ) : (
                <div className="st-diff-container" tabIndex={0}>
                  <table className="st-diff-table">
                    <tbody>
                      {visibleDiff.map((row, idx) => (
                        <tr key={idx} className={`st-diff-row ${row.type}`}>
                          <td className="st-diff-line-old">{row.old_line || ''}</td>
                          <td className="st-diff-line-new">{row.new_line || ''}</td>
                          <td className="st-diff-sign">{row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}</td>
                          <td className="st-diff-code">{row.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="k-btn outline sm" onClick={() => setSubTab('editor')}>
                  <Icon name="settings" /> Open in Editor
                </button>
                <button type="button" className="k-btn primary sm" onClick={() => setSubTab('overview')}>
                  <Icon name="check" /> Proceed to Approve
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: IN-PLACE MARKDOWN EDITOR */}
          {subTab === 'editor' && (
            <div className="st-editor-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--muted)' }}>
                  Edit the process definition markdown. YAML frontmatter must retain <code>id: {p.id}</code>.
                </p>
                <span className="st-hash" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Active Hash: <code>{detail.content_hash || p.content_hash}</code>
                </span>
              </div>

              <textarea
                className="st-editor-textarea"
                value={editorText}
                onChange={e => setEditorText(e.target.value)}
                placeholder="---&#10;id: proc...&#10;name: ...&#10;---"
                spellCheck={false}
              />

              {showApprovePrompt ? (
                <div style={{ background: 'var(--surface-2)', padding: '14px 16px', borderRadius: 'var(--r-field)', border: '1px solid var(--line)' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13.5px', fontWeight: 600 }}>
                    Approval Justification Note:
                  </label>
                  <input
                    type="text"
                    className="st-copilot-input"
                    style={{ width: '100%', marginBottom: '10px' }}
                    value={editorApproveNote}
                    onChange={e => setEditorApproveNote(e.target.value)}
                    placeholder="e.g. Read the updated model view; steps and guardrails match bank policy."
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="k-btn outline sm" onClick={() => setShowApprovePrompt(false)} disabled={editorSaving}>
                      Cancel
                    </button>
                    <button type="button" className="k-btn primary sm" onClick={() => handleSaveEditor(true)} disabled={editorSaving || editorApproveNote.trim().length < 3}>
                      {editorSaving ? 'Saving...' : 'Confirm & Approve for Production'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="st-editor-actions">
                  <button type="button" className="k-btn outline sm" onClick={() => setEditorText(detail.raw_markdown || '')} disabled={editorSaving}>
                    Discard Changes
                  </button>
                  <button type="button" className="k-btn outline sm" onClick={() => handleSaveEditor(false)} disabled={editorSaving}>
                    {editorSaving ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button type="button" className="k-btn primary sm" onClick={() => setShowApprovePrompt(true)} disabled={editorSaving}>
                    Save & Approve
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: COMPLIANCE COPILOT */}
          {subTab === 'copilot' && (
            <div className="st-copilot-container">
              <div className="st-copilot-chips">
                <button type="button" className="st-copilot-chip" onClick={() => askCopilot(undefined, 'compliance_audit')} disabled={copilotBusy}>
                  🛡️ Audit RBI & DPDP Compliance
                </button>
                <button type="button" className="st-copilot-chip" onClick={() => askCopilot(undefined, 'risk_detection')} disabled={copilotBusy}>
                  ⚠️ Detect Security & Autonomy Risks
                </button>
                <button type="button" className="st-copilot-chip" onClick={() => askCopilot(undefined, 'explain_diff')} disabled={copilotBusy}>
                  📝 Explain Diff in Plain English
                </button>
                <button type="button" className="st-copilot-chip" onClick={() => askCopilot(undefined, 'suggest_guardrails')} disabled={copilotBusy}>
                  💡 Suggest Safer Guardrails
                </button>
              </div>

              <div className="st-copilot-chat" tabIndex={0}>
                {copilotMessages.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                    <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: 'var(--ink)' }}>AI Compliance Review Copilot</p>
                    <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                      Click one of the audit chips above or ask a specific question to evaluate regulatory adherence, autonomy ceilings, and security guardrails for <strong>{p.name}</strong>.
                    </p>
                  </div>
                ) : (
                  copilotMessages.map((msg, i) => (
                    <div key={i} className={`st-copilot-msg ${msg.role}`}>
                      {msg.role === 'user' ? (
                        <div><strong>Admin:</strong> {msg.text}</div>
                      ) : (
                        <div>
                          {msg.risk && (
                            <div style={{ marginBottom: '8px' }}>
                              <Tag tone={msg.risk === 'LOW' ? 'success' : msg.risk === 'HIGH' ? 'danger' : 'warning'}>
                                {msg.risk} RISK
                              </Tag>
                            </div>
                          )}
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {copilotBusy && (
                  <div className="st-copilot-msg assistant" style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
                    Copilot is reviewing banking regulations and analyzing process guidelines...
                  </div>
                )}
              </div>

              <form
                className="st-copilot-input-bar"
                onSubmit={e => {
                  e.preventDefault();
                  askCopilot();
                }}
              >
                <input
                  type="text"
                  className="st-copilot-input"
                  value={copilotInput}
                  onChange={e => setCopilotInput(e.target.value)}
                  placeholder="Ask Copilot anything about this process (e.g. Does Step 5 enforce four-eyes?)..."
                  disabled={copilotBusy}
                />
                <button type="submit" className="k-btn primary sm" disabled={copilotBusy || !copilotInput.trim()}>
                  Ask Copilot
                </button>
              </form>
            </div>
          )}
        </>
      )}
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
  enforced: boolean;
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
  const [hoveredNode, setHoveredNode] = useState<OntologyNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'swimlane' | 'matrix'>('graph');
  const [zoomScale, setZoomScale] = useState<number>(1);

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
    setHoveredNode(null);
  }, [selectedProcess]);

  const p = processes.find(x => x.id === selectedProcess);
  const q = searchQuery.trim().toLowerCase();

  const filterNodes = (nodes: OntologyNode[]) => {
    if (!q) return nodes;
    return nodes.filter(n => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) || n.type.toLowerCase().includes(q));
  };

  const allTriggers = useMemo(() => graphData?.nodes.filter(n => n.type === 'event' || n.type === 'care') || [], [graphData]);
  const allProcessHub = useMemo(() => graphData?.nodes.filter(n => n.type === 'process') || [], [graphData]);
  const allActivities = useMemo(() => graphData?.nodes.filter(n => n.type === 'activity' || n.type === 'step') || [], [graphData]);
  const allTools = useMemo(() => graphData?.nodes.filter(n => n.type === 'tool') || [], [graphData]);
  const allTables = useMemo(() => graphData?.nodes.filter(n => n.type === 'table') || [], [graphData]);
  const allPolicies = useMemo(() => graphData?.nodes.filter(n => n.type === 'policy') || [], [graphData]);

  const triggers = filterNodes(allTriggers);
  const activities = filterNodes(allActivities);
  const tools = filterNodes(allTools);
  const tables = filterNodes(allTables);
  const policies = filterNodes(allPolicies);

  const relatedEdges = useMemo(() => {
    if (!activeNode || !graphData) return [];
    return graphData.edges.filter(e => e.source === activeNode.id || e.target === activeNode.id);
  }, [activeNode, graphData]);

  // Color mapping helper
  const getNodeColor = (type: string) => {
    switch (type) {
      case 'event':
      case 'care': return '#3b82f6'; // Blue
      case 'process': return '#10b981'; // Emerald
      case 'activity':
      case 'step': return '#8b5cf6'; // Violet
      case 'tool': return '#f59e0b'; // Amber
      case 'table': return '#06b6d4'; // Cyan
      case 'policy': return '#ef4444'; // Rose
      default: return '#6b7280';
    }
  };

  // Structured Layout Coordinate Map for SVG Graph
  const layout = useMemo(() => {
    if (!graphData) return { nodesWithCoords: [], edgesWithCoords: [], width: 1200, height: 600 };

    const col0 = allTriggers.length > 0 ? allTriggers : [{ id: 'direct.intent', label: 'Customer Chat Intent', type: 'event' }];
    const col1 = allProcessHub.length > 0 ? allProcessHub : (p ? [{ id: p.id, label: p.name, type: 'process' }] : []);
    const col2 = allActivities;
    const col3 = [...allTools, ...allTables];
    const col4 = allPolicies;

    const colPositions = [50, 290, 530, 770, 1010];
    const nodeWidth = 195;
    const nodeHeight = 52;
    const gapY = 18;
    const startY = 40;

    const maxColLen = Math.max(col0.length, col1.length, col2.length, col3.length, col4.length, 3);
    const canvasHeight = Math.max(maxColLen * (nodeHeight + gapY) + 80, 520);
    const canvasWidth = 1260;

    const coordsMap = new Map<string, { x: number; y: number; node: OntologyNode }>();

    const placeCol = (items: OntologyNode[], colIdx: number) => {
      const x = colPositions[colIdx];
      const totalH = items.length * (nodeHeight + gapY) - gapY;
      const initialY = Math.max(startY, (canvasHeight - totalH) / 2);
      items.forEach((it, idx) => {
        const y = initialY + idx * (nodeHeight + gapY);
        coordsMap.set(it.id, { x, y, node: it });
      });
    };

    placeCol(col0, 0);
    placeCol(col1, 1);
    placeCol(col2, 2);
    placeCol(col3, 3);
    placeCol(col4, 4);

    const nodesWithCoords = Array.from(coordsMap.values());

    const edgesWithCoords = graphData.edges.map(e => {
      const s = coordsMap.get(e.source);
      const t = coordsMap.get(e.target);
      if (!s || !t) return null;

      const sx = s.x < t.x ? s.x + nodeWidth : s.x;
      const sy = s.y + nodeHeight / 2;
      const tx = s.x < t.x ? t.x : t.x + nodeWidth;
      const ty = t.y + nodeHeight / 2;

      const dx = Math.abs(tx - sx) * 0.45;
      const path = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;

      return {
        ...e,
        sx, sy, tx, ty, path
      };
    }).filter(Boolean);

    return { nodesWithCoords, edgesWithCoords, width: canvasWidth, height: canvasHeight };
  }, [graphData, allTriggers, allProcessHub, allActivities, allTools, allTables, allPolicies, p]);

  return (
    <div className="ont-mapping-view">
      {/* Educational Guide Banner */}
      <div className="ont-info-banner">
        <div className="ont-info-header">
          <div className="ont-info-icon"><Icon name="sparkles" /></div>
          <div className="ont-info-text">
            <strong>Interactive Banking Knowledge Map & Ontology Topology:</strong>
            <p>
              Visual overview of how customer questions map to Mitra's banking processes, authorized CBS tools, underlying data tables, and governing RBI compliance policies. Click any node to inspect connected relationships.
            </p>
          </div>
        </div>
        <div className="ont-legend-chips">
          <span className="ont-legend-chip trigger" style={{ borderColor: '#3b82f6' }}><span className="ont-legend-dot" style={{ background: '#3b82f6' }} /> 1. Customer Trigger</span>
          <span className="ont-legend-chip core" style={{ borderColor: '#10b981' }}><span className="ont-legend-dot" style={{ background: '#10b981' }} /> 2. Process Core</span>
          <span className="ont-legend-chip activity" style={{ borderColor: '#8b5cf6' }}><span className="ont-legend-dot" style={{ background: '#8b5cf6' }} /> 3. Lifecycle Steps</span>
          <span className="ont-legend-chip tool" style={{ borderColor: '#f59e0b' }}><span className="ont-legend-dot" style={{ background: '#f59e0b' }} /> 4. Authorized Tools</span>
          <span className="ont-legend-chip tool" style={{ borderColor: '#06b6d4' }}><span className="ont-legend-dot" style={{ background: '#06b6d4' }} /> 5. Data Tables</span>
          <span className="ont-legend-chip guardrail" style={{ borderColor: '#ef4444' }}><span className="ont-legend-dot" style={{ background: '#ef4444' }} /> 6. RBI Policies</span>
        </div>
      </div>

      {/* Control Bar: Focus Process, Search, View Mode Tabs */}
      <div className="ont-selector-bar">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="ont-process-picker"><strong>Focus Business Process:</strong></label>
          <select id="ont-process-picker" value={selectedProcess} onChange={e => setSelectedProcess(e.target.value)}>
            {processes.map(pr => (
              <option key={pr.id} value={pr.id}>{pr.name} ({pr.id})</option>
            ))}
          </select>
          {p && <Tag tone={IN_KOSH[p.kosh_status]?.[0]}>{IN_KOSH[p.kosh_status]?.[1] || humanizeCode(p.kosh_status)}</Tag>}
        </div>

        {/* View Mode Switcher */}
        <div className="ont-mode-tabs" role="tablist" aria-label="Visualizer Mode">
          <button
            type="button"
            className={`ont-mode-btn ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => setViewMode('graph')}
            title="Graphical knowledge map view"
          >
            <Icon name="sparkles" /> Knowledge Graph
          </button>
          <button
            type="button"
            className={`ont-mode-btn ${viewMode === 'swimlane' ? 'active' : ''}`}
            onClick={() => setViewMode('swimlane')}
            title="Structured column swimlane view"
          >
            <Icon name="transactions" /> Swimlane Flow
          </button>
          <button
            type="button"
            className={`ont-mode-btn ${viewMode === 'matrix' ? 'active' : ''}`}
            onClick={() => setViewMode('matrix')}
            title="Semantic relationships matrix"
          >
            <Icon name="file" /> Relationship Matrix
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search nodes & tools…"
            className="form-input"
            style={{ minWidth: '200px', padding: '6px 12px', fontSize: '13px' }}
          />
          <button type="button" className="k-btn outline sm" onClick={loadGraph} title="Reload graph">
            <Icon name="refresh" /> Refresh
          </button>
        </div>
      </div>

      {graphData && (
        <div className="st-kpis">
          <Kpi label="Steps & nodes" value={graphData.stats.total_nodes} caption="In this process graph" />
          <Kpi label="Graph connections" value={graphData.stats.total_edges} caption="Relationships mapped" />
          <Kpi label="Authorized tools" value={allTools.length} caption={`${allTools.length} callable CBS actions`} />
          <Kpi label="Governing policies" value={allPolicies.length} caption="Active safety guardrails" />
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={5} />
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
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: getNodeColor(activeNode.type),
                      display: 'inline-block'
                    }}
                  />
                  <div>
                    <span className="ont-inspector-title">{activeNode.label}</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <code>{activeNode.id}</code>
                      <Tag tone="info">{activeNode.type.toUpperCase()}</Tag>
                      {activeNode.domain && <Tag tone="neutral">{domainName(activeNode.domain)}</Tag>}
                    </div>
                  </div>
                </div>
                <button type="button" className="k-btn outline sm" onClick={() => setActiveNode(null)}>
                  Close Inspector
                </button>
              </div>

              {/* Explanatory context for non-technical users */}
              <p style={{ margin: '4px 0', fontSize: '13.5px', color: 'var(--ink-2)' }}>
                {activeNode.type === 'process' && 'Central business process hub governing workflows, tools, and regulatory policies.'}
                {(activeNode.type === 'event' || activeNode.type === 'care') && 'Customer inquiry trigger that invokes this process during conversational turns.'}
                {(activeNode.type === 'activity' || activeNode.type === 'step') && 'Lifecycle activity step executed during customer journey progression.'}
                {activeNode.type === 'tool' && 'Authorized Core Banking tool callable by Mitra subject to policy and MFA clearance.'}
                {activeNode.type === 'table' && 'Underlying CBS database table accessed or updated by this process.'}
                {activeNode.type === 'policy' && 'RBI or internal bank policy guardrail enforcing transaction thresholds and four-eyes review.'}
              </p>

              {relatedEdges.length > 0 ? (
                <div>
                  <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                    Connected Graph Links ({relatedEdges.length}):
                  </strong>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {relatedEdges.map((re, idx) => {
                      const isSource = re.source === activeNode.id;
                      const neighborId = isSource ? re.target : re.source;
                      const neighborNode = graphData?.nodes.find(n => n.id === neighborId);
                      return (
                        <button
                          key={idx}
                          type="button"
                          className="ont-edge-tag"
                          style={{ cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface-2)' }}
                          onClick={() => neighborNode && setActiveNode(neighborNode)}
                          title="Click to jump to this connected node"
                        >
                          {isSource ? `➔ ${re.relation} ➔ ${neighborNode?.label || re.target}` : `⬅ ${re.relation} ⬅ ${neighborNode?.label || re.source}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <small className="muted">Directly linked to root process hub.</small>
              )}
            </div>
          )}

          {/* VIEW MODE 1: Interactive Knowledge Graph */}
          {viewMode === 'graph' && (
            <div className="ont-graph-canvas-wrap">
              {/* Zoom & Fit Controls */}
              <div className="ont-graph-controls">
                <button
                  type="button"
                  className="ont-ctrl-btn"
                  onClick={() => setZoomScale(s => Math.max(0.65, Number((s - 0.15).toFixed(2))))}
                  title="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  className="ont-ctrl-btn"
                  onClick={() => setZoomScale(1)}
                  title="Reset zoom"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  type="button"
                  className="ont-ctrl-btn"
                  onClick={() => setZoomScale(s => Math.min(1.5, Number((s + 0.15).toFixed(2))))}
                  title="Zoom in"
                >
                  +
                </button>
                <div style={{ width: '1px', background: 'var(--line)', margin: '0 4px' }} />
                <span style={{ fontSize: '11.5px', color: 'var(--muted)', alignSelf: 'center' }}>
                  Interactive Canvas · Click any node to inspect
                </span>
              </div>

              <svg
                className="ont-graph-svg"
                width={layout.width}
                height={layout.height}
                style={{ transform: `scale(${zoomScale})` }}
              >
                <defs>
                  <marker
                    id="ont-arrow-default"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--line-strong)" />
                  </marker>
                  <marker
                    id="ont-arrow-highlight"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent)" />
                  </marker>
                </defs>

                {/* Render Directed Edges */}
                {layout.edgesWithCoords.map((edge: any, idx: number) => {
                  const isHighlighted = (activeNode && (edge.source === activeNode.id || edge.target === activeNode.id)) ||
                    (hoveredNode && (edge.source === hoveredNode.id || edge.target === hoveredNode.id));
                  const isDimmed = (activeNode || hoveredNode) && !isHighlighted;

                  return (
                    <g key={idx}>
                      <path
                        d={edge.path}
                        className={`ont-svg-edge ${isHighlighted ? 'highlighted' : ''} ${isDimmed ? 'dimmed' : ''}`}
                        markerEnd={isHighlighted ? 'url(#ont-arrow-highlight)' : 'url(#ont-arrow-default)'}
                      />
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {layout.nodesWithCoords.map(({ x, y, node }) => {
                  const isSelected = activeNode?.id === node.id;
                  const isHovered = hoveredNode?.id === node.id;
                  const isMatchSearch = !q || node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q);
                  const isDimmed = (!isMatchSearch) || ((activeNode || hoveredNode) && !isSelected && !isHovered &&
                    !relatedEdges.some(e => e.source === node.id || e.target === node.id));

                  const color = getNodeColor(node.type);

                  return (
                    <g
                      key={node.id}
                      className={`ont-svg-node ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`}
                      transform={`translate(${x}, ${y})`}
                      onClick={() => setActiveNode(node)}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <rect
                        width={195}
                        height={52}
                        rx={8}
                        fill="var(--surface)"
                        stroke={isSelected ? 'var(--accent)' : color}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                      <circle cx={18} cy={26} r={6} fill={color} />
                      <text
                        x={32}
                        y={23}
                        fill="var(--ink)"
                        fontSize="12.5"
                        fontWeight="600"
                        fontFamily="var(--k-sans)"
                      >
                        {node.label.length > 20 ? node.label.slice(0, 19) + '…' : node.label}
                      </text>
                      <text
                        x={32}
                        y={39}
                        fill="var(--muted)"
                        fontSize="10"
                        fontFamily="var(--k-mono)"
                      >
                        {node.id.length > 24 ? node.id.slice(0, 23) + '…' : node.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* VIEW MODE 2: Structured Swimlanes */}
          {viewMode === 'swimlane' && (
            <div className="ont-swimlanes">
              {/* Lane 1: Triggers & Entry */}
              <div className="ont-lane">
                <div className="ont-lane-title">
                  <span>1. Customer Triggers</span>
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
                  <span>2. Core Process</span>
                  <Tag tone="success">Core</Tag>
                </div>
                {p && (
                  <div
                    className={`ont-node-card ${activeNode?.id === p.id ? 'selected' : ''}`}
                    style={{ borderColor: 'var(--accent)' }}
                    onClick={() => setActiveNode({ id: p.id, label: p.name, type: 'process', domain: p.domain })}
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
                  <span>3. Steps & Activities</span>
                  <Tag tone="neutral">{activities.length}</Tag>
                </div>
                {activities.length ? activities.map(a => (
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
                )) : <span className="muted" style={{ padding: '8px' }}>Direct atomic execution</span>}
              </div>

              {/* Lane 4: Executable Tools & Tables */}
              <div className="ont-lane">
                <div className="ont-lane-title">
                  <span>4. Tools & Data</span>
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
                  <span>5. Guardrail Policies</span>
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
                      <Tag tone="danger">Policy</Tag>
                    </div>
                    <span className="ont-node-sub">{po.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW MODE 3: Semantic Relationship Matrix */}
          {viewMode === 'matrix' && graphData && (
            <Panel
              title="Semantic Relationship Matrix"
              count={graphData.edges.length}
              sub="Formal RDF/Graph edge mappings connecting this process to activities, tools, tables, and policies."
            >
              <div className="ont-matrix-grid">
                {graphData.edges.filter(e => !q || `${e.source} ${e.relation} ${e.target}`.toLowerCase().includes(q)).map((e, idx) => (
                  <div key={idx} className="ont-matrix-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Tag tone="info">{e.relation}</Tag>
                      <small className="muted">Edge #{idx + 1}</small>
                    </div>
                    <div className="ont-matrix-flow">
                      <span
                        className="ont-matrix-node-badge"
                        onClick={() => {
                          const n = graphData.nodes.find(x => x.id === e.source);
                          if (n) setActiveNode(n);
                        }}
                        title="Click to inspect source"
                      >
                        {e.source}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '13px' }}>➔</span>
                      <span
                        className="ont-matrix-node-badge"
                        onClick={() => {
                          const n = graphData.nodes.find(x => x.id === e.target);
                          if (n) setActiveNode(n);
                        }}
                        title="Click to inspect target"
                      >
                        {e.target}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
  const [paramsData, , pError] = useData<{ parameters: PolicyParameter[] }>('/api/admin/ontology/parameters');
  const [smData, , sError] = useData<{ state_machines: Record<string, StateMachine> }>('/api/admin/ontology/state-machines');

  const [activeEntityTab, setActiveEntityTab] = useState<string>('obj.card');
  const [fromState, setFromState] = useState<string>('ACTIVE');
  const [toState, setToState] = useState<string>('FROZEN');
  const [selectedSourceState, setSelectedSourceState] = useState<string | null>('ACTIVE');
  const [checkResult, setCheckResult] = useState<{ ok: boolean; msg: string; reason?: string } | null>(null);

  const [paramFilter, setParamFilter] = useState<string>('all');
  const [paramSearch, setParamSearch] = useState<string>('');
  const [rulesViewMode, setRulesViewMode] = useState<'cards' | 'table'>('cards');

  // When active entity tab changes, sync states
  useEffect(() => {
    if (!smData?.state_machines) return;
    const sm = smData.state_machines[activeEntityTab];
    if (sm) {
      const init = sm.initial || sm.states[0] || '';
      setSelectedSourceState(init);
      setFromState(init);
      const nextStates = sm.transitions[init] || [];
      setToState(nextStates[0] || sm.states[1] || init);
      setCheckResult(null);
    }
  }, [activeEntityTab, smData]);

  const checkTransition = (fState?: string, tState?: string) => {
    if (!smData?.state_machines) return;
    const sm = smData.state_machines[activeEntityTab];
    if (!sm) { setCheckResult({ ok: false, msg: 'Unknown entity state machine' }); return; }

    const from = fState || fromState;
    const to = tState || toState;
    const allowed = sm.transitions[from] || [];

    if (allowed.includes(to)) {
      setCheckResult({
        ok: true,
        msg: `Compliant State Transition: ${activeEntityTab} may transition from ${from} to ${to}.`,
        reason: `Allowed by formal ontology lifecycle. State transition satisfies RBI four-eyes and transaction security guardrails.`
      });
    } else {
      setCheckResult({
        ok: false,
        msg: `Illegal State Transition: ${activeEntityTab} cannot transition from ${from} to ${to}.`,
        reason: allowed.length > 0
          ? `Permitted next states from ${from} are: [${allowed.join(', ')}]. Jumping to ${to} violates core lifecycle constraints.`
          : `${from} is a Terminal State. No outbound transitions are permitted once reached.`
      });
    }
  };

  const getEntityIcon = (id: string) => {
    switch (id) {
      case 'obj.card': return 'cards';
      case 'obj.account': return 'accounts';
      case 'obj.payment_intent': return 'payments';
      case 'obj.account_application': return 'file';
      default: return 'shield';
    }
  };

  const getDomainIcon = (paramId: string) => {
    if (paramId.includes('PAYMENT') || paramId.includes('CONCESSION')) return 'payments';
    if (paramId.includes('PAYEE')) return 'shield';
    if (paramId.includes('STEP_UP')) return 'lock';
    return 'clock';
  };

  const formatParamValue = (p: PolicyParameter) => {
    if (p.id === 'PARAM_AGENT_PAYMENT_LIMIT') return '₹0';
    if (p.id === 'PARAM_CONCESSION_LIMIT') return '0 paise';
    if (p.id === 'PARAM_NEW_PAYEE_COOLING_HOURS') return '24 Hours';
    if (p.id === 'PARAM_NEW_PAYEE_LIMIT') return '₹10,000';
    if (p.id === 'PARAM_STEP_UP_MAX_FAILURES') return '3 Attempts';
    if (p.id === 'PARAM_STEP_UP_LOCK_MINUTES') return '15 Minutes';
    if (p.id === 'PARAM_CONTACT_HOURS') return '08:00 – 19:00 IST';
    if (p.id === 'PARAM_MAX_CONTACT_ATTEMPTS') return '3 Attempts';
    if (p.id === 'PARAM_APPLICATION_EXPIRY_DAYS') return '30 Days';
    if (p.id === 'PARAM_DISPUTE_TAT_DAYS') return '30 Days';
    return String(p.value ?? '—');
  };

  const activeSm = smData?.state_machines[activeEntityTab];
  const allowedNextForSelected = useMemo(() => {
    if (!activeSm || !selectedSourceState) return [];
    return activeSm.transitions[selectedSourceState] || [];
  }, [activeSm, selectedSourceState]);

  // Filtering for Policy Parameters
  const filteredParams = useMemo(() => {
    if (!paramsData?.parameters) return [];
    return paramsData.parameters.filter(p => {
      const matchSearch = !paramSearch.trim() ||
        `${p.id} ${p.name} ${p.description} ${p.owner} ${p.enforced_in}`.toLowerCase().includes(paramSearch.toLowerCase().trim());
      if (!matchSearch) return false;

      if (paramFilter === 'payments') return p.id.includes('PAYMENT') || p.id.includes('CONCESSION');
      if (paramFilter === 'fraud') return p.id.includes('PAYEE');
      if (paramFilter === 'security') return p.id.includes('STEP_UP');
      if (paramFilter === 'outreach') return p.id.includes('CONTACT') || p.id.includes('EXPIRY') || p.id.includes('DISPUTE');
      return true;
    });
  }, [paramsData, paramFilter, paramSearch]);

  return (
    <div className="ont-sm-container">
      {/* Visual State Machine Diagram & Interactive Sandbox */}
      <Panel
        title="Formal Entity State Machines"
        count={smData ? Object.keys(smData.state_machines).length : 0}
        sub="Strict lifecycle state machines that prevent unauthorized state leaps (e.g. executing payments without authorization, or reopening closed accounts)."
      >
        {sError && <p className="form-error">{sError}</p>}
        {smData && activeSm && (
          <div className="ont-sm-diagram-card">
            {/* Entity Navigation Tabs */}
            <div className="ont-sm-tabs">
              {Object.entries(smData.state_machines).map(([id, sm]) => (
                <button
                  key={id}
                  type="button"
                  className={`ont-sm-tab-btn ${activeEntityTab === id ? 'active' : ''}`}
                  onClick={() => setActiveEntityTab(id)}
                >
                  <Icon name={getEntityIcon(id)} />
                  <span>{sm.name}</span>
                  <Tag tone={activeEntityTab === id ? 'info' : 'neutral'}>{sm.states.length} states</Tag>
                </button>
              ))}
            </div>

            {/* Active Entity Info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <strong style={{ fontSize: '17px', color: 'var(--ink)' }}>{activeSm.name}</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--muted)', maxWidth: '75ch' }}>
                  {activeSm.description}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Initial:</span>
                <Tag tone="success">{activeSm.initial}</Tag>
                <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>Terminal:</span>
                {activeSm.terminal.map(t => <Tag key={t} tone="neutral">{t}</Tag>)}
              </div>
            </div>

            {/* Visual State Flow Lifecycle Diagram */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                  Interactive Lifecycle States · Click any state to highlight valid outgoing paths
                </strong>
                {selectedSourceState && (
                  <span style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                    Active Source: <strong>{selectedSourceState}</strong>
                  </span>
                )}
              </div>

              <div className="ont-sm-state-grid">
                {activeSm.states.map(state => {
                  const isSource = selectedSourceState === state;
                  const isAllowedTarget = allowedNextForSelected.includes(state);
                  const isInitial = state === activeSm.initial;
                  const isTerminal = activeSm.terminal.includes(state);

                  return (
                    <div
                      key={state}
                      className={`ont-sm-state-node ${isSource ? 'is-active-source' : ''} ${isAllowedTarget ? 'is-allowed-target' : ''} ${isTerminal ? 'is-terminal' : ''}`}
                      onClick={() => {
                        setSelectedSourceState(state);
                        setFromState(state);
                        const next = activeSm.transitions[state] || [];
                        if (next.length > 0) {
                          setToState(next[0]);
                          checkTransition(state, next[0]);
                        } else {
                          checkTransition(state, state);
                        }
                      }}
                      title={isTerminal ? 'Terminal state (no outbound transitions)' : `Click to inspect transitions from ${state}`}
                    >
                      {isInitial && <Tag tone="info">START</Tag>}
                      <span>{state}</span>
                      {isTerminal && <Tag tone="neutral">END</Tag>}
                      {isAllowedTarget && <span style={{ color: 'var(--ok)', fontSize: '12px', fontWeight: 700 }}>✓ Next</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Transition Path Context Banner */}
            {selectedSourceState && (
              <div style={{ padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r-field)', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Permitted transitions from </span>
                  <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{selectedSourceState}:</strong>
                  <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', marginLeft: '8px' }}>
                    {allowedNextForSelected.length > 0 ? (
                      allowedNextForSelected.map(t => (
                        <button
                          key={t}
                          type="button"
                          className="ont-edge-tag"
                          style={{ cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--surface)' }}
                          onClick={() => {
                            setToState(t);
                            checkTransition(selectedSourceState, t);
                          }}
                          title={`Test transition to ${t}`}
                        >
                          ➔ {t}
                        </button>
                      ))
                    ) : (
                      <Tag tone="neutral">None (Terminal State)</Tag>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Quick Presets:</span>
                  {activeEntityTab === 'obj.card' && (
                    <>
                      <button type="button" className="ont-sim-preset-btn" onClick={() => { setFromState('ACTIVE'); setToState('FROZEN'); checkTransition('ACTIVE', 'FROZEN'); }}>
                        Normal Freeze
                      </button>
                      <button type="button" className="ont-sim-preset-btn" onClick={() => { setFromState('CANCELLED'); setToState('ACTIVE'); checkTransition('CANCELLED', 'ACTIVE'); }}>
                        Illegal Re-open
                      </button>
                    </>
                  )}
                  {activeEntityTab === 'obj.payment_intent' && (
                    <>
                      <button type="button" className="ont-sim-preset-btn" onClick={() => { setFromState('AUTHORISED'); setToState('EXECUTING'); checkTransition('AUTHORISED', 'EXECUTING'); }}>
                        Valid Exec
                      </button>
                      <button type="button" className="ont-sim-preset-btn" onClick={() => { setFromState('CREATED'); setToState('COMPLETED'); checkTransition('CREATED', 'COMPLETED'); }}>
                        Bypass Authorization
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Interactive Transition Test Bench */}
            <div style={{ padding: '16px 20px', background: 'var(--surface-2)', borderRadius: 'var(--r-field)', border: '1px solid var(--line)', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>Symbolic Transition Validator Sandbox:</strong>
                <small className="muted">Evaluates state clearances against RBI rules</small>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>From:</span>
                  <select value={fromState} onChange={e => { setFromState(e.target.value); setCheckResult(null); }} className="form-input">
                    {activeSm.states.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </label>

                <span style={{ color: 'var(--muted)' }}>➔</span>

                <label style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>To:</span>
                  <select value={toState} onChange={e => { setToState(e.target.value); setCheckResult(null); }} className="form-input">
                    {activeSm.states.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </label>

                <button type="button" className="k-btn primary sm" onClick={() => checkTransition()}>
                  Check Clearance
                </button>
              </div>

              {checkResult && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--r-field)',
                  background: checkResult.ok ? 'var(--ok-bg)' : 'var(--danger-bg)',
                  border: `1px solid ${checkResult.ok ? 'var(--ok)' : 'var(--danger)'}`,
                  color: checkResult.ok ? 'var(--ok)' : 'var(--danger)',
                  display: 'grid',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
                    <Icon name={checkResult.ok ? 'check' : 'alert'} />
                    <span>{checkResult.msg}</span>
                  </div>
                  {checkResult.reason && (
                    <small style={{ fontSize: '12.5px', color: 'var(--ink-2)', opacity: 0.9 }}>
                      {checkResult.reason}
                    </small>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* 10 Governed Policy Parameters - Visual Rich Cards */}
      <Panel
        title="Banking Rules & Safeguard Parameters"
        count={filteredParams.length}
        sub="The 10 formal policy parameters defined in config/ontology/policies/approval-matrix.md governing autonomous transaction limits, cooling-off windows, and four-eyes review."
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className={`ont-ctrl-btn ${rulesViewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setRulesViewMode('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              className={`ont-ctrl-btn ${rulesViewMode === 'table' ? 'active' : ''}`}
              onClick={() => setRulesViewMode('table')}
            >
              Table
            </button>
          </div>
        }
      >
        {pError && <p className="form-error">{pError}</p>}

        {/* Filters & Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div className="ont-filter-bar">
            {[
              { id: 'all', label: 'All Rules' },
              { id: 'payments', label: '💳 Payments & Limits' },
              { id: 'fraud', label: '🛡️ Fraud & Cooling-off' },
              { id: 'security', label: '🔐 Security & Kavach' },
              { id: 'outreach', label: '📞 Customer Outreach' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`ont-filter-chip ${paramFilter === tab.id ? 'active' : ''}`}
                onClick={() => setParamFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={paramSearch}
            onChange={e => setParamSearch(e.target.value)}
            placeholder="Search banking rules…"
            className="form-input"
            style={{ minWidth: '220px', padding: '6px 12px', fontSize: '13px' }}
          />
        </div>

        {paramsData ? (
          rulesViewMode === 'cards' ? (
            <div className="ont-policy-grid">
              {filteredParams.map(p => (
                <div key={p.id} className="ont-policy-card">
                  <div className="ont-policy-top">
                    <div className="ont-policy-icon-badge">
                      <Icon name={getDomainIcon(p.id)} />
                    </div>
                    <div className="ont-policy-val-box" style={{ textAlign: 'right' }}>
                      <span className="ont-policy-val">{formatParamValue(p)}</span>
                      <span className="ont-policy-unit">{p.unit}</span>
                    </div>
                  </div>

                  <div>
                    <strong style={{ fontSize: '15px', color: 'var(--ink)', display: 'block' }}>{p.name}</strong>
                    <code style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'inline-block' }}>{p.id}</code>
                  </div>

                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--ink-2)', flex: 1 }}>
                    {p.description}
                  </p>

                  <div className="ont-policy-meta">
                    <Tag tone={p.enforced ? 'info' : 'warning'}>{p.enforced ? `Enforced: ${p.enforced_in}` : p.enforced_in}</Tag>
                    <Tag tone="neutral">Owner: {p.owner}</Tag>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table st-cards">
                <thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Owner</th><th>Enforced In</th><th>Description</th></tr></thead>
                <tbody>{filteredParams.map(p => (
                  <tr key={p.id}>
                    <td className="st-main"><code>{p.id}</code><span className="st-sub">{p.name}</span></td>
                    <td><strong style={{ color: 'var(--accent-ink)', fontSize: '15px' }}>{formatParamValue(p)}</strong></td>
                    <td><Tag tone="neutral">{p.unit}</Tag></td>
                    <td>{p.owner}</td>
                    <td><Tag tone={p.enforced ? 'info' : 'warning'}>{p.enforced_in}</Tag></td>
                    <td className="st-wrap">{p.description}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
        ) : <SkeletonRows rows={5} />}
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
type AutoPause = { tool: string; reason: string; since: string; until: string };
type Controls = { disabled_channels: string[]; disabled_tools: string[]; reason?: string; updated_by?: string; updated_at?: string; channels: string[]; tools: string[];
  auto_pauses?: AutoPause[]; auto_pause_rule?: { refusals: number; within_minutes: number; pause_minutes: number } };
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
  const resumeAuto = async () => {
    setBusy(true); setSaveError(null);
    try { await post('/api/admin/controls/resume', {}); load(); toast({ message: 'Money tools resumed.' }); }
    catch (e) { setSaveError(errorText(e)); } finally { setBusy(false); }
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
      ) : !data.auto_pauses?.length && <Attention tone="ok" title="All channels live · no tools blocked">{lastChange}</Attention>}

      {data.auto_pauses?.length ? (
        <Attention tone="danger" title="Money tools paused automatically"
          actions={<button type="button" className="k-btn outline sm" disabled={busy} onClick={resumeAuto}>Resume now</button>}>
          {data.auto_pauses[0].reason}. {data.auto_pauses.map(p => humanizeCode(p.tool)).join(' and ')} stay off until {when(data.auto_pauses[0].until)}, then resume by themselves. Chat and enquiries are not affected.
        </Attention>
      ) : data.auto_pause_rule && (
        <p className="muted">Automatic pause: if Sentinel refuses {data.auto_pause_rule.refusals} payments within {data.auto_pause_rule.within_minutes} minutes, the transfer and bill-payment tools stop for {data.auto_pause_rule.pause_minutes} minutes.</p>
      )}

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

/* ---------------- Sentinel decisions ---------------- */
type Explained = {
  id: string; at: string | null; decision: 'ALLOW' | 'CHALLENGE' | 'DENY'; risk_score: number | null; challenge_at: number; deny_at: number;
  action: { type: string | null; amount_minor: number | null } | null;
  reasons: { code: string; meaning: string; points: number | null; kind: 'signal' | 'rule' }[];
  checks: { name: string; status: string; detail: string }[]; obligations: string[]; customer_was_told: string;
  policy_version: string | null; session_id: string | null;
};
const DECISION_OUTCOME = {
  ALLOW: { tone: 'success', label: 'Allowed' }, CHALLENGE: { tone: 'warning', label: 'Extra verification' }, DENY: { tone: 'danger', label: 'Refused' },
} as const;
const rupees = (minor?: number | null) => (!minor ? '—' : `₹${(minor / 100).toLocaleString('en-IN')}`);
const points = (n: number | null) => (n == null ? 'Rule' : `${n > 0 ? '+' : ''}${n} points`);

const DecisionDialog: React.FC<{ d: Explained; close: () => void }> = ({ d, close }) => (
  <Modal isOpen onClose={close} wide title={`${DECISION_OUTCOME[d.decision].label}: ${d.action?.type ? humanizeCode(d.action.type) : 'decision'} ${rupees(d.action?.amount_minor)}`}
    subtitle={`Reference ${d.id} · ${when(d.at)}`}>
    <div className="k-page-stack">
      <p>Risk score <strong>{d.risk_score ?? '—'}</strong>. A score of {d.challenge_at} or more needs extra verification, and {d.deny_at} or more is refused.
        Rules can refuse a payment whatever the score is.</p>
      <Panel title="Why" count={d.reasons.length} sub="Each reason with what it means and what it added to the score.">
        {d.reasons.length ? (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>Reason</th><th>What it means</th><th>Effect</th></tr></thead>
            <tbody>{d.reasons.map(r => (
              <tr key={r.code}>
                <td className="st-main"><code>{r.code}</code></td>
                <td data-label="What it means">{r.meaning}</td>
                <td data-label="Effect"><Tag tone={r.points == null ? 'neutral' : r.points > 0 ? 'warning' : 'success'}>{points(r.points)}</Tag></td>
              </tr>))}</tbody>
          </table></div>
        ) : <Empty title="No reasons were recorded">Nothing raised the score, and no rule applied.</Empty>}
      </Panel>
      <Panel title="Checks" count={d.checks.length} sub="What Sentinel verified before scoring.">
        {d.checks.length ? (
          <div className="table-scroll"><table className="table st-cards">
            <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>{d.checks.map(c => (
              <tr key={c.name}>
                <td className="st-main">{c.name}</td>
                <td data-label="Result"><Tag tone={c.status === 'PASS' ? 'success' : 'danger'}>{c.status === 'PASS' ? 'Passed' : 'Failed'}</Tag></td>
                <td data-label="Detail">{c.detail}</td>
              </tr>))}</tbody>
          </table></div>
        ) : <Empty title="No checks recorded">This decision has no check list on file.</Empty>}
      </Panel>
      <Panel title="What the customer saw" sub="Customers and Mitra never see the reasons or the score, so nobody can learn how to avoid them.">
        <div className="panel-body st-tight"><p>{d.customer_was_told}</p></div>
      </Panel>
    </div>
  </Modal>
);

const DecisionsTab: React.FC = () => {
  const [data, load, error] = useData<{ decisions: Explained[] }>('/api/admin/decisions?limit=100');
  const [filter, setFilter] = useState('ALL');
  const [open, setOpen] = useState<Explained | null>(null);
  const head = <Head tab="admin-decisions" sub="Why Sentinel allowed, challenged or refused each payment. Only the admin sees this." />;
  if (!data) return <>{head}<Loading error={error} retry={load} /></>;
  const rows = data.decisions.filter(d => filter === 'ALL' || d.decision === filter);
  const of = (k: string) => data.decisions.filter(d => d.decision === k).length;
  return (
    <>
      {head}
      <Panel title="Recent decisions" count={rows.length} sub="The newest 100, newest first."
        actions={<FilterTabs name="decision" label="Filter decisions by outcome" value={filter} onChange={setFilter}
          tabs={[{ id: 'ALL', label: 'All', count: data.decisions.length }, { id: 'DENY', label: 'Refused', count: of('DENY') },
            { id: 'CHALLENGE', label: 'Extra verification', count: of('CHALLENGE') }, { id: 'ALLOW', label: 'Allowed', count: of('ALLOW') }]} />}>
        {rows.length ? (
          <div className="table-scroll"><table className="table st-cards st-sticky">
            <thead><tr><th>When</th><th>Payment</th><th>Outcome</th><th>Score</th><th>Top reason</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody><AnimatePresence>{rows.map((d, i) => (
              <motion.tr key={d.id} {...rowMotion(i)}>
                <td className="st-main">{when(d.at)}<span className="st-sub"><code>{d.id}</code></span></td>
                <td data-label="Payment">{d.action?.type ? humanizeCode(d.action.type) : '—'} <span className="st-sub">{rupees(d.action?.amount_minor)}</span></td>
                <td data-label="Outcome"><Tag tone={DECISION_OUTCOME[d.decision].tone}>{DECISION_OUTCOME[d.decision].label}</Tag></td>
                <td data-label="Score">{d.risk_score ?? '—'}</td>
                <td data-label="Top reason">{d.reasons[0] ? d.reasons[0].meaning : <span className="muted">None</span>}</td>
                <td className="st-act"><div className="row-actions"><button type="button" className="k-btn outline sm" onClick={() => setOpen(d)}>Explain…</button></div></td>
              </motion.tr>))}</AnimatePresence></tbody>
          </table></div>
        ) : <Empty title="No decisions here">{filter === 'ALL' ? 'Decisions appear after a payment is proposed.' : 'No decision has this outcome yet.'}</Empty>}
      </Panel>
      {open && <DecisionDialog d={open} close={() => setOpen(null)} />}
    </>
  );
};

const TABS: Record<string, React.FC<{ go: (route: string) => void }>> = {
  'admin-approvals': ApprovalsTab, 'admin-ontology': OntologyTab, 'admin-skills': SkillsTab, 'admin-sources': SourcesTab,
  'admin-usage': UsageTab, 'admin-quality': QualityTab, 'admin-controls': ControlsTab, 'admin-audit': AuditTab,
  'admin-decisions': DecisionsTab,
};

export const AdminPage: React.FC<{ tab: string; onNavigate: (route: string) => void }> = ({ tab, onNavigate }) => {
  const Tab = TABS[tab];
  return <div className="k-page-stack st-page">{Tab ? <Tab go={onNavigate} /> : <Head tab={tab} sub="This page does not exist." />}</div>;
};
