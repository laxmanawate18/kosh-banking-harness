import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Modal } from '../common/Modal';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { MoneyTabs } from '../common/SectionTabs';
import { Stagger } from '../common/Animate';
import { formatDate, formatDateTime } from '../common/Formatters';
import { useStepUp, StepUpField } from '../app/StepUp';
import { useToast } from '../common/Toast';

interface BeneficiariesPageProps {
  onNavigate?: (route: string) => void;
  onSendMoney?: (beneficiaryId: string) => void;
}

const COOLING_MS = 24 * 3_600_000;
/** New payees can receive at most ₹25,000 for 24 hours after being added. Returns the end time, or null. */
export const coolingEndsAt = (createdAt?: string): Date | null => {
  if (!createdAt) return null;
  const end = new Date(createdAt).getTime() + COOLING_MS;
  return end > Date.now() ? new Date(end) : null;
};

const initials = (s: string) => (s || 'P').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

export const BeneficiariesPage: React.FC<BeneficiariesPageProps> = ({ onNavigate, onSendMoney }) => {
  const { t } = useI18n();
  const { overview, addBeneficiary } = useBanking();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const step = useStepUp();
  const toast = useToast();
  const people = (overview?.beneficiaries || []).filter((b: any) => b.kind === 'PERSON' || !b.kind);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const row = await step.run(() => addBeneficiary({ name: name.trim(), account_number: upiId.trim(), nickname: upiId.trim() || undefined }));
      if (!row) return;
      toast({ message: t('{name} added. They can receive up to ₹25,000 in the first 24 hours.', { name: name.trim() }) });
      setOpen(false);
      setName('');
      setUpiId('');
    } catch (err: any) {
      setError(err.message || t('Could not add this payee.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <MoneyTabs active="beneficiaries" />
      <PageHeader title={t('Payees')} subtitle={t('People you pay often. New payees have a 24-hour cooling period for your safety.')}
        actions={<button type="button" className="k-btn primary" onClick={() => setOpen(true)}><Icon name="beneficiaries" />{t('Add payee')}</button>} />

      {people.length === 0 ? (
        <div className="k-card k-empty">
          <Icon name="users" />
          <strong>{t('No payees yet')}</strong>
          <small>{t('Add someone you pay often to send money in two taps.')}</small>
          <button type="button" className="k-btn outline c-mt" onClick={() => setOpen(true)}>{t('Add payee')}</button>
        </div>
      ) : (
        <Stagger className="k-acc-grid">
          {people.map((b: any) => {
            const blocked = b.risk_status === 'BLOCKED_MULE';
            const display = b.display_name || b.name || t('Payee');
            const cooling = coolingEndsAt(b.created_at);
            return (
              <Stagger.Item as="article" key={b.id} className="k-acc">
                <header>
                  <span className="k-avatar" aria-hidden="true">{initials(display)}</span>
                  {blocked
                    ? <span className="k-pill danger">{t('Blocked')}</span>
                    : cooling
                      ? <span className="k-pill warn k-cooling"><Icon name="timer" />{t('Cooling period')}</span>
                      : <span className="k-pill ok">{t('Verified')}</span>}
                </header>
                <h3>{display}</h3>
                <span className="k-acc-no">{b.upi_id || b.destination_masked || b.account_number_masked}</span>
                <small className="c-payee-note">
                  {cooling
                    ? t('Up to ₹25,000 until {time}', { time: formatDateTime(cooling.toISOString()) })
                    : t('Added {date}', { date: formatDate(b.created_at) || t('earlier') })}
                </small>
                {blocked
                  ? <p className="form-error c-mt">{t('Payments to this destination are blocked by Sentinel.')}</p>
                  : <button type="button" className="k-btn outline sm c-payee-send"
                      onClick={() => (onSendMoney ? onSendMoney(b.id) : onNavigate?.('payments'))}>
                      <Icon name="payments" />{t('Send money')}
                    </button>}
              </Stagger.Item>
            );
          })}
        </Stagger>
      )}

      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title={t('Add a payee')} subtitle={t('For your safety, a new payee can receive up to ₹25,000 in the first 24 hours.')}>
          <form onSubmit={add}>
            <label className="k-field">
              {t('Full name')}
              <input required value={name} onChange={e => setName(e.target.value)} autoFocus />
            </label>
            <label className="k-field">
              {t('UPI ID')}
              <input required value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@bank" pattern="^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,63}$" />
              <small>{t('Example: vikram@okaxis')}</small>
            </label>
            {step.needed && <StepUpField otp={step.otp} setOtp={step.setOtp} />}
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="k-dialog-actions">
              <button type="button" className="k-btn outline" onClick={() => setOpen(false)} disabled={busy}>{t('Cancel')}</button>
              <button type="submit" className="k-btn primary" disabled={busy}>{busy ? t('Adding…') : step.needed ? t('Verify and save') : t('Save payee')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
};
