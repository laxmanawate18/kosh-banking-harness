import React, { useState } from 'react';
import { formatMoney } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
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

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return t('{date} at {time}', {
        date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      });
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

      {/* Transaction Detail Dialog */}
      {selectedTx && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedTx(null)}
          title={t('Transaction details')}
          subtitle={t('Reference {id}', { id: selectedTx.reference_number || selectedTx.id })}
        >
          <div className="review-amount" style={{ textAlign: 'center', margin: '14px 0' }}>
            {formatMoney(selectedTx.amount_minor ?? selectedTx.amount_paise ?? 0)}
          </div>
          <div className="info-row">
            <span>{t('Description')}</span>
            <strong>{selectedTx.description}</strong>
          </div>
          <div className="info-row">
            <span>{t('Date & time')}</span>
            <strong>{formatDateTime(selectedTx.created_at)}</strong>
          </div>
          <div className="info-row">
            <span>{t('Category')}</span>
            <strong>{selectedTx.category || t('General')}</strong>
          </div>
          <div className="info-row">
            <span>{t('Status')}</span>
            <Badge status={selectedTx.status}>{selectedTx.status}</Badge>
          </div>
          <div className="info-row">
            <span>{t('Reference')}</span>
            <strong>{selectedTx.reference_number || selectedTx.id}</strong>
          </div>
          <div className="dialog-footer" style={{ marginTop: '20px' }}>
            <button type="button" className="button wide primary" onClick={() => setSelectedTx(null)}>
              {t('Done')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};
