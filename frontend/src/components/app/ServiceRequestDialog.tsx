import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Icon } from '../common/Icon';
import { submitServiceRequest } from '../../services/banking';
import { useStepUp, StepUpField } from './StepUp';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';

export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'select' | 'date' | 'email' | 'tel';
  options?: [string, string][];
  help?: string;
};

export type ServiceSpec = {
  serviceId: string;
  title: string;
  subtitle: string;
  fields?: Field[];
  initial?: Record<string, string>;
  /** Human summary sent as the request's required `details` text (5–2000 chars). */
  details: (data: Record<string, string>) => string;
  submitLabel?: string;
  /** Requests about the customer, not an account (contact details, branch visit): no account picker; the primary account is sent. */
  hideAccount?: boolean;
};

/** Submits a catalogue service request; handles the backend's STEP_UP_REQUIRED with an in-place OTP step. */
export const ServiceRequestDialog: React.FC<{ spec: ServiceSpec | null; onClose: () => void }> = ({ spec, onClose }) => {
  const { t } = useI18n();
  const { accounts, refreshOverview } = useBanking();
  const [data, setData] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState('');
  const step = useStepUp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneId, setDoneId] = useState('');

  useEffect(() => {
    if (!spec) return;
    setData(spec.initial || {});
    setAccountId(accounts[0]?.id || '');
    step.reset();
    setError('');
    setDoneId('');
  }, [spec]);

  if (!spec) return null;

  const send = async () => {
    const res = await submitServiceRequest({
      service_id: spec.serviceId,
      data: { ...data, account_id: accountId, details: spec.details(data) },
    });
    setDoneId(res.id);
    refreshOverview();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await step.run(send);
    } catch (err: any) {
      setError(err.message || t('Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (doneId) {
    return (
      <Modal isOpen onClose={onClose} title={t('Request submitted')} subtitle={spec.title}>
        <div className="k-empty"><Icon name="check" /><strong>{t('We have your request')}</strong><small>{t('Reference {id}. Track it under My requests.', { id: doneId })}</small></div>
        <div className="k-dialog-actions">
          <a className="k-btn outline" href="#requests" onClick={onClose}>{t('My requests')}</a>
          <button type="button" className="k-btn primary" onClick={onClose}>{t('Done')}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={spec.title} subtitle={spec.subtitle}>
      <form onSubmit={submit}>
        {accounts.length > 1 && !spec.hideAccount && (
          <label className="k-field">
            {t('Account')}
            <select value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name || a.account_type} · {a.account_number_masked || a.account_number}</option>)}
            </select>
          </label>
        )}
        {(spec.fields || []).map(f => (
          <label key={f.name} className="k-field">
            {f.label}
            {f.type === 'select' ? (
              <select value={data[f.name] || ''} required onChange={e => setData(d => ({ ...d, [f.name]: e.target.value }))}>
                <option value="" disabled>{t('Choose')}</option>
                {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <input type={f.type || 'text'} value={data[f.name] || ''} required onChange={e => setData(d => ({ ...d, [f.name]: e.target.value }))} />
            )}
            {f.help && <small>{f.help}</small>}
          </label>
        ))}
        {step.needed && <StepUpField otp={step.otp} setOtp={step.setOtp} />}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" className="k-btn primary wide" disabled={busy}>
          {busy ? t('Submitting…') : step.needed ? t('Verify and submit') : spec.submitLabel || t('Submit request')}
        </button>
      </form>
    </Modal>
  );
};
