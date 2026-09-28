import React from 'react';
import { Transaction } from '../../types/banking';
import { useI18n } from '../../i18n';
import { categoryLabel } from './RecentTransactions';

interface SpendingBreakdownProps {
  transactions: Transaction[];
}

export const SpendingBreakdown: React.FC<SpendingBreakdownProps> = ({ transactions }) => {
  const { t } = useI18n();
  const categories: Record<string, number> = {};
  const debits = transactions.filter(t => (t.amount_minor ?? t.amount_paise ?? 0) < 0);

  debits.forEach(t => {
    const c = t.category || 'OTHER';
    const amt = t.amount_minor ?? t.amount_paise ?? 0;
    categories[c] = (categories[c] || 0) - amt;
  });

  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const items = sorted.slice(0, 3);
  if (sorted.length > 3) {
    items.push(['OTHER', sorted.slice(3).reduce((n, v) => n + v[1], 0)]);
  }

  const total = debits.reduce((n, t) => n - (t.amount_minor ?? t.amount_paise ?? 0), 0);

  const formatShort = (n: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format((n || 0) / 100);
  };

  let offset = 0;

  return (
    <>
      <div className="spending-visual">
        <svg className="donut" viewBox="0 0 180 180" aria-label={t('Spending by category')}>
          <circle className="donut-base" cx="90" cy="90" r="65" />
          {items.map(([_, n], i) => {
            const size = (n / (total || 1)) * 408.4;
            const currentOffset = offset;
            offset += size;
            return (
              <circle
                key={i}
                className={`donut-part tone-${i}`}
                cx="90"
                cy="90"
                r="65"
                strokeDasharray={`${size} ${408.4 - size}`}
                strokeDashoffset={-currentOffset}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <small>{t('Total spent')}</small>
          <strong>{formatShort(total)}</strong>
        </div>
      </div>

      <div className="legend">
        {items.length > 0 ? (
          items.map(([label, n], i) => (
            <div key={label} className="legend-row">
              <i className={`legend-dot tone-${i}`} />
              <span>{categoryLabel(t, label)}</span>
              <span>{formatShort(n)}</span>
            </div>
          ))
        ) : (
          <p className="form-hint">{t('No spending in this period.')}</p>
        )}
      </div>
    </>
  );
};
