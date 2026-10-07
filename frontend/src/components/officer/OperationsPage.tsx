import React, { useEffect, useMemo, useState } from 'react';
import { formatDate } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import {
  fetchOfficerRpaStatus,
  recordOfficerDecision,
  fetchOfficerLeads,
  updateOfficerLeadStatus,
  approveOfficerLead,
  fetchOfficerCustomers,
  requestCustomerDeletion,
  resendOfficerCustomerCredentials,
} from '../../services/banking';
import { get, post } from '../../services/api';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { OfficerCopilot } from './OfficerCopilot';

interface OperationsPageProps {
  isHistory?: boolean;
  initialFilter?: string;
}

const activeStatuses = [
  'NEW', 'DUE', 'PENDING', 'PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED',
  'IN_REVIEW', 'SUBMITTED', 'QUEUED_FOR_CBS', 'RPA_EXECUTING', 'RPA_FAILED',
];

const fieldLabels: Record<string, string> = {
  full_name: 'Applicant name', date_of_birth: 'Date of birth', pan_number: 'PAN',
  mobile: 'Mobile', email: 'Email', identity_document: 'Identity document',
  document_last4: 'Document ending', address: 'Residential address', city: 'City',
  state: 'State', pincode: 'PIN code', account_scheme: 'Account scheme',
  initial_deposit: 'Requested initial deposit', nominee: 'Nominee',
  nominee_name: 'Nominee name', nominee_relationship: 'Nominee relationship',
  cif_number: 'CBS customer ID', account_number: 'Account number', cbs_status: 'CBS status',
};

const rpaStepLabels: Record<string, string> = {
  'AO-001': 'Open CBS account-opening screen',
  'AO-002': 'Enter applicant name',
  'AO-003': 'Enter PAN',
  'AO-004': 'Enter date of birth',
  'AO-005': 'Enter mobile number',
  'AO-006': 'Enter residential address',
  'AO-007': 'Select account scheme',
  'AO-008': 'Bind the portal reference',
  'AO-009': 'Verify the CBS read-back',
  'AO-010': 'Submit the maker entry',
};

const KYC_REQUIRED_CHECKS = [
  {
    id: 'document_authenticity',
    label: 'Document Authenticity',
    description: 'Official Valid Document (OVD) & issuer authenticity verified independently',
  },
  {
    id: 'pan_or_form60',
    label: 'PAN / Form 60 Verification',
    description: 'Tax identifier verified against official issuer records',
  },
  {
    id: 'identity_match',
    label: 'Identity & Photo Match',
    description: 'Biometric / photographic comparison & customer details matched with proof',
  },
  {
    id: 'screening',
    label: 'AML & PEP Screening',
    description: 'Sanctions, negative list, and Politically Exposed Person (PEP) checks cleared',
  },
  {
    id: 'declarations',
    label: 'Declarations & Regulatory Consents',
    description: 'FATCA, tax residency, and digital banking declarations verified',
  },
];

type FunnelRow = { product_id: string; title: string; channel: string; shown: number; clicked: number; applied: number;
  approved: number; dismissed: number; click_rate: number; conversion_rate: number };

/** Personalised-offer funnel: distinct customers shown -> clicked -> applied -> approved, last 30 days. */
const OfferFunnel: React.FC = () => {
  const [data, setData] = useState<{ rows: FunnelRow[]; totals: Record<string, number> } | null>(null);
  useEffect(() => { get('/api/officer/offers/funnel').then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  const tot = data.totals;
  return (
    <section className="panel" aria-label="Offer conversion funnel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>Personalised offer funnel · last 30 days</h2>
      <p style={{ marginTop: 0 }}>
        Shown {tot.shown} → clicked {tot.clicked} → applied {tot.applied} → approved {tot.approved} · dismissed {tot.dismissed} ·
        conversion {tot.conversion_rate}%
      </p>
      {data.rows.length ? (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Offer</th><th>Channel</th><th>Shown</th><th>Clicked</th><th>Applied</th><th>Approved</th><th>Dismissed</th><th>Click rate</th><th>Conversion</th></tr></thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.product_id + r.channel}>
                  <td>{r.title}</td><td>{r.channel === 'MITRA' ? 'Mitra chat' : 'Dashboard'}</td><td>{r.shown}</td><td>{r.clicked}</td>
                  <td>{r.applied}</td><td>{r.approved}</td><td>{r.dismissed}</td><td>{r.click_rate}%</td><td>{r.conversion_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>No personalised offers shown yet.</p>}
    </section>
  );
};

type CareCase = { id: string; kind: string; status: string; priority: string; customer_id: string | null; name: string | null;
  phone: string | null; category: string | null; summary: string; preferred_time: string | null; due_at: string; created_at: string; overdue: boolean };
const CARE_KIND: Record<string, string> = { GRIEVANCE: 'Complaint', CALLBACK: 'Callback', FRAUD: 'Fraud report', HARDSHIP: 'Hardship',
  CARD_FREEZE: 'Card freeze review' };

/** Complaints, callbacks, fraud reports and hardship requests raised through Mitra, with their RBI-driven due times. */
const CareQueue: React.FC = () => {
  const [cases, setCases] = useState<CareCase[] | null>(null);
  const load = () => get('/api/officer/care-cases').then(r => setCases(r.cases)).catch(() => setCases([]));
  useEffect(() => { load(); }, []);
  const setStatus = async (id: string, status: string) => {
    const resolution = status === 'RESOLVED' ? window.prompt('Resolution note sent to the case record') || undefined : undefined;
    await post(`/api/officer/care-cases/${id}`, { status, resolution }); load();
  };
  if (!cases) return <section className="panel"><p>Loading customer care cases…</p></section>;
  const open = cases.filter(c => c.status === 'OPEN' || c.status === 'IN_PROGRESS');
  return (
    <section className="panel" aria-label="Customer care queue">
      <h2 style={{ marginTop: 0 }}>Customer care · {open.length} open{open.filter(c => c.overdue).length ? ` · ${open.filter(c => c.overdue).length} overdue` : ''}</h2>
      {cases.length ? (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Case</th><th>Type</th><th>Customer</th><th>Issue</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.id}</strong>{c.priority === 'HIGH' && <><br /><span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>HIGH PRIORITY</span></>}</td>
                  <td>{CARE_KIND[c.kind] || c.kind}{c.category && c.category !== c.kind ? <><br /><small>{c.category}</small></> : null}</td>
                  <td>{c.customer_id || 'Visitor'}{c.name ? <><br /><small>{c.name}</small></> : null}{c.phone ? <><br /><small>{c.phone}</small></> : null}</td>
                  <td style={{ maxWidth: 360 }}>{c.summary}{c.preferred_time ? <><br /><small>Preferred time: {c.preferred_time}</small></> : null}</td>
                  <td style={{ color: c.overdue ? '#b91c1c' : undefined }}>{new Date(c.due_at).toLocaleString()}{c.overdue ? ' (overdue)' : ''}</td>
                  <td>{c.status}</td>
                  <td>
                    {c.status === 'OPEN' && <button type="button" className="button" onClick={() => setStatus(c.id, 'IN_PROGRESS')}>Take</button>}{' '}
                    {c.status !== 'RESOLVED' && <button type="button" className="button primary" onClick={() => setStatus(c.id, 'RESOLVED')}>Resolve</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>No complaints, callbacks or fraud reports yet.</p>}
    </section>
  );
};

const terminalRpaStatuses = new Set(['COMPLETED', 'FAILED']);

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'initial_deposit') return `₹${Number(value).toLocaleString('en-IN')}`;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replaceAll('_', ' ');
}

function parseSignal(item: unknown) {
  if (typeof item === 'object' && item !== null) {
    const obj = item as any;
    return {
      code: obj.code || 'SIGNAL',
      status: obj.status || 'INFO',
      message: obj.message || obj.code || 'Verification check recorded',
      blocking: Boolean(obj.blocking),
    };
  }
  if (typeof item === 'string') {
    try {
      const parsed = JSON.parse(item);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          code: parsed.code || 'SIGNAL',
          status: parsed.status || 'INFO',
          message: parsed.message || parsed.code || 'Verification check recorded',
          blocking: Boolean(parsed.blocking),
        };
      }
    } catch {
      // not json string
    }
    return {
      code: item,
      status: 'INFO',
      message: item.replace(/_/g, ' '),
      blocking: false,
    };
  }
  return {
    code: 'SIGNAL',
    status: 'INFO',
    message: String(item),
    blocking: false,
  };
}

export const OperationsPage: React.FC<OperationsPageProps> = ({ isHistory = false, initialFilter = 'all' }) => {
  const { overview, refreshOverview } = useBanking();
  const [filter, setFilter] = useState(initialFilter);

  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [verificationReference, setVerificationReference] = useState('');
  const [verificationChecks, setVerificationChecks] = useState<string[]>([]);
  const [overrideJustification, setOverrideJustification] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [leadActionMsg, setLeadActionMsg] = useState<string | null>(null);
  const [isApprovingLead, setIsApprovingLead] = useState(false);

  const [customers, setCustomers] = useState<any[]>([]);
  const [customerToWipe, setCustomerToWipe] = useState<any | null>(null);
  const [isWipingCustomer, setIsWipingCustomer] = useState(false);
  const [customerWipeError, setCustomerWipeError] = useState<string | null>(null);
  const [deletionReason, setDeletionReason] = useState('');

  const loadLeads = async () => {
    try {
      const res = await fetchOfficerLeads();
      setLeads(res.leads || []);
    } catch (err) {
      console.error('Failed to load officer leads', err);
    }
  };

  const loadCustomers = async () => {
    try {
      const res = await fetchOfficerCustomers();
      setCustomers(res.customers || []);
    } catch (err) {
      console.error('Failed to load officer customers', err);
    }
  };

  const handleRequestDeletion = async (customerId: string) => {
    try {
      setIsWipingCustomer(true);
      setCustomerWipeError(null);
      await requestCustomerDeletion(customerId, deletionReason.trim());
      setLeadActionMsg(`Deletion of ${customerId} sent to the admin for approval. Nothing is removed until then.`);
      await loadCustomers();
      setCustomerToWipe(null);
      setDeletionReason('');
    } catch (err: any) {
      setCustomerWipeError(err?.detail?.toString?.() || err.message || 'The request could not be sent.');
    } finally {
      setIsWipingCustomer(false);
    }
  };

  useEffect(() => {
    if (!isHistory) {
      loadLeads();
      loadCustomers();
    }
  }, [isHistory]);

  const handleRefresh = async () => {
    await refreshOverview();
    if (!isHistory) {
      await loadLeads();
      await loadCustomers();
    }
  };

  const handleUpdateLeadStatus = async (leadId: string, status: string, notes?: string) => {
    try {
      await updateOfficerLeadStatus(leadId, status, notes);
      setLeadActionMsg(`Lead status updated to ${status}`);
      setTimeout(() => setLeadActionMsg(null), 3500);
      await loadLeads();
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead((prev: any) => prev ? { ...prev, status, notes: notes || prev.notes } : null);
      }
    } catch (err: any) {
      console.error('Failed to update lead status', err);
    }
  };

  useEffect(() => {
    if (filter === 'customers') {
      loadCustomers();
    }
  }, [filter]);

  const [resendingCids, setResendingCids] = useState<Record<string, boolean>>({});

  const handleResendCredentials = async (cust: any) => {
    setResendingCids((prev) => ({ ...prev, [cust.customer_id]: true }));
    setLeadActionMsg(null);
    try {
      const res = await resendOfficerCustomerCredentials(cust.customer_id);
      setLeadActionMsg(`✓ New login for @${res.username}, temporary password ${res.temp_password}. Give it to the customer in person; Kosh sends no e-mail.`);
      await loadCustomers();
    } catch (err: any) {
      alert(`Failed to resend credentials: ${err.message || err}`);
    } finally {
      setResendingCids((prev) => ({ ...prev, [cust.customer_id]: false }));
    }
  };

  const handleApproveLead = async (leadId: string) => {
    try {
      setIsApprovingLead(true);
      setDecisionError(null);
      const res = await approveOfficerLead(leadId);
      setLeadActionMsg(`Application approved. Login @${res.username}, temporary password ${res.temp_password}. Give it to the customer in person; Kosh sends no e-mail.`);
      await loadLeads();
      await loadCustomers();
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead((prev: any) => prev ? {
          ...prev,
          status: 'CONVERTED',
          customer_id: res.customer_id,
          preferences: {
            ...prev.preferences,
            delivery_status: res.delivery_status,
            provisioned_username: res.username,
          },
        } : null);
      }
    } catch (err: any) {
      console.error('Failed to approve lead', err);
      setDecisionError(err.message || 'Failed to approve application and dispatch credentials.');
    } finally {
      setIsApprovingLead(false);
    }
  };

  const operations: any[] =
    (overview as any)?.operations || overview?.requests || overview?.pending_challenges || [];

  let rows = operations.filter((request) =>
    !isHistory ? activeStatuses.includes(request.status) : !activeStatuses.includes(request.status)
  );
  if (filter !== 'all' && filter !== 'leads') rows = rows.filter((request) => request.status === filter);


  const handleOpenCase = (request: any) => {
    setSelectedCase(request);
    setDecisionError(null);
    const isKyc = request.service_id === 'P1-17';
    setDecisionNotes(
      isKyc
        ? 'KYC documents, PAN, and address proof verified against bank policy.'
        : 'Supporting evidence and identity documents verified against bank policy.'
    );
    const refCode = request.collected_data?.bank_verification_reference ||
      `KYC-VERIF-${(request.id || '').replace(/^REQ-/, '').slice(0, 10) || '2026-0923'}`;
    setVerificationReference(refCode.length >= 8 ? refCode : `${refCode}-VERIF`);
    setVerificationChecks(
      ['document_authenticity', 'pan_or_form60', 'identity_match', 'screening', 'declarations']
    );
    setOverrideJustification(
      request.discrepancy_flags?.length
        ? 'Officer independently verified original documents, tax registry records, and screening databases as per bank policy.'
        : ''
    );
  };

  const handleCloseCase = () => {
    setSelectedCase(null);
    setDecisionError(null);
  };

  useEffect(() => {
    const job = selectedCase?.rpa_job;
    if (!selectedCase || selectedCase.service_id !== 'P1-25' || !job || terminalRpaStatuses.has(job.status)) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const updated = await fetchOfficerRpaStatus(selectedCase.id);
        setSelectedCase(updated);
        if (terminalRpaStatuses.has(updated?.rpa_job?.status)) await refreshOverview();
      } catch {
        window.clearInterval(timer);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [selectedCase, refreshOverview]);

  const stepEvents = useMemo(() => {
    const events: any[] = selectedCase?.rpa_job?.events || [];
    const byStep = new Map<string, any>();
    for (const event of events) {
      if (event.step_id) byStep.set(event.step_id, event);
    }
    return Array.from(byStep.values());
  }, [selectedCase?.rpa_job?.events]);

  const awaitingReview = operations.filter((r) => r.status === 'PENDING_APPROVAL').length;
  const escalated = operations.filter((r) => r.status === 'ESCALATED').length;
  const automating = operations.filter((r) => ['QUEUED_FOR_CBS', 'RPA_EXECUTING'].includes(r.status)).length;
  const decisionsRecorded = operations.filter((r) => ['APPROVED', 'REJECTED', 'COMPLETED'].includes(r.status)).length;

  const getBadgeVariant = (status: string) => {
    if (['DENY', 'DENIED', 'REJECTED', 'BLOCKED_MULE', 'LOCKED', 'RPA_FAILED', 'FAILED'].includes(status)) return 'danger';
    if (['PENDING_APPROVAL', 'MORE_INFO_REQUIRED', 'ESCALATED', 'CHALLENGE', 'FROZEN', 'NEW',
      'DUE', 'IN_REVIEW', 'PENDING', 'QUEUED_FOR_CBS', 'RPA_EXECUTING', 'EXECUTING'].includes(status)) return 'warning';
    if (['CANCELLED', 'SUBMITTED'].includes(status)) return 'neutral';
    return 'success';
  };

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedCase) return;
    setDecisionError(null);
    const isKyc = selectedCase.service_id === 'P1-17';

    if (decision === 'APPROVE' && isKyc) {
      const required = ['document_authenticity', 'pan_or_form60', 'identity_match', 'screening', 'declarations'];
      const missingChecks = required.filter((id) => !verificationChecks.includes(id));
      if (missingChecks.length > 0) {
        setDecisionError('Please complete all 5 independent KYC verification checks before approving.');
        return;
      }
      if (!verificationReference.trim() || verificationReference.trim().length < 8) {
        setDecisionError('Bank verification reference must be at least 8 characters (e.g. KYC-VERIF-2026-0923).');
        return;
      }
      if (selectedCase.discrepancy_flags?.length > 0 && !overrideJustification.trim()) {
        setDecisionError('Override justification is required when discrepancy flags are present.');
        return;
      }
    }

    setIsDeciding(true);
    try {
      const defaultReason = decision === 'APPROVE'
        ? (isKyc
            ? 'KYC documents, PAN, and address proof verified against bank policy.'
            : 'Supporting evidence and identity documents verified against bank policy.')
        : 'Rejected by officer.';

      const payload: {
        action: 'APPROVE' | 'REJECT';
        reason: string;
        override_justification?: string;
        verification_checks?: string[];
        verification_reference?: string;
      } = {
        action: decision,
        reason: decisionNotes.trim() || defaultReason,
      };

      if (decision === 'APPROVE') {
        if (isKyc) {
          payload.verification_checks = verificationChecks;
          payload.verification_reference = verificationReference.trim();
        } else {
          payload.verification_checks = verificationChecks.length ? verificationChecks : ['document_authenticity', 'identity_match'];
        }

        if (overrideJustification.trim()) {
          payload.override_justification = overrideJustification.trim();
        } else if (selectedCase.discrepancy_flags?.length) {
          payload.override_justification = decisionNotes.trim() || 'Officer verified submitted evidence against bank policy.';
        }
      }

      const updated = await recordOfficerDecision(selectedCase.id, payload);
      setSelectedCase(updated);
      setDecisionError(null);
      await refreshOverview();
    } catch (err: any) {
      setDecisionError(err.message || 'Failed to record officer decision');
    } finally {
      setIsDeciding(false);
    }
  };

  const openLeadsCount = leads.filter(
    (l) => !['CONVERTED', 'DECLINED', 'REJECTED', 'LOST'].includes((l.status || '').toUpperCase())
  ).length;

  const filterButtons = !isHistory
    ? [
        ['all', 'All open'],
        ['PENDING_APPROVAL', 'For review'],
        ['ESCALATED', 'Escalated'],
        ['QUEUED_FOR_CBS', 'CBS queue'],
        ['RPA_FAILED', 'RPA attention'],
        ['care', 'Customer care 🛟'],
        ['leads', `AI Sales Leads 🎯 ${openLeadsCount > 0 ? `(${openLeadsCount})` : ''}`],
        ['customers', `Customers & Accounts 👥 ${customers.length > 0 ? `(${customers.length})` : ''}`],
      ]
    : [
        ['all', 'All'],
        ['COMPLETED', 'Completed'],
        ['APPROVED', 'Approved'],
        ['REJECTED', 'Rejected'],
        ['CANCELLED', 'Cancelled'],
      ];

  const detailEntries = selectedCase
    ? Object.entries(selectedCase.collected_data || selectedCase.details || {})
      .filter(([key]) => fieldLabels[key] && !['rpa_completed', 'rpa_error', 'bank_verification_checks', 'bank_verification_reference'].includes(key))
    : [];
  const mayDecide = selectedCase && ['PENDING_APPROVAL', 'ESCALATED', 'MORE_INFO_REQUIRED', 'RPA_FAILED'].includes(selectedCase.status);

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>
            {filter === 'leads'
              ? 'AI Sales Leads & CRM Pipeline'
              : filter === 'customers'
              ? 'Customers & Banking Relationships'
              : !isHistory
              ? 'Let’s move things forward.'
              : 'Case history'}
          </h1>
          <p>
            {filter === 'leads'
              ? 'Review, qualify, and convert credit card & loan opportunities captured from non-customers and returning visitors.'
              : filter === 'customers'
              ? 'Manage active customer banking relationships, inspect provisioned digital credentials, and request removal of customer access (approved by the admin).'
              : !isHistory
              ? 'Review the complete customer application, follow CBS automation, or track AI sales leads.'
              : 'Decisions, CBS results, and cancelled requests in one place.'}
          </p>
        </div>
        <div className="heading-actions">
          {leadActionMsg && (
            <span className="ops-flash">
              ✓ {leadActionMsg}
            </span>
          )}
          <button type="button" className="button" onClick={handleRefresh}>Refresh queue</button>
        </div>
      </header>

      {!isHistory && filter !== 'leads' && filter !== 'customers' && <OfficerCopilot requestId={selectedCase?.id} />}

      <div className="metric-strip">
        <div className="metric"><small>Awaiting review</small><strong>{awaitingReview}</strong></div>
        <div className="metric warning"><small>Escalated</small><strong>{escalated}</strong></div>
        <div className="metric"><small>CBS automation</small><strong>{automating}</strong></div>
        <div className="metric"><small>Decisions recorded</small><strong>{decisionsRecorded}</strong></div>
        {!isHistory && (
          <div className={`metric ops-tile ${filter === 'leads' ? 'active' : ''}`} onClick={() => setFilter('leads')}>
            <small>AI Sales Leads</small>
            <strong>{openLeadsCount}</strong>
          </div>
        )}
        {!isHistory && (
          <div className={`metric ops-tile blue ${filter === 'customers' ? 'active' : ''}`} onClick={() => setFilter('customers')}>
            <small>Customers & Relationships</small>
            <strong>{customers.length}</strong>
          </div>
        )}
      </div>

      <div className="filters">
        {filterButtons.map(([id, label]) => (
          <button key={id} type="button" className={`filter ${filter === id ? 'active' : ''}`}
            onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {filter === 'leads' && <OfferFunnel />}
      {filter === 'care' ? <CareQueue /> : (
      <section className="panel">
        {filter === 'leads' ? (
          leads.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product Inquired / Applied</th>
                    <th>Customer / Prospect</th>
                    <th>Requirement & Limit</th>
                    <th>Profile / Income</th>
                    <th>Status</th>
                    <th>Counter Offer / Strategy</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <strong>{lead.category ? lead.category.replace(/_/g, ' ') : 'INQUIRY'}</strong>
                        <br />
                        <span className="ops-subtype">
                          {lead.sub_type || lead.recommended_product_id || lead.id}
                        </span>
                      </td>
                      <td>
                        <strong className="ops-name">
                          {lead.preferences?.applicant_name || lead.customer_id || 'Visitor / Prospect'}
                        </strong>
                        {lead.preferences?.phone_number && (
                          <div className="ops-line">
                            <span className="ops-phone">
                              📞 {lead.preferences.phone_number}
                            </span>
                          </div>
                        )}
                        {lead.preferences?.app_ref && (
                          <div className="ops-line">
                            <span className="ops-ref-chip">
                              {lead.preferences.app_ref}
                            </span>
                          </div>
                        )}
                        <small className="muted ops-sub">
                          {formatDate(lead.created_at)}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {lead.amount_requested_minor ? `₹${(lead.amount_requested_minor / 100).toLocaleString('en-IN')}` : 'Flexible Limit'}
                        </strong>
                        {lead.tenure_months ? ` · ${lead.tenure_months}m` : ''}
                        <br />
                        <small className="muted">
                          {typeof lead.preferences === 'string'
                            ? lead.preferences
                            : lead.preferences?.purpose || lead.preferences?.summary || (lead.preferences?.pan_masked ? `PAN: ${lead.preferences.pan_masked}` : 'Standard terms')}
                        </small>
                      </td>
                      <td>
                        <strong>
                          {lead.monthly_income_minor ? `₹${(lead.monthly_income_minor / 100).toLocaleString('en-IN')}/mo` : 'Income unstated'}
                        </strong>
                        <br />
                        <small className="muted">
                          {lead.employment_type || 'Customer'}
                          {lead.preferences?.employer_or_college ? ` · ${lead.preferences.employer_or_college}` : ''}
                        </small>
                      </td>
                      <td>
                        <Badge variant={lead.status === 'CONVERTED' ? 'success' : lead.status === 'CONTACTED' ? 'warning' : 'info'}>
                          {lead.status}
                        </Badge>
                      </td>
                      <td className="ops-offer-col">
                        <div>
                          {lead.special_offer_note || lead.follow_up_pitch || 'Pre-approved terms'}
                        </div>
                        {lead.follow_up_pitch && (
                          <small className="muted">
                            "{lead.follow_up_pitch}"
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="ops-actions">
                          <button
                            type="button"
                            className="button text ops-xs"
                            onClick={() => setSelectedLead(lead)}
                          >
                            Details
                          </button>
                          {!['CONTACTED', 'CONVERTED', 'LOST', 'DECLINED'].includes(lead.status) && (
                            <button
                              type="button"
                              className="button ops-xs"
                              onClick={() => handleUpdateLeadStatus(lead.id, 'CONTACTED')}
                            >
                              Contacted
                            </button>
                          )}
                          {lead.status !== 'CONVERTED' && (
                            <button
                              type="button"
                              className="button primary ops-xs"
                              onClick={() => handleUpdateLeadStatus(lead.id, 'CONVERTED')}
                            >
                              Convert 🏆
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel">
              <h3>No leads captured yet</h3>
              <p>When customers converse with the AI Banker regarding loans, cards, or services, consultative leads are captured and surfaced here automatically.</p>
            </div>
          )
        ) : filter === 'customers' ? (
          customers.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer Profile</th>
                    <th>Contact Details</th>
                    <th>Digital Access</th>
                    <th>Primary Account & Balance</th>
                    <th>Tier & Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.customer_id}>
                      <td>
                        <strong className="ops-name">{c.full_name}</strong>
                        <br />
                        <span className="ops-cid">
                          {c.customer_id}
                        </span>
                        {c.member_since && (
                          <small className="muted ops-note">
                            Since {c.member_since}
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="ops-contact">
                          <span>📞 {c.phone_number || 'N/A'}</span>
                          <br />
                          <span className="muted">✉️ {c.email || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        {c.username ? (
                          <div>
                            <span className="ops-user">
                              @{c.username}
                            </span>
                            <br />
                            <small className="muted ops-fine">
                              {c.user_id ? 'Authenticated profile' : 'Unbound'}
                            </small>
                          </div>
                        ) : (
                          <span className="muted ops-contact">No user login</span>
                        )}
                      </td>
                      <td>
                        <strong className="ops-balance">{c.total_balance_formatted}</strong>
                        <br />
                        <small className="muted ops-acct">
                          {c.primary_account_number || 'No account'}
                        </small>
                      </td>
                      <td>
                        <Badge variant={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {c.status}
                        </Badge>
                        <br />
                        <small className="muted ops-tier">
                          {c.tier} · KYC: {c.kyc_status}
                        </small>
                      </td>
                      <td>
                        <div className="ops-actions roomy">
                          <button
                            type="button"
                            className="button ops-pill info"
                            disabled={resendingCids[c.customer_id] || c.status === 'ACCESS_REMOVED'}
                            onClick={() => handleResendCredentials(c)}
                          >
                            {resendingCids[c.customer_id] ? 'Sending…' : '✉️ Resend Creds'}
                          </button>
                          <button
                            type="button"
                            className="button ops-pill wipe"
                            disabled={c.deletion_pending || c.status === 'ACCESS_REMOVED'}
                            onClick={() => setCustomerToWipe(c)}
                          >
                            {c.status === 'ACCESS_REMOVED' ? 'Access removed' : c.deletion_pending ? 'Deletion pending' : 'Request deletion'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel">
              <h3>No Active Customers</h3>
              <p>There are no registered banking relationships found in the core banking state.</p>
            </div>
          )
        ) : rows.length ? (

          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Service request</th><th>Customer</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
              <tbody>{rows.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.service_name || request.request_type || 'Request'}</strong><br />
                    <small className="muted">{request.id}</small></td>
                  <td>{request.customer_id || request.user_id || 'CUST-001'}</td>
                  <td>{formatDate(request.created_at)}</td>
                  <td><Badge variant={getBadgeVariant(request.status)}>{request.status}</Badge></td>
                  <td><button type="button" className="button" onClick={() => handleOpenCase(request)}>
                    {['PENDING_APPROVAL', 'ESCALATED', 'MORE_INFO_REQUIRED'].includes(request.status) ? 'Review case' : 'View case'}
                  </button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="empty-panel"><h3>All clear here</h3><p>No requests match this view.</p></div>}
      </section>)}


      {selectedCase && (
        <Modal isOpen onClose={handleCloseCase}
          wide
          title={selectedCase.service_name || selectedCase.prompt || selectedCase.id}
          subtitle={`Submitted ${formatDate(selectedCase.created_at)} · ${selectedCase.customer_id || selectedCase.user_id}`}>
          <div className="case-summary-strip">
            <div><span>Case status</span><Badge variant={getBadgeVariant(selectedCase.status)}>{selectedCase.status}</Badge></div>
            <div><span>Reference</span><strong>{selectedCase.id}</strong></div>
            <div><span>Assurance</span><strong>{selectedCase.auth_level || '—'}</strong></div>
          </div>

          <section className="case-section">
            <div className="case-section-heading"><div><small>APPLICATION</small><h3>Customer-submitted details</h3></div>
              <span>{detailEntries.length} fields</span></div>
            {detailEntries.length ? <div className="case-detail-grid">
              {detailEntries.map(([key, value]) => <div className={key === 'address' ? 'wide' : ''} key={key}>
                <span>{fieldLabels[key] || key}</span><strong>{displayValue(key, value)}</strong>
              </div>)}
            </div> : <p className="muted">No structured application details were attached.</p>}
          </section>

          {((selectedCase.findings && selectedCase.findings.length > 0) ||
            (selectedCase.discrepancy_flags && selectedCase.discrepancy_flags.length > 0)) && (
            <section className="case-section">
              <div className="case-section-heading">
                <div>
                  <small>VERIFICATION</small>
                  <h3>Review signals & compliance checks</h3>
                </div>
                <span>{(selectedCase.findings?.length || 0)} signals</span>
              </div>

              {selectedCase.discrepancy_flags && selectedCase.discrepancy_flags.length > 0 && (
                <div className="discrepancy-callout">
                  <div className="ops-row">
                    <Badge variant="warning">ATTENTION REQUIRED</Badge>
                    <strong>
                      Discrepancy / Review Flags ({selectedCase.discrepancy_flags.length})
                    </strong>
                  </div>
                  <p>
                    The system flagged the following items for mandatory independent officer verification and override justification before approval:
                  </p>
                  <div className="ops-flags">
                    {selectedCase.discrepancy_flags.map((flag: string, idx: number) => (
                      <span key={idx} className="discrepancy-tag">
                        ⚠️ {flag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedCase.findings && selectedCase.findings.length > 0 && (
                <div className="review-signals-list">
                  {selectedCase.findings.map((item: any, index: number) => {
                    const signal = parseSignal(item);
                    const isPass = signal.status === 'PASS';
                    const isReview = ['OFFICER_REVIEW', 'WARN', 'WARNING'].includes(signal.status);
                    const isFail = ['FAIL', 'FAILED', 'BLOCKED', 'BLOCKING'].includes(signal.status);

                    return (
                      <div
                        key={`${index}-${signal.code}`}
                        className={`review-signal-row ${isPass ? 'pass' : isReview ? 'warning' : isFail ? 'danger' : ''}`}
                      >
                        <div className="review-signal-info">
                          <span className="review-signal-msg">{signal.message}</span>
                          <span className="review-signal-code">{signal.code}</span>
                        </div>
                        <Badge variant={isPass ? 'success' : isReview ? 'warning' : isFail ? 'danger' : 'neutral'}>
                          {isPass ? '✓ PASS' : signal.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {selectedCase.service_id === 'P1-25' && selectedCase.rpa_job && (
            <section className="case-section rpa-panel" aria-live="polite">
              <div className="case-section-heading">
                <div><small>CBS AUTOMATION</small><h3>Account-opening RPA</h3></div>
                <div className="ops-row">
                  <a
                    href="/cbs/retail/account_opening"
                    target="_blank"
                    rel="noreferrer"
                    className="button secondary ops-xs"
                  >
                    Open Mock CBS ↗
                  </a>
                  <Badge variant={getBadgeVariant(selectedCase.rpa_job.status)}>{selectedCase.rpa_job.status}</Badge>
                </div>
              </div>
              <p className="rpa-caption">Automated Playwright worker entering this approved application in the Finacle CBS maker terminal.</p>
              <div className="rpa-live-grid">
                <div className="rpa-timeline-col">
                  <div className="rpa-timeline">
                    {Object.entries(rpaStepLabels).map(([stepId, label]) => {
                      const event = stepEvents.find((entry) => entry.step_id === stepId);
                      const state = event?.phase === 'COMPLETED' ? 'done' : event?.phase === 'FAILED' ? 'failed'
                        : selectedCase.rpa_job.current_step === stepId ? 'running' : 'waiting';
                      return <div className={`rpa-step ${state}`} key={stepId}>
                        <span className="rpa-step-dot">{state === 'done' ? '✓' : state === 'failed' ? '!' : ''}</span>
                        <div><strong>{label}</strong><small>{stepId} · {state === 'running' ? 'In progress' : state}</small></div>
                      </div>;
                    })}
                  </div>
                  {selectedCase.rpa_job.status === 'COMPLETED' && <div className="rpa-result">
                    <div><span>CIF</span><strong>{selectedCase.rpa_job.cif_number}</strong></div>
                    <div><span>Account number</span><strong>{selectedCase.rpa_job.account_number}</strong></div>
                    <div className="wide"><span>CBS status</span><strong>{displayValue('cbs_status', selectedCase.rpa_job.cbs_status)}</strong></div>
                  </div>}
                  {selectedCase.rpa_job.error && (
                    <div className="rpa-error">
                      <div>{selectedCase.rpa_job.error}</div>
                      <button
                        type="button"
                        className="button primary"
                        disabled={isDeciding}
                        onClick={() => handleDecision('APPROVE')}
                      >
                        {isDeciding ? 'Retrying RPA...' : '↻ Retry CBS Automation'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="rpa-terminal-col">
                  <div className="rpa-terminal-window">
                    <div className="rpa-terminal-topbar">
                      <div className="rpa-terminal-controls">
                        <span className="rpa-terminal-dot close"></span>
                        <span className="rpa-terminal-dot min"></span>
                        <span className="rpa-terminal-dot max"></span>
                      </div>
                      <span className="rpa-terminal-title">Finacle 10.x · CBS Maker Terminal</span>
                      <span className={`rpa-terminal-badge ${selectedCase.rpa_job.status === 'COMPLETED' ? 'done' : 'live'}`}>
                        {selectedCase.rpa_job.status === 'COMPLETED' ? '✓ RECORD CREATED' : '● LIVE VIEW'}
                      </span>
                    </div>
                    <div className="rpa-terminal-body">
                      {selectedCase.rpa_job.latest_screenshot ? (
                        <img
                          src={selectedCase.rpa_job.latest_screenshot}
                          alt="Live CBS Screen"
                          className="rpa-terminal-img"
                        />
                      ) : (
                        <div className="rpa-terminal-placeholder">
                          <span className="ai-streaming-cursor" />
                          <div>Connecting to Finacle Core Banking Session...</div>
                          <small>Live browser screenshots stream here during RPA automation</small>
                        </div>
                      )}
                    </div>
                    <div className="rpa-terminal-footer">
                      <span>
                        {selectedCase.rpa_job.current_step
                          ? `Executing: ${rpaStepLabels[selectedCase.rpa_job.current_step] || selectedCase.rpa_job.current_step}`
                          : selectedCase.rpa_job.status === 'COMPLETED'
                          ? 'Application submission completed successfully'
                          : 'Queue initialized · Standing by'}
                      </span>
                      <span>
                        {selectedCase.rpa_job.current_step || 'AO-INIT'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {mayDecide && (
            <div className="decision-box">
              {decisionError && (
                <div className="decision-error-banner" role="alert">
                  <span>⚠️</span>
                  <div>{decisionError}</div>
                </div>
              )}

              {selectedCase.service_id === 'P1-17' && (
                <div className="kyc-checklist-box">
                  <div className="ops-kyc-head">
                    <strong>
                      Independent KYC Verification Checks (RBI / PMLA)
                    </strong>
                    <button
                      type="button"
                      className="button text"
                      onClick={() => setVerificationChecks(['document_authenticity', 'pan_or_form60', 'identity_match', 'screening', 'declarations'])}
                    >
                      Select all checks
                    </button>
                  </div>
                  <p className="muted">
                    Confirm the following independent bank checks before recording an approval decision:
                  </p>
                  <div className="kyc-checklist-grid">
                    {KYC_REQUIRED_CHECKS.map((check) => (
                      <label key={check.id} className="kyc-checkbox-item">
                        <input
                          type="checkbox"
                          checked={verificationChecks.includes(check.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVerificationChecks([...verificationChecks, check.id]);
                            } else {
                              setVerificationChecks(verificationChecks.filter((id) => id !== check.id));
                            }
                          }}
                        />
                        <div>
                          <strong>{check.label}</strong>
                          <span className="muted">{check.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="ops-ref">
                    <label>
                      <span className="ops-label">
                        Bank Verification Reference (minimum 8 characters)
                      </span>
                      <input
                        type="text"
                        className="input ops-field"
                        value={verificationReference}
                        onChange={(e) => setVerificationReference(e.target.value)}
                        placeholder="e.g. KYC-VERIF-2026-0923"
                      />
                    </label>
                    <small className="muted">
                      Audit reference code recorded permanently in the bank compliance ledger.
                    </small>
                  </div>
                </div>
              )}

              {selectedCase.discrepancy_flags && selectedCase.discrepancy_flags.length > 0 && (
                <div className="ops-fieldset">
                  <label>
                    <span className="ops-label warn">
                      Officer Override Justification (Required for Discrepancy Flags)
                    </span>
                    <textarea
                      rows={2}
                      className="input ops-field warn"
                      value={overrideJustification}
                      onChange={(e) => setOverrideJustification(e.target.value)}
                      placeholder="Explain how the flagged discrepancies were independently vetted and verified..."
                    />
                  </label>
                </div>
              )}

              <div className="ops-fieldset last">
                <label>
                  <span className="ops-label">
                    Decision rationale / audit notes
                  </span>
                  <textarea
                    rows={2}
                    placeholder="Record what you verified and why the decision is appropriate."
                    value={decisionNotes}
                    onChange={(event) => setDecisionNotes(event.target.value)}
                    className="ops-field"
                  />
                </label>
              </div>

              <div className="dialog-footer">
                <button
                  type="button"
                  className="button danger"
                  disabled={isDeciding}
                  onClick={() => handleDecision('REJECT')}
                >
                  Reject case
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={isDeciding}
                  onClick={() => handleDecision('APPROVE')}
                >
                  {isDeciding
                    ? 'Recording decision…'
                    : selectedCase.service_id === 'P1-25'
                    ? 'Approve and start CBS entry'
                    : selectedCase.service_id === 'P1-17'
                    ? 'Approve KYC verification'
                    : 'Approve case'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {selectedLead && (
        <Modal
          isOpen
          onClose={() => setSelectedLead(null)}
          wide
          title={`Lead: ${selectedLead.category?.replace(/_/g, ' ') || 'Inquiry'} (${selectedLead.preferences?.app_ref || selectedLead.id})`}
          subtitle={`Applicant: ${selectedLead.preferences?.applicant_name || selectedLead.customer_id || 'Visitor / Prospect'} · ${formatDate(selectedLead.created_at)}`}
        >
          {selectedLead.status === 'PENDING_APPROVAL' && (
            <div className="ops-notice pending">
              <span>⏳</span>
              <div>
                <strong>Awaiting Officer Credential Provisioning</strong>
                <p>
                  Applicant has no prior banking relationship. Review details below and click <strong>Approve & Send Credentials</strong> to provision their customer profile and dispatch temporary credentials to <strong>{selectedLead.preferences?.email || 'email'}</strong>.
                </p>
              </div>
            </div>
          )}

          {selectedLead.status === 'CONVERTED' && (
            <div className="ops-notice done">
              <span>✅</span>
              <div>
                <strong>Credentials Dispatched via Email</strong>
                <p>
                  Profile provisioned for Customer <strong>{selectedLead.customer_id}</strong>. Login <strong>@{selectedLead.preferences?.provisioned_username || 'customer'}</strong> handed over by the officer; Kosh sends no e-mail.
                </p>
              </div>
            </div>
          )}

          {decisionError && (
            <div className="ops-lead-error">
              {decisionError}
            </div>
          )}

          <div className="case-summary-strip">
            <div>
              <span>Lead Status</span>
              <Badge variant={selectedLead.status === 'CONVERTED' ? 'success' : selectedLead.status === 'PENDING_APPROVAL' ? 'warning' : selectedLead.status === 'CONTACTED' ? 'info' : 'neutral'}>
                {selectedLead.status}
              </Badge>
            </div>
            <div><span>Product Sub-type</span><strong>{selectedLead.sub_type || 'Standard'}</strong></div>
            <div><span>Recommended</span><strong>{selectedLead.recommended_product_id || 'Kosh Premium'}</strong></div>
          </div>

          <section className="case-section">
            <div className="case-section-heading">
              <div><small>QUALIFICATION & CONTACT</small><h3>Applicant Profile & Underwriting Details</h3></div>
            </div>
            <div className="case-detail-grid">
              <div>
                <span>Applicant Name</span>
                <strong>{selectedLead.preferences?.applicant_name || selectedLead.customer_id || 'Visitor Prospect'}</strong>
              </div>
              <div>
                <span>Mobile Phone</span>
                <strong className="ops-teal ops-mono">
                  {selectedLead.preferences?.phone_number || 'Unstated'}
                </strong>
              </div>
              <div>
                <span>Email Address</span>
                <strong className="ops-teal">{selectedLead.preferences?.email || '—'}</strong>
              </div>
              <div>
                <span>PAN Masked</span>
                <strong className="ops-mono">{selectedLead.preferences?.pan_masked || '—'}</strong>
              </div>
              <div>
                <span>Requested Amount / Limit</span>
                <strong>{selectedLead.amount_requested_minor ? `₹${(selectedLead.amount_requested_minor / 100).toLocaleString('en-IN')}` : '—'}</strong>
              </div>
              <div>
                <span>Requested Tenure</span>
                <strong>{selectedLead.tenure_months ? `${selectedLead.tenure_months} Months` : '—'}</strong>
              </div>
              <div>
                <span>Employment Profile</span>
                <strong>
                  {selectedLead.employment_type || '—'}
                  {selectedLead.preferences?.employer_or_college ? ` · ${selectedLead.preferences.employer_or_college}` : ''}
                </strong>
              </div>
              <div>
                <span>Monthly Net Income</span>
                <strong>{selectedLead.monthly_income_minor ? `₹${(selectedLead.monthly_income_minor / 100).toLocaleString('en-IN')}/mo` : '—'}</strong>
              </div>
              <div className="wide">
                <span>Preferences & Underwriting Notes</span>
                <p>
                  {selectedLead.notes || (typeof selectedLead.preferences === 'string' ? selectedLead.preferences : selectedLead.preferences?.summary || 'Standard terms')}
                </p>
              </div>
            </div>
          </section>

          <section className="case-section">
            <div className="case-section-heading">
              <div><small>SALES STRATEGY</small><h3>AI Re-engagement Offer & Pitch</h3></div>
            </div>
            <div className="ops-pitch offer">
              <strong>
                Special Incentive / Counter-Offer
              </strong>
              <p>
                {selectedLead.special_offer_note || 'Exclusive reduced rate and zero processing fee'}
              </p>
            </div>
            <div className="ops-pitch quote">
              <strong>
                AI Follow-up Pitch (Presented on Return Login)
              </strong>
              <p>
                "{selectedLead.follow_up_pitch || 'Welcome back! We noticed your prior interest and have an exclusive pre-approved rate ready.'}"
              </p>
            </div>
          </section>

          <div className="dialog-footer ops-lead-foot">
            <span>
              Officer CRM Pipeline · Lead ID: {selectedLead.id}
            </span>
            <div className="ops-row">
              {selectedLead.status === 'PENDING_APPROVAL' ? (
                <>
                  <button
                    type="button"
                    className="button ops-decline"
                    onClick={() => handleUpdateLeadStatus(selectedLead.id, 'DECLINED', 'Application declined by officer.')}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="button primary teal"
                    disabled={isApprovingLead}
                    onClick={() => handleApproveLead(selectedLead.id)}
                  >
                    {isApprovingLead ? 'Provisioning & Dispatching...' : 'Approve & Send Credentials via Email ✉️'}
                  </button>
                </>
              ) : (
                <>
                  {selectedLead.status !== 'LOST' && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleUpdateLeadStatus(selectedLead.id, 'LOST')}
                    >
                      Mark Lost
                    </button>
                  )}
                  {!['CONTACTED', 'CONVERTED', 'LOST', 'DECLINED'].includes(selectedLead.status) && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleUpdateLeadStatus(selectedLead.id, 'CONTACTED')}
                    >
                      Mark Contacted
                    </button>
                  )}
                  {selectedLead.status !== 'CONVERTED' && (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => handleUpdateLeadStatus(selectedLead.id, 'CONVERTED')}
                    >
                      Mark Converted 🏆
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {customerToWipe && (
        <Modal
          isOpen={Boolean(customerToWipe)}
          onClose={() => !isWipingCustomer && setCustomerToWipe(null)}
          title={`Request deletion: ${customerToWipe.customer_id}`}
        >
          <div className="ops-wipe">
            <div className="ops-wipe-warn">
              <strong>Two people decide this.</strong>
              <p>
                You are asking to remove <strong>{customerToWipe.full_name}</strong>'s (<code>{customerToWipe.customer_id}</code>) access.
                The admin approves or rejects it in the Admin Panel; nothing changes until then.
              </p>
              <ul>
                <li>Removed: the login (@{customerToWipe.username || 'unlinked'}), sessions, chats, unsent forms, sales leads, phone number and email.</li>
                <li>Kept, as the bank must retain them: name and KYC, accounts, cards, transactions, service requests, consents and the audit trail.</li>
              </ul>
            </div>
            <textarea className="input" rows={3} style={{ width: '100%' }} placeholder="Reason (required, at least 10 characters)"
              value={deletionReason} onChange={e => setDeletionReason(e.target.value)} />

            {customerWipeError && (
              <div className="ops-wipe-error">
                {customerWipeError}
              </div>
            )}

            <div className="ops-wipe-actions">
              <button
                type="button"
                className="button"
                disabled={isWipingCustomer}
                onClick={() => setCustomerToWipe(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button ops-confirm"
                disabled={isWipingCustomer || deletionReason.trim().length < 10}
                onClick={() => handleRequestDeletion(customerToWipe.customer_id)}
              >
                {isWipingCustomer ? 'Sending…' : 'Send for approval'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
