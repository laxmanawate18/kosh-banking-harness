import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { KoshLogo, LotusMark, Rangoli } from '../common/KoshLogo';
import type { ServiceRequestItem } from '../../types/banking';

interface SidebarProps {
  activeRoute: string;
  onRouteChange: (route: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

type NavItem = { id: string; title: string; icon: string };

export const CUSTOMER_NAV: [string, NavItem[]][] = [
  ['Banking', [
    { id: 'overview', title: 'Home', icon: 'overview' },
    { id: 'ai-banker', title: 'Mitra AI banker', icon: 'ai-banker' },
    { id: 'accounts', title: 'Accounts and statements', icon: 'accounts' },
    { id: 'transactions', title: 'Transactions', icon: 'transactions' },
  ]],
  ['Move money', [
    { id: 'upi', title: 'UPI', icon: 'upi' },
    { id: 'payments', title: 'Send money', icon: 'payments' },
    { id: 'beneficiaries', title: 'Payees', icon: 'beneficiaries' },
    { id: 'bills', title: 'Bills and recharge', icon: 'bills' },
  ]],
  ['Products', [
    { id: 'cards', title: 'Cards', icon: 'cards' },
    { id: 'deposits', title: 'Deposits', icon: 'deposits' },
    { id: 'services', title: 'Services', icon: 'services' },
    { id: 'requests', title: 'My requests', icon: 'requests' },
  ]],
  ['You', [
    { id: 'security', title: 'Kavach security', icon: 'security' },
    { id: 'settings', title: 'Profile and settings', icon: 'settings' },
  ]],
];

export const OFFICER_NAV: [string, NavItem[]][] = [
  ['Operations', [
    { id: 'operations', title: 'Review queue', icon: 'requests' },
    { id: 'leads', title: 'AI sales leads', icon: 'cards' },
    { id: 'history', title: 'Case history', icon: 'transactions' },
    { id: 'audit', title: 'Security activity', icon: 'security' },
  ]],
];

const OPEN_STATUSES = ['SUBMITTED', 'PENDING_APPROVAL', 'ESCALATED', 'MORE_INFO_REQUIRED'];

export const Sidebar: React.FC<SidebarProps> = ({ activeRoute, onRouteChange, isOpen, onClose }) => {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const { overview } = useBanking();
  const isOfficer = user?.role === 'OFFICER';
  const groups = isOfficer ? OFFICER_NAV : CUSTOMER_NAV;
  const openRequests = overview?.requests?.filter((r: ServiceRequestItem) => OPEN_STATUSES.includes(r.status)).length || 0;
  const go = (id: string) => { onRouteChange(id); onClose(); };

  return (
    <>
      <div className={`k-side-scrim ${isOpen ? 'show' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside id="sidebar" className={`k-side ${isOpen ? 'open' : ''}`} aria-label={t('Main navigation')}>
        <Rangoli className="k-side-motif" />
        <a href={isOfficer ? '#operations' : '#overview'} className="k-side-logo"
          onClick={e => { e.preventDefault(); go(isOfficer ? 'operations' : 'overview'); }}>
          <KoshLogo size={36} tone="light" />
        </a>
        <span className="k-side-space">{isOfficer ? t('Bank operations') : t('Personal banking')}</span>

        <nav id="navigation" aria-label={t('Main navigation')}>
          {groups.map(([group, items]) => (
            <div key={group} className="k-side-group">
              <span className="k-side-group-label">{t(group)}</span>
              {items.map(item => {
                const active = activeRoute === item.id;
                return (
                  <a key={item.id} href={`#${item.id}`} className={`k-side-item ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined} onClick={e => { e.preventDefault(); go(item.id); }}>
                    <Icon name={item.icon} />
                    <span>{t(item.title)}</span>
                    {item.id === 'requests' && openRequests > 0 && <span className="k-side-count">{openRequests}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="k-side-foot">
          <div className="k-side-kavach">
            <LotusMark size={30} />
            <div><strong>{t('Kavach is on')}</strong><small>{t('Every payment is checked for you')}</small></div>
          </div>
          <button id="logoutBtn" type="button" className="k-side-logout" onClick={logout}>
            {t('Sign out')} <Icon name="logout" />
          </button>
        </div>
      </aside>
    </>
  );
};
