import React from 'react';
import { useBanking } from '../../context/BankingContext';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { formatDate, formatMoney, humanizeCode } from '../common/Formatters';
import { serviceLabel } from './serviceCatalogue';

type Note = { id: string; tone: 'warn' | 'danger' | 'ok' | ''; icon: string; title: string; body: string; route: string };

const OPEN = ['SUBMITTED', 'PENDING_APPROVAL', 'ESCALATED', 'MORE_INFO_REQUIRED'];

/** Notifications are derived from the overview we already load: alerts, KYC, bills and request updates. */
function useNotifications(): Note[] {
  const { t } = useI18n();
  const { overview } = useBanking();
  if (!overview) return [];
  const o = overview as any;
  const notes: Note[] = [];
  for (const a of o.security_alerts || []) {
    if (a.status !== 'OPEN') continue;
    notes.push({ id: a.id, tone: 'danger', icon: 'alert', title: a.title, body: a.description, route: 'security' });
  }
  const kyc = overview.kyc || overview.customer?.kyc;
  if (kyc?.status === 'NOT_DONE' || kyc?.status === 'PENDING_RE_KYC') {
    notes.push({ id: 'kyc', tone: 'warn', icon: 'idcard', title: t('Complete your KYC'), body: t('Some transfers are paused until KYC is done.'), route: 'ai-banker' });
  }
  for (const b of overview.bills || []) {
    if (b.status !== 'DUE' && b.status !== 'OVERDUE') continue;
    notes.push({ id: b.id, tone: 'warn', icon: 'receipt', title: t('{biller} bill due', { biller: b.biller_name }), body: `${formatMoney(b.amount_minor ?? b.amount_paise)} · ${formatDate(b.due_date)}`, route: 'bills' });
  }
  for (const r of overview.requests || []) {
    const open = OPEN.includes(r.status);
    notes.push({ id: r.id, tone: open ? '' : 'ok', icon: open ? 'clock' : 'check', title: serviceLabel(t, r.service_id, r.service_name || r.request_type), body: open ? t('In progress') : t('Updated: {status}', { status: humanizeCode(r.status).toLowerCase() }), route: 'requests' });
  }
  return notes;
}

export const NotificationsMenu: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { t } = useI18n();
  const notes = useNotifications();
  const urgent = notes.filter(n => n.tone === 'danger' || n.tone === 'warn').length;
  const close = () => (document.getElementById('k-notifs') as any)?.hidePopover?.();
  return (
    <>
      <button id="notificationsBtn" type="button" className="k-icon-btn" popoverTarget="k-notifs"
        aria-label={urgent ? t('Notifications, {n} need attention', { n: urgent }) : t('Notifications')}>
        <Icon name="bell" />
        {urgent > 0 && <span className="k-dot-badge" aria-hidden="true">{urgent}</span>}
      </button>
      <div id="k-notifs" popover="auto" className="k-popover k-notif-pop">
        <header><h2>{t('Notifications')}</h2><span className="k-pill">{notes.length}</span></header>
        {notes.length === 0 && <div className="k-notif-empty">{t('You are all caught up.')}</div>}
        {notes.map(n => (
          <button key={n.id} type="button" className="k-notif" onClick={() => { close(); onNavigate(n.route); }}>
            <span className={`k-notif-icon ${n.tone}`}><Icon name={n.icon} /></span>
            <span><strong>{n.title}</strong><small>{n.body}</small></span>
          </button>
        ))}
      </div>
    </>
  );
};
