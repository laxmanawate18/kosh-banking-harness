import React, { useState } from 'react';
import { formatMoney } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { TransactionDetailModal } from '../overview/RecentTransactions';
import type { Transaction } from '../../types/banking';
import { useI18n } from '../../i18n';

export const TransactionsPage: React.FC = () => {
  const { overview } = useBanking();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const accounts = overview?.accounts || [];
  const transactions = overview?.transactions || [];

  const filteredTransactions = transactions.filter((tx: Transaction) => {
    const q = search.toLowerCase().trim();
    const matchesSearch = !q ||
      (tx.description || '').toLowerCase().includes(q) ||
      (tx.reference_number || '').toLowerCase().includes(q) ||
      (tx.category || '').toLowerCase().includes(q);

    const matchesAccount = accountFilter === 'all' || tx.account_id === accountFilter;

    const amt = tx.amount_minor ?? tx.amount_paise ?? 0;
    const matchesDirection = directionFilter === 'all' ||
      (directionFilter === 'debit' && amt < 0) ||
      (directionFilter === 'credit' && amt > 0);

    return matchesSearch && matchesAccount && matchesDirection;
  });

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch {
      return isoStr;
    }
  };

  const getMerchantIcon = (category?: string) => {
    const kind = String(category || 'salary').toLowerCase();
    if (kind === 'groceries') return 'groceries';
    if (kind === 'salary') return 'salary';
    if (kind === 'entertainment') return 'entertainment';
    if (kind === 'utilities') return 'utilities';
    if (kind === 'p2p_transfer') return 'payments';
    return 'transactions';
  };

  const getCleanDescription = (desc: string) => {
    return (desc || '').replace(/^(UPI|BBPS|Salary) • /, '');
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('Transactions')}</h1>
          <p>{t('Follow every credit, debit and payment.')}</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="button" onClick={() => window.print()}>
            <Icon name="download" /> {t('Export statement')}
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            id="transactionSearch"
            type="search"
            placeholder={t('Search merchant, reference or category')}
            aria-label={t('Search transactions')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            id="transactionAccount"
            aria-label={t('Filter by account')}
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
          >
            <option value="all">{t('All accounts')}</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} • {a.account_number_masked}</option>
            ))}
          </select>
          <select
            id="transactionDirection"
            aria-label={t('Filter by type')}
            value={directionFilter}
            onChange={e => setDirectionFilter(e.target.value)}
          >
            <option value="all">{t('All transactions')}</option>
            <option value="debit">{t('Money out')}</option>
            <option value="credit">{t('Money in')}</option>
          </select>
        </div>

        <div id="transactionResults">
          {filteredTransactions.length === 0 ? (
            <div className="empty">
              <Icon name="requests" />
              <h3>{t('No transactions here')}</h3>
              <p>{t('Try a different search or account filter.')}</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Transaction')}</th>
                    <th>{t('Date')}</th>
                    <th className="category-col">{t('Account')}</th>
                    <th className="status-col">{t('Status')}</th>
                    <th className="amount">{t('Amount')}</th>
                    <th aria-label={t('Details')}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map(tx => {
                    const kind = String(tx.category || 'salary').toLowerCase();
                    const iconName = getMerchantIcon(tx.category);
                    const amt = tx.amount_minor ?? tx.amount_paise ?? 0;
                    const isCredit = amt > 0;
                    const acct = accounts.find(a => a.id === tx.account_id);
                    const acctName = acct ? acct.name : (tx.account_id || t('Primary'));

                    return (
                      <tr key={tx.id}>
                        <td>
                          <div className="merchant-cell">
                            <span className={`merchant-icon ${kind}`}>
                              <Icon name={iconName} />
                            </span>
                            <div>
                              <strong>{getCleanDescription(tx.description)}</strong>
                              <small>{tx.category ? tx.category.toLowerCase().replace(/^\w/, c => c.toUpperCase()) : t('General')}</small>
                            </div>
                          </div>
                        </td>
                        <td className="muted">{formatDate(tx.created_at)}</td>
                        <td className="category-col muted">{acctName}</td>
                        <td className="status-col">
                          <Badge status={tx.status}>{tx.status}</Badge>
                        </td>
                        <td className={`amount ${isCredit ? 'credit' : ''}`}>
                          {isCredit ? '+ ' : ''}{formatMoney(amt)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setSelectedTx(tx)}
                            aria-label={t('Details for {name}', { name: tx.description })}
                          >
                            <Icon name="arrow-right" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {selectedTx && <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </>
  );
};
