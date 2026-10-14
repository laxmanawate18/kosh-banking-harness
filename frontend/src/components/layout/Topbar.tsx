import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { PreferencesMenu } from '../common/Preferences';
import { NotificationsMenu } from '../app/Notifications';

interface TopbarProps {
  activeRouteLabel: string;
  onOpenMobileMenu: () => void;
  onOpenSearch: () => void;
  onNavigate?: (route: string) => void;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const initials = (name?: string) => {
  const parts = (name || 'Kosh User').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
};

export const Topbar: React.FC<TopbarProps> = ({ activeRouteLabel, onOpenMobileMenu, onOpenSearch, onNavigate }) => {
  const { t } = useI18n();
  const { user } = useAuth();

  const isOfficer = user?.role === 'OFFICER';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="k-top">
      <div className="k-top-left">
        <button id="menuToggle" type="button" className="k-icon-btn k-only-mobile" aria-label={t('Open navigation')} onClick={onOpenMobileMenu}>
          <Icon name="menu" />
        </button>
        <div className="k-top-title">
          <small>{t(greeting())}</small>
          <strong id="pageCrumb">{activeRouteLabel}</strong>
        </div>
      </div>

      <div className="k-top-actions">
        <button id="searchBtn" type="button" className="k-search" onClick={onOpenSearch}>
          <Icon name="search" />
          <span>{isOfficer || isAdmin ? t('Search pages') : t('Search accounts, payees, services')}</span>
          <kbd>⌘K</kbd>
        </button>
        <button type="button" className="k-icon-btn k-only-mobile" aria-label={t('Search')} onClick={onOpenSearch}>
          <Icon name="search" />
        </button>
        <PreferencesMenu />
        {!isOfficer && !isAdmin && <NotificationsMenu onNavigate={r => onNavigate?.(r)} />}
        <button id="profileBtn" type="button" className="k-profile" onClick={() => onNavigate?.(isAdmin ? 'admin-audit' : isOfficer ? 'audit' : 'settings')}
          aria-label={`${user?.display_name || t('Customer')} ${isAdmin ? t('AI admin') : isOfficer ? t('Bank officer') : t('Personal account')}, ${t('profile and settings')}`}>
          <span id="profileInitials" className="k-avatar k-avatar-drawn" data-initials={initials(user?.display_name)} aria-hidden="true" />
          <span className="k-profile-text">
            <strong id="signedInIdentity">{user?.display_name || t('Customer')}</strong>{' '}
            <small id="signedInRole">{isAdmin ? t('AI admin') : isOfficer ? t('Bank officer') : t('Personal account')}</small>
          </span>
        </button>
      </div>
    </header>
  );
};
