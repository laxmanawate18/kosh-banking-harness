import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import { Transaction } from '../../types/banking';
import { useI18n } from '../../i18n';
import { categoryLabel } from './RecentTransactions';
import { EASE } from '../common/Animate';

interface SpendingBreakdownProps {
  transactions: Transaction[];
}

const C = 2 * Math.PI * 65;  // ring circumference
const amountOf = (x: Transaction) => x.amount_minor ?? x.amount_paise ?? 0;
const formatShort = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((n || 0) / 100);

/** One ring segment: drawn as far as the shared sweep has reached (clockwise from 12 o'clock). */
const Segment: React.FC<{ i: number; start: number; size: number; sweep: MotionValue<number>; dim: boolean }> = ({ i, start, size, sweep, dim }) => {
  const dash = useTransform(sweep, p => { const len = Math.min(Math.max(p * C - start, 0), size); return `${len} ${C - len}`; });
  return (
    <motion.circle className={`donut-part tone-${i}`} cx="90" cy="90" r="65" style={{ strokeDasharray: dash }} strokeDashoffset={-start}
      animate={{ opacity: dim ? 0.25 : 1 }} transition={{ duration: 0.15 }} />
  );
};

export const SpendingBreakdown: React.FC<SpendingBreakdownProps> = ({ transactions }) => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true });
  const sweep = useMotionValue(reduce ? 1 : 0);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { sweep.set(1); return; }
    const controls = animate(sweep, 1, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [seen, reduce, sweep]);

  const categories: Record<string, number> = {};
  const debits = transactions.filter(x => amountOf(x) < 0);
  debits.forEach(x => { const c = x.category || 'OTHER'; categories[c] = (categories[c] || 0) - amountOf(x); });
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const items = sorted.slice(0, 3);
  if (sorted.length > 3) items.push(['OTHER', sorted.slice(3).reduce((n, v) => n + v[1], 0)]);
  const total = debits.reduce((n, x) => n - amountOf(x), 0);
  const starts = items.map((_, i) => items.slice(0, i).reduce((n, [, v]) => n + (v / (total || 1)) * C, 0));

  return (
    <>
      <div className="spending-visual" ref={ref}>
        <svg className="donut" viewBox="0 0 180 180" role="img" aria-label={t('Spending by category')}>
          <circle className="donut-base" cx="90" cy="90" r="65" />
          {items.map(([label, n], i) => (
            <Segment key={label} i={i} start={starts[i]} size={(n / (total || 1)) * C} sweep={sweep} dim={active !== null && active !== i} />
          ))}
        </svg>
        <div className="donut-center">
          <small>{t('Total spent')}</small>
          <strong>{formatShort(total)}</strong>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="legend c-legend-list" onMouseLeave={() => setActive(null)}>
          {items.map(([label, n], i) => (
            <li key={label} className={`legend-row ${active === i ? 'active' : ''}`} tabIndex={0}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
              <i className={`legend-dot tone-${i}`} aria-hidden="true" />
              <span>{categoryLabel(t, label)}</span>
              <span>{formatShort(n)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="legend"><p className="form-hint">{t('No spending in this period.')}</p></div>
      )}
    </>
  );
};
