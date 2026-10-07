import React, { useState, useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Icon } from '../common/Icon';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_NAV, OFFICER_NAV } from './Sidebar';

interface SearchItem {
  id: string;
  title: string;
  category: string;
  icon: string;
  route: string;
  action?: () => void;
}

const kbd: React.CSSProperties = { padding: '1px 4px', border: '1px solid var(--line-strong)', borderRadius: '3px', background: 'var(--surface)' };

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

  if (!isOpen) return null;

  return (
    <div
      className="gsm-scrim"
      onClick={onClose}
    >
      <div
        className="flow-dialog search-dialog"
        style={{
          background: 'var(--surface)',
          borderRadius: '12px',
          boxShadow: '0 24px 60px rgba(23, 57, 41, 0.25)',
          overflow: 'hidden',
          width: 'min(560px, 100%)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="search-head" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="search" />
          <input
            ref={inputRef}
            type="search"
            placeholder={staffNav ? t('Search pages') : t('Search pages, services, accounts and actions')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              border: 0,
              outline: 'none',
              padding: '8px 12px',
              fontSize: '13px',
              flex: 1,
              background: 'transparent',
              margin: 0,
            }}
          />
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            style={{ width: '28px', height: '28px', fontSize: '14px' }}
            aria-label={t('Close')}
          >
            <Icon name="close" />
          </button>
        </div>

        <div
          id="searchResults"
          style={{
            maxHeight: '340px',
            overflowY: 'auto',
            padding: '6px',
          }}
        >
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: '24px 16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                {t('No results found for “{query}”', { query })}
              </p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="search-result"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    background: isSelected ? 'var(--surface-2)' : 'transparent',
                    border: 0,
                    borderRadius: '6px',
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelect(item)}
                >
                  <span style={{ color: 'var(--brand)', display: 'grid', placeItems: 'center' }}>
                    <Icon name={item.icon} />
                  </span>
                  <span style={{ fontWeight: 500, flex: 1, color: 'var(--ink)' }}>
                    {item.title}
                  </span>
                  <small style={{ color: 'var(--muted)', fontSize: '13px' }}>
                    {item.category}
                  </small>
                </button>
              );
            })
          )}
        </div>

        <small style={{ display: 'block', padding: '8px 14px', color: 'var(--muted)', fontSize: '13px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
          {withKey(t('{key} to close'), <kbd style={kbd}>Esc</kbd>)} · {withKey(t('{key} to navigate'), <><kbd style={kbd}><ArrowUp size={12} aria-label={t('Up')} /></kbd> <kbd style={kbd}><ArrowDown size={12} aria-label={t('Down')} /></kbd></>)} · {withKey(t('{key} to select'), <kbd style={kbd}>Enter</kbd>)}
        </small>
      </div>
    </div>
  );
};
