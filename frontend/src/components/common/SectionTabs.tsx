import React from 'react';
import { useI18n } from '../../i18n';
import { useBanking } from '../../context/BankingContext';

type Tab = { id: string; label: string; count?: number };

/** Related pages share one sidebar entry; this strip moves between them. Every tab is still its own route. */
const SectionTabs: React.FC<{ label: string; tabs: Tab[]; active: string }> = ({ label, tabs, active }) => {
  const { t } = useI18n();
  return (
    <nav className="k-subnav" aria-label={label}>
      {tabs.map(tab => (
        <a key={tab.id} href={`#${tab.id}`} aria-current={tab.id === active ? 'page' : undefined}>
          {t(tab.label)}
          {!!tab.count && <span className="k-subnav-count">{tab.count}</span>}
        </a>
      ))}
    </nav>
  );
};

const MONEY_TABS: Tab[] = [
  { id: 'payments', label: 'Send money' },
  { id: 'upi', label: 'UPI' },
  { id: 'beneficiaries', label: 'Payees' },
  { id: 'bills', label: 'Bills' },
];

export const MoneyTabs: React.FC<{ active: string }> = ({ active }) => {
  const { t } = useI18n();
  return <SectionTabs label={t('Pay and transfer')} tabs={MONEY_TABS} active={active} />;
};

const OPEN_STATUSES = ['SUBMITTED', 'PENDING_APPROVAL', 'ESCALATED', 'MORE_INFO_REQUIRED'];

export const ServiceTabs: React.FC<{ active: string }> = ({ active }) => {
  const { t } = useI18n();
  const { overview } = useBanking();
  const open = overview?.requests?.filter((r: { status: string }) => OPEN_STATUSES.includes(r.status)).length || 0;
  return <SectionTabs label={t('Services and requests')} active={active}
    tabs={[{ id: 'services', label: 'Services' }, { id: 'requests', label: 'My requests', count: open }]} />;
};
