import React, { useState } from 'react';
import { AccountApplication } from '../applications/AccountApplication';
import type { Product } from '../../types/products';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { AnimatePresence, EASE, Stagger, motion } from '../common/Animate';
import { useReducedMotion } from 'framer-motion';
import { RequestCard, RequestDetailModal } from './RequestsPage';
import { submitServiceRequest } from '../../services/banking';
import { fdMaturity, formatDate, formatRupees, rdMaturity } from '../common/Formatters';
import { HideBalancesToggle, Money } from '../app/Balance';
import { useI18n } from '../../i18n';
import type { Account } from '../../types/banking';

/** A booked deposit as the bank returns it (an account of type FIXED_DEPOSIT / RECURRING_DEPOSIT). */
type Deposit = Account & {
  balance_minor?: number; interest_rate?: number; tenure_months?: number; opened_at?: string;
  maturity_date?: string; maturity_amount_minor?: number; monthly_instalment_minor?: number | null;
};

/**
 * Principal to maturity as a small growth curve; the maturity figure counts up as the line draws.
 * Uses the bank's maturity amount; without one, estimates from the deposit's own rate and term (labelled "Estimate").
 */
const DepositGrowth: React.FC<{ d: Deposit }> = ({ d }) => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const recurring = d.type === 'RECURRING_DEPOSIT';
  const principal = d.balance_minor ?? d.available_balance_minor ?? 0;
  const rate = d.interest_rate, months = d.tenure_months;
  const instalment = d.monthly_instalment_minor ?? principal;
  const value = (m: number) => (recurring ? rdMaturity(instalment, rate!, m) : fdMaturity(principal, rate!, m / 12));
  const estimate = d.maturity_amount_minor == null;
  const maturity = d.maturity_amount_minor ?? (rate != null && months ? Math.round(value(months)) : null);
  if (maturity == null || !months || rate == null) return null;
  // Shape from the deposit's own compounding, scaled to the box: honest, if gentle.
  const pts = Array.from({ length: 13 }, (_, k) => {
    const m = (months * k) / 12;
    const v = k === 0 ? (recurring ? instalment : principal) : k === 12 ? maturity : value(m);
    return [m, v] as const;
  });
  const lo = pts[0][1], hi = Math.max(maturity, lo + 1);
  const path = pts.map(([m, v], k) => `${k ? 'L' : 'M'}${(4 + (m / months) * 392).toFixed(1)},${(56 - ((v - lo) / (hi - lo)) * 48).toFixed(1)}`).join(' ');
  return (
    <div className="c-growth">
      <svg viewBox="0 0 400 64" className="c-growth-curve" aria-hidden="true">
        <path d={`${path} L396,60 L4,60 Z`} className="c-growth-area" />
        <motion.path d={path} className="c-growth-line" initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }} />
      </svg>
      <dl className="c-growth-ends">
        <div><dt>{recurring ? t('Deposited so far') : t('Principal')}</dt><dd><Money value={principal} /></dd></div>
        <div className="end">
          <dt>{d.maturity_date ? t('At maturity, {date}', { date: formatDate(d.maturity_date) }) : t('At maturity')}{estimate && <span className="c-tag">{t('Estimate')}</span>}</dt>
          <dd><Money value={maturity} /></dd>
        </div>
      </dl>
    </div>
  );
};

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
  const [fdProduct, setFdProduct] = useState<Product | null>(null);

  const accounts = overview?.accounts || [];
  const deposits = accounts.filter(a => a.type === 'FIXED_DEPOSIT' || a.type === 'RECURRING_DEPOSIT') as Deposit[];
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
    if (type === 'FD') {  // a fixed deposit is booked in the core by the robot, through the account-opening pipeline
      fetch('/api/products?category=deposits').then(r => r.json())
        .then(({ products }) => setFdProduct(products.find((p: Product) => p.id === 'PROD-FD-SMART') || products[0] || null))
        .catch(() => setFormError(t('The deposit form could not be opened. Please try again.')));
      return;
    }
    setFormError('');
    setModalType(type);
    setAmount('5000');
    setTenureMonths('12');
  };

  const products = [
    { type: 'FD' as const, icon: 'deposits', title: t('Fixed deposit'), rate: t('{rate}% p.a.', { rate: '8.10' }),  // the published Kosh Vriddhi Smart FD rate
      body: t('Set aside a lump sum for 6 to 36 months. The rate is fixed when the bank confirms your deposit.'), cta: t('Open a fixed deposit') },
    { type: 'RD' as const, icon: 'calendar', title: t('Recurring deposit'), rate: t('Up to {rate}% p.a.', { rate: '6.85' }),
      body: t('Save a fixed amount every month and build the habit. Choose a term from 6 to 36 months.'), cta: t('Open a recurring deposit') },
  ];

  return (
    <>
      <PageHeader title={t('Deposits')} subtitle={t('Plan a deposit and send an application to your banking team.')}
        actions={deposits.length ? <HideBalancesToggle /> : undefined} />
      <div className="k-page-stack">
        <AnimatePresence>
          {successMsg && (
            <motion.div className="k-note c-note-ok" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Icon name="check" /><span>{successMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {deposits.length > 0 && (
          <section aria-labelledby="dep-mine">
            <div className="c-section-head"><h2 id="dep-mine">{t('Your deposits')}</h2></div>
            <Stagger className="c-product-grid">
              {deposits.map(d => (
                <Stagger.Item as="article" key={d.id} className="k-panel c-deposit">
                  <header className="c-deposit-head">
                    <div>
                      <h3>{d.name}</h3>
                      <span className="k-acc-no">{d.account_number_masked}{d.opened_at ? ` · ${t('Opened {date}', { date: formatDate(d.opened_at) })}` : ''}</span>
                    </div>
                    {d.interest_rate != null && <span className="c-rate">{t('{rate}% p.a.', { rate: d.interest_rate })}</span>}
                  </header>
                  {d.tenure_months ? <p className="c-deposit-term">{t('{n} months', { n: d.tenure_months })}</p> : null}
                  <DepositGrowth d={d} />
                </Stagger.Item>
              ))}
            </Stagger>
          </section>
        )}

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
          <span>{t('A fixed deposit is booked in core banking within a minute of verifying your identity, and the amount moves from the savings account you choose. A recurring deposit request is reviewed by the bank first.')}</span>
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
      {fdProduct && <AccountApplication product={fdProduct} onClose={() => { setFdProduct(null); refreshOverview(); }} />}
    </>
  );
};
