import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { AnimatePresence, Stagger, motion } from '../common/Animate';
import { RequestCard, RequestDetailModal } from './RequestsPage';
import { submitServiceRequest } from '../../services/banking';
import { fdMaturity, formatRupees, rdMaturity } from '../common/Formatters';
import { useI18n } from '../../i18n';

interface DepositsPageProps {
  onNavigate?: (route: string) => void;
  onOpenService?: (serviceId: string) => void;
  onViewRequest?: (requestId: string) => void;
}

export const DepositsPage: React.FC<DepositsPageProps> = () => {
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

  const open = (type: 'FD' | 'RD') => {
    setFormError('');
    setModalType(type);
    setAmount(type === 'FD' ? '50000' : '5000');
    setTenureMonths('12');
  };

  const products = [
    { type: 'FD' as const, icon: 'deposits', title: t('Fixed deposit'), rate: t('Up to {rate}% p.a.', { rate: '7.25' }),
      body: t('Set aside a lump sum for 6 to 36 months. The rate is fixed when the bank confirms your deposit.'), cta: t('Open a fixed deposit') },
    { type: 'RD' as const, icon: 'calendar', title: t('Recurring deposit'), rate: t('Up to {rate}% p.a.', { rate: '6.85' }),
      body: t('Save a fixed amount every month and build the habit. Choose a term from 6 to 36 months.'), cta: t('Open a recurring deposit') },
  ];

  return (
    <>
      <PageHeader title={t('Deposits')} subtitle={t('Plan a deposit and send an application to your banking team.')} />
      <div className="k-page-stack">
        <AnimatePresence>
          {successMsg && (
            <motion.div className="k-note c-note-ok" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Icon name="check" /><span>{successMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <Stagger className="c-product-grid">
          {products.map((p, i) => (
            <Stagger.Item as="article" key={p.type} className="k-panel c-product">
              <span className="quick-icon"><Icon name={p.icon} /></span>
              <div>
                <h2>{p.title}</h2>
                <span className="c-rate">{p.rate}</span>
              </div>
              <p>{p.body}</p>
              <button type="button" className={`k-btn ${i === 0 ? 'primary' : 'outline'}`} onClick={() => open(p.type)}>{p.cta} <Icon name="arrow-right" /></button>
            </Stagger.Item>
          ))}
        </Stagger>

        <section aria-labelledby="dep-apps">
          <div className="c-section-head"><h2 id="dep-apps">{t('Your deposit applications')}</h2></div>
          {reqs.length ? (
            <Stagger className="request-list">
              {reqs.map((r: any) => <RequestCard key={r.id} request={r} onOpen={setSelectedRequest} />)}
            </Stagger>
          ) : (
            <div className="k-card empty">
              <Icon name="deposits" />
              <h3>{t('No deposits yet')}</h3>
              <p>{t('Open a fixed or recurring deposit and you can follow its progress here.')}</p>
              <button type="button" className="k-btn outline" onClick={() => open('FD')}>{t('Open a deposit')}</button>
            </div>
          )}
        </section>

        <div className="k-note">
          <Icon name="info" />
          <span>{t('Submitting an application does not immediately debit your account. Rate confirmation and booking require bank officer review.')}</span>
        </div>
      </div>

      {/* Deposit Application Modal */}
      {modalType && (
        <Modal
          isOpen={true}
          onClose={() => setModalType(null)}
          title={modalType === 'FD' ? t('Apply for fixed deposit') : t('Apply for recurring deposit')}
          subtitle={t('Review deposit tenure, interest rate and maturity estimate.')}
        >
          <form onSubmit={handleApplyDeposit}>
            <label className="k-field">
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

            <label className="k-field">
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

            <label className="k-field">
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

            <label className="k-field">
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

            <div className="c-maturity">
              <div className="info-row"><span>{t('Interest rate')}</span><strong>{t('{rate}% p.a.', { rate: interestRate })}</strong></div>
              <div className="info-row"><span>{t('Estimated maturity value')}</span><strong className="c-maturity-value">{formatRupees(estimatedMaturity)}</strong></div>
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}

            <div className="k-dialog-actions">
              <button type="button" className="k-btn outline" onClick={() => setModalType(null)} disabled={isSubmitting}>{t('Cancel')}</button>
              <button type="submit" className="k-btn primary" disabled={isSubmitting}>{isSubmitting ? t('Submitting…') : t('Submit application')}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedRequest && <RequestDetailModal request={selectedRequest} onClose={() => setSelectedRequest(null)} />}
    </>
  );
};
