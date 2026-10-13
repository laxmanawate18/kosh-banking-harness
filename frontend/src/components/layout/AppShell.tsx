import React, { useState, useEffect } from 'react';
import { ADMIN_NAV, Sidebar } from './Sidebar';

const ADMIN_TITLES: Record<string, string> = Object.fromEntries(ADMIN_NAV.flatMap(([, items]) => items.map(i => [i.id, i.title])));
import { Topbar } from './Topbar';
import { ConsentModal } from './ConsentModal';
import { GlobalSearchModal } from './GlobalSearchModal';
import { Icon } from '../common/Icon';
import { LotusMark } from '../common/KoshLogo';
import { motion, pageMotion } from '../common/Animate';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { SessionGuard } from '../app/SessionGuard';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';

interface AppShellProps {
  activeRoute: string;
  onRouteChange: (route: string) => void;
  children: React.ReactNode;
}

export const ROUTE_TITLES: Record<string, string> = {
  overview: 'Home',
  'ai-banker': 'Mitra AI banker',
  accounts: 'Accounts and statements',
  transactions: 'Transactions',
  upi: 'UPI',
  payments: 'Send money',
  beneficiaries: 'Payees',
  bills: 'Bills and recharge',
  cards: 'Cards',
  deposits: 'Deposits',
  services: 'Services',
  requests: 'My requests',
  security: 'Sentinel security',
  settings: 'Profile and settings',
  operations: 'Review queue',
  leads: 'AI sales leads',
  history: 'Case history',
  audit: 'Security activity',
  'not-found': 'Page not found',
};

const TABS = [
  { id: 'overview', label: 'Home', icon: 'overview' },
  { id: 'upi', label: 'UPI', icon: 'upi' },
  { id: 'ai-banker', label: 'Mitra', icon: 'mitra' },
  { id: 'cards', label: 'Cards', icon: 'cards' },
];

export const AppShell: React.FC<AppShellProps> = ({ activeRoute, onRouteChange, children }) => {
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();
  const { setIsOpen: setChatOpen } = useChat();
  const isOfficer = user?.role === 'OFFICER' || user?.role === 'ADMIN';  // staff: no customer chat

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [activeRoute]);

  return (
    <div id="appShell" className="k-shell">
      <Sidebar activeRoute={activeRoute} onRouteChange={onRouteChange} isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      <div className="k-body">
        <Topbar
          activeRouteLabel={t(ROUTE_TITLES[activeRoute] || ADMIN_TITLES[activeRoute] || 'Home')}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onNavigate={onRouteChange}
        />
        <motion.main id="mainContent" tabIndex={-1} key={activeRoute} className="k-main" {...pageMotion}>
          <ErrorBoundary resetKey={activeRoute}>{children}</ErrorBoundary>
        </motion.main>
      </div>

      <ConsentModal />
      <SessionGuard />
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={onRouteChange} />

      {!isOfficer && activeRoute !== 'ai-banker' && (
        <button id="assistantToggle" type="button" className="k-fab" title={t('Ask Mitra')} onClick={() => setChatOpen(true)}>
          <LotusMark size={30} />
          <span id="assistantToggleText">{t('Ask Mitra')}</span>
        </button>
      )}

      {!isOfficer && (
        <nav className="k-tabbar" aria-label={t('Quick navigation')}>
          {TABS.map(tab => (
            <button key={tab.id} type="button" className={activeRoute === tab.id ? 'active' : ''}
              aria-current={activeRoute === tab.id ? 'page' : undefined} onClick={() => onRouteChange(tab.id)}>
              {tab.icon === 'mitra' ? <LotusMark size={24} /> : <Icon name={tab.icon} />}
              <span>{t(tab.label)}</span>
            </button>
          ))}
          <button type="button" onClick={() => setMobileMenuOpen(true)}>
            <Icon name="menu" />
            <span>{t('More')}</span>
          </button>
        </nav>
      )}
    </div>
  );
};
