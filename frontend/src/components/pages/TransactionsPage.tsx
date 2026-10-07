import React, { useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { FilterTabs } from '../common/FilterTabs';
import { RecentTransactions, TransactionDetailModal, categoryLabel } from '../overview/RecentTransactions';
import type { Transaction } from '../../types/banking';
import { useI18n } from '../../i18n';

const amountOf = (tx: Transaction) => tx.amount_minor ?? tx.amount_paise ?? 0;

export const TransactionsPage: React.FC = () => {
  const { overview } = useBanking();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [direction, setDirection] = useState('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const accounts = overview?.accounts || [];
  const q = search.toLowerCase().trim();
  // Search and account narrow the list first; the direction tabs then show counts for what is left.
  const matching = (overview?.transactions || []).filter(tx =>
    (accountFilter === 'all' || tx.account_id === accountFilter) &&
    (!q || [tx.description, tx.reference_number, tx.reference, categoryLabel(t, tx.category)].some(v => (v || '').toLowerCase().includes(q))));
  const out = matching.filter(tx => amountOf(tx) < 0);
  const into = matching.filter(tx => amountOf(tx) > 0);
  const shown = direction === 'out' ? out : direction === 'in' ? into : matching;

  return (
    <>
      <PageHeader title={t('Transactions')} subtitle={t('Follow every credit, debit and payment.')}
        actions={<button type="button" className="k-btn outline c-hide-phone" onClick={() => window.print()}><Icon name="download" />{t('Print or PDF')}</button>} />

      <section className="k-panel">
        <div className="toolbar c-tx-toolbar">
          <input type="search" placeholder={t('Search merchant, reference or category')} aria-label={t('Search transactions')}
            value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label={t('Filter by account')} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
            <option value="all">{t('All accounts')}</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.account_number_masked}</option>)}
          </select>
          <FilterTabs label={t('Filter by type')} name="tx-direction" value={direction} onChange={setDirection} tabs={[
            { id: 'all', label: t('All'), count: matching.length },
            { id: 'in', label: t('Money in'), count: into.length },
            { id: 'out', label: t('Money out'), count: out.length },
          ]} />
        </div>
        <RecentTransactions key={`${direction}-${accountFilter}`} transactions={shown} compact={false} accounts={accounts} onSelectTransaction={setSelectedTx} />
      </section>

      {selectedTx && <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </>
  );
};
