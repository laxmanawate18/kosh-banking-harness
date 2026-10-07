import { useEffect, useState } from 'react';
import type { Transaction } from '../../types/banking';

const KEY = 'kosh.txSeenAt';

/**
 * Time of the newest transaction the customer had already seen when this view opened; anything newer is "new".
 * Read once per view, then moved forward, so each arrival is highlighted once. A first visit marks nothing new.
 */
export function useSeenSince(transactions: Transaction[] = []) {
  const newest = transactions.reduce((m, x) => (x.created_at > m ? x.created_at : m), '');
  const [since] = useState(() => localStorage.getItem(KEY));
  useEffect(() => {
    if (newest && newest > (localStorage.getItem(KEY) || '')) localStorage.setItem(KEY, newest);
  }, [newest]);
  return since ?? (newest || null);
}
