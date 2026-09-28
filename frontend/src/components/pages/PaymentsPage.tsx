import React, { useEffect, useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { Celebrate } from '../common/Celebrate';
import { formatDateTime, formatMoney } from '../common/Formatters';
import { coolingEndsAt } from './BeneficiariesPage';
import { useStepUp, StepUpField } from '../app/StepUp';

interface PaymentsPageProps {
  initialBeneficiaryId?: string;
  onStartKyc?: () => void;
}

const COOLING_LIMIT_MINOR = 2_500_000;

export const PaymentsPage: React.FC<PaymentsPageProps> = ({ initialBeneficiaryId, onStartKyc }) => {
  const { t } = useI18n();
  const { overview, accounts, beneficiaries, transferMoney, addBeneficiary, kyc } = useBanking();
  const [sourceAccountId, setSourceAccountId] = useState(accounts[0]?.id || '');
  const [beneficiaryId, setBeneficiaryId] = useState(initialBeneficiaryId || '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [success, setSuccess] = useState<{ amount: number; payee: string; ref: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUpi, setNewUpi] = useState('');
  const [addError, setAddError] = useState('');
  const step = useStepUp();

  useEffect(() => { if (initialBeneficiaryId) setBeneficiaryId(initialBeneficiaryId); }, [initialBeneficiaryId]);
  useEffect(() => { if (!sourceAccountId && accounts.length) setSourceAccountId(accounts[0].id); }, [accounts, sourceAccountId]);

  const customerKyc = kyc || overview?.kyc || overview?.customer?.kyc;
  const restricted = customerKyc?.status === 'NOT_DONE';
  const people = beneficiaries.filter((b: any) => b.kind === 'PERSON' || !b.kind);
  const payee: any = beneficiaries.find(b => b.id === beneficiaryId);
  const account = accounts.find(a => a.id === sourceAccountId) || accounts[0];
  const amountMinor = Math.round(parseFloat(amount || '0') * 100);
  const cooling = coolingEndsAt(payee?.created_at);
  const payeeName = payee?.display_name || payee?.name || '';

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!(amountMinor > 0)) return setError(t('Enter an amount greater than zero.'));
    if (!beneficiaryId) return setError(t('Choose who you are paying.'));
    if (cooling && amountMinor > COOLING_LIMIT_MINOR) return setError(t('New payees can receive up to ₹25,000 until {time}.', { time: formatDateTime(cooling.toISOString()) }));
    setReviewing(true);
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await transferMoney({ source_account_id: sourceAccountId, beneficiary_id: beneficiaryId, amount_minor: amountMinor, note });
      setReviewing(false);
      // A Kavach challenge opens the approval dialog, which shows its own success screen.
      if (!res?.challenge) {
        setSuccess({ amount: amountMinor, payee: payeeName, ref: res?.payment_ref || res?.receipt?.payment_ref || res?.id || '' });
      }
      setAmount('');
      setNote('');
    } catch (err: any) {
      setReviewing(false);
      setError(err.message || t('The payment did not go through. No money has left your account.'));
    } finally {
      setBusy(false);
    }
  };

  const addPayee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    try {
      const row: any = await step.run(() => addBeneficiary({ name: newName.trim(), account_number: newUpi.trim(), nickname: newUpi.trim() }));
      if (!row) return;
      if (row.id) setBeneficiaryId(row.id);
      setAddOpen(false);
      setNewName('');
      setNewUpi('');
    } catch (err: any) {
      setAddError(err.message || t('Could not add this payee.'));
    }
  };

  return (
    <div className="k-app-page">
      <header className="k-app-head">
        <h1>{t('Send money')}</h1>
        <p>{t('Choose a payee and amount. Kavach checks the payment before any money moves.')}</p>
      </header>

      {restricted && (
        <section className="k-alert danger">
          <Icon name="alert" />
          <div>
            <strong>{t('Transfers are paused until KYC is complete')}</strong>
            <p>{t('As per RBI rules, UPI, IMPS, NEFT and RTGS transfers and debit card use are paused until KYC is complete.')}</p>
          </div>
          <button type="button" className="k-btn primary" onClick={() => onStartKyc?.()}>{t('Complete KYC with Mitra')}</button>
        </section>
      )}

      <div className="k-two">
        <section className="k-panel">
          <div className="k-panel-body" style={{ paddingTop: 20 }}>
            <form id="transferForm" onSubmit={review} noValidate>
              <label className="k-field">
                {t('From account')}
                <select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)} disabled={restricted}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {formatMoney(a.available_balance_minor ?? a.balance_paise)}</option>)}
                </select>
              </label>
              <label className="k-field">
                {t('To')}
                <select value={beneficiaryId} onChange={e => setBeneficiaryId(e.target.value)} disabled={restricted}>
                  <option value="">{t('Choose a saved payee')}</option>
                  {people.map((b: any) => (
                    <option key={b.id} value={b.id} disabled={b.risk_status === 'BLOCKED_MULE'}>
                      {b.display_name || b.name} · {b.upi_id || b.account_number}{b.risk_status === 'BLOCKED_MULE' ? ` (${t('Blocked')})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="k-link" style={{ marginBottom: 16 }} onClick={() => setAddOpen(true)} disabled={restricted}>
                <Icon name="beneficiaries" />{t('Add a new payee')}
              </button>
              {cooling && (
                <div className="k-note warn" style={{ marginBottom: 14 }}>
                  <Icon name="timer" />
                  <span>{t('{name} was added recently. Up to ₹25,000 until {time}.', { name: payeeName, time: formatDateTime(cooling.toISOString()) })}</span>
                </div>
              )}
              <label className="k-field">
                {t('Amount')}
                <input className="money-input" inputMode="decimal" placeholder="₹ 0" value={amount}
                  onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} disabled={restricted} aria-invalid={!!error} />
              </label>
              <label className="k-field">
                {t('Note (optional)')}
                <input maxLength={120} value={note} onChange={e => setNote(e.target.value)} disabled={restricted} />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="k-btn primary wide lg" type="submit" disabled={restricted}>
                {t('Review payment')} <Icon name="arrow-right" />
              </button>
            </form>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 18 }}>
          <section className="k-panel">
            <header className="k-panel-head"><div><h2>{t('Your payees')}</h2></div></header>
            <div className="k-panel-body">
              <ul className="k-list">
                {people.filter((b: any) => b.risk_status !== 'BLOCKED_MULE').slice(0, 5).map((b: any) => (
                  <li key={b.id}>
                    <span><strong>{b.display_name || b.name}</strong><small>{b.upi_id || b.account_number}</small></span>
                    <button type="button" className="k-btn sm outline" disabled={restricted} onClick={() => setBeneficiaryId(b.id)}>{t('Choose')}</button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <aside className="k-kavach-tip">
            <Icon name="alert" />
            <div>
              <strong>{t('Know who you are paying')}</strong>
              <p>{t('A bank employee will never ask you to move money to a "safe account". If someone does, it is a scam. Call 1930.')}</p>
            </div>
          </aside>
        </div>
      </div>

      {addOpen && (
        <Modal isOpen onClose={() => setAddOpen(false)} title={t('Add a payee')} subtitle={t('For your safety, a new payee can receive up to ₹25,000 in the first 24 hours.')}>
          <form onSubmit={addPayee}>
            <label className="k-field">{t('Full name')}<input required value={newName} onChange={e => setNewName(e.target.value)} autoFocus /></label>
            <label className="k-field">{t('UPI ID')}<input required value={newUpi} onChange={e => setNewUpi(e.target.value)} placeholder="name@bank" pattern="^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,63}$" /></label>
            {step.needed && <StepUpField otp={step.otp} setOtp={step.setOtp} />}
            {addError && <div className="form-error" role="alert">{addError}</div>}
            <div className="k-dialog-actions">
              <button type="button" className="k-btn outline" onClick={() => setAddOpen(false)}>{t('Cancel')}</button>
              <button type="submit" className="k-btn primary">{step.needed ? t('Verify and save') : t('Save payee')}</button>
            </div>
          </form>
        </Modal>
      )}

      {reviewing && (
        <Modal isOpen onClose={() => setReviewing(false)} title={t('Review payment')} subtitle={t('Check the payee and amount before you send.')}>
          <div className="review-amount">{formatMoney(amountMinor)}</div>
          <p className="review-payee" style={{ textAlign: 'center' }}>{t('To {payee}', { payee: payeeName })}</p>
          <div className="info-row"><span>{t('From account')}</span><strong>{account?.name}</strong></div>
          <div className="info-row"><span>{t('UPI ID')}</span><strong>{payee?.upi_id || payee?.account_number}</strong></div>
          {note && <div className="info-row"><span>{t('Note')}</span><strong>{note}</strong></div>}
          <div className="k-dialog-actions">
            <button type="button" className="k-btn outline" onClick={() => setReviewing(false)} disabled={busy}>{t('Edit')}</button>
            <button type="button" className="k-btn primary" onClick={confirm} disabled={busy}>{busy ? t('Sending…') : t('Send money')}</button>
          </div>
        </Modal>
      )}

      {success && (
        <Modal isOpen onClose={() => setSuccess(null)} title={t('Payment sent')} subtitle={t('Kavach verified and completed your payment.')}>
          <Celebrate />
          <div className="review-amount">{formatMoney(success.amount)}</div>
          <p className="review-payee" style={{ textAlign: 'center' }}>{t('To {payee}', { payee: success.payee })}</p>
          {success.ref && <div className="info-row"><span>{t('Reference')}</span><strong>{success.ref}</strong></div>}
          <div className="k-dialog-actions"><button type="button" className="k-btn primary wide" onClick={() => setSuccess(null)}>{t('Done')}</button></div>
        </Modal>
      )}
    </div>
  );
};
