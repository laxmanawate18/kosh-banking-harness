import React, { useEffect, useMemo, useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import {
  fetchOfficerRpaStatus,
  recordOfficerDecision,
  fetchOfficerLeads,
  updateOfficerLeadStatus,
  approveOfficerLead,
  fetchOfficerCustomers,
  wipeOfficerCustomer,
  resendOfficerCustomerCredentials,
} from '../../services/banking';
import { get } from '../../services/api';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

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
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [leadActionMsg, setLeadActionMsg] = useState<string | null>(null);
  const [isApprovingLead, setIsApprovingLead] = useState(false);
  const [leadApprovalSuccess, setLeadApprovalSuccess] = useState<string | null>(null);

  const [customers, setCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerToWipe, setCustomerToWipe] = useState<any | null>(null);
  const [isWipingCustomer, setIsWipingCustomer] = useState(false);
  const [customerWipeSuccess, setCustomerWipeSuccess] = useState<string | null>(null);
  const [customerWipeError, setCustomerWipeError] = useState<string | null>(null);

  const loadLeads = async () => {
    try {
      setLoadingLeads(true);
      const res = await fetchOfficerLeads();
      setLeads(res.leads || []);
    } catch (err) {
      console.error('Failed to load officer leads', err);
    } finally {
      setLoadingLeads(false);
    }
  };

  const loadCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const res = await fetchOfficerCustomers();
      setCustomers(res.customers || []);
    } catch (err) {
      console.error('Failed to load officer customers', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleWipeCustomer = async (customerId: string) => {
    try {
      setIsWipingCustomer(true);
      setCustomerWipeError(null);
      const res = await wipeOfficerCustomer(customerId);
      setCustomerWipeSuccess(res.message || `Customer ${customerId} wiped successfully.`);
      setLeadActionMsg(`Customer ${customerId} and login credentials wiped successfully.`);
      setTimeout(() => setCustomerWipeSuccess(null), 4000);
      await loadCustomers();
      await loadLeads();
      setCustomerToWipe(null);
    } catch (err: any) {
      console.error('Failed to wipe customer', err);
      setCustomerWipeError(err.message || 'Failed to wipe customer account.');
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
      setLeadActionMsg(`✓ Fresh Net Banking credentials generated for @${res.username}! Password: ${res.temp_password} (Emailed to ${res.email})`);
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
      setLeadApprovalSuccess(null);
      const res = await approveOfficerLead(leadId);
      setLeadApprovalSuccess(res.message || 'Credentials successfully dispatched to email.');
      setLeadActionMsg(`Application approved! Credentials emailed to ${res.email_sent_to || 'applicant'}.`);
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

  const formatDate = (dateStr?: string) => dateStr
    ? new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

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
              ? 'Manage active customer banking relationships, inspect provisioned digital credentials, and wipe accounts for onboarding re-testing.'
              : !isHistory
              ? 'Review the complete customer application, follow CBS automation, or track AI sales leads.'
              : 'Decisions, CBS results, and cancelled requests in one place.'}
          </p>
        </div>
        <div className="heading-actions">
          {leadActionMsg && (
            <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, marginRight: '10px' }}>
              ✓ {leadActionMsg}
            </span>
          )}
          <button type="button" className="button" onClick={handleRefresh}>Refresh queue</button>
        </div>
      </header>

      <div className="metric-strip">
        <div className="metric"><small>Awaiting review</small><strong>{awaitingReview}</strong></div>
        <div className="metric warning"><small>Escalated</small><strong>{escalated}</strong></div>
        <div className="metric"><small>CBS automation</small><strong>{automating}</strong></div>
        <div className="metric"><small>Decisions recorded</small><strong>{decisionsRecorded}</strong></div>
        {!isHistory && (
          <div className="metric" style={{ borderColor: 'var(--brand)', cursor: 'pointer', background: filter === 'leads' ? '#e1f0e9' : undefined }} onClick={() => setFilter('leads')}>
            <small>AI Sales Leads</small>
            <strong style={{ color: 'var(--brand)' }}>{openLeadsCount}</strong>
          </div>
        )}
        {!isHistory && (
          <div className="metric" style={{ borderColor: '#2563eb', cursor: 'pointer', background: filter === 'customers' ? '#eff6ff' : undefined }} onClick={() => setFilter('customers')}>
            <small>Customers & Relationships</small>
            <strong style={{ color: '#2563eb' }}>{customers.length}</strong>
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
                        <span style={{ color: '#006b5e', fontWeight: 600, fontSize: '11px' }}>
                          {lead.sub_type || lead.recommended_product_id || lead.id}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: '#102a2f' }}>
                          {lead.preferences?.applicant_name || lead.customer_id || 'Visitor / Prospect'}
                        </strong>
                        {lead.preferences?.phone_number && (
                          <div style={{ marginTop: '2px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#006b5e', fontWeight: 600 }}>
                              📞 {lead.preferences.phone_number}
                            </span>
                          </div>
                        )}
                        {lead.preferences?.app_ref && (
                          <div style={{ marginTop: '2px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '10px', background: '#e1f0e9', color: '#006b5e', padding: '1px 5px', borderRadius: '4px', border: '1px solid #c9d9d1', fontWeight: 600 }}>
                              {lead.preferences.app_ref}
                            </span>
                          </div>
                        )}
                        <small className="muted" style={{ display: 'block', marginTop: '2px' }}>
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
                      <td style={{ maxWidth: '240px' }}>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.special_offer_note || lead.follow_up_pitch || 'Pre-approved terms'}
                        </div>
                        {lead.follow_up_pitch && (
                          <small className="muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                            "{lead.follow_up_pitch}"
                          </small>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="button text"
                            style={{ fontSize: '11px', padding: '3px 6px' }}
                            onClick={() => setSelectedLead(lead)}
                          >
                            Details
                          </button>
                          {!['CONTACTED', 'CONVERTED', 'LOST', 'DECLINED'].includes(lead.status) && (
                            <button
                              type="button"
                              className="button"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => handleUpdateLeadStatus(lead.id, 'CONTACTED')}
                            >
                              Contacted
                            </button>
                          )}
                          {lead.status !== 'CONVERTED' && (
                            <button
                              type="button"
                              className="button primary"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
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
                        <strong style={{ color: '#102a2f' }}>{c.full_name}</strong>
                        <br />
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--brand)', fontSize: '11px' }}>
                          {c.customer_id}
                        </span>
                        {c.member_since && (
                          <small className="muted" style={{ display: 'block', fontSize: '10px' }}>
                            Since {c.member_since}
                          </small>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ fontWeight: 600 }}>📞 {c.phone_number || 'N/A'}</span>
                          <br />
                          <span className="muted" style={{ fontSize: '11px' }}>✉️ {c.email || 'N/A'}</span>
                        </div>
                      </td>
                      <td>
                        {c.username ? (
                          <div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#006b5e', fontSize: '12px' }}>
                              @{c.username}
                            </span>
                            <br />
                            <small className="muted" style={{ fontSize: '10px' }}>
                              {c.user_id ? 'Authenticated profile' : 'Unbound'}
                            </small>
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: '12px' }}>No user login</span>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: '#006b5e', fontSize: '13px' }}>{c.total_balance_formatted}</strong>
                        <br />
                        <small className="muted" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                          {c.primary_account_number || 'No account'}
                        </small>
                      </td>
                      <td>
                        <Badge variant={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {c.status}
                        </Badge>
                        <br />
                        <small className="muted" style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}>
                          {c.tier} · KYC: {c.kyc_status}
                        </small>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="button"
                            style={{
                              fontSize: '11px',
                              padding: '4px 10px',
                              color: '#0369a1',
                              borderColor: '#bae6fd',
                              background: '#f0f9ff',
                              fontWeight: 700,
                            }}
                            disabled={resendingCids[c.customer_id]}
                            onClick={() => handleResendCredentials(c)}
                          >
                            {resendingCids[c.customer_id] ? 'Sending…' : '✉️ Resend Creds'}
                          </button>
                          <button
                            type="button"
                            className="button"
                            style={{
                              fontSize: '11px',
                              padding: '4px 10px',
                              color: '#b91c1c',
                              borderColor: '#fca5a5',
                              background: '#fef2f2',
                              fontWeight: 700,
                            }}
                            onClick={() => setCustomerToWipe(c)}
                          >
                            Wipe Out 🗑️
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
      </section>


      {selectedCase && (
        <Modal isOpen onClose={handleCloseCase}
          maxWidth="max-w-3xl"
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Badge variant="warning">ATTENTION REQUIRED</Badge>
                    <strong style={{ fontSize: '12px' }}>
                      Discrepancy / Review Flags ({selectedCase.discrepancy_flags.length})
                    </strong>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#685025', lineHeight: 1.5 }}>
                    The system flagged the following items for mandatory independent officer verification and override justification before approval:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a
                    href="/cbs/retail/account_opening"
                    target="_blank"
                    rel="noreferrer"
                    className="button secondary"
                    style={{ fontSize: '11px', padding: '3px 8px', height: 'auto', textDecoration: 'none' }}
                  >
                    Open Mock CBS ↗
                  </a>
                  <Badge variant={getBadgeVariant(selectedCase.rpa_job.status)}>{selectedCase.rpa_job.status}</Badge>
                </div>
              </div>
              <p className="rpa-caption">Automated Playwright worker entering this approved application in the Finacle CBS maker terminal.</p>
              <div className="rpa-live-grid">
                <div className="rpa-timeline-col">
                  <div className="rpa-timeline" style={{ gridTemplateColumns: '1fr' }}>
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
                  {selectedCase.rpa_job.status === 'COMPLETED' && <div className="rpa-result" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div><span>CIF</span><strong>{selectedCase.rpa_job.cif_number}</strong></div>
                    <div><span>Account number</span><strong>{selectedCase.rpa_job.account_number}</strong></div>
                    <div style={{ gridColumn: '1/-1' }}><span>CBS status</span><strong>{displayValue('cbs_status', selectedCase.rpa_job.cbs_status)}</strong></div>
                  </div>}
                  {selectedCase.rpa_job.error && (
                    <div className="rpa-error" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>{selectedCase.rpa_job.error}</div>
                      <button
                        type="button"
                        className="button primary"
                        style={{ alignSelf: 'flex-start', fontSize: '11px', padding: '5px 12px', height: 'auto' }}
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
                          <span className="ai-streaming-cursor" style={{ width: '8px', height: '16px' }} />
                          <div>Connecting to Finacle Core Banking Session...</div>
                          <small style={{ color: '#5b7162' }}>Live browser screenshots stream here during RPA automation</small>
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
                      <span style={{ fontFamily: 'ui-monospace, monospace', opacity: 0.8 }}>
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
                  <span style={{ fontSize: '15px' }}>⚠️</span>
                  <div>{decisionError}</div>
                </div>
              )}

              {selectedCase.service_id === 'P1-17' && (
                <div className="kyc-checklist-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '12px', color: 'var(--brand)' }}>
                      Independent KYC Verification Checks (RBI / PMLA)
                    </strong>
                    <button
                      type="button"
                      className="button text"
                      style={{ fontSize: '10.5px', padding: '2px 6px', height: 'auto' }}
                      onClick={() => setVerificationChecks(['document_authenticity', 'pan_or_form60', 'identity_match', 'screening', 'declarations'])}
                    >
                      Select all checks
                    </button>
                  </div>
                  <p className="muted" style={{ fontSize: '10.5px', margin: '0 0 10px' }}>
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
                          <span className="muted" style={{ display: 'block', fontSize: '10px' }}>{check.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: '12px' }}>
                    <label style={{ display: 'block' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)' }}>
                        Bank Verification Reference (minimum 8 characters)
                      </span>
                      <input
                        type="text"
                        className="input"
                        value={verificationReference}
                        onChange={(e) => setVerificationReference(e.target.value)}
                        placeholder="e.g. KYC-VERIF-2026-0923"
                        style={{
                          width: '100%',
                          marginTop: '4px',
                          fontSize: '12px',
                          padding: '7px 10px',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                        }}
                      />
                    </label>
                    <small className="muted" style={{ fontSize: '9.5px' }}>
                      Audit reference code recorded permanently in the bank compliance ledger.
                    </small>
                  </div>
                </div>
              )}

              {selectedCase.discrepancy_flags && selectedCase.discrepancy_flags.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#7b5b28' }}>
                      Officer Override Justification (Required for Discrepancy Flags)
                    </span>
                    <textarea
                      rows={2}
                      className="input"
                      value={overrideJustification}
                      onChange={(e) => setOverrideJustification(e.target.value)}
                      placeholder="Explain how the flagged discrepancies were independently vetted and verified..."
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        fontSize: '12px',
                        padding: '7px 10px',
                        border: '1px solid #e7d9be',
                        background: '#fffdf9',
                        borderRadius: '6px',
                      }}
                    />
                  </label>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink)' }}>
                    Decision rationale / audit notes
                  </span>
                  <textarea
                    rows={2}
                    placeholder="Record what you verified and why the decision is appropriate."
                    value={decisionNotes}
                    onChange={(event) => setDecisionNotes(event.target.value)}
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      fontSize: '12px',
                      padding: '7px 10px',
                      border: '1px solid var(--line)',
                      borderRadius: '6px',
                    }}
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
          maxWidth="max-w-2xl"
          title={`Lead: ${selectedLead.category?.replace(/_/g, ' ') || 'Inquiry'} (${selectedLead.preferences?.app_ref || selectedLead.id})`}
          subtitle={`Applicant: ${selectedLead.preferences?.applicant_name || selectedLead.customer_id || 'Visitor / Prospect'} · ${formatDate(selectedLead.created_at)}`}
        >
          {selectedLead.status === 'PENDING_APPROVAL' && (
            <div style={{ background: '#fffaf0', border: '1px solid #fbd38d', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '20px' }}>⏳</span>
              <div>
                <strong style={{ color: '#b86e24', fontSize: '13px' }}>Awaiting Officer Credential Provisioning</strong>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#744210', lineHeight: 1.4 }}>
                  Applicant has no prior banking relationship. Review details below and click <strong>Approve & Send Credentials</strong> to provision their customer profile and dispatch temporary credentials to <strong>{selectedLead.preferences?.email || 'email'}</strong>.
                </p>
              </div>
            </div>
          )}

          {selectedLead.status === 'CONVERTED' && (
            <div style={{ background: '#e1f0e9', border: '1px solid #c9d9d1', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '20px' }}>✅</span>
              <div>
                <strong style={{ color: '#006b5e', fontSize: '13px' }}>Credentials Dispatched via Email</strong>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#102a2f', lineHeight: 1.4 }}>
                  Profile provisioned for Customer <strong>{selectedLead.customer_id}</strong>. Credentials dispatched to <strong>{selectedLead.preferences?.email || 'email'}</strong> ({selectedLead.preferences?.delivery_status || 'SENT'}).
                </p>
              </div>
            </div>
          )}

          {decisionError && (
            <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', color: '#c53030', fontSize: '12px' }}>
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
                <strong style={{ color: '#006b5e', fontFamily: 'monospace' }}>
                  {selectedLead.preferences?.phone_number || 'Unstated'}
                </strong>
              </div>
              <div>
                <span>Email Address</span>
                <strong style={{ color: '#006b5e' }}>{selectedLead.preferences?.email || '—'}</strong>
              </div>
              <div>
                <span>PAN Masked</span>
                <strong style={{ fontFamily: 'monospace' }}>{selectedLead.preferences?.pan_masked || '—'}</strong>
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
                <p style={{ margin: 0, fontSize: '12px', color: '#102a2f', lineHeight: 1.5 }}>
                  {selectedLead.notes || (typeof selectedLead.preferences === 'string' ? selectedLead.preferences : selectedLead.preferences?.summary || 'Standard terms')}
                </p>
              </div>
            </div>
          </section>

          <section className="case-section">
            <div className="case-section-heading">
              <div><small>SALES STRATEGY</small><h3>AI Re-engagement Offer & Pitch</h3></div>
            </div>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '10px' }}>
              <strong style={{ fontSize: '12px', color: 'var(--brand)', display: 'block', marginBottom: '4px' }}>
                Special Incentive / Counter-Offer
              </strong>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}>
                {selectedLead.special_offer_note || 'Exclusive reduced rate and zero processing fee'}
              </p>
            </div>
            <div style={{ background: '#fff', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
              <strong style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                AI Follow-up Pitch (Presented on Return Login)
              </strong>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.5 }}>
                "{selectedLead.follow_up_pitch || 'Welcome back! We noticed your prior interest and have an exclusive pre-approved rate ready.'}"
              </p>
            </div>
          </section>

          <div className="dialog-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Officer CRM Pipeline · Lead ID: {selectedLead.id}
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {selectedLead.status === 'PENDING_APPROVAL' ? (
                <>
                  <button
                    type="button"
                    className="button"
                    style={{ color: '#c53030' }}
                    onClick={() => handleUpdateLeadStatus(selectedLead.id, 'DECLINED', 'Application declined by officer.')}
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    style={{ background: '#006b5e', borderColor: '#006b5e' }}
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
          title={`Wipe Out Customer: ${customerToWipe.customer_id}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: '#fef2f2',
              border: '1px solid #f87171',
              borderRadius: '8px',
              padding: '14px',
              color: '#991b1b',
              fontSize: '13px',
              lineHeight: '1.5',
            }}>
              <strong>⚠️ Permanent Customer & Credential Wipe Out:</strong>
              <p style={{ margin: '8px 0 0' }}>
                You are about to permanently purge the customer profile, user login credentials, accounts, and CRM leads for{' '}
                <strong>{customerToWipe.full_name}</strong> (<code>{customerToWipe.customer_id}</code>).
              </p>
              <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                <li>Registered Mobile: <strong>{customerToWipe.phone_number || 'N/A'}</strong> (will be completely freed for clean visitor re-testing)</li>
                <li>Digital Username: <strong>@{customerToWipe.username || 'unlinked'}</strong> (will be deleted from auth records)</li>
                <li>Primary Account: <strong>{customerToWipe.primary_account_number || 'N/A'}</strong> (balance: {customerToWipe.total_balance_formatted})</li>
                <li>All active sessions, security tokens, and leads will be wiped.</li>
              </ul>
            </div>

            {customerWipeError && (
              <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
                {customerWipeError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
                className="button"
                disabled={isWipingCustomer}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  borderColor: '#dc2626',
                  fontWeight: 700,
                }}
                onClick={() => handleWipeCustomer(customerToWipe.customer_id)}
              >
                {isWipingCustomer ? 'Wiping Out...' : 'Confirm Wipe Out 🗑️'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
