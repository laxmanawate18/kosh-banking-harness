import React, { useEffect, useMemo, useState } from 'react';
import { formatDate, formatRupees, humanizeCode } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { fetchOfficerRpaStatus, recordOfficerDecision } from '../../services/banking';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { Tag, errorText } from './StaffKit';

/** One service request, as the officer reviews it: what the customer sent, what the checks found, the CBS robot, and the decision. */

export const DECIDE_STATUSES = ['PENDING_APPROVAL', 'ESCALATED', 'MORE_INFO_REQUIRED', 'RPA_FAILED'];

const fieldLabels: Record<string, string> = {
  full_name: 'Applicant name', date_of_birth: 'Date of birth', pan_number: 'PAN', pan_masked: 'PAN',
  mobile: 'Mobile', email: 'Email', identity_document: 'Identity document',
  document_last4: 'Document ending', address: 'Residential address', city: 'City',
  state: 'State', pincode: 'PIN code', account_scheme: 'Account scheme',
  initial_deposit: 'Requested initial deposit', initial_deposit_minor: 'Requested initial deposit', nominee: 'Nominee',
  nominee_name: 'Nominee name', nominee_relationship: 'Nominee relationship', occupation: 'Occupation',
  annual_income_slab: 'Annual income', source_of_funds: 'Source of funds', tax_residency: 'Tax residency',
  update_type: 'Request type', document_expiry: 'Document valid until',
  cif_number: 'CBS customer ID', account_number: 'Account number', cbs_status: 'CBS status',
};

const rpaStepLabels: Record<string, string> = {
  'AO-001': 'Open CBS account-opening screen', 'AO-002': 'Enter applicant name', 'AO-003': 'Enter PAN',
  'AO-004': 'Enter date of birth', 'AO-005': 'Enter mobile number', 'AO-006': 'Enter residential address',
  'AO-007': 'Select account scheme', 'AO-008': 'Bind the portal reference', 'AO-009': 'Verify the CBS read-back',
  'AO-010': 'Submit the maker entry',
};

const KYC_CHECKS = [
  { id: 'document_authenticity', label: 'Document authenticity', description: 'Official valid document and issuer verified independently' },
  { id: 'pan_or_form60', label: 'PAN or Form 60', description: 'Tax identifier checked against the issuer’s records' },
  { id: 'identity_match', label: 'Identity and photo match', description: 'Photo and details compared with the proof' },
  { id: 'screening', label: 'AML and PEP screening', description: 'Sanctions, negative-list and politically exposed person checks cleared' },
  { id: 'declarations', label: 'Declarations and consents', description: 'FATCA, tax residency and digital banking declarations verified' },
];
const ALL_CHECKS = KYC_CHECKS.map(c => c.id);
const terminalRpa = new Set(['COMPLETED', 'FAILED']);
const LEVEL: Record<string, string> = { L1: 'Level 1 · basic sign-in', L2: 'Level 2 · signed in', L3: 'Level 3 · signed in and verified' };

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'initial_deposit') return formatRupees(Number(value));
  if (key === 'initial_deposit_minor') return formatRupees(Number(value) / 100);
  if (key === 'date_of_birth' || key === 'document_expiry') return formatDate(String(value));
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  return /^[A-Z0-9]+(_[A-Z0-9]+)+$|^[A-Z]{3,}$/.test(s) ? humanizeCode(s) : s;  // codes become words; names and numbers stay
}

function parseSignal(item: unknown) {
  let obj: any = item;
  if (typeof item === 'string') { try { obj = JSON.parse(item); } catch { obj = { code: item, message: humanizeCode(item) }; } }
  if (typeof obj !== 'object' || obj === null) obj = { message: String(item) };
  return { code: obj.code || 'SIGNAL', status: String(obj.status || 'INFO').toUpperCase(), message: obj.message || humanizeCode(obj.code) || 'Check recorded' };
}

export const CaseDialog: React.FC<{ request: any; onClose: () => void }> = ({ request, onClose }) => {
  const { refreshOverview } = useBanking();
  const [c, setC] = useState<any>(request);
  const isKyc = c.service_id === 'P1-17';
  const [notes, setNotes] = useState(isKyc ? 'KYC documents, PAN and address proof verified against bank policy.'
    : 'Supporting evidence and identity documents verified against bank policy.');
  const [reference, setReference] = useState(() => {
    const ref = request.collected_data?.bank_verification_reference || `KYC-VERIF-${(request.id || '').replace(/^REQ-/, '').slice(0, 10) || '2026-0923'}`;
    return ref.length >= 8 ? ref : `${ref}-VERIF`;
  });
  const [checks, setChecks] = useState<string[]>(ALL_CHECKS);
  const [override, setOverride] = useState(request.discrepancy_flags?.length
    ? 'Officer independently verified original documents, tax registry records and screening databases as per bank policy.' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow the CBS robot while it types the account into core banking.
  useEffect(() => {
    const job = c?.rpa_job;
    if (c.service_id !== 'P1-25' || !job || terminalRpa.has(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const updated = await fetchOfficerRpaStatus(c.id);
        setC(updated);
        if (terminalRpa.has(updated?.rpa_job?.status)) await refreshOverview();
      } catch { window.clearInterval(timer); }
    }, 500);
    return () => window.clearInterval(timer);
  }, [c, refreshOverview]);

  const stepEvents = useMemo(() => {
    const byStep = new Map<string, any>();
    for (const e of c?.rpa_job?.events || []) if (e.step_id) byStep.set(e.step_id, e);
    return Array.from(byStep.values());
  }, [c?.rpa_job?.events]);

  const decide = async (action: 'APPROVE' | 'REJECT') => {
    setError(null);
    if (action === 'APPROVE' && isKyc) {
      if (ALL_CHECKS.some(id => !checks.includes(id))) return setError('Complete all five KYC checks before approving.');
      if (reference.trim().length < 8) return setError('The bank verification reference needs at least 8 characters (e.g. KYC-VERIF-2026-0923).');
      if (c.discrepancy_flags?.length && !override.trim()) return setError('Explain how you verified the flagged items before approving.');
    }
    setBusy(true);
    try {
      const payload: Parameters<typeof recordOfficerDecision>[1] = {
        action, reason: notes.trim() || (action === 'APPROVE' ? 'Supporting evidence verified against bank policy.' : 'Rejected by officer.') };
      if (action === 'APPROVE') {
        payload.verification_checks = isKyc ? checks : (checks.length ? checks : ['document_authenticity', 'identity_match']);
        if (isKyc) payload.verification_reference = reference.trim();
        if (override.trim()) payload.override_justification = override.trim();
        else if (c.discrepancy_flags?.length) payload.override_justification = notes.trim() || 'Officer verified submitted evidence against bank policy.';
      }
      setC(await recordOfficerDecision(c.id, payload));
      await refreshOverview();
    } catch (err) {
      setError(errorText(err, 'The decision could not be recorded'));
    } finally {
      setBusy(false);
    }
  };

  const details = Object.entries(c.collected_data || c.details || {}).filter(([k]) => fieldLabels[k] && !(k === 'pan_number' && c.collected_data?.pan_masked));
  const findings = (c.findings || []).map(parseSignal);
  const passed = findings.filter((f: any) => f.status === 'PASS').length;
  const flags: string[] = c.discrepancy_flags || [];
  const mayDecide = DECIDE_STATUSES.includes(c.status);
  const job = c.rpa_job;

  return (
    <Modal isOpen onClose={onClose} wide title={c.service_name || c.prompt || c.id}
      subtitle={`Submitted ${formatDate(c.created_at)} · ${c.customer_id || c.user_id}`}>
      <div className="st-case">
        <div className="case-summary-strip">
          <div><span>Status</span><Badge status={c.status} /></div>
          <div><span>Reference</span><strong>{c.id}</strong></div>
          <div><span>Customer sign-in</span><strong>{LEVEL[c.auth_level] || c.auth_level || '—'}</strong></div>
        </div>

        <section className="case-section">
          <div className="case-section-heading"><div><small>Application</small><h3>What the customer submitted</h3></div>
            <span>{details.length} fields</span></div>
          {details.length ? <div className="case-detail-grid">
            {details.map(([key, value]) => <div className={key === 'address' ? 'wide' : ''} key={key}>
              <span>{fieldLabels[key]}</span><strong>{displayValue(key, value)}</strong>
            </div>)}
          </div> : <p className="muted">No structured application details were attached.</p>}
        </section>

        {(findings.length > 0 || flags.length > 0) && (
          <section className="case-section">
            <div className="case-section-heading"><div><small>Verification</small><h3>Automatic checks</h3></div>
              <span>{passed} of {findings.length} passed</span></div>
            {flags.length > 0 && (
              <div className="discrepancy-callout">
                <div className="ops-row"><Icon name="alert" /><strong>{mayDecide ? `${flags.length === 1 ? '1 item needs' : `${flags.length} items need`} your own check` : `${flags.length} flagged for an officer check`}</strong></div>
                <p>{mayDecide ? 'Verify these yourself and explain how before approving.' : 'The deciding officer had to verify these and explain how.'}</p>
                <div className="ops-flags">{flags.map(f => <span key={f} className="discrepancy-tag">{humanizeCode(f)}</span>)}</div>
              </div>
            )}
            {findings.length > 0 && (
              <div className="review-signals-list">{findings.map((s: any, i: number) => {
                const tone = s.status === 'PASS' ? 'pass' : ['OFFICER_REVIEW', 'WARN', 'WARNING'].includes(s.status) ? 'warning'
                  : ['FAIL', 'FAILED', 'BLOCKED', 'BLOCKING'].includes(s.status) ? 'danger' : '';
                return (
                  <div key={`${i}-${s.code}`} className={`review-signal-row ${tone}`}>
                    <span className="review-signal-msg">{s.message}</span>
                    <Tag tone={tone === 'pass' ? 'success' : tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'neutral'}>
                      {tone === 'pass' ? 'Passed' : tone === 'warning' ? 'Check yourself' : tone === 'danger' ? 'Failed' : humanizeCode(s.status)}</Tag>
                  </div>);
              })}</div>
            )}
          </section>
        )}

        {c.service_id === 'P1-25' && job && (
          <section className="case-section rpa-panel" aria-live="polite">
            <div className="case-section-heading">
              <div><small>Core banking</small><h3>The robot enters the account in CBS</h3></div>
              <div className="ops-row">
                <a href="/cbs/retail/account_opening" target="_blank" rel="noreferrer" className="k-btn outline sm">Open mock CBS <Icon name="arrow-up-right" /></a>
                <Badge status={job.status} />
              </div>
            </div>
            <div className="rpa-live-grid">
              <div className="rpa-timeline-col">
                <div className="rpa-timeline">{Object.entries(rpaStepLabels).map(([stepId, label]) => {
                  const ev = stepEvents.find(e => e.step_id === stepId);
                  const state = ev?.phase === 'COMPLETED' ? 'done' : ev?.phase === 'FAILED' ? 'failed' : job.current_step === stepId ? 'running' : 'waiting';
                  return <div className={`rpa-step ${state}`} key={stepId}>
                    <span className="rpa-step-dot">{state === 'done' ? <Icon name="check" /> : state === 'failed' ? <Icon name="close" /> : null}</span>
                    <div><strong>{label}</strong><small>{state === 'running' ? 'In progress' : state === 'done' ? 'Done' : state === 'failed' ? 'Failed' : 'Waiting'}</small></div>
                  </div>;
                })}</div>
                {job.status === 'COMPLETED' && <div className="rpa-result">
                  <div><span>CIF</span><strong>{job.cif_number}</strong></div>
                  <div><span>Account number</span><strong>{job.account_number}</strong></div>
                  <div className="wide"><span>CBS status</span><strong>{displayValue('cbs_status', job.cbs_status)}</strong></div>
                </div>}
                {job.error && <div className="rpa-error">
                  <div>{job.error}</div>
                  <button type="button" className="k-btn primary sm" disabled={busy} onClick={() => decide('APPROVE')}>
                    {busy ? "Retrying…" : "Retry CBS entry"}</button>
                </div>}
              </div>
              <div className="rpa-terminal-col">
                <div className="rpa-terminal-window">
                  <div className="rpa-terminal-topbar">
                    <div className="rpa-terminal-controls"><span className="rpa-terminal-dot close" /><span className="rpa-terminal-dot min" /><span className="rpa-terminal-dot max" /></div>
                    <span className="rpa-terminal-title">Finacle 10.x · CBS maker terminal</span>
                    <span className={`rpa-terminal-badge ${job.status === 'COMPLETED' ? 'done' : 'live'}`}>{job.status === 'COMPLETED' ? 'Record created' : 'Live view'}</span>
                  </div>
                  <div className="rpa-terminal-body">
                    {job.latest_screenshot ? <img src={job.latest_screenshot} alt="Live CBS screen" className="rpa-terminal-img" />
                      : <div className="rpa-terminal-placeholder"><span className="ai-streaming-cursor" /><div>Connecting to the core banking session…</div>
                        <small>Screenshots stream here while the robot works</small></div>}
                  </div>
                  <div className="rpa-terminal-footer">
                    <span>{job.current_step ? `Now: ${rpaStepLabels[job.current_step] || job.current_step}`
                      : job.status === 'COMPLETED' ? 'Application entered' : 'Queued · standing by'}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {mayDecide && (
          <div className="decision-box">
            {isKyc && (
              <fieldset className="kyc-checklist-box">
                <legend className="ops-kyc-head">
                  <strong>Your independent KYC checks (RBI / PMLA)</strong>
                </legend>
                <div className="ops-row st-spread"><p className="muted">Confirm each check you did yourself.</p>
                  <button type="button" className="k-link" onClick={() => setChecks(ALL_CHECKS)}>Select all</button></div>
                <div className="kyc-checklist-grid">{KYC_CHECKS.map(check => (
                  <label key={check.id} className="kyc-checkbox-item">
                    <input type="checkbox" checked={checks.includes(check.id)}
                      onChange={e => setChecks(e.target.checked ? [...checks, check.id] : checks.filter(id => id !== check.id))} />
                    <span><strong>{check.label}</strong><span className="muted">{check.description}</span></span>
                  </label>))}
                </div>
                <label className="k-field st-field">Bank verification reference
                  <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. KYC-VERIF-2026-0923" />
                  <small>At least 8 characters. Kept permanently in the compliance record.</small>
                </label>
              </fieldset>
            )}
            {flags.length > 0 && (
              <label className="k-field st-field">How you verified the flagged items (required)
                <textarea rows={2} value={override} onChange={e => setOverride(e.target.value)}
                  placeholder="Explain how each flagged item was checked independently…" />
              </label>
            )}
            <label className="k-field st-field">Your decision note
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What you verified and why the decision is right." />
              <small>Saved in the audit trail with your name.</small>
            </label>
            {error && <div className="decision-error-banner" role="alert"><Icon name="alert" /><div>{error}</div></div>}
            <div className="k-dialog-actions">
              <button type="button" className="k-btn danger sm" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>
              <button type="button" className="k-btn primary sm" disabled={busy} onClick={() => decide('APPROVE')}>
                {busy ? 'Recording…' : c.service_id === 'P1-25' ? 'Approve and start CBS entry' : isKyc ? 'Approve KYC' : 'Approve'}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
