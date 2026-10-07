import React from 'react';
import { Transaction } from '../../types/banking';
import { formatMoney, formatDate, formatDateTime, humanizeCode } from '../common/Formatters';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { Stagger } from '../common/Animate';
import { useI18n } from '../../i18n';

/** Display label for a backend transaction category code; unknown codes are shown in sentence case. */
export const categoryLabel = (t: (key: string) => string, category?: string) => {
  const code = String(category || '').toUpperCase();
  const labels: Record<string, string> = {
    SALARY: t('Salary'),
    UTILITIES: t('Utilities'),
    ELECTRICITY: t('Electricity'),
    INTERNET: t('Internet'),
    GROCERIES: t('Groceries'),
    ENTERTAINMENT: t('Entertainment'),
    P2P_TRANSFER: t('Transfer'),
    OTHER: t('Other'),
  };
  if (!code) return t('General');
  return labels[code] ?? humanizeCode(code);
};

const ICONS: Record<string, string> = { salary: 'salary', utilities: 'utilities', p2p_transfer: 'payments', groceries: 'groceries', entertainment: 'entertainment' };
const amountOf = (tx: Transaction) => tx.amount_minor ?? tx.amount_paise ?? 0;
/** "UPI • Vikram" -> "Vikram": the channel is already shown by the icon and category. */
const cleanDescription = (desc: string) => (desc || '').replace(/^(UPI|BBPS|Salary)\s*•\s*/i, '');

interface RecentTransactionsProps {
  transactions: Transaction[];
  compact?: boolean;
  /** Account names for the Account column of the full list. */
  accounts?: { id: string; name?: string }[];
  onSelectTransaction?: (transaction: Transaction) => void;
}

/** The one transaction table: five rows on dashboards (compact), every row with account and status on the Transactions page. */
export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  compact = true,
  accounts = [],
  onSelectTransaction,
}) => {
  const { t } = useI18n();
  const ts = compact ? transactions.slice(0, 5) : transactions;

  if (ts.length === 0) {
    return (
      <div className="empty">
        <Icon name="transactions" />
        <h3>{t('No transactions here')}</h3>
        <p>{compact ? t('Payments you make and receive will show up here.') : t('Try a different search or account filter.')}</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="table tx-table">
        <thead>
          <tr>
            <th>{t('Transaction')}</th>
            <th>{t('Date')}</th>
            {!compact && <th className="category-col">{t('Account')}</th>}
            {!compact && <th className="status-col">{t('Status')}</th>}
            <th className="amount">{t('Amount')}</th>
            <th><span className="sr-only">{t('Details')}</span></th>
          </tr>
        </thead>
        <Stagger as="tbody">
          {ts.map(tx => {
            const kind = String(tx.category || 'salary').toLowerCase();
            const amount = amountOf(tx);
            const isCredit = amount > 0;
            return (
              <Stagger.Item as="tr" key={tx.id} className={onSelectTransaction ? 'c-tx-row' : undefined}
                onClick={onSelectTransaction ? () => onSelectTransaction(tx) : undefined}>
                <td>
                  <div className="merchant-cell">
                    <span className={`merchant-icon ${kind}`}><Icon name={ICONS[kind] || 'transactions'} /></span>
                    <div>
                      <strong>{cleanDescription(tx.description)}</strong>
                      <small>{categoryLabel(t, tx.category)}</small>
                    </div>
                  </div>
                </td>
                <td className="muted date-col">{formatDate(tx.created_at)}</td>
                {!compact && <td className="category-col muted">{accounts.find(a => a.id === tx.account_id)?.name || t('Primary account')}</td>}
                {!compact && <td className="status-col"><Badge status={tx.status} /></td>}
                <td className={`amount ${isCredit ? 'credit' : ''}`}>{isCredit ? '+ ' : ''}{formatMoney(amount)}</td>
                <td>
                  {onSelectTransaction && (
                    <button type="button" className="icon-button" onClick={e => { e.stopPropagation(); onSelectTransaction(tx); }}
                      aria-label={t('Details for {name}', { name: tx.description })}>
                      <Icon name="chevron-right" />
                    </button>
                  )}
                </td>
              </Stagger.Item>
            );
          })}
        </Stagger>
      </table>
    </div>
  );
};

/** The transaction detail dialog used by the dashboard and the transactions page. */
export const TransactionDetailModal: React.FC<{ tx: Transaction; onClose: () => void }> = ({ tx, onClose }) => {
  const { t } = useI18n();
  const ref = tx.reference_number || tx.reference || tx.id;
  const amount = amountOf(tx);
  return (
    <Modal isOpen onClose={onClose} title={t('Transaction details')} subtitle={t('Reference {ref}', { ref })}>
      <div className={`review-amount ${amount > 0 ? 'c-credit' : ''}`}>{amount > 0 ? '+ ' : ''}{formatMoney(amount)}</div>
      <div className="info-row"><span>{t('Description')}</span><strong>{tx.description}</strong></div>
      <div className="info-row"><span>{t('Date and time')}</span><strong>{formatDateTime(tx.created_at)}</strong></div>
      <div className="info-row"><span>{t('Category')}</span><strong>{categoryLabel(t, tx.category)}</strong></div>
      <div className="info-row"><span>{t('Status')}</span><Badge status={tx.status} /></div>
      <div className="info-row"><span>{t('Reference')}</span><strong>{ref}</strong></div>
      <div className="k-dialog-actions">
        <button type="button" className="k-btn primary wide" onClick={onClose}>{t('Done')}</button>
      </div>
    </Modal>
  );
};
