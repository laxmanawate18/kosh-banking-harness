import React, { useState, useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Icon } from '../common/Icon';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { ActiveIndicator, AnimatePresence, SPRING, Stagger, motion } from '../common/Animate';
import { ADMIN_NAV, OFFICER_NAV } from './Sidebar';

interface SearchItem {
  id: string;
  title: string;
  category: string;
  icon: string;
  route: string;
  action?: () => void;
}

/** Drops a key cap into a translated sentence at its {key} placeholder, so word order follows the language. */
const withKey = (text: string, key: React.ReactNode) => {
  const [before, after] = text.split('{key}');
  return <>{before}{key}{after}</>;
};

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const staffNav = user?.role === 'ADMIN' ? ADMIN_NAV : user?.role === 'OFFICER' ? OFFICER_NAV : null;
  const customerItems: SearchItem[] = [
    // Navigation
    { id: 'nav-overview', title: t('Overview and balance summary'), category: t('Navigation'), icon: 'overview', route: 'overview' },
    { id: 'nav-ai-banker', title: t('Chat with Mitra'), category: t('Navigation'), icon: 'ai-banker', route: 'ai-banker' },
    { id: 'nav-accounts', title: t('My accounts and statements'), category: t('Navigation'), icon: 'accounts', route: 'accounts' },
    { id: 'nav-transactions', title: t('Transaction history and search'), category: t('Navigation'), icon: 'transactions', route: 'transactions' },
    { id: 'nav-upi', title: t('UPI'), category: t('Navigation'), icon: 'upi', route: 'upi' },
    { id: 'nav-payments', title: t('Send money and fund transfers'), category: t('Navigation'), icon: 'payments', route: 'payments' },
    { id: 'nav-beneficiaries', title: t('Beneficiaries and saved payees'), category: t('Navigation'), icon: 'beneficiaries', route: 'beneficiaries' },
    { id: 'nav-bills', title: t('Bill payments and utilities'), category: t('Navigation'), icon: 'bills', route: 'bills' },
    { id: 'nav-cards', title: t('Debit cards and card controls'), category: t('Navigation'), icon: 'cards', route: 'cards' },
    { id: 'nav-deposits', title: t('Fixed and recurring deposits'), category: t('Navigation'), icon: 'deposits', route: 'deposits' },
    { id: 'nav-services', title: t('Banking services catalogue'), category: t('Navigation'), icon: 'services', route: 'services' },
    { id: 'nav-requests', title: t('My service requests'), category: t('Navigation'), icon: 'requests', route: 'requests' },
    { id: 'nav-security', title: t('Security centre and sessions'), category: t('Navigation'), icon: 'security', route: 'security' },
    { id: 'nav-settings', title: t('Profile and settings'), category: t('Navigation'), icon: 'settings', route: 'settings' },

    // Quick Actions & Services
    { id: 'act-kyc', title: t('Complete KYC verification'), category: t('Mitra'), icon: 'security', route: 'ai-banker' },
    { id: 'act-freeze', title: t('Freeze debit card'), category: t('Quick action'), icon: 'cards', route: 'cards' },
    { id: 'act-fd', title: t('Open a fixed deposit'), category: t('Deposit'), icon: 'deposits', route: 'deposits' },
    { id: 'act-rd', title: t('Open a recurring deposit'), category: t('Deposit'), icon: 'deposits', route: 'deposits' },
    { id: 'act-cheque', title: t('Order a cheque book'), category: t('Service'), icon: 'requests', route: 'services' },
    { id: 'act-address', title: t('Update residential address'), category: t('Service'), icon: 'settings', route: 'services' },
    { id: 'act-nominee', title: t('Update account nominee'), category: t('Service'), icon: 'requests', route: 'services' },
    { id: 'act-appointment', title: t('Book a branch appointment'), category: t('Service'), icon: 'calendar', route: 'services' },
  ];
  // Staff search their own console's pages; customer pages are not theirs to open.
  const searchItems: SearchItem[] = staffNav
    ? staffNav.flatMap(([group, items]) => items.map(item => ({ id: `nav-${item.id}`, title: t(item.title), category: t(group), icon: item.icon, route: item.id })))
    : customerItems;

  const filtered = searchItems.filter(item => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.route.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item: SearchItem) => {
    if (item.action) {
      item.action();
    } else {
      onNavigate(item.route);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="gsm-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}>
          <motion.div className="k-search-panel" role="dialog" aria-modal="true" aria-label={t('Search')} onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={SPRING}>
            <div className="k-search-head">
              <Icon name="search" />
              <input ref={inputRef} type="search" role="combobox" aria-expanded="true" aria-controls="searchResults"
                aria-activedescendant={filtered[selectedIndex] ? `sr-${filtered[selectedIndex].id}` : undefined}
                placeholder={staffNav ? t('Search pages') : t('Search pages, services, accounts and actions')}
                value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown} />
              <button type="button" className="k-icon-btn" onClick={onClose} aria-label={t('Close')}><Icon name="close" /></button>
            </div>
            <div id="searchResults" className="k-search-results" role="listbox" aria-label={t('Results')}>
              {filtered.length === 0 ? (
                <p className="k-search-empty">{t('No results found for “{query}”', { query })}</p>
              ) : (
                <Stagger key={query ? 'q' : 'all'}>
                  {filtered.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <Stagger.Item as="button" key={item.id} id={`sr-${item.id}`} type="button" role="option" aria-selected={isSelected}
                        className={`k-search-result ${isSelected ? 'selected' : ''}`} onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => handleSelect(item)}>
                        {isSelected && <ActiveIndicator id="search-selection" className="k-search-highlight" />}
                        <span className="k-search-icon"><Icon name={item.icon} /></span>
                        <span className="k-search-title">{item.title}</span>
                        <small>{item.category}</small>
                      </Stagger.Item>
                    );
                  })}
                </Stagger>
              )}
            </div>
            <small className="k-search-keys">
              {withKey(t('{key} to close'), <kbd>Esc</kbd>)} · {withKey(t('{key} to navigate'), <><kbd><ArrowUp size={12} aria-label={t('Up')} /></kbd> <kbd><ArrowDown size={12} aria-label={t('Down')} /></kbd></>)} · {withKey(t('{key} to select'), <kbd>Enter</kbd>)}
            </small>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
