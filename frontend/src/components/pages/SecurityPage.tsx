import React, { useState, useEffect } from 'react';
import { formatDate } from '../common/Formatters';
import { useBanking } from '../../context/BankingContext';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { apiGet, apiPost, apiDelete } from '../../services/api';
import { useI18n } from '../../i18n';

interface SecuritySession {
  id: string;
  current: boolean;
  created_at: string;
  user_agent?: string;
  ip_address?: string;
}

interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  status: string;
}

interface SecurityPageProps {
  onNavigate?: (route: string) => void;
  onExportAudit?: () => void;
}

export const SecurityPage: React.FC<SecurityPageProps> = ({
  onNavigate,
  onExportAudit,
}) => {
  const { overview, events } = useBanking();
  const { auth, user } = useAuth();
  const { t } = useI18n();
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const alerts: SecurityAlert[] = (overview as any)?.security_alerts || [];
  const hasConsent = auth?.consent != null ? Boolean(auth.consent) : Boolean((user as any)?.consent ?? true);

  const loadSessions = () => {
    setIsLoadingSessions(true);
    apiGet<{ sessions: SecuritySession[] }>('/api/portal/security/sessions')
      .then((res) => {
        if (res?.sessions) setSessions(res.sessions);
      })
      .catch(() => {
        setSessions([
          {
            id: 'sess-current',
            current: true,
            created_at: new Date().toISOString(),
          },
        ]);
      })
      .finally(() => setIsLoadingSessions(false));
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiDelete(`/api/portal/security/sessions/${encodeURIComponent(sessionId)}`);
      loadSessions();
    } catch {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('Protection you can see.')}</h1>
          <p>{t('Review alerts, authorization checks and your signed-in sessions.')}</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="button"
            onClick={() => onExportAudit?.()}
          >
            {t('Export activity')}
          </button>
        </div>
      </header>

      <div className="split-grid control-docket">
        <div className="stack">
          <section className="panel">
            <header className="panel-head">
              <h2>{t('Security alerts')}</h2>
              <Badge status={alerts.some((a) => a.status === 'OPEN') ? 'CHALLENGE' : 'ACTIVE'}>
                {alerts.some((a) => a.status === 'OPEN') ? t('Needs attention') : t('Active')}
              </Badge>
            </header>

            {alerts.length > 0 ? (
              alerts.map((a) => (
                <div key={a.id} className="panel-pad">
                  <h3>{a.title}</h3>
                  <p className="form-hint">{a.description}</p>
                  <Badge variant={a.status === 'OPEN' ? 'warning' : 'neutral'}>
                    {a.status}
                  </Badge>
                  <div className="dialog-footer">
                    <button
                      type="button"
                      className="button"
                      onClick={() => onNavigate?.('cards')}
                    >
                      {t('Manage card')}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-panel">
                <div className="empty-icon">
                  <Icon name="security" />
                </div>
                <h3>{t('You’re in the clear')}</h3>
                <p>{t('No open security alerts.')}</p>
              </div>
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>{t('Recent security activity')}</h2>
            </header>
            <div id="sentinelRail">
              {events && events.length > 0 ? (
                events.slice(0, 12).map((e, idx) => (
                  <article key={e.id || idx} className="audit-item">
                    <span
                      className={`event-dot ${
                        ['CRITICAL', 'ERROR'].includes(e.severity || '')
                          ? 'danger'
                          : e.severity === 'WARNING'
                          ? 'warning'
                          : ''
                      }`}
                    />
                    <div>
                      <h3>{(e.event_type || e.action || '').replaceAll('_', ' ').toLowerCase()}</h3>
                      <p>{e.summary || e.resource || ''}</p>
                      {e.details?.reason_codes?.length ? (
                        <details>
                          <summary>{t('Policy reasons')}</summary>
                          {e.details.reason_codes.map((r: string, rIdx: number) => (
                            <p key={rIdx}>{r.replaceAll('_', ' ').toLowerCase()}</p>
                          ))}
                        </details>
                      ) : null}
                    </div>
                    <time>
                      {formatDate(e.created_at)}
                      <br />
                      {formatTime(e.created_at)}
                    </time>
                  </article>
                ))
              ) : (
                <div className="empty-panel">
                  <div className="empty-icon">
                    <Icon name="security" />
                  </div>
                  <h3>{t('No activity to show')}</h3>
                  <p>{t('Security decisions will be recorded here.')}</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel panel-pad">
            <h2>{t('Permission & protection')}</h2>
            <div className="info-row">
              <span>{t('Identity')}</span>
              <strong>{t('Signed in and verified')}</strong>
            </div>
            <div className="info-row">
              <span>{t('Digital banking permission')}</span>
              <strong>{hasConsent ? t('Active') : t('Withdrawn')}</strong>
            </div>
            <div className="info-row">
              <span>{t('Payment checks')}</span>
              <strong>{t('Kavach authorization')}</strong>
            </div>
            <div className="info-row">
              <span>{t('Transfers')}</span>
              <strong>{t('Approval required')}</strong>
            </div>
            <div className="info-row">
              <span>{t('Card protection')}</span>
              <strong>{t('Available immediately')}</strong>
            </div>
            <p className="form-hint" style={{ marginTop: '14px' }}>
              {t('Payments are checked against your intent, the destination, amount, account ownership and recent activity.')}
            </p>
          </section>

          <section className="panel panel-pad">
            <h2>{t('Signed-in sessions')}</h2>
            <div id="activeSessions">
              {isLoadingSessions ? (
                <p className="form-hint">{t('Loading sessions…')}</p>
              ) : sessions.length > 0 ? (
                sessions.map((s) => (
                  <div key={s.id} className="info-row">
                    <span>
                      <strong>{s.current ? t('This session') : t('Banking session')}</strong>
                      <br />
                      <small>{t('Signed in {date}', { date: formatDate(s.created_at) })}</small>
                    </span>
                    {s.current ? (
                      <Badge variant="success">{t('Active')}</Badge>
                    ) : (
                      <button
                        type="button"
                        className="button"
                        onClick={() => handleRevokeSession(s.id)}
                      >
                        {t('Sign out')}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="info-row">
                  <span>
                    <strong>{t('This session')}</strong>
                    <br />
                    <small>{t('Signed in today')}</small>
                  </span>
                  <Badge variant="success">{t('Active')}</Badge>
                </div>
              )}
            </div>
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
    .then((res) => setApps(res.apps)).catch(() => setError(t('Connected apps could not be loaded right now.')));
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
    <section className="panel panel-pad">
      <h2>{t('Connected assistant apps')}</h2>
      <p className="form-hint">{t('Apps you allowed to use your account. They can only propose payments; you approve each one in Kavach.')}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {apps === null && !error ? <p className="form-hint">{t('Loading…')}</p> : apps?.length ? apps.map((app) => (
        <div key={app.client_id} className="info-row">
          <span>
            <strong>{app.name}</strong>
            <br />
            <small>{app.scopes.includes('banking.propose') ? t('Can view and propose') : t('Can view only')} · {t('Connected {date}', { date: formatDate(app.connected_at) })}</small>
          </span>
          <button type="button" className="button" onClick={() => revoke(app.client_id)}>{t('Withdraw access')}</button>
        </div>
      )) : apps && <p className="form-hint">{t('No assistant apps are connected.')}</p>}
    </section>
  );
};
