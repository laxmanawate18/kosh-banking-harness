import React, { useState } from 'react';
import { formatDate, formatMoney } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { PageHeader } from '../common/PageHeader';
import { AnimatePresence, AnimatedNumber, Stagger, motion } from '../common/Animate';
import { categoryLabel } from '../overview/RecentTransactions';
import { LotusLoader } from '../common/LotusLoader';
import { useI18n } from '../../i18n';

const amountOf = (b: any) => b.amount_minor ?? b.amount_paise ?? 0;
const isDue = (b: any) => ['DUE', 'PENDING', 'OVERDUE'].includes(b.status);

export const BillsPage: React.FC = () => {
  const { overview, payBill } = useBanking();
  const { t } = useI18n();
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(overview?.accounts[0]?.id || '');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [payError, setPayError] = useState('');

  // Bills that need paying come first.
  const bills = [...(overview?.bills || [])].sort((a: any, b: any) => Number(isDue(b)) - Number(isDue(a)));
  const accounts = overview?.accounts || [];
  const due = bills.filter(isDue);

  // Until the accounts arrive, say so instead of claiming there is nothing here.
  if (!overview) return <LotusLoader label={t('Loading your bills…')} />;

  const handlePay = async () => {
    if (!selectedBill) return;
    setIsLoading(true);
    setPayError('');
    try {
      await payBill(selectedBill.id, selectedAccountId || accounts[0]?.id);
      setToastMsg(t('Payment recorded for {name}', { name: selectedBill.biller_name }));
      setSelectedBill(null);
      setTimeout(() => setToastMsg(''), 4000);
    } catch (err: any) {
      setPayError(err.message || t('Payment failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <PageHeader title={t('Bills and recharge')} subtitle={t('Review upcoming payments and bills you’ve already paid.')} />
      <div className="k-page-stack">
        <AnimatePresence>
          {toastMsg && (
            <motion.div className="k-note c-note-ok" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Icon name="check" /><span>{toastMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="c-bills-layout">
          {bills.length === 0 ? (
            <div className="k-card empty"><Icon name="bills" /><h3>{t('No bills yet')}</h3><p>{t('Bills from your registered billers will appear here.')}</p></div>
          ) : (
            <Stagger className="c-bill-list">
              {bills.map((b: any) => (
                <Stagger.Item as="article" key={b.id} className="k-panel c-bill">
                  <header className="c-bill-head">
                    <span className="merchant-icon utilities"><Icon name="utilities" /></span>
                    <div>
                      <h2>{b.biller_name}</h2>
                      <small>{categoryLabel(t, b.category)} · {b.reference_masked || b.consumer_number}</small>
                    </div>
                    <Badge status={b.status} />
                  </header>
                  <div className="c-bill-amount">{formatMoney(amountOf(b))}</div>
                  <div className="info-row"><span>{t('Due date')}</span><strong>{b.due_date ? formatDate(b.due_date) : t('Not set')}</strong></div>
                  {b.paid_at && <div className="info-row"><span>{t('Paid on')}</span><strong>{formatDate(b.paid_at)}</strong></div>}
                  {b.payment_reference && <div className="info-row"><span>{t('Payment reference')}</span><strong>{b.payment_reference}</strong></div>}
                  {isDue(b) ? (
                    <button type="button" className="k-btn primary wide c-mt" onClick={() => { setPayError(''); setSelectedBill(b); }}>
                      {t('Review and pay')} <Icon name="arrow-right" />
                    </button>
                  ) : (
                    <p className="c-paid"><Icon name="check" />{t('Paid. Nothing to do.')}</p>
                  )}
                </Stagger.Item>
              ))}
            </Stagger>
          )}

          <aside className="k-page-stack">
            <section className="k-panel">
              <header className="k-panel-head"><div><h2>{t('At a glance')}</h2><p>{t('Across your registered billers')}</p></div></header>
              <div className="k-panel-body">
                <div className="info-row"><span>{t('To pay now')}</span><strong className="c-strong-num"><AnimatedNumber value={due.reduce((n, b) => n + amountOf(b), 0)} format={v => formatMoney(Math.round(v))} /></strong></div>
                <div className="info-row"><span>{t('Bills due')}</span><strong>{due.length}</strong></div>
                <div className="info-row"><span>{t('Bills paid')}</span><strong>{bills.length - due.length}</strong></div>
              </div>
            </section>
            <aside className="k-kavach-tip">
              <Icon name="shield" />
              <div>
                <strong>{t('Safe bill payments')}</strong>
                <p>{t('Bill amounts are retrieved from your registered biller. The payment form cannot change the amount or destination.')}</p>
              </div>
            </aside>
          </aside>
        </div>
      </div>

      {selectedBill && (
        <Modal isOpen onClose={() => setSelectedBill(null)} title={t('Review bill payment')} subtitle={t('Pay {name}', { name: selectedBill.biller_name })}>
          <div className="review-amount">{formatMoney(amountOf(selectedBill))}</div>
          <p className="review-payee">{t('To {name}', { name: selectedBill.biller_name })}</p>
          <label className="k-field">
            {t('From account')}
            <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} · {a.account_number_masked} · {formatMoney(a.available_balance_minor ?? a.balance_paise ?? 0)}</option>
              ))}
            </select>
          </label>
          <div className="info-row"><span>{t('Biller category')}</span><strong>{categoryLabel(t, selectedBill.category)}</strong></div>
          <div className="info-row"><span>{t('Due date')}</span><strong>{selectedBill.due_date ? formatDate(selectedBill.due_date) : t('Not set')}</strong></div>
          <div className="info-row"><span>{t('Payment fee')}</span><strong>₹0.00</strong></div>
          <div className="k-note c-mt"><Icon name="shield" /><span>{t('Sentinel will verify the registered bill and authorize eligible payments.')}</span></div>
          {payError && <p className="form-error" role="alert">{payError}</p>}
          <div className="k-dialog-actions">
            <button type="button" className="k-btn outline" onClick={() => setSelectedBill(null)} disabled={isLoading}>{t('Cancel')}</button>
            <button type="button" className="k-btn primary" onClick={handlePay} disabled={isLoading}>{isLoading ? t('Processing…') : t('Confirm bill payment')}</button>
          </div>
        </Modal>
      )}
    </>
  );
};
