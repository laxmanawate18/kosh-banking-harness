import React, { useEffect, useState } from 'react';
import { formatDate, formatRupees, humanizeCode } from '../common/Formatters';
import { approveOfficerLead, fetchOfficerCustomers, fetchOfficerLeads, updateOfficerLeadStatus } from '../../services/banking';
import { get } from '../../services/api';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { SkeletonRows } from '../common/Skeleton';
import { AnimatePresence, motion } from '../common/Animate';
import { Attention, Bar, Empty, Kpi, Paged, Panel, rowMotion, channelName, errorText } from './StaffKit';

/** AI sales leads: interest Mitra recorded, and applications from new customers that need the officer's approval. */

type Product = { id: string; title: string; category: string };
type Funnel = { rows: { product_id: string; title: string; channel: string; shown: number; clicked: number; applied: number; approved: number;
  dismissed: number; click_rate: number; conversion_rate: number }[]; totals: Record<string, number> };
type Credentials = { username: string; temp_password: string; customer_id?: string };

const KIND: Record<string, string> = { savings: 'Savings account', cards: 'Credit card', loans: 'Loan', deposits: 'Fixed deposit', wealth: 'Investments' };
const OPEN = ['NEW', 'QUALIFIED', 'APPLIED', 'CONTACTED', 'INTERESTED'];
const CLOSED = ['DECLINED', 'REJECTED', 'LOST'];
const kindOf = (lead: any, p?: Product) => KIND[p?.category || ''] || (/LOAN/i.test(lead.category) ? 'Loan' : /CARD/i.test(lead.category) ? 'Credit card'
  : /SAV/i.test(lead.category) ? 'Savings account' : /FD|DEPOSIT/i.test(lead.category) ? 'Fixed deposit' : humanizeCode(lead.category) || 'Enquiry');
const productOf = (lead: any, p?: Product) => p?.title || (lead.sub_type && /[a-z]/.test(lead.sub_type) ? lead.sub_type : humanizeCode(lead.sub_type)) || kindOf(lead, p);
const rupees = (minor?: number | null) => (minor ? formatRupees(minor / 100) : null);
const rank = (s: string) => (s === 'PENDING_APPROVAL' ? 0 : OPEN.includes(s) ? 1 : s === 'CONVERTED' ? 2 : 3);

const CredentialNote: React.FC<{ c: Credentials; onDismiss?: () => void }> = ({ c, onDismiss }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="k-note st-credentials" role="status">
      <Icon name="key" />
      <div>
        <strong>Sign-in created for @{c.username}</strong>
        <span>Temporary password <code>{c.temp_password}</code>
          <button type="button" className="k-link" onClick={() => navigator.clipboard?.writeText(c.temp_password).then(() => setCopied(true))}>
            <Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}</button></span>
        <span>Give it to the customer yourself, in person or on a verified call. Kosh sends no e-mail. It is shown only now.</span>
      </div>
      {onDismiss && <button type="button" className="k-btn outline sm" onClick={onDismiss}>Done</button>}
    </div>
  );
};

const LeadDialog: React.FC<{ lead: any; product?: Product; who: string; onClose: () => void; onChanged: () => Promise<void> }> = (
  { lead, product, who, onClose, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [status, setStatus] = useState<string>(lead.status);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const p = lead.preferences && typeof lead.preferences === 'object' ? lead.preferences : {};
  const run = async (fn: () => Promise<any>, next?: string) => {
    setBusy(true); setError(null);
    try { const res = await fn(); if (next) setStatus(next); await onChanged(); return res; }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); setConfirmDecline(false); }
  };
  const approve = async () => { const res = await run(() => approveOfficerLead(lead.id), 'CONVERTED'); if (res?.username) setCreds(res); };
  const mark = (s: string, note?: string) => run(() => updateOfficerLeadStatus(lead.id, s, note), s);

  return (
    <Modal isOpen wide onClose={onClose} title={productOf(lead, product)}
      subtitle={`${kindOf(lead, product)} · ${who} · received ${formatDate(lead.created_at)}${p.app_ref ? ` · ${p.app_ref}` : ''}`}>
      <div className="st-case">
        {creds ? <CredentialNote c={creds} /> : status === 'PENDING_APPROVAL' ? (
          <div className="k-note warn"><Icon name="clock" /><div><strong>Waiting for your approval.</strong> This applicant has no account yet.
            Approving creates their customer profile and a sign-in with a temporary password, which you then give to them. Kosh sends no e-mail.</div></div>
        ) : status === 'CONVERTED' && lead.customer_id ? (
          <div className="k-note"><Icon name="check" /><div><strong>Converted.</strong> Customer {lead.customer_id}
            {p.provisioned_username ? <> signs in as @{p.provisioned_username}</> : null}; the officer handed the sign-in over.</div></div>
        ) : null}

        <div className="case-summary-strip">
          <div><span>Status</span><Badge status={status} /></div>
          <div><span>Product</span><strong>{productOf(lead, product)}</strong></div>
          <div><span>Lead</span><strong>{lead.id}</strong></div>
        </div>

        <section className="case-section">
          <div className="case-section-heading"><div><small>Applicant</small><h3>Contact and eligibility</h3></div></div>
          <div className="case-detail-grid">
            <div><span>Name</span><strong>{who}</strong></div>
            <div><span>Mobile</span><strong className="st-mono">{p.phone_number || '—'}</strong></div>
            <div><span>Email</span><strong>{p.email || '—'}</strong></div>
            <div><span>PAN</span><strong className="st-mono">{p.pan_masked || '—'}</strong></div>
            <div><span>Amount or limit asked</span><strong>{rupees(lead.amount_requested_minor) || 'Not stated'}</strong></div>
            <div><span>Tenure</span><strong>{lead.tenure_months ? `${lead.tenure_months} months` : '—'}</strong></div>
            <div><span>Employment</span><strong>{humanizeCode(lead.employment_type) || '—'}{p.employer_or_college ? ` · ${p.employer_or_college}` : ''}</strong></div>
            <div><span>Monthly income</span><strong>{rupees(lead.monthly_income_minor) || 'Not stated'}</strong></div>
            <div className="wide"><span>Notes</span><p>{lead.notes || p.summary || p.purpose || '—'}</p></div>
          </div>
        </section>

        {(lead.special_offer_note || lead.follow_up_pitch) && (
          <section className="case-section">
            <div className="case-section-heading"><div><small>Follow-up</small><h3>What Mitra offers when they return</h3></div></div>
            {lead.special_offer_note && <div className="ops-pitch offer"><strong>Offer</strong><p>{lead.special_offer_note}</p></div>}
            {lead.follow_up_pitch && <div className="ops-pitch quote"><strong>Mitra's message on their next visit</strong><p>“{lead.follow_up_pitch}”</p></div>}
          </section>
        )}

        {error && <div className="decision-error-banner" role="alert"><Icon name="alert" /><div>{error}</div></div>}
        <div className="k-dialog-actions st-spread">
          {confirmDecline ? <>
            <span className="st-confirm-text">Decline this application? The applicant gets no account.</span>
            <div className="st-row">
              <button type="button" className="k-btn outline sm" disabled={busy} onClick={() => setConfirmDecline(false)}>Keep it</button>
              <button type="button" className="k-btn danger sm" disabled={busy} onClick={() => mark('DECLINED', 'Application declined by officer.')}>Decline application</button>
            </div>
          </> : status === 'PENDING_APPROVAL' && !creds ? <>
            <button type="button" className="k-btn danger sm" disabled={busy} onClick={() => setConfirmDecline(true)}>Decline…</button>
            <button type="button" className="k-btn primary sm" disabled={busy} onClick={approve}>
              <Icon name="key" />{busy ? 'Creating the sign-in…' : 'Approve and create sign-in'}</button>
          </> : <>
            <span className="muted">{CLOSED.includes(status) ? 'This lead is closed.' : status === 'CONVERTED' ? 'This lead became a customer.' : 'Record what happened with this lead.'}</span>
            <div className="st-row">
              {!['LOST', 'CONVERTED', ...CLOSED].includes(status) && <button type="button" className="k-btn outline sm" disabled={busy} onClick={() => mark('LOST')}>Mark lost</button>}
              {OPEN.includes(status) && status !== 'CONTACTED' && <button type="button" className="k-btn outline sm" disabled={busy} onClick={() => mark('CONTACTED')}>Mark contacted</button>}
              {OPEN.includes(status) && <button type="button" className="k-btn primary sm" disabled={busy} onClick={() => mark('CONVERTED')}>Mark converted</button>}
              {creds && <button type="button" className="k-btn primary sm" onClick={onClose}>Done</button>}
            </div>
          </>}
        </div>
      </div>
    </Modal>
  );
};

const OfferFunnel: React.FC<{ data: Funnel }> = ({ data }) => {
  const t = data.totals;
  const steps: [string, number][] = [['Shown', t.shown], ['Clicked', t.clicked], ['Applied', t.applied], ['Approved', t.approved]];
  return (
    <Panel title="Personalised offers" sub={`Distinct customers in the last 30 days. ${t.dismissed} dismissed an offer.`} label="Offer conversion funnel">
      <ol className="st-funnel">{steps.map(([label, n], i) => (
        <motion.li key={label} {...rowMotion(i)}><span>{label}</span><strong className="k-num">{n.toLocaleString('en-IN')}</strong>
          <Bar value={n} max={t.shown}>{t.shown ? `${Math.round((100 * n) / t.shown)}%` : '—'}</Bar></motion.li>))}</ol>
      {data.rows.length ? (
        <div className="table-scroll"><table className="table st-cards">
          <thead><tr><th>Offer</th><th>Where</th><th className="num">Shown</th><th className="num">Clicked</th><th className="num">Applied</th>
            <th className="num">Approved</th><th className="num">Dismissed</th><th className="num">Click rate</th><th className="num">Conversion</th></tr></thead>
          <tbody>{data.rows.map((r, i) => (
            <motion.tr key={r.product_id + r.channel} {...rowMotion(i)}>
              <td className="st-main"><strong>{r.title}</strong></td><td data-label="Where">{channelName(r.channel)}</td>
              <td data-label="Shown" className="num">{r.shown}</td><td data-label="Clicked" className="num">{r.clicked}</td>
              <td data-label="Applied" className="num">{r.applied}</td><td data-label="Approved" className="num">{r.approved}</td>
              <td data-label="Dismissed" className="num st-hide-sm">{r.dismissed}</td><td data-label="Click rate" className="num st-hide-sm">{r.click_rate}%</td>
              <td className="num st-status"><strong>{r.conversion_rate}%</strong></td>
            </motion.tr>))}</tbody>
        </table></div>
      ) : <Empty icon="gift" title="No personalised offers shown yet" />}
    </Panel>
  );
};

export const LeadsPage: React.FC = () => {
  const [leads, setLeads] = useState<any[] | null>(null);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const loadLeads = () => fetchOfficerLeads().then(r => setLeads(r.leads || [])).catch(() => setLeads([]));
  const loadFunnel = () => get<Funnel>('/api/officer/offers/funnel').then(setFunnel).catch(() => setFunnel(null));
  useEffect(() => {
    loadLeads(); loadFunnel();
    get<{ products: Product[] }>('/api/products').then(r => setProducts(Object.fromEntries(r.products.map(p => [p.id, p])))).catch(() => undefined);
    fetchOfficerCustomers().then(r => setNames(Object.fromEntries((r.customers || []).map((c: any) => [c.customer_id, c.full_name])))).catch(() => undefined);
  }, []);
  const refresh = async () => { setBusy(true); await Promise.all([loadLeads(), loadFunnel()]); setBusy(false); };

  const all = [...(leads || [])].sort((a, b) => rank(a.status) - rank(b.status) || String(b.created_at).localeCompare(String(a.created_at)));
  const pending = all.filter(l => l.status === 'PENDING_APPROVAL');
  const openLeads = all.filter(l => OPEN.includes(l.status));
  const converted = all.filter(l => l.status === 'CONVERTED');
  const closed = all.filter(l => CLOSED.includes(l.status));
  const rows = { all, pending, open: openLeads, converted, closed }[filter] || all;
  const who = (l: any) => l.preferences?.applicant_name || names[l.customer_id] || l.customer_id || 'Visitor';

  return (
    <div className="k-page-stack st-page">
      <PageHeader eyebrow="Bank operations" title="AI sales leads"
        subtitle="Interest Mitra recorded, and applications from new customers. A new customer can sign in only after you approve."
        actions={<button type="button" className="k-btn outline sm" onClick={refresh} disabled={busy} aria-busy={busy}>
          <Icon name="refresh" className={`icon ${busy ? 'st-spin' : ''}`} />{busy ? 'Refreshing…' : 'Refresh'}</button>} />

      {leads && (pending.length
        ? <Attention title={`${pending.length} application${pending.length > 1 ? 's' : ''} waiting for your approval`}
            actions={<button type="button" className="k-btn primary sm" onClick={() => setOpen(pending[pending.length - 1])}>Review the oldest</button>}>
            New customers who applied through Mitra. Approving creates their sign-in.</Attention>
        : <Attention tone="ok" title="No application waits for your approval">New applications appear here first.</Attention>)}

      <div className="st-kpis">
        <Kpi group="leads" label="Applications to approve" value={leads ? pending.length : null} tone="warn" caption="New customers waiting for a sign-in"
          onClick={() => setFilter('pending')} pressed={filter === 'pending'} />
        <Kpi group="leads" label="Open leads" value={leads ? openLeads.length : null} caption="Interested; follow up and record the outcome"
          onClick={() => setFilter('open')} pressed={filter === 'open'} />
        <Kpi group="leads" label="Converted" value={leads ? converted.length : null} tone="ok" caption="Became customers"
          onClick={() => setFilter('converted')} pressed={filter === 'converted'} />
        <Kpi label="Offer conversion" value={funnel ? funnel.totals.conversion_rate : null} format={v => `${v.toFixed(0)}%`}
          caption="Shown an offer → approved, last 30 days" />
      </div>

      <Panel title="Leads" count={rows.length} sub="Waiting approvals first, then open leads, newest first."
        actions={<FilterTabs name="leads" label="Filter leads" value={filter} onChange={setFilter} tabs={[
          { id: 'all', label: 'All', count: all.length }, { id: 'pending', label: 'To approve', count: pending.length },
          { id: 'open', label: 'Open', count: openLeads.length }, { id: 'converted', label: 'Converted', count: converted.length },
          { id: 'closed', label: 'Closed', count: closed.length }]} />}>
        {!leads ? <SkeletonRows rows={4} label="Loading leads" /> : rows.length ? <Paged rows={rows} reset={filter}>{shown => (
          <div className="table-scroll"><table className="table st-cards st-sticky">
            <thead><tr><th>Product</th><th>Applicant</th><th className="num">Amount asked</th><th className="num">Monthly income</th><th>Status</th><th>Received</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody><AnimatePresence initial={false}>{shown.map((l, i) => {
              const p = products[l.recommended_product_id];
              return (
                <motion.tr key={l.id} {...rowMotion(i % 20)}>
                  <td className="st-main"><strong>{productOf(l, p)}</strong><span className="st-sub">{kindOf(l, p)}</span></td>
                  <td data-label="Applicant"><strong>{who(l)}</strong>
                    {l.preferences?.phone_number && <span className="st-sub st-nowrap">{l.preferences.phone_number}</span>}
                    <span className="st-sub st-nowrap">{l.preferences?.app_ref || (who(l) !== l.customer_id ? l.customer_id : null) || (!l.preferences?.phone_number && 'No contact recorded')}</span></td>
                  <td data-label="Amount asked" className="num">{rupees(l.amount_requested_minor) || <span className="muted">Not stated</span>}
                    {l.tenure_months ? <span className="st-sub">{l.tenure_months} months</span> : null}</td>
                  <td data-label="Monthly income" className="num st-hide-sm">{rupees(l.monthly_income_minor) || <span className="muted">Not stated</span>}
                    {l.employment_type ? <span className="st-sub">{humanizeCode(l.employment_type)}</span> : null}</td>
                  <td className="st-status"><Badge status={l.status} /></td>
                  <td data-label="Received" className="st-nowrap st-hide-sm">{formatDate(l.created_at)}</td>
                  <td className="st-act"><div className="row-actions">
                    <button type="button" className={`k-btn sm ${l.status === 'PENDING_APPROVAL' ? 'primary' : 'outline'}`} onClick={() => setOpen(l)}>
                      {l.status === 'PENDING_APPROVAL' ? 'Review' : 'Open'}</button>
                  </div></td>
                </motion.tr>);
            })}</AnimatePresence></tbody>
          </table></div>)}</Paged>
        : <Empty title="No leads in this view">When people ask Mitra about loans, cards or accounts, their interest appears here.</Empty>}
      </Panel>

      {funnel && <OfferFunnel data={funnel} />}

      {open && <LeadDialog lead={open} product={products[open.recommended_product_id]} who={who(open)} onClose={() => setOpen(null)} onChanged={loadLeads} />}
    </div>
  );
};
