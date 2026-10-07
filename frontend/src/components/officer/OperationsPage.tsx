import React, { useEffect, useState } from 'react';
import { formatDate, formatDateTime, formatMoney, humanizeCode } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { fetchOfficerCustomers, fetchOfficerLeads, requestCustomerDeletion, resendOfficerCustomerCredentials } from '../../services/banking';
import { get, post } from '../../services/api';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { AnimatePresence, motion } from '../common/Animate';
import { OfficerCopilot } from './OfficerCopilot';
import { CaseDialog, DECIDE_STATUSES } from './CaseDialog';
import { LeadsPage } from './LeadsPage';
import { Attention, Empty, Kpi, Panel, Tag, rowMotion, errorText } from './StaffKit';

interface OperationsPageProps {
  isHistory?: boolean;
  initialFilter?: string;
}

const ACTIVE = ['NEW', 'DUE', 'PENDING', 'PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED',
  'IN_REVIEW', 'SUBMITTED', 'QUEUED_FOR_CBS', 'RPA_EXECUTING', 'RPA_FAILED'];
const CBS = ['QUEUED_FOR_CBS', 'RPA_EXECUTING', 'RPA_FAILED'];
const byOldest = (a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The officer console: Review queue (service requests, customer care, customers), AI sales leads and Case history share this entry. */
export const OperationsPage: React.FC<OperationsPageProps> = ({ isHistory = false, initialFilter }) =>
  initialFilter === 'leads' ? <LeadsPage /> : isHistory ? <HistoryPage /> : <QueuePage />;

/* ---------------- Service requests table (queue and history) ---------------- */
const RequestsTable: React.FC<{ rows: any[]; onOpen: (r: any) => void; history?: boolean }> = ({ rows, onOpen, history }) => (
  <div className="table-scroll"><table className="table st-cards st-sticky">
    <thead><tr><th>Request</th><th>Customer</th><th>Submitted</th>{history && <th>Decided</th>}<th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
    <tbody><AnimatePresence initial={false}>{rows.map((r, i) => {
      const decide = DECIDE_STATUSES.includes(r.status);
      return (
        <motion.tr key={r.id} {...rowMotion(i)}>
          <td className="st-main"><strong>{r.service_name || humanizeCode(r.request_type) || 'Service request'}</strong><span className="st-sub">{r.id}</span></td>
          <td data-label="Customer">{r.customer_id || r.user_id || '—'}</td>
          <td data-label="Submitted" className="st-nowrap">{formatDateTime(r.created_at)}</td>
          {history && <td data-label="Decided" className="st-nowrap">{r.updated_at ? formatDateTime(r.updated_at) : '—'}{r.approver_id && <span className="st-sub">{r.approver_id}</span>}</td>}
          <td className="st-status"><Badge status={r.status} /></td>
          <td className="st-act"><div className="row-actions">
            <button type="button" className={`k-btn sm ${decide ? 'primary' : 'outline'}`} onClick={() => onOpen(r)}>{decide ? 'Review' : 'View case'}</button>
          </div></td>
        </motion.tr>);
    })}</AnimatePresence></tbody>
  </table></div>
);

/* ---------------- Customer care ---------------- */
type CareCase = { id: string; kind: string; status: string; priority: string; customer_id: string | null; name: string | null;
  phone: string | null; category: string | null; summary: string; preferred_time: string | null; due_at: string; created_at: string; overdue: boolean };
const CARE_KIND: Record<string, string> = { GRIEVANCE: 'Complaint', CALLBACK: 'Callback', FRAUD: 'Fraud report', HARDSHIP: 'Hardship', CARD_FREEZE: 'Card freeze review' };
const CARE_STATUS: Record<string, ['info' | 'warning' | 'success' | 'neutral', string]> = {
  OPEN: ['info', 'New'], IN_PROGRESS: ['warning', 'In progress'], RESOLVED: ['success', 'Resolved'] };
const careOpen = (c: CareCase) => c.status === 'OPEN' || c.status === 'IN_PROGRESS';
const urgency = (a: CareCase, b: CareCase) => Number(b.overdue) - Number(a.overdue) || Number(b.priority === 'HIGH') - Number(a.priority === 'HIGH')
  || a.due_at.localeCompare(b.due_at);
const categoryText = (c: CareCase) => (!c.category || c.category.toUpperCase() === c.kind ? null
  : /^[A-Z_]+$/.test(c.category) ? humanizeCode(c.category) : c.category.charAt(0).toUpperCase() + c.category.slice(1));

const CarePanel: React.FC<{ cases: CareCase[] | null; reload: () => Promise<void>; filter: string; setFilter: (f: string) => void }> = (
  { cases, reload, filter, setFilter }) => {
  const [resolving, setResolving] = useState<CareCase | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = [...(cases || [])].sort(urgency);
  const open = list.filter(careOpen);
  const groups: Record<string, CareCase[]> = {
    open, overdue: open.filter(c => c.overdue), high: open.filter(c => c.priority === 'HIGH'),
    resolved: list.filter(c => c.status === 'RESOLVED'), all: list };
  const rows = groups[filter] || open;
  const update = async (c: CareCase, status: string, resolution?: string) => {
    setBusy(c.id); setError(null);
    try { await post(`/api/officer/care-cases/${c.id}`, { status, resolution }); await reload(); setResolving(null); setNote(''); }
    catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };
  return (
    <Panel title="Customer care" count={rows.length} label="Customer care queue"
      sub="Complaints, callbacks, fraud reports and hardship requests raised through Mitra. Most urgent first; due times follow RBI rules."
      actions={<FilterTabs name="care" label="Filter care cases" value={filter} onChange={setFilter} tabs={[
        { id: 'open', label: 'Open', count: open.length }, { id: 'overdue', label: 'Overdue', count: groups.overdue.length },
        { id: 'high', label: 'High priority', count: groups.high.length }, { id: 'resolved', label: 'Resolved', count: groups.resolved.length },
        { id: 'all', label: 'All' }]} />}>
      {error && !resolving && <div className="panel-body st-tight"><p className="form-error" role="alert">{error}</p></div>}
      {!cases ? <div className="st-loading" aria-busy="true"><i /><i /><i /></div> : rows.length ? (
        <div className="table-scroll"><table className="table st-cards st-sticky">
          <thead><tr><th>Case</th><th>Customer</th><th>Issue</th><th>Due</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody><AnimatePresence initial={false}>{rows.map((c, i) => (
            <motion.tr key={c.id} {...rowMotion(i)}>
              <td className="st-main"><strong>{CARE_KIND[c.kind] || humanizeCode(c.kind)}</strong>
                <span className="st-sub">{[c.id, categoryText(c)].filter(Boolean).join(' · ')}</span>
                {c.priority === 'HIGH' && careOpen(c) && <span className="st-flag"><Tag tone="danger">High priority</Tag></span>}</td>
              <td data-label="Customer">{c.name || c.customer_id || 'Visitor'}
                {(c.name && c.customer_id) || c.phone ? <span className="st-sub">{[c.name ? c.customer_id : null, c.phone].filter(Boolean).join(' · ')}</span> : null}</td>
              <td data-label="Issue" className="st-wrap">{c.summary}{c.preferred_time && <span className="st-sub">Preferred time: {c.preferred_time}</span>}</td>
              <td data-label="Due" className="st-nowrap">{formatDateTime(c.due_at)}{c.overdue && careOpen(c) && <span className="st-flag"><Tag tone="danger">Overdue</Tag></span>}</td>
              <td className="st-status"><Tag tone={CARE_STATUS[c.status]?.[0] || 'neutral'}>{CARE_STATUS[c.status]?.[1] || humanizeCode(c.status)}</Tag></td>
              <td className="st-act"><div className="row-actions">
                {c.status === 'OPEN' && <button type="button" className="k-btn outline sm" disabled={busy === c.id} onClick={() => update(c, 'IN_PROGRESS')}>Take</button>}
                {c.status !== 'RESOLVED' && <button type="button" className="k-btn primary sm" disabled={busy === c.id} onClick={() => { setError(null); setResolving(c); }}>Resolve…</button>}
                {c.status === 'RESOLVED' && <span className="muted">Closed</span>}
              </div></td>
            </motion.tr>))}</AnimatePresence></tbody>
        </table></div>
      ) : <Empty title={filter === 'overdue' ? 'Nothing is overdue' : 'No cases in this view'}>Cases customers raise through Mitra appear here.</Empty>}

      {resolving && (
        <Modal isOpen onClose={() => !busy && setResolving(null)} title={`Resolve ${CARE_KIND[resolving.kind]?.toLowerCase() || 'case'} ${resolving.id}`}
          subtitle={resolving.name || resolving.customer_id || 'Visitor'}>
          <form onSubmit={e => { e.preventDefault(); if (note.trim().length >= 5) update(resolving, 'RESOLVED', note.trim()); }}>
            <p className="st-dialog-text">{resolving.summary}</p>
            <label className="k-field">Resolution note
              <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} required minLength={5}
                placeholder="What you did and what you told the customer." />
              <small>Required, at least 5 characters. Saved on the case record.</small>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="k-dialog-actions">
              <button type="button" className="k-btn outline sm" disabled={!!busy} onClick={() => setResolving(null)}>Cancel</button>
              <button type="submit" className="k-btn primary sm" disabled={!!busy || note.trim().length < 5}>{busy ? 'Saving…' : 'Mark resolved'}</button>
            </div>
          </form>
        </Modal>)}
    </Panel>
  );
};

/* ---------------- Customers ---------------- */
const KYC: Record<string, string> = { VERIFIED: 'verified', NOT_DONE: 'not done', PENDING_RE_KYC: 're-KYC due', PENDING: 'pending', IN_REVIEW: 'in review' };
const CustomersPanel: React.FC<{ customers: any[] | null; reload: () => Promise<void> }> = ({ customers, reload }) => {
  const [creds, setCreds] = useState<{ username: string; temp_password: string; name: string } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toWipe, setToWipe] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = async (c: any) => {
    setResetting(c.customer_id); setError(null); setCopied(false);
    try { const res = await resendOfficerCustomerCredentials(c.customer_id); setCreds({ ...res, name: c.full_name }); await reload(); }
    catch (e) { setError(errorText(e, 'A new password could not be made')); } finally { setResetting(null); }
  };
  const requestDeletion = async () => {
    setWiping(true); setWipeError(null);
    try {
      await requestCustomerDeletion(toWipe.customer_id, reason.trim());
      setSent(`Deletion of ${toWipe.full_name} (${toWipe.customer_id}) is with the admin. Nothing is removed until they approve.`);
      setToWipe(null); setReason(''); await reload();
    } catch (e) { setWipeError(errorText(e, 'The request could not be sent')); } finally { setWiping(false); }
  };

  return (
    <Panel title="Customers" count={customers?.length} sub="Customers with a Kosh sign-in. Reset a password, or ask the admin to remove a customer's access.">
      {(creds || sent || error) && <div className="panel-body st-tight">
        {creds && <div className="k-note st-credentials" role="status"><Icon name="key" /><div>
          <strong>New temporary password for {creds.name} (@{creds.username})</strong>
          <span><code>{creds.temp_password}</code>
            <button type="button" className="k-link" onClick={() => navigator.clipboard?.writeText(creds.temp_password).then(() => setCopied(true))}>
              <Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}</button></span>
          <span>Give it to the customer yourself, in person or on a verified call. Kosh sends no e-mail. It is shown only now.</span></div>
          <button type="button" className="k-btn outline sm" onClick={() => setCreds(null)}>Done</button></div>}
        {sent && <div className="k-note" role="status"><Icon name="check" /><div>{sent}</div>
          <button type="button" className="k-btn outline sm" onClick={() => setSent(null)}>Done</button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>}
      {!customers ? <div className="st-loading" aria-busy="true"><i /><i /><i /></div> : customers.length ? (
        <div className="table-scroll"><table className="table st-cards st-sticky">
          <thead><tr><th>Customer</th><th>Contact</th><th>Sign-in</th><th className="num">Balance</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody><AnimatePresence initial={false}>{customers.map((c, i) => {
            const removed = c.status === 'ACCESS_REMOVED';
            return (
              <motion.tr key={c.customer_id} {...rowMotion(i)}>
                <td className="st-main"><strong>{c.full_name}</strong><span className="st-sub">{c.customer_id}{c.member_since ? ` · since ${formatDate(c.member_since)}` : ''}</span></td>
                <td data-label="Contact"><span className="st-contact"><Icon name="phone" />{c.phone_number || '—'}</span>
                  <span className="st-contact st-sub"><Icon name="mail" />{c.email || '—'}</span></td>
                <td data-label="Sign-in">{c.username ? <>@{c.username}<span className="st-sub">{c.user_id ? 'Linked to the profile' : 'Not linked'}</span></> : <span className="muted">No sign-in</span>}</td>
                <td data-label="Balance" className="num">{c.total_balance_minor != null ? formatMoney(c.total_balance_minor) : c.total_balance_formatted}<span className="st-sub">{c.primary_account_number || 'No account'}</span></td>
                <td className="st-status"><Badge status={c.status} /><span className="st-sub">{/^[A-Z_]+$/.test(c.tier || '') ? humanizeCode(c.tier) : c.tier} · KYC {KYC[c.kyc_status] || humanizeCode(c.kyc_status).toLowerCase()}</span></td>
                <td className="st-act"><div className="row-actions">
                  <button type="button" className="k-btn outline sm" disabled={!!resetting || removed || !c.username} onClick={() => reset(c)}>
                    {resetting === c.customer_id ? 'Resetting…' : 'Reset password'}</button>
                  <button type="button" className="k-btn danger sm" disabled={c.deletion_pending || removed}
                    onClick={() => { setWipeError(null); setReason(''); setToWipe(c); }}>
                    {removed ? 'Access removed' : c.deletion_pending ? 'With the admin' : 'Request deletion…'}</button>
                </div></td>
              </motion.tr>);
          })}</AnimatePresence></tbody>
        </table></div>
      ) : <Empty icon="users" title="No customers yet">Customers appear here once they have a Kosh sign-in.</Empty>}

      {toWipe && (
        <Modal isOpen onClose={() => !wiping && setToWipe(null)} title={`Ask to remove ${toWipe.full_name}'s access`} subtitle={`${toWipe.customer_id} · two people decide this`}>
          <form onSubmit={e => { e.preventDefault(); if (reason.trim().length >= 10) requestDeletion(); }}>
            <div className="k-note warn st-dialog-text"><Icon name="alert" /><div>
              <strong>The admin approves or rejects this in the Admin Panel; nothing changes until then.</strong>
              <ul className="st-list">
                <li>Removed: the sign-in (@{toWipe.username || 'none'}), sessions, chats, unsent forms, sales leads, phone number and email.</li>
                <li>Kept, as the bank must: name and KYC, accounts, cards, transactions, service requests, consents and the audit trail.</li>
              </ul></div></div>
            <label className="k-field">Reason
              <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} required minLength={10}
                placeholder="e.g. Customer asked in branch on 7 Oct to close their digital access." />
              <small>Required, at least 10 characters. The admin reads it.</small>
            </label>
            {wipeError && <p className="form-error" role="alert">{wipeError}</p>}
            <div className="k-dialog-actions">
              <button type="button" className="k-btn outline sm" disabled={wiping} onClick={() => setToWipe(null)}>Cancel</button>
              <button type="submit" className="k-btn danger sm" disabled={wiping || reason.trim().length < 10}>{wiping ? 'Sending…' : 'Send to the admin'}</button>
            </div>
          </form>
        </Modal>)}
    </Panel>
  );
};

/* ---------------- Review queue ---------------- */
type View = 'requests' | 'care' | 'customers';

const QueuePage: React.FC = () => {
  const { overview, refreshOverview } = useBanking();
  const ops: any[] = (overview as any)?.operations || overview?.requests || [];
  const [picked, setView] = useState<View | null>(null);  // until the officer picks, show where the work is
  const [filter, setFilter] = useState('all');
  const [careFilter, setCareFilter] = useState('open');
  const [openCase, setOpenCase] = useState<any>(null);
  const [care, setCare] = useState<CareCase[] | null>(null);
  const [customers, setCustomers] = useState<any[] | null>(null);
  const [leads, setLeads] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCare = () => get<{ cases: CareCase[] }>('/api/officer/care-cases').then(r => setCare(r.cases)).catch(() => setCare([]));
  const loadCustomers = () => fetchOfficerCustomers().then(r => setCustomers(r.customers || [])).catch(() => setCustomers([]));
  const loadLeads = () => fetchOfficerLeads().then(r => setLeads(r.leads || [])).catch(() => setLeads([]));
  useEffect(() => { loadCare(); loadCustomers(); loadLeads(); }, []);
  const refresh = async () => { setBusy(true); await Promise.all([refreshOverview(), loadCare(), loadCustomers(), loadLeads()]); setBusy(false); };

  const open = ops.filter(r => ACTIVE.includes(r.status)).sort(byOldest);
  const toDecide = open.filter(r => DECIDE_STATUSES.includes(r.status));
  const cbs = open.filter(r => CBS.includes(r.status));
  const cbsFailed = cbs.filter(r => r.status === 'RPA_FAILED');
  const careOpenList = (care || []).filter(careOpen);
  const overdue = careOpenList.filter(c => c.overdue);
  const apps = (leads || []).filter(l => l.status === 'PENDING_APPROVAL');
  const pendingDeletion = (customers || []).filter(c => c.deletion_pending).length;
  const rows = filter === 'decide' ? toDecide : filter === 'cbs' ? cbs : filter === 'ESCALATED' ? open.filter(r => r.status === 'ESCALATED') : open;
  const view: View = picked ?? (open.length || !careOpenList.length ? 'requests' : 'care');
  const show = (v: View, f?: string) => { setView(v); if (f && v === 'requests') setFilter(f); if (f && v === 'care') setCareFilter(f); };
  const waiting = toDecide.length + apps.length + overdue.length;
  const loaded = care && leads;

  return (
    <div className="k-page-stack st-page">
      <PageHeader eyebrow="Bank operations" title="Review queue"
        subtitle="Service requests, customer care and customer access, most urgent first. Mitra and the copilot never decide; you do."
        actions={<button type="button" className="k-btn outline sm" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>} />

      {loaded && (waiting ? (
        <Attention title={`${plural(waiting, 'item')} waiting for you`}
          actions={toDecide.length ? <button type="button" className="k-btn primary sm" onClick={() => setOpenCase(toDecide[0])}>Review the oldest request</button>
            : overdue.length ? <button type="button" className="k-btn primary sm" onClick={() => show('care', 'overdue')}>Show overdue cases</button>
            : <a className="k-btn primary sm" href="#leads">Go to applications</a>}>
          <span className="st-attention-list">
            {toDecide.length > 0 && <button type="button" className="k-link" onClick={() => show('requests', 'decide')}>{plural(toDecide.length, 'service request')} to decide</button>}
            {overdue.length > 0 && <button type="button" className="k-link" onClick={() => show('care', 'overdue')}>{plural(overdue.length, 'care case')} past the due time</button>}
            {apps.length > 0 && <a className="k-link" href="#leads">{plural(apps.length, 'account application')} to approve in AI sales leads</a>}
          </span>
        </Attention>
      ) : <Attention tone="ok" title="Nothing waits for your decision">New requests, care cases and applications appear here first.</Attention>)}

      <div className="st-kpis" role="group" aria-label="Queues">
        <Kpi group="ops" label="Requests to decide" value={toDecide.length} tone="warn" caption={`${plural(open.length, 'request')} open in total`}
          onClick={() => show('requests', 'decide')} pressed={view === 'requests' && filter !== 'cbs'} />
        <Kpi group="ops" label="Customer care open" value={care ? careOpenList.length : null} tone={overdue.length ? 'danger' : undefined}
          caption={overdue.length ? `${overdue.length} past the due time` : 'All within the due time'}
          onClick={() => show('care', overdue.length ? 'overdue' : 'open')} pressed={view === 'care'} />
        <Kpi group="ops" label="Core banking entry" value={cbs.length} tone={cbsFailed.length ? 'danger' : undefined}
          caption={cbsFailed.length ? `${cbsFailed.length} failed; retry from the case` : 'Accounts the robot is entering in CBS'}
          onClick={() => show('requests', 'cbs')} pressed={view === 'requests' && filter === 'cbs'} />
        <Kpi group="ops" label="Customers" value={customers ? customers.length : null}
          caption={pendingDeletion ? `${pendingDeletion} deletion request${pendingDeletion > 1 ? 's' : ''} with the admin` : 'With a Kosh sign-in'}
          onClick={() => show('customers')} pressed={view === 'customers'} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} className="k-page-stack">
          {view === 'requests' && (
            <Panel title="Service requests" count={rows.length} sub="Oldest first. Open a case to see the application, the checks and record your decision."
              actions={<FilterTabs name="queue" label="Filter service requests" value={filter} onChange={setFilter} tabs={[
                { id: 'all', label: 'All open', count: open.length }, { id: 'decide', label: 'To decide', count: toDecide.length },
                { id: 'ESCALATED', label: 'Escalated', count: open.filter(r => r.status === 'ESCALATED').length },
                { id: 'cbs', label: 'Core banking', count: cbs.length }]} />}>
              {rows.length ? <RequestsTable rows={rows} onOpen={setOpenCase} />
                : <Empty title="Nothing waits here">New service requests from customers appear here. Finished ones move to Case history.</Empty>}
            </Panel>)}
          {view === 'care' && <CarePanel cases={care} reload={loadCare} filter={careFilter} setFilter={setCareFilter} />}
          {view === 'customers' && <CustomersPanel customers={customers} reload={loadCustomers} />}
        </motion.div>
      </AnimatePresence>

      <OfficerCopilot requestId={openCase?.id} />
      {openCase && <CaseDialog request={openCase} onClose={() => setOpenCase(null)} />}
    </div>
  );
};

/* ---------------- Case history ---------------- */
const HistoryPage: React.FC = () => {
  const { overview, refreshOverview } = useBanking();
  const [filter, setFilter] = useState('all');
  const [openCase, setOpenCase] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const done = ((overview as any)?.operations || overview?.requests || []).filter((r: any) => !ACTIVE.includes(r.status))
    .sort((a: any, b: any) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  const statuses = ['COMPLETED', 'APPROVED', 'REJECTED', 'CANCELLED'];
  const rows = filter === 'all' ? done : done.filter((r: any) => r.status === filter);
  return (
    <div className="k-page-stack st-page">
      <PageHeader eyebrow="Bank operations" title="Case history" subtitle="Decided, completed and cancelled requests, newest first. Open one to see what was checked and decided."
        actions={<button type="button" className="k-btn outline sm" disabled={busy}
          onClick={async () => { setBusy(true); await refreshOverview(); setBusy(false); }}>{busy ? 'Refreshing…' : 'Refresh'}</button>} />
      <Panel title="Past requests" count={rows.length}
        actions={<FilterTabs name="history" label="Filter by outcome" value={filter} onChange={setFilter}
          tabs={[{ id: 'all', label: 'All', count: done.length }, ...statuses.map(s => ({ id: s, label: humanizeCode(s), count: done.filter((r: any) => r.status === s).length }))]} />}>
        {rows.length ? <RequestsTable rows={rows} onOpen={setOpenCase} history />
          : <Empty icon="file" title="No requests in this view">Requests appear here once they are decided or cancelled.</Empty>}
      </Panel>
      {openCase && <CaseDialog request={openCase} onClose={() => setOpenCase(null)} />}
    </div>
  );
};
