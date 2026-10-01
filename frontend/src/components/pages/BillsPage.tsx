import React, { useState } from 'react';
import { formatMoney } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { useI18n } from '../../i18n';

export const BillsPage: React.FC = () => {
  const { overview, payBill } = useBanking();
  const { t } = useI18n();
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState(overview?.accounts[0]?.id || '');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [payError, setPayError] = useState('');

  const bills = overview?.bills || [];
  const accounts = overview?.accounts || [];

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return t('Not set');
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

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
      <header className="page-heading">
        <div>
          <h1>{t('Bills, taken care of.')}</h1>
          <p>{t('Review upcoming payments and bills you’ve already paid.')}</p>
        </div>
      </header>

      {toastMsg && (
        <div className="badge success" style={{ padding: '8px 14px', marginBottom: '14px', display: 'inline-flex' }}>
          <Icon name="check" /> {toastMsg}
        </div>
      )}

      <div className="two-grid">
        {bills.map((b: any) => {
          const isDue = b.status === 'DUE' || b.status === 'PENDING';
          const amt = b.amount_minor ?? b.amount_paise ?? 0;

          return (
            <section key={b.id} className="panel panel-pad">
              <div className="merchant-cell">
                <span className="merchant-icon utilities">
                  <Icon name="utilities" />
                </span>
                <div>
                  <h3>{b.biller_name}</h3>
                  <small className="muted">{b.category} · {b.reference_masked || b.consumer_number || '•••• 8821'}</small>
                </div>
              </div>

              <div className="balance">{formatMoney(amt)}</div>
              <Badge status={b.status}>{b.status}</Badge>

              <div className="info-row">
                <span>{t('Due date')}</span>
                <strong>{formatDate(b.due_date)}</strong>
              </div>

              <div className="info-row">
                <span>{t('Biller verification')}</span>
                <strong>{t('Verified recurring biller')}</strong>
              </div>

              {b.payment_reference && (
                <div className="info-row">
                  <span>{t('Payment reference')}</span>
                  <strong>{b.payment_reference}</strong>
                </div>
              )}

              <div className="dialog-footer" style={{ marginTop: '16px' }}>
                {isDue ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setPayError('');
                      setSelectedBill(b);
                    }}
                  >
                    {t('Review & pay')}
                  </button>
                ) : (
                  <span className="muted">{t('Payment recorded')}</span>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="content-note" style={{ marginTop: '20px' }}>
        {t('Bill amounts are retrieved from your registered biller. The payment form cannot change the amount or destination.')}
      </div>

      {selectedBill && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedBill(null)}
          title={t('Review bill payment')}
          subtitle={t('Pay {name}', { name: selectedBill.biller_name })}
        >
          <div className="review-amount" style={{ textAlign: 'center', margin: '14px 0' }}>
            {formatMoney(selectedBill.amount_minor ?? selectedBill.amount_paise ?? 0)}
          </div>
          <p className="review-payee" style={{ textAlign: 'center', marginBottom: '16px' }}>
            {t('To {name}', { name: selectedBill.biller_name })}
          </p>

          <div className="payment-form">
            <label>
              {t('From account')}
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} • {a.account_number_masked} · {formatMoney(a.available_balance_minor ?? a.balance_paise ?? 0)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="info-row">
            <span>{t('Biller category')}</span>
            <strong>{selectedBill.category}</strong>
          </div>
          <div className="info-row">
            <span>{t('Due date')}</span>
            <strong>{formatDate(selectedBill.due_date)}</strong>
          </div>
          <div className="info-row">
            <span>{t('Payment fee')}</span>
            <strong>₹0.00</strong>
          </div>

          <div className="content-note" style={{ margin: '14px 0' }}>
            {t('Sentinel will verify the registered bill and authorize eligible payments.')}
          </div>

          {payError && <p className="form-error" role="alert">{payError}</p>}

          <div className="dialog-footer">
            <button
              type="button"
              className="button secondary"
              onClick={() => setSelectedBill(null)}
              disabled={isLoading}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handlePay}
              disabled={isLoading}
            >
              {isLoading ? t('Processing…') : t('Confirm bill payment')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
