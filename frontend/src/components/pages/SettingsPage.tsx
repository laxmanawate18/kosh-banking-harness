import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBanking } from '../../context/BankingContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../services/api';
import { useI18n } from '../../i18n';

interface SettingsPageProps {
  onOpenService?: (serviceId: string) => void;
  onStartKyc?: () => void;
  onChangePassword?: () => void;
  onBookAppointment?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onOpenService,
  onStartKyc,
  onChangePassword,
  onBookAppointment,
}) => {
  const { auth, user, setConsent } = useAuth();
  const { overview, profile, kyc, refreshOverview } = useBanking();
  const { t } = useI18n();

  const [preferences, setPreferences] = useState({
    email_updates: true,
    payment_alerts: true,
    monthly_statement: true,
    whatsapp_updates: false,
  });
  const [prefStatus, setPrefStatus] = useState<string | null>(null);
  const savedPreferences = (overview as any)?.preferences;
  useEffect(() => {
    if (savedPreferences && typeof savedPreferences === 'object') setPreferences(p => ({ ...p, ...savedPreferences }));
  }, [savedPreferences]);

  const c = profile || overview?.customer || (user as any) || {
    display_name: 'Ananya Sharma',
    full_name: 'Ananya Sharma',
    tier: 'Platinum',
    member_since: '2022-01-01',
    email: 'ananya.sharma@example.com',
    phone_masked: '+91 98••• ••210',
    city: 'Mumbai',
  };

  const customerKyc = kyc || overview?.kyc || c.kyc || {
    status: 'VERIFIED',
    due_date: '2027-03-31',
    risk_category: 'LOW',
    pan_masked: '••••••123F',
    aadhaar_masked: '•••• •••• 9812',
  };

  const hasConsent = auth?.consent != null ? Boolean(auth.consent) : Boolean((user as any)?.consent ?? true);

  const initials = (name?: string) => {
    return (name || 'A S')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '31 Mar 2027';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handlePreferencesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPatch('/api/portal/preferences', preferences);
      setPrefStatus(t('Preferences saved.'));
      setTimeout(() => setPrefStatus(null), 3000);
    } catch (err: any) {
      setPrefStatus(err.message || t('Could not save your preferences. Please try again.'));
    }
  };

  const toggleConsent = async () => {
    const nextConsent = !hasConsent;
    try {
      if (nextConsent) {
        await apiPost('/api/consent', { accepted: true });
      } else {
        await apiDelete('/api/consent');
      }
      setConsent(nextConsent);
      refreshOverview();
    } catch (err: any) {
      setPrefStatus(err.message || t('Could not update consent. Please try again.'));
    }
  };

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('Make yourself at home.')}</h1>
          <p>{t('Your personal details, preferences and account security.')}</p>
        </div>
      </header>

      <div className="split-grid">
        <section className="panel">
          <div className="settings-group">
            <div className="merchant-cell">
              <span className="avatar">{initials(c.display_name || c.full_name)}</span>
              <div>
                <h2>{c.display_name || c.full_name || 'Ananya Sharma'}</h2>
                <p>
                  {t('{tier} banking · Customer since {year}', {
                    tier: c.tier || 'Platinum',
                    year: new Date(c.member_since || '2022-01-01').getFullYear(),
                  })}
                </p>
              </div>
            </div>

            <div className="info-row">
              <span>{t('Email')}</span>
              <strong>{c.email || 'ananya.sharma@example.com'}</strong>
            </div>
            <div className="info-row">
              <span>{t('Mobile')}</span>
              <strong>{c.phone_masked || c.phone || '+91 98••• ••210'}</strong>
            </div>
            <div className="info-row">
              <span>{t('City')}</span>
              <strong>{c.city || 'Mumbai'}</strong>
            </div>

            <div className="dialog-footer">
              <button
                type="button"
                className="button"
                onClick={() => onOpenService?.('P1-11')}
              >
                {t('Request contact update')}
              </button>
            </div>
          </div>

          <div className="settings-group">
            <div className="panel-head">
              <h2>{t('KYC compliance profile')}</h2>
              <Badge variant={customerKyc.status === 'VERIFIED' ? 'success' : 'warning'}>
                {customerKyc.status || 'VERIFIED'}
              </Badge>
            </div>

            <div className="info-row">
              <span>{t('Regulatory status')}</span>
              <strong>{(customerKyc.status || 'VERIFIED').replaceAll('_', ' ').toLowerCase()}</strong>
            </div>
            <div className="info-row">
              <span>{t('Periodic due date')}</span>
              <strong>{formatDate(customerKyc.due_date)}</strong>
            </div>
            <div className="info-row">
              <span>{t('Risk classification')}</span>
              <strong>{customerKyc.risk_category || 'LOW'}</strong>
            </div>
            <div className="info-row">
              <span>{t('Registered PAN')}</span>
              <strong>{customerKyc.pan_masked || '••••••••••'}</strong>
            </div>
            <div className="info-row">
              <span>{t('Registered Aadhaar')}</span>
              <strong>{customerKyc.aadhaar_masked || '•••• •••• ••••'}</strong>
            </div>

            <div className="dialog-footer">
              {customerKyc.status === 'NOT_DONE' ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onStartKyc?.()}
                >
                  {t('Complete initial KYC with Mitra')} <Icon name="arrow-right" />
                </button>
              ) : customerKyc.status === 'PENDING_RE_KYC' ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onStartKyc?.()}
                >
                  {t('Complete KYC with Mitra')} <Icon name="arrow-right" />
                </button>
              ) : (
                <Badge variant="neutral">{t('KYC compliant')}</Badge>
              )}
            </div>
          </div>

          <form id="preferencesForm" className="settings-group" onSubmit={handlePreferencesSubmit}>
            <h3>{t('Notification preferences')}</h3>
            <p>{t('Choose which updates you would like to receive.')}</p>

            <label className="check-row">
              <span>
                <strong>{t('Service request updates')}</strong>
                <small style={{ display: 'block' }}>{t('Status changes and decisions.')}</small>
              </span>
              <input
                type="checkbox"
                name="email_updates"
                checked={preferences.email_updates}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, email_updates: e.target.checked }))
                }
              />
            </label>

            <label className="check-row">
              <span>
                <strong>{t('Payment notifications')}</strong>
                <small style={{ display: 'block' }}>{t('Transfers and bill payment confirmations.')}</small>
              </span>
              <input
                type="checkbox"
                name="payment_alerts"
                checked={preferences.payment_alerts}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, payment_alerts: e.target.checked }))
                }
              />
            </label>

            <label className="check-row">
              <span>
                <strong>{t('Monthly statement')}</strong>
                <small style={{ display: 'block' }}>{t('A regular summary of your accounts.')}</small>
              </span>
              <input
                type="checkbox"
                name="monthly_statement"
                checked={preferences.monthly_statement}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, monthly_statement: e.target.checked }))
                }
              />
            </label>
            <label className="check-row">
              <span>
                <strong>{t('WhatsApp alerts')}</strong>
                <small style={{ display: 'block' }}>{t('Also receive SMS alerts on WhatsApp.')}</small>
              </span>
              <input
                type="checkbox"
                name="whatsapp_updates"
                checked={preferences.whatsapp_updates}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, whatsapp_updates: e.target.checked }))
                }
              />
            </label>

            <p className="form-hint">
              {t('Preferences are saved here. Delivery requires a connected notification provider.')}
            </p>
            {prefStatus && <p className="form-hint" style={{ color: 'var(--ok)', fontWeight: 600 }}>{prefStatus}</p>}
            <button className="button primary" type="submit">
              {t('Save preferences')}
            </button>
          </form>
        </section>

        <div className="stack">
          <section className="panel panel-pad">
            <h2>{t('Password & sign-in')}</h2>
            <p className="form-hint">{t('Change your password and sign out other sessions.')}</p>
            <button
              type="button"
              className="button"
              onClick={() => onChangePassword?.()}
            >
              {t('Change password')}
            </button>

            <div className="section-heading">
              <h2>{t('Digital banking consent')}</h2>
            </div>
            <Badge variant={hasConsent ? 'success' : 'danger'}>
              {hasConsent ? t('Active') : t('Revoked')}
            </Badge>
            <p className="form-hint" style={{ marginTop: '8px' }}>
              {t('You control whether Mitra can prepare actions and service requests for you.')}
            </p>
            <button
              type="button"
              className="button"
              onClick={toggleConsent}
            >
              {hasConsent ? t('Withdraw permission') : t('Restore permission')}
            </button>
          </section>

          <section className="tip-panel">
            <Icon name="help" />
            <div>
              <h3>{t('Need a hand?')}</h3>
              <p>{t('Arrange an appointment with your branch or raise a support request.')}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => onBookAppointment?.()}
              >
                {t('Book a branch visit')} <Icon name="arrow-right" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
