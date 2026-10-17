import React, { useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime, formatRupees, humanizeCode } from '../common/Formatters';
import { get, post } from '../../services/api';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { useToast } from '../common/Toast';
import { Drawer, KYC_CHECKS, displayValue, fieldLabels } from './CaseDialog';
import { errorText } from './StaffKit';

/**
 * One account application as the officer reviews it: the form, the KYC checks (KYC comes first for a new customer),
 * the decision with a reason the applicant sees, then the robot keying it into the legacy core, live.
 */

const LABELS: Record<string, string> = {
  ...fieldLabels, mobile: 'Mobile', funding_account_id: 'Funding account', amount_minor: 'Deposit amount',
  tenure_months: 'Tenure', maturity_instruction: 'On maturity',
};
const TRACK: Record<string, string> = { NEW_TO_BANK: 'New to bank', EXISTING_CUSTOMER: 'Existing customer' };
const AT_CORE = ['QUEUED_FOR_CBS', 'RPA_EXECUTING', 'CBS_MAKER_DONE', 'CBS_AUTHORISED'];
const FAILED = ['RPA_FAILED', 'CBS_REJECTED'];
const STEPS: [string, string][] = [
  ['SIGN_IN_MAKER', 'Sign in to the core as maker'], ['ENQUIRY', 'Look up this reference in the core'],
  ['NEW_CUSTOMER', 'Create the customer (CIF)'], ['NEW_ACCOUNT', 'Open the savings account'], ['NEW_DEPOSIT', 'Book the fixed deposit'],
  ['SIGN_OUT', 'Sign out'], ['SIGN_IN_CHECKER', 'Sign in as checker'], ['AUTHORISE', 'Authorise as the core’s checker'],
];

const shown = (key: string, value: unknown) =>
  key === 'amount_minor' ? formatRupees(Number(value) / 100) : key === 'tenure_months' ? `${value} months` : displayValue(key, value);

export const ApplicationDialog: React.FC<{ reference: string; onClose: () => void; onChanged: () => void }> = (
  { reference, onClose, onChanged }) => {
  const toast = useToast();
  const [a, setA] = useState<any>(null);
  const [checks, setChecks] = useState<string[]>([]);  // nothing pre-ticked: each check is the officer's own
  const [kycRef, setKycRef] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => get<any>(`/api/officer/applications/${encodeURIComponent(reference)}`).then(setA)
    .catch(e => setError(errorText(e, 'The application could not be loaded'))), [reference]);
  useEffect(() => { load(); }, [load]);

  // While the robot works, follow it in real time: its steps, the core's numbers and its live Chromium screenshot.
  const working = a && AT_CORE.includes(a.status);
  useEffect(() => {
    if (!working) return;
    const timer = window.setInterval(async () => {
      try {
        const robot = await get<any>(`/api/officer/applications/${encodeURIComponent(reference)}/robot`);
        setA((prev: any) => ({ ...prev, ...robot }));
        if (!AT_CORE.includes(robot.status)) { load(); onChanged(); }
      } catch { window.clearInterval(timer); }
    }, 350);
    return () => window.clearInterval(timer);
  }, [working, reference, load, onChanged]);

  const act = async (path: string, body: object, done: string) => {
    setError(null);
    setBusy(true);
    try {
      await post(`/api/officer/applications/${encodeURIComponent(reference)}/${path}`, body);
      toast({ message: done, tone: 'success' });
      onChanged();
      await load();
    } catch (e) {
      setError(errorText(e, 'The action could not be recorded'));
    } finally {
      setBusy(false);
    }
  };
  const decide = (action: 'APPROVE' | 'REJECT') => {
    if (reason.trim().length < 10) return setError(action === 'REJECT'
      ? 'Write the reason for the applicant (at least 10 characters). They will see it.'
      : 'Write what you verified (at least 10 characters).');
    if (action === 'APPROVE' && a.kyc_required) {
      if (KYC_CHECKS.some(c => !checks.includes(c.id))) return setError('KYC comes first: confirm all five checks you did yourself.');
      if (kycRef.trim().length < 8) return setError('Record the bank verification reference (at least 8 characters).');
    }
    act('decision', { action, reason: reason.trim(), kyc_checks: checks, kyc_reference: kycRef.trim() },
      action === 'APPROVE' ? `Approved ${reference}: the robot is opening it in the core` : `Rejected ${reference}; the applicant sees your reason`);
  };

  if (!a) return (
    <Drawer onClose={onClose} title={reference} subtitle="Loading…">
      {error ? <div className="decision-error-banner" role="alert"><Icon name="alert" /><div>{error}</div></div> : <p className="muted">Loading the application…</p>}
    </Drawer>);

  const fields = Object.entries(a.payload || {}).filter(([k, v]) => LABELS[k] && v !== '' && v != null);
  const events: any[] = a.events || [];
  const doneSteps = new Set(events.filter(e => e.phase === 'COMPLETED').map(e => e.step));
  const runningEvent = [...events].reverse().find(e => e.phase === 'RUNNING' && !doneSteps.has(e.step));
  const failedStep = events.find(e => e.phase === 'FAILED');
  const relevant = STEPS.filter(([id]) => (a.kind === 'FD' ? id !== 'NEW_CUSTOMER' && id !== 'NEW_ACCOUNT' : id !== 'NEW_DEPOSIT')
    && (id !== 'NEW_CUSTOMER' || a.track === 'NEW_TO_BANK'));
  const showRobot = AT_CORE.includes(a.status) || FAILED.includes(a.status) || a.status === 'OPENED';

  return (
    <Drawer onClose={onClose} title={`${a.product} — ${a.applicant || "Applicant"}`}
      subtitle={`${a.kind === 'FD' ? 'Fixed deposit' : 'Savings account'} · ${TRACK[a.track]} · submitted ${formatDate(a.created_at)}`}>
      <div className="st-case">
        <div className="case-summary-strip">
          <div><span>Status</span><Badge status={a.status} /></div>
          <div><span>Reference</span><strong>{a.reference}</strong></div>
          <div><span>Applicant</span><strong>{a.customer_id || TRACK[a.track]}</strong></div>
        </div>
        {a.reapplied_from && <p className="muted"><Icon name="info" /> Applying again after {a.reapplied_from} was rejected.</p>}

        <section className="case-section">
          <div className="case-section-heading"><div><small>Application</small><h3>What the applicant submitted</h3></div>
            <span>{fields.length} fields</span></div>
          <div className="case-detail-grid">{fields.map(([key, value]) => (
            <div className={key === 'address' ? 'wide' : ''} key={key}><span>{LABELS[key]}</span><strong>{shown(key, value)}</strong></div>))}
          </div>
          {(a.documents || []).length > 0 && <ul className="st-list">{a.documents.map((d: any) => (
            <li key={d.id}><Icon name="file" /> {humanizeCode(d.document_type)} · {humanizeCode(d.scan_status || 'stored')}</li>))}</ul>}
        </section>

        {a.decision && (
          <section className="case-section">
            <div className="case-section-heading"><div><small>Decision</small>
              <h3>{a.decision.action === 'APPROVE' ? 'Approved' : 'Rejected'} by {a.decision.by}</h3></div>
              <span>{formatDateTime(a.decision.at)}</span></div>
            <p>{a.decision.reason}</p>
            {a.kyc_verification && <p className="muted">KYC verified first · reference {a.kyc_verification.reference}</p>}
          </section>)}

        {showRobot && (
          <section className="case-section rpa-panel" aria-live="polite">
            <div className="case-section-heading">
              <div><small>Core banking (legacy, no API)</small><h3>The robot keys it into the core</h3></div>
              <Badge status={a.status} />
            </div>
            <div className="rpa-live-grid">
              <div className="rpa-timeline-col">
                <div className="rpa-timeline">{relevant.map(([id, label]) => {
                  const state = doneSteps.has(id) ? 'done' : failedStep?.step === id ? 'failed' : runningEvent?.step === id ? 'running' : 'waiting';
                  return <div className={`rpa-step ${state}`} key={id}>
                    <span className="rpa-step-dot">{state === 'done' ? <Icon name="check" /> : state === 'failed' ? <Icon name="close" /> : null}</span>
                    <div><strong>{label}</strong><small>{state === 'running' ? (runningEvent?.label || 'In progress…') : state === 'done' ? 'Done' : state === 'failed' ? 'Failed' : 'Waiting'}</small></div>
                  </div>;
                })}</div>
                {(a.cbs?.cif_number || a.cbs?.account_number || a.cbs?.fd_number) && <div className="rpa-result">
                  {a.cbs.cif_number && <div><span>CIF</span><strong>{a.cbs.cif_number}</strong></div>}
                  {(a.cbs.account_number || a.cbs.fd_number) && <div><span>{a.kind === 'FD' ? 'Deposit number' : 'Account number'}</span>
                    <strong>{a.cbs.account_number || a.cbs.fd_number}</strong></div>}
                  {a.cbs.checker_reference && <div className="wide"><span>Core authorisation</span><strong>{a.cbs.checker_reference}</strong></div>}
                </div>}
                {FAILED.includes(a.status) && <div className="rpa-error">
                  <div><strong>{a.status === 'CBS_REJECTED' ? 'The core refused the entry' : 'The robot could not finish'}</strong>
                    <br />{a.last_error}{a.attempts > 1 ? ` (after ${a.attempts} attempts)` : ''}</div>
                  <button type="button" className="k-btn primary sm" disabled={busy}
                    onClick={() => act('retry', {}, `Retrying ${reference} in the core`)}>{busy ? 'Retrying…' : 'Retry core entry'}</button>
                </div>}
              </div>
              <div className="rpa-terminal-col">
                <div className="rpa-terminal-window">
                  <div className="rpa-terminal-topbar">
                    <div className="rpa-terminal-controls"><span className="rpa-terminal-dot close" /><span className="rpa-terminal-dot min" /><span className="rpa-terminal-dot max" /></div>
                    <span className="rpa-terminal-title">Kosh Core Banking · legacy terminal</span>
                    <span className={`rpa-terminal-badge ${a.status === 'OPENED' ? 'done' : 'live'}`}>{a.status === 'OPENED' ? 'Opened' : 'Live view'}</span>
                  </div>
                  <div className="rpa-terminal-body">
                    {a.screenshot ? <img src={a.screenshot} alt="The legacy core screen the robot is using" className="rpa-terminal-img" />
                      : <div className="rpa-terminal-placeholder"><span className="ai-streaming-cursor" />
                        <div>{a.status === 'QUEUED_FOR_CBS' ? 'Queued for the robot…' : 'No screenshot kept (the server restarted since)'}</div></div>}
                  </div>
                  <div className="rpa-terminal-footer"><span>{events.length ? events[events.length - 1].label : 'Standing by'}</span></div>
                </div>
              </div>
            </div>
          </section>)}

        {(a.status === 'SUBMITTED' || FAILED.includes(a.status)) && (
          <div className="decision-box">
            {a.status === 'SUBMITTED' && a.kyc_required && (
              <fieldset className="kyc-checklist-box">
                <legend className="ops-kyc-head"><strong>KYC first: your independent checks (RBI / PMLA)</strong></legend>
                <p className="muted">A new customer's account is opened only after you verify KYC yourself. Tick each check you did.</p>
                <div className="kyc-checklist-grid">{KYC_CHECKS.map(check => (
                  <label key={check.id} className="kyc-checkbox-item">
                    <input type="checkbox" checked={checks.includes(check.id)}
                      onChange={e => setChecks(e.target.checked ? [...checks, check.id] : checks.filter(id => id !== check.id))} />
                    <span><strong>{check.label}</strong><span className="muted">{check.description}</span></span>
                  </label>))}
                </div>
                <label className="k-field st-field">Bank verification reference
                  <input type="text" value={kycRef} onChange={e => setKycRef(e.target.value)} placeholder="e.g. KYC-VERIF-2026-1009" />
                  <small>At least 8 characters. Kept permanently in the compliance record.</small>
                </label>
              </fieldset>)}
            <label className="k-field st-field">{a.status === 'SUBMITTED' ? 'Reason for your decision' : 'Reason, if you reject it now'}
              <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="If you reject, write it for the applicant: what was wrong and what to fix when applying again." />
              <small>At least 10 characters. <strong>A rejection reason is shown to the applicant</strong>, with an option to apply again.</small>
            </label>
            {error && <div className="decision-error-banner" role="alert"><Icon name="alert" /><div>{error}</div></div>}
            <div className="k-dialog-actions">
              <button type="button" className="k-btn danger sm" disabled={busy} onClick={() => decide('REJECT')}>Reject</button>
              {a.status === 'SUBMITTED' && <button type="button" className="k-btn primary sm" disabled={busy} onClick={() => decide('APPROVE')}>
                {busy ? 'Recording…' : 'Approve and open in core banking'}</button>}
            </div>
          </div>)}

        <section className="case-section">
          <div className="case-section-heading"><div><small>History</small><h3>Every step, with who and when</h3></div></div>
          <ol className="st-list">{(a.history || []).map((h: any, i: number) => (
            <li key={i}><strong>{humanizeCode(h.to)}</strong> · {formatDateTime(h.at)} · {h.by}<br /><small className="muted">{h.note}</small></li>))}
          </ol>
        </section>
      </div>
    </Drawer>
  );
};
