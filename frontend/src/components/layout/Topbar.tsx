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

const greeting = (): [string, string] => {
  const h = new Date().getHours();
  if (h < 12) return ['सुप्रभात', 'Good morning'];
  if (h < 17) return ['नमस्ते', 'Good afternoon'];
  return ['शुभ संध्या', 'Good evening'];
};

const initials = (name?: string) => {
  const parts = (name || 'Kosh User').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
};

export const Topbar: React.FC<TopbarProps> = ({ activeRouteLabel, onOpenMobileMenu, onOpenSearch, onNavigate }) => {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [hi, en] = greeting();
  const isOfficer = user?.role === 'OFFICER';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="k-top">
      <div className="k-top-left">
        <button id="menuToggle" type="button" className="k-icon-btn k-only-mobile" aria-label={t('Open navigation')} onClick={onOpenMobileMenu}>
          <Icon name="menu" />
        </button>
        <div className="k-top-title">
          <small>{lang === 'en' ? <><b lang="hi">{hi}</b> · {en}</> : <b>{t(en)}</b>}</small>
          <strong id="pageCrumb">{activeRouteLabel}</strong>
        </div>
      </div>

      <div className="k-top-actions">
        <button id="searchBtn" type="button" className="k-search" onClick={onOpenSearch} aria-label={t('Search')}>
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
          aria-label={t('Profile and settings')}>
          <span id="profileInitials" className="k-avatar">{initials(user?.display_name)}</span>
          <span className="k-profile-text">
            <strong id="signedInIdentity">{user?.display_name || t('Customer')}</strong>
            <small id="signedInRole">{isAdmin ? t('AI admin') : isOfficer ? t('Bank officer') : t('Personal account')}</small>
          </span>
        </button>
      </div>
    </header>
  );
};
