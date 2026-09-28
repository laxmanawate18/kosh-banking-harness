import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { submitServiceRequest } from '../../services/banking';
import { fdMaturity, rdMaturity } from '../common/Formatters';
import { useI18n } from '../../i18n';

interface DepositsPageProps {
  onNavigate?: (route: string) => void;
  onOpenService?: (serviceId: string) => void;
  onViewRequest?: (requestId: string) => void;
}

export const DepositsPage: React.FC<DepositsPageProps> = ({
  onNavigate,
  onOpenService,
  onViewRequest,
}) => {
  const { overview, refreshOverview } = useBanking();
  const { t } = useI18n();
  const [modalType, setModalType] = useState<'FD' | 'RD' | null>(null);
  const [amount, setAmount] = useState('50000');
  const [tenureMonths, setTenureMonths] = useState('12');
  const [selectedAccId, setSelectedAccId] = useState(overview?.accounts[0]?.id || '');
  const [payoutOption, setPayoutOption] = useState('ON_MATURITY');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  const accounts = overview?.accounts || [];
  const reqs = (overview?.requests || []).filter((r: any) =>
    ['P1-19', 'P1-20', 'FD_BOOKING', 'RD_BOOKING'].includes(r.service_id || r.request_type || '')
  );

  // Illustrative rate card; the backend accepts 6, 12, 24 or 36 months and up to ₹2,00,000.
  const RATES: Record<'FD' | 'RD', Record<number, number>> = {
    FD: { 6: 6.5, 12: 7.25, 24: 7.1, 36: 7.0 },
    RD: { 6: 6.25, 12: 6.85, 24: 6.9, 36: 6.75 },
  };
  const TENURES = [6, 12, 24, 36];
  const numAmount = parseFloat(amount) || 0;
  const numMonths = parseInt(tenureMonths, 10) || 12;
  const interestRate = RATES[modalType || 'FD'][numMonths] ?? 7;

  const estimatedMaturity = Math.round(modalType === 'FD'
    ? fdMaturity(numAmount, interestRate, numMonths / 12)
    : rdMaturity(numAmount, interestRate, numMonths));

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleApplyDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (numAmount < 1000 || numAmount > 200000) {
      setFormError(t('Enter an amount between ₹1,000 and ₹2,00,000.'));
      return;
    }
    setIsSubmitting(true);
    try {
      await submitServiceRequest({
        service_id: modalType === 'FD' ? 'P1-19' : 'P1-20',
        data: {
          account_id: selectedAccId || accounts[0]?.id,
          amount_minor: Math.round(numAmount * 100),
          tenure_months: String(numMonths),
          details: `${modalType} of Rs ${numAmount} for ${numMonths} months at ${interestRate}% p.a., payout ${payoutOption}`,
        },
      });
      setSuccessMsg(modalType === 'FD'
        ? t('Fixed deposit application submitted for officer review.')
        : t('Recurring deposit application submitted for officer review.'));
      setModalType(null);
      await refreshOverview();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setFormError(err.message || t('We could not submit your deposit application. Nothing was booked.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('Make room for your future.')}</h1>
          <p>{t('Plan a deposit and send an application to your banking team.')}</p>
        </div>
      </header>

      {successMsg && (
        <div className="badge success" style={{ padding: '8px 14px', marginBottom: '14px', display: 'inline-flex' }}>
          <Icon name="check" /> {successMsg}
        </div>
      )}

      <div className="two-grid">
        <article className="service-tile">
          <span className="quick-icon">
            <Icon name="deposits" />
          </span>
          <h2>{t('Fixed deposit')}</h2>
          <p>
            {t('Set aside a lump sum for a term that suits your plans. Earn up to 7.25% p.a. guaranteed returns with officer rate confirmation before booking.')}
          </p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setModalType('FD');
              setAmount('50000');
              setTenureMonths('12');
            }}
          >
            {t('Apply for fixed deposit')}
          </button>
        </article>

        <article className="service-tile">
          <span className="quick-icon">
            <Icon name="calendar" />
          </span>
          <h2>{t('Recurring deposit')}</h2>
          <p>
            {t('Build a disciplined savings habit with a fixed monthly contribution. Earn up to 6.85% p.a. returns with flexible tenure options.')}
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setModalType('RD');
              setAmount('5000');
              setTenureMonths('12');
            }}
          >
            {t('Apply for recurring deposit')}
          </button>
        </article>
      </div>

      <div className="section-heading" style={{ marginTop: '20px' }}>
        <h2>{t('Your deposit applications')}</h2>
      </div>

      {reqs.length ? (
        <div className="request-list">
          {reqs.map((r: any) => (
            <article key={r.id} className="request-card">
              <div>
                <h3>{r.service_name || r.request_type || t('Deposit application')}</h3>
                <p>
                  {r.id} · {new Date(r.created_at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="request-actions">
                <Badge status={r.status || 'PENDING_APPROVAL'}>
                  {r.status || 'PENDING_APPROVAL'}
                </Badge>
                <button
                  type="button"
                  className="button"
                  onClick={() => setSelectedRequest(r)}
                >
                  {t('View details')}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="requests" />
          <h3>{t('Nothing to track just yet')}</h3>
          <p>{t('New requests and their progress will appear here.')}</p>
          <button
            type="button"
            className="button"
            onClick={() => onNavigate?.('services')}
          >
            {t('Explore services')}
          </button>
        </div>
      )}

      <div className="content-note" style={{ marginTop: '20px' }}>
        {t('Submitting an application does not immediately debit your account. Rate confirmation and booking require bank officer review.')}
      </div>

      {/* Deposit Application Modal */}
      {modalType && (
        <Modal
          isOpen={true}
          onClose={() => setModalType(null)}
          title={modalType === 'FD' ? t('Apply for fixed deposit') : t('Apply for recurring deposit')}
          subtitle={t('Review deposit tenure, interest rate and maturity estimate.')}
        >
          <form onSubmit={handleApplyDeposit} className="payment-form">
            <label>
              {t('From account')}
              <select
                value={selectedAccId}
                onChange={e => setSelectedAccId(e.target.value)}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} • {a.account_number_masked}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {modalType === 'FD' ? t('Deposit amount (₹)') : t('Monthly contribution (₹)')}
              <input
                type="number"
                min="1000"
                max="200000"
                step="500"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </label>

            <label>
              {t('Tenure')}
              <select
                value={tenureMonths}
                onChange={e => setTenureMonths(e.target.value)}
              >
                {TENURES.map(n => (
                  <option key={n} value={String(n)}>{t('{n} months ({rate}% p.a.)', { n, rate: RATES[modalType][n].toFixed(2) })}</option>
                ))}
              </select>
            </label>

            <label>
              {t('Interest payout')}
              <select
                value={payoutOption}
                onChange={e => setPayoutOption(e.target.value)}
              >
                <option value="ON_MATURITY">{t('Cumulative (on maturity)')}</option>
                <option value="QUARTERLY">{t('Quarterly payout')}</option>
                <option value="MONTHLY">{t('Monthly payout')}</option>
              </select>
            </label>

            <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: '8px', margin: '14px 0', border: '1px solid var(--line)' }}>
              <div className="info-row"><span>{t('Interest rate')}</span><strong>{t('{rate}% p.a.', { rate: interestRate })}</strong></div>
              <div className="info-row"><span>{t('Estimated maturity value')}</span><strong style={{ color: 'var(--ok)', fontSize: '14px' }}>{formatMoney(estimatedMaturity)}</strong></div>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}

            <div className="dialog-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModalType(null)}
                disabled={isSubmitting}
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? t('Submitting…') : t('Submit application')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Request Details Modal */}
      {selectedRequest && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedRequest(null)}
          title={t('Deposit application details')}
          subtitle={t('Reference {id}', { id: selectedRequest.id })}
        >
          <div className="info-row">
            <span>{t('Service')}</span>
            <strong>{selectedRequest.service_name || selectedRequest.request_type || t('Deposit application')}</strong>
          </div>
          <div className="info-row">
            <span>{t('Status')}</span>
            <Badge status={selectedRequest.status}>{selectedRequest.status}</Badge>
          </div>
          <div className="info-row">
            <span>{t('Submitted on')}</span>
            <strong>{new Date(selectedRequest.created_at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          </div>
          <div className="dialog-footer" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="button primary wide"
              onClick={() => setSelectedRequest(null)}
            >
              {t('Done')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
