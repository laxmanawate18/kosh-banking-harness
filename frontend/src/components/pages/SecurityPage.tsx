import React, { useState, useEffect } from 'react';
import { formatDate, formatDateTime } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { AnimatePresence, motion } from '../common/Animate';
import { apiGet, apiDelete } from '../../services/api';
import { useI18n } from '../../i18n';

interface SecuritySession { id: string; current: boolean; created_at: string; last_seen_at?: string }
interface SecurityAlert { id: string; title: string; description: string; status: string; created_at?: string }
interface SecurityPageProps { onNavigate?: (route: string) => void; onExportAudit?: () => void }

type T = (key: string) => string;
/**
 * Activity a customer can act on, in their words. Anything else (agent tool calls, intent binding, model withholding,
 * Sentinel's risk decisions) is internal and never shown, even if the server sends it. Mirrors CUSTOMER_EVENT_TYPES in portal.py.
 */
const EVENT_LABELS = (t: T): Record<string, [string, 'ok' | 'warn' | 'info']> => ({
  OAUTH_AUTHENTICATION_SUCCEEDED: [t('You signed in'), 'info'],
  STEP_UP_SUCCEEDED: [t('You confirmed it was you with an OTP'), 'ok'],
  STEP_UP_FAILED: [t('An OTP check failed'), 'warn'],
  SESSION_REVOKED: [t('A device was signed out'), 'info'],
  AGENT_ACCESS_REVOKED: [t('You removed an assistant app’s access'), 'info'],
  PAYMENT_PROPOSED: [t('Mitra prepared an action for your approval'), 'info'],
  CHALLENGE_ISSUED: [t('A payment waited for your approval in Kavach'), 'warn'],
  PAYMENT_EXECUTED: [t('A payment was sent'), 'ok'],
  PAYMENT_CANCELLED: [t('A payment was cancelled'), 'info'],
  CARD_FROZEN: [t('Your debit card was frozen'), 'warn'],
  CARD_UNFROZEN: [t('Your debit card was unfrozen'), 'ok'],
  PREFERENCES_UPDATED: [t('Notification preferences changed'), 'info'],
  MARKETING_CONSENT_GRANTED: [t('Personalised offers turned on'), 'info'],
  MARKETING_CONSENT_WITHDRAWN: [t('Personalised offers turned off'), 'info'],
  CONSENT_GRANTED: [t('Digital banking permission given'), 'ok'],
  CONSENT_REVOKED: [t('Digital banking permission withdrawn'), 'warn'],
  WORKFLOW_STARTED: [t('You started a form with Mitra'), 'info'],
  WORKFLOW_SUBMITTED: [t('You submitted a form'), 'ok'],
  DOCUMENT_CAPTURED: [t('A document was uploaded'), 'info'],
  EKYC_VERIFIED: [t('Video KYC completed'), 'ok'],
  SERVICE_REQUEST_CREATED: [t('You sent a service request'), 'info'],
  OFFICER_DECISION: [t('The bank decided on your request'), 'ok'],
  CUSTOMER_RESPONSE: [t('You replied to the bank'), 'info'],
  REQUEST_CANCELLED: [t('A request was cancelled'), 'info'],
});

const FIRST = 5;

/** A list that shows its first few rows and reveals the rest in place. */
function useShowAll<X>(rows: X[], first = FIRST) {
  const [all, setAll] = useState(false);
  return { rows: all ? rows : rows.slice(0, first), extra: rows.length - first, all, toggle: () => setAll(a => !a) };
}

const ShowAll: React.FC<{ extra: number; all: boolean; toggle: () => void; what: string }> = ({ extra, all, toggle, what }) => {
  const { t } = useI18n();
  if (extra <= 0) return null;
  return (
    <button type="button" className="k-link c-show-all" aria-expanded={all} onClick={toggle}>
      {all ? t('Show fewer') : `${t('Show all')} ${what} (${extra + FIRST})`}
      <Icon name="chevron-down" className={`icon c-chevron ${all ? 'up' : ''}`} />
    </button>
  );
};

const rowMotion = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

export const SecurityPage: React.FC<SecurityPageProps> = ({ onNavigate, onExportAudit }) => {
  const { overview, events } = useBanking();
  const { auth, user } = useAuth();
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SecuritySession[] | null>(null);
  const [sessionError, setSessionError] = useState('');

  const alerts: SecurityAlert[] = (overview as any)?.security_alerts || [];
  const openAlerts = alerts.filter(a => a.status === 'OPEN');
  const hasConsent = auth?.consent != null ? Boolean(auth.consent) : Boolean((user as any)?.consent ?? true);
  const labels = EVENT_LABELS(t);
  const activity = useShowAll((events || []).filter(e => labels[e.event_type || '']));
  // This device first, then the most recently active.
  const sorted = [...(sessions || [])].sort((a, b) => Number(b.current) - Number(a.current)
    || (b.last_seen_at || b.created_at).localeCompare(a.last_seen_at || a.created_at));
  const devices = useShowAll(sorted);

  const loadSessions = () =>
    apiGet<{ sessions: SecuritySession[] }>('/api/portal/security/sessions')
      .then(res => setSessions(res?.sessions || []))
      .catch(() => setSessions([{ id: 'sess-current', current: true, created_at: new Date().toISOString() }]));
  useEffect(() => { loadSessions(); }, []);

  const signOut = async (id: string) => {
    setSessionError('');
    try {
      await apiDelete(`/api/portal/security/sessions/${encodeURIComponent(id)}`);
      setSessions(prev => (prev || []).filter(s => s.id !== id));
    } catch {
      setSessionError(t('That device could not be signed out. Please try again.'));
    }
  };

  return (
    <>
      <PageHeader title={t('Sentinel security')} subtitle={t('Alerts, recent activity and the devices signed in to your account.')}
        actions={<button type="button" className="k-btn outline c-hide-phone" onClick={() => onExportAudit?.()}><Icon name="download" />{t('Export activity')}</button>} />

      <div className="c-split">
        <div className="k-page-stack">
          <section className="k-panel">
            <header className="k-panel-head">
              <div><h2>{t('Security alerts')}</h2><p>{openAlerts.length ? t('Something needs your attention') : t('Nothing needs your attention')}</p></div>
              {openAlerts.length > 0 && <Badge variant="warning">{t('Needs attention')}</Badge>}
            </header>
            {alerts.length ? alerts.map(a => (
              <article key={a.id} className={`c-alert ${a.status === 'OPEN' ? 'open' : ''}`}>
                <span className="c-alert-icon"><Icon name={a.status === 'OPEN' ? 'alert' : 'check'} /></span>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.description}</p>
                  {a.created_at && <small>{formatDateTime(a.created_at)}</small>}
                </div>
                <div className="c-alert-actions">
                  <Badge status={a.status} />
                  <button type="button" className="k-btn outline sm" onClick={() => onNavigate?.('cards')}>{t('Manage card')}</button>
                </div>
              </article>
            )) : (
              <div className="k-empty"><Icon name="security" /><strong>{t('You’re in the clear')}</strong><small>{t('No open security alerts.')}</small></div>
            )}
          </section>

          <section className="k-panel">
            <header className="k-panel-head"><div><h2>{t('Recent security activity')}</h2><p>{t('Sign-ins, approvals and changes to your account')}</p></div></header>
            {activity.rows.length ? (
              <ul className="c-activity">
                <AnimatePresence initial={false}>
                  {activity.rows.map((e, i) => {
                    const [label, tone] = labels[e.event_type || ''];
                    return (
                      <motion.li key={e.id || i} {...rowMotion}>
                        <span className={`c-dot ${tone}`} aria-hidden="true" />
                        <span className="c-activity-text">{label}</span>
                        <time dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            ) : (
              <div className="k-empty"><Icon name="clock" /><strong>{t('No activity to show')}</strong><small>{t('Sign-ins, approvals and changes will be listed here.')}</small></div>
            )}
            <ShowAll {...activity} what={t('activity')} />
          </section>
        </div>

        <div className="k-page-stack">
          <section className="k-panel">
            <header className="k-panel-head"><div><h2>{t('Permission & protection')}</h2></div></header>
            <div className="k-panel-body">
              <div className="info-row"><span>{t('Identity')}</span><strong>{t('Signed in and verified')}</strong></div>
              <div className="info-row"><span>{t('Digital banking permission')}</span><Badge variant={hasConsent ? 'success' : 'danger'}>{hasConsent ? t('Active') : t('Withdrawn')}</Badge></div>
              <div className="info-row"><span>{t('Payments')}</span><strong>{t('You approve each one in Kavach')}</strong></div>
              <div className="info-row"><span>{t('Card protection')}</span><strong>{t('Freeze any time from Cards')}</strong></div>
              <p className="form-hint">{t('Payments are checked against your intent, the destination, amount, account ownership and recent activity.')}</p>
            </div>
          </section>

          <section className="k-panel">
            <header className="k-panel-head">
              <div><h2>{t('Signed-in devices')}</h2><p>{sessions ? t('{n} active sessions', { n: sessions.length }) : t('Loading sessions…')}</p></div>
            </header>
            <ul className="k-list c-sessions">
              <AnimatePresence initial={false}>
                {devices.rows.map(s => (
                  <motion.li key={s.id} {...rowMotion}>
                    <span className="c-session">
                      <Icon name="globe" />
                      <span>
                        <strong>{s.current ? t('This device') : t('Web browser')}</strong>
                        <small>{s.current || !s.last_seen_at
                          ? t('Signed in {date}', { date: formatDateTime(s.created_at) })
                          : t('Last active {date}', { date: formatDateTime(s.last_seen_at) })}</small>
                      </span>
                    </span>
                    {s.current
                      ? <Badge variant="success">{t('You are here')}</Badge>
                      : <button type="button" className="k-btn outline sm" onClick={() => signOut(s.id)}>{t('Sign out')}</button>}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {sessionError && <p className="form-error c-pad-x" role="alert">{sessionError}</p>}
            <ShowAll {...devices} what={t('devices')} />
          </section>

          <ConnectedApps />
        </div>
      </div>
    </>
  );
};

type ConnectedApp = { client_id: string; name: string; scopes: string[]; connected_at: string };

/** Outside assistant apps this customer allowed through Kosh's agent gateway; withdrawing access takes effect within 5 minutes. */
const ConnectedApps: React.FC = () => {
  const { t } = useI18n();
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [error, setError] = useState('');
  const load = () => apiGet<{ apps: ConnectedApp[] }>('/api/portal/security/apps')
    .then(res => setApps(res.apps)).catch(() => setError(t('Connected apps could not be loaded right now.')));
  useEffect(() => { load(); }, []);
  const revoke = async (clientId: string) => {
    setError('');
    try {
      await apiDelete(`/api/portal/security/apps/${encodeURIComponent(clientId)}`);
      load();
    } catch {
      setError(t('Access could not be withdrawn. Please try again.'));
    }
  };
  return (
    <section className="k-panel">
      <header className="k-panel-head">
        <div><h2>{t('Connected assistant apps')}</h2><p>{t('Apps you allowed to use your account. They can only propose payments; you approve each one in Kavach.')}</p></div>
      </header>
      <div className="k-panel-body">
        {error && <p className="form-error" role="alert">{error}</p>}
        {apps === null && !error ? <p className="form-hint">{t('Loading…')}</p> : apps?.length ? (
          <ul className="k-list">
            {apps.map(app => (
              <li key={app.client_id}>
                <span>
                  <strong>{app.name}</strong>
                  <small>{app.scopes.includes('banking.propose') ? t('Can view and propose') : t('Can view only')} · {t('Connected {date}', { date: formatDate(app.connected_at) })}</small>
                </span>
                <button type="button" className="k-btn outline sm" onClick={() => revoke(app.client_id)}>{t('Withdraw access')}</button>
              </li>
            ))}
          </ul>
        ) : apps && <p className="form-hint">{t('No assistant apps are connected.')}</p>}
      </div>
    </section>
  );
};
