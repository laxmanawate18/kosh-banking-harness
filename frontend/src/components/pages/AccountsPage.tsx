import React, { useMemo, useState } from 'react';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { Badge } from '../common/Badge';
import { PageHeader } from '../common/PageHeader';
import { AnimatedNumber, Stagger } from '../common/Animate';
import { prefersReducedMotion } from '../common/motion';
import { formatDate, formatMoney } from '../common/Formatters';
import { ServiceRequestDialog, type ServiceSpec } from '../app/ServiceRequestDialog';
import type { Transaction } from '../../types/banking';

interface AccountsPageProps {
  onNavigate?: (route: string) => void;
}

const PERIODS = [
  ['30', 'Last 30 days'],
  ['90', 'Last 3 months'],
  ['fy', 'This financial year'],
] as const;

const sinceFor = (period: string) => {
  const now = new Date();
  if (period === 'fy') return new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
  return new Date(now.getTime() - Number(period) * 86_400_000);
};

const amountOf = (x: Transaction) => x.amount_minor ?? x.amount_paise ?? 0;
const money = (v: number) => formatMoney(Math.round(v));

export const AccountsPage: React.FC<AccountsPageProps> = ({ onNavigate }) => {
  const { t } = useI18n();
  const { overview } = useBanking();
  const accounts = overview?.accounts || [];
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [period, setPeriod] = useState<string>('90');
  const [spec, setSpec] = useState<ServiceSpec | null>(null);
  const account = accounts.find(a => a.id === accountId) || accounts[0];

  const rows = useMemo(() => {
    const since = sinceFor(period).getTime();
    return (overview?.transactions || [])
      .filter(x => (!x.account_id || x.account_id === account?.id) && new Date(x.created_at).getTime() >= since)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [overview, account?.id, period]);

  const downloadCsv = () => {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ['Date', 'Description', 'Reference', 'Debit (INR)', 'Credit (INR)'].map(esc).join(','),
      ...rows.map(x => {
        const a = amountOf(x) / 100;
        return [formatDate(x.created_at), x.description, x.reference_number || x.id, a < 0 ? (-a).toFixed(2) : '', a > 0 ? a.toFixed(2) : ''].map(esc).join(',');
      }),
    ];
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `kosh-statement-${account?.account_number_masked?.slice(-4) || ''}-${period}.csv` });
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const fy = (() => { const y = sinceFor('fy').getFullYear(); return `${y}-${String(y + 1).slice(2)}`; })();
  const services: { icon: string; title: string; body: string; spec: ServiceSpec }[] = [
    {
      icon: 'file', title: t('Interest certificate'), body: t('Interest earned this financial year, for your tax return.'),
      spec: { serviceId: 'P1-22', title: t('Interest certificate'), subtitle: t('We will email it to your registered address.'), details: () => `Interest certificate for FY ${fy}` },
    },
    {
      icon: 'receipt', title: t('TDS certificate (Form 16A)'), body: t('Tax deducted on your deposit interest.'),
      spec: { serviceId: 'P1-21', title: t('TDS certificate (Form 16A)'), subtitle: t('Issued each quarter for tax deducted at source.'), details: () => `Form 16A TDS certificate for FY ${fy}` },
    },
    {
      icon: 'idcard', title: t('Form 15G / 15H'), body: t('Declare that your income is below the taxable limit to avoid TDS.'),
      spec: {
        serviceId: 'P1-21', title: t('Form 15G / 15H'), subtitle: t('15H is for senior citizens, 15G for everyone else.'),
        fields: [{ name: 'form', label: t('Form'), type: 'select', options: [['15G', t('Form 15G (below 60 years)')], ['15H', t('Form 15H (60 years and above)')]] }],
        details: d => `Form ${d.form} declaration for FY ${fy}: no TDS on deposit interest`,
        submitLabel: t('Submit declaration'),
      },
    },
    {
      icon: 'requests', title: t('Cheque book'), body: t('25 leaves free each year.'),
      spec: {
        serviceId: 'P1-04', title: t('Request a cheque book'), subtitle: t('Delivered to your registered address in 5 to 7 working days.'),
        fields: [{ name: 'leaves', label: t('Number of leaves'), type: 'select', options: [['25', '25'], ['50', '50']] }],
        initial: { leaves: '25' },
        details: d => `Cheque book with ${d.leaves} leaves`,
      },
    },
    {
      icon: 'users', title: t('Nominee'), body: t('Add or change who receives your money if something happens to you.'),
      spec: {
        serviceId: 'P1-14', title: t('Add or update nominee'), subtitle: t('A bank officer verifies nominee changes.'),
        fields: [
          { name: 'nominee_name', label: t('Nominee full name') },
          { name: 'relationship', label: t('Relationship'), type: 'select', options: [['Spouse', t('Spouse')], ['Parent', t('Parent')], ['Child', t('Child')], ['Sibling', t('Sibling')], ['Other', t('Other')]] },
        ],
        details: d => `Register ${d.nominee_name} (${d.relationship}) as nominee`,
      },
    },
    {
      icon: 'download', title: t('Official statement'), body: t('A signed PDF statement by email, accepted for visas and loans.'),
      spec: {
        serviceId: 'P1-03', title: t('Official account statement'), subtitle: t('Signed PDF sent to your registered email.'),
        fields: [{ name: 'period', label: t('Period'), type: 'select', options: PERIODS.map(([v, l]) => [v, t(l)] as [string, string]) }],
        initial: { period: '90' },
        details: d => `Official signed statement, period ${d.period}`,
      },
    },
  ];

  const showStatement = (id: string) => {
    setAccountId(id);
    document.getElementById('statement')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <>
      <PageHeader title={t('Accounts and statements')} subtitle={t('Balances, statements and account documents in one place.')} />
      <div className="k-page-stack">
      <Stagger as="section" className="k-acc-grid" aria-label={t('Your accounts')}>
        {accounts.map(a => {
          const current = a.id === account?.id;
          return (
            <Stagger.Item as="article" key={a.id} className={`k-acc ${current ? 'c-acc-current' : ''}`}>
              <header>
                <span className="k-acc-type">{t(a.type === 'CURRENT' ? 'Current' : 'Savings')}</span>
                <Badge status={a.status} />
              </header>
              <h3>{a.name}</h3>
              <span className="k-acc-no">{a.account_number_masked}{a.ifsc_code ? ` · IFSC ${a.ifsc_code}` : ''}</span>
              <strong className="k-acc-bal"><AnimatedNumber value={a.available_balance_minor ?? 0} format={money} /></strong>
              {current
                ? <span className="c-acc-showing"><Icon name="check" />{t('Statement shown below')}</span>
                : <button type="button" className="k-link" onClick={() => showStatement(a.id)}>{t('View statement')} <Icon name="arrow-right" /></button>}
            </Stagger.Item>
          );
        })}
      </Stagger>

      <section className="k-panel" id="statement">
        <header className="k-panel-head">
          <div><h2>{t('Statement')}</h2><p>{account?.name} · {account?.account_number_masked}</p></div>
          <div className="c-statement-tools">
            <select aria-label={t('Period')} value={period} onChange={e => setPeriod(e.target.value)}>
              {PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
            <button type="button" className="k-btn outline sm" onClick={downloadCsv} disabled={!rows.length}><Icon name="download" />CSV</button>
            <button type="button" className="k-btn outline sm" onClick={() => window.print()} disabled={!rows.length}><Icon name="file" />{t('Print or PDF')}</button>
          </div>
        </header>
        {rows.length ? (
          <div className="table-scroll">
            <table className="table c-stmt-table">
              <thead><tr><th>{t('Date')}</th><th>{t('Description')}</th><th className="amount">{t('Amount')}</th></tr></thead>
              <tbody>
                {rows.map(x => (
                  <tr key={x.id}>
                    <td className="muted date-col">{formatDate(x.created_at)}</td>
                    <td>{x.description}</td>
                    <td className={`amount ${amountOf(x) > 0 ? 'credit' : ''}`}>{amountOf(x) > 0 ? '+ ' : ''}{formatMoney(amountOf(x))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty"><Icon name="file" /><h3>{t('No transactions in this period')}</h3><p>{t('Try a longer period.')}</p></div>
        )}
      </section>

      <section aria-labelledby="docs-title">
        <div className="c-section-head">
          <h2 id="docs-title">{t('Documents and account services')}</h2>
          <button type="button" className="k-link" onClick={() => onNavigate?.('services')}>{t('All banking services')} <Icon name="arrow-right" /></button>
        </div>
        <Stagger className="c-tile-grid">
          {services.map(s => (
            <Stagger.Item as="button" key={s.title} type="button" className="k-quick-tile" whileTap={{ scale: 0.98 }} onClick={() => setSpec(s.spec)}>
              <Icon name={s.icon} />
              <span><strong>{s.title}</strong><small>{s.body}</small></span>
              <Icon name="arrow-right" className="icon k-go" />
            </Stagger.Item>
          ))}
        </Stagger>
      </section>
      </div>

      <ServiceRequestDialog spec={spec} onClose={() => setSpec(null)} />
    </>
  );
};
