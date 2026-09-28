import React from 'react';
import { Transaction } from '../../types/banking';
import { formatMoney, formatDate } from '../common/Formatters';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
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
  return labels[code] ?? code.toLowerCase().replace(/^\w/, c => c.toUpperCase());
};

interface RecentTransactionsProps {
  transactions: Transaction[];
  compact?: boolean;
  onViewAll?: () => void;
  onSelectTransaction?: (transaction: Transaction) => void;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({
  transactions,
  compact = true,
  onViewAll,
  onSelectTransaction,
}) => {
  const { t } = useI18n();
  const ts = compact ? transactions.slice(0, 5) : transactions;

  const getMerchantIcon = (category?: string) => {
    const kind = String(category || 'salary').toLowerCase();
    if (kind === 'salary') return 'salary';
    if (kind === 'utilities') return 'utilities';
    if (kind === 'p2p_transfer') return 'payments';
    if (kind === 'groceries') return 'groceries';
    if (kind === 'entertainment') return 'entertainment';
    return 'transactions';
  };

  const getCleanDescription = (desc: string) => {
    return desc.replace(/^(UPI|BBPS|Salary)\s*•\s*/i, '');
  };

  if (ts.length === 0) {
    return (
      <div className="empty">
        <Icon name="requests" />
        <h3>{t('No transactions here')}</h3>
        <p>{t('Try a different search or account filter.')}</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>{t('Transaction')}</th>
            <th>{t('Date')}</th>
            {!compact && <th className="category-col">{t('Account')}</th>}
            {!compact && <th className="status-col">{t('Status')}</th>}
            <th className="amount">{t('Amount')}</th>
            <th aria-label={t('Details')}></th>
          </tr>
        </thead>
        <tbody>
          {ts.map(tx => {
            const kind = String(tx.category || 'salary').toLowerCase();
            const iconName = getMerchantIcon(tx.category);
            const amountVal = tx.amount_minor ?? tx.amount_paise ?? 0;
            const isCredit = amountVal > 0;
            return (
              <tr key={tx.id}>
                <td>
                  <div className="merchant-cell">
                    <span className={`merchant-icon ${kind}`}>
                      <Icon name={iconName} />
                    </span>
                    <div>
                      <strong>{getCleanDescription(tx.description)}</strong>
                      <small>{categoryLabel(t, tx.category)}</small>
                    </div>
                  </div>
                </td>
                <td className="muted">{formatDate(tx.created_at)}</td>
                {!compact && (
                  <td className="category-col muted">{tx.account_id}</td>
                )}
                {!compact && (
                  <td className="status-col">
                    <Badge status={tx.status}>{tx.status}</Badge>
                  </td>
                )}
                <td className={`amount ${isCredit ? 'credit' : ''}`}>
                  {isCredit ? '+ ' : ''}{formatMoney(tx.amount_minor)}
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onSelectTransaction?.(tx)}
                    aria-label={t('Details for {name}', { name: tx.description })}
                  >
                    <Icon name="chevron-right" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
