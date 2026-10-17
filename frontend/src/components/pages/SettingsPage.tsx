import React, { useEffect, useState } from 'react';
import { formatDate } from '../common/Formatters';
import { useAuth } from '../../context/AuthContext';
import { useBanking } from '../../context/BankingContext';
import { Badge } from '../common/Badge';
import { Icon } from '../common/Icon';
import { PageHeader } from '../common/PageHeader';
import { Modal } from '../common/Modal';
import { AnimatePresence, motion } from '../common/Animate';
import { ServiceRequestDialog, type ServiceSpec } from '../app/ServiceRequestDialog';
import { apiPost, apiPatch, apiDelete } from '../../services/api';
import { useI18n } from '../../i18n';

interface SettingsPageProps {
  onOpenService?: (serviceId: string) => void;
  onStartKyc?: () => void;
  onBookAppointment?: () => void;
}

type Prefs = { email_updates: boolean; payment_alerts: boolean; monthly_statement: boolean; whatsapp_updates: boolean; marketing_offers: boolean; offers_paused_until?: string };

const initials = (name?: string) => (name || 'K').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
const future = (iso?: string) => !!iso && new Date(iso).getTime() > Date.now();
/** A masked number ("•••• 9812") is shown as is; anything else from the record ("UNVERIFIED", empty) means no number on file. */
const masked = (v?: string) => (v && v.includes('•') ? v : '');

export const SettingsPage: React.FC<SettingsPageProps> = ({ onStartKyc }) => {
  const { auth, user, setConsent } = useAuth();
  const { overview, profile, kyc, refreshOverview, updatePreferences } = useBanking();
  const { t } = useI18n();
  const [prefs, setPrefs] = useState<Prefs>({ email_updates: true, payment_alerts: true, monthly_statement: true, whatsapp_updates: false, marketing_offers: false });
  const [saved, setSaved] = useState(prefs);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [spec, setSpec] = useState<ServiceSpec | null>(null);
  const savedPreferences = (overview as any)?.preferences;
  useEffect(() => {
    if (savedPreferences && typeof savedPreferences === 'object') {
      setPrefs(p => ({ ...p, ...savedPreferences }));
      setSaved(p => ({ ...p, ...savedPreferences }));
    }
  }, [savedPreferences]);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  const c: any = profile || overview?.customer || user || {};
  const k: any = kyc || overview?.kyc || c.kyc || {};
  const kycStatus: string = k.status || 'UNKNOWN';
  const needsKyc = kycStatus === 'NOT_DONE' || kycStatus === 'PENDING_RE_KYC';
  const hasConsent = auth?.consent != null ? Boolean(auth.consent) : Boolean((user as any)?.consent ?? true);
  const lastVerified = k.last_verified_date || k.last_verified_at || k.verification?.completed_at;

  const flash = (s: { ok: boolean; text: string }) => { setStatus(s); setTimeout(() => setStatus(null), 3500); };

  const persistPrefs = async (next: Prefs) => {
    updatePreferences(next);
    try {
      await apiPatch('/api/portal/preferences', next);
      setSaved(next);
      updatePreferences(next);
      flash({ ok: true, text: t('Preferences saved.') });
      refreshOverview();
    } catch (err: any) {
      flash({ ok: false, text: err.message || t('Could not save your preferences. Please try again.') });
    }
  };

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistPrefs(prefs);
  };

  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  const toggleConsent = async () => {
    try {
      if (hasConsent) await apiDelete('/api/consent');
      else await apiPost('/api/consent', { accepted: true });
      setConsent(!hasConsent);
      setConfirmWithdraw(false);
      setWithdrawError('');
      refreshOverview();
    } catch (err: any) {
      const text = err.message || t('Could not update consent. Please try again.');
      if (confirmWithdraw) setWithdrawError(text);  // the dialog covers the page, so the error has to be inside it
      else flash({ ok: false, text });
    }
  };

  const contactSpec: ServiceSpec = {
    serviceId: 'P1-11', title: t('Update email or mobile'), subtitle: t('A bank officer confirms the change before we use the new details.'),
    fields: [
      { name: 'email', label: t('Email address'), type: 'email' },
      { name: 'mobile', label: t('Mobile number'), type: 'tel', help: t('Ten digits, without +91.') },
    ],
    initial: { email: c.email || '' },
    hideAccount: true,
    details: d => `Update contact details: email ${d.email}, mobile ${d.mobile}`,
  };
  const branchSpec: ServiceSpec = {
    serviceId: 'P1-23', title: t('Book a branch visit'), subtitle: t('The branch confirms your slot by SMS.'),
    fields: [
      { name: 'branch', label: t('Branch'), type: 'select', options: [['Mumbai Fort', 'Mumbai Fort'], ['Mumbai Andheri', 'Mumbai Andheri'], ['Mumbai Bandra', 'Mumbai Bandra']] },
      { name: 'preferred_date', label: t('Preferred date'), type: 'date' },
      { name: 'preferred_window', label: t('Preferred time'), type: 'select', options: [['10:00–11:00', '10–11 am'], ['11:00–12:00', '11 am–12 pm'], ['14:00–15:00', '2–3 pm'], ['15:00–16:00', '3–4 pm']] },
    ],
    details: d => `Branch visit at ${d.branch} on ${d.preferred_date}, ${d.preferred_window}`,
    submitLabel: t('Request this slot'),
    hideAccount: true,
  };

  const toggles: [keyof Prefs, string, string, string][] = [
    ['email_updates', 'requests', t('Service request updates'), t('Status changes and decisions.')],
    ['payment_alerts', 'payments', t('Payment notifications'), t('Transfers and bill payment confirmations.')],
    ['monthly_statement', 'file', t('Monthly statement'), t('A regular summary of your accounts.')],
    ['whatsapp_updates', 'phone', t('WhatsApp alerts'), t('Also receive SMS alerts on WhatsApp.')],
    ['marketing_offers', 'gift', t('Personalised offers'),
      t('Let Kosh use your balances, salary credits and spending to suggest products. Separate from your banking consent; off unless you turn it on.')],
  ];

  return (
    <>
      <PageHeader title={t('Profile and settings')} subtitle={t('Your personal details, preferences and account security.')} />

      <div className="c-split">
        <div className="k-page-stack">
          <section className="k-panel">
            <header className="k-panel-head c-profile-head">
              <span className="k-avatar" aria-hidden="true">{initials(c.display_name || c.full_name)}</span>
              <div>
                <h2>{c.display_name || c.full_name}</h2>
                <p>{t('{tier} banking · Customer since {year}', { tier: c.tier || 'Kosh', year: c.member_since ? new Date(c.member_since).getFullYear() : '—' })}</p>
              </div>
            </header>
            <div className="k-panel-body">
              <div className="info-row"><span>{t('Email')}</span><strong>{c.email || '—'}</strong></div>
              <div className="info-row"><span>{t('Mobile')}</span><strong>{c.phone_masked || c.phone || '—'}</strong></div>
              <div className="info-row"><span>{t('City')}</span><strong>{c.city || '—'}</strong></div>
              <button type="button" className="k-btn outline c-mt" onClick={() => setSpec(contactSpec)}><Icon name="phone" />{t('Update email or mobile')}</button>
            </div>
          </section>

          <section className="k-panel">
            <header className="k-panel-head">
              <div><h2>{t('KYC')}</h2><p>{t('Your identity check with the bank')}</p></div>
              <Badge status={kycStatus} />
            </header>
            <div className="k-panel-body">
              {lastVerified && <div className="info-row"><span>{t('Last verified')}</span><strong>{formatDate(lastVerified)}</strong></div>}
              {future(k.due_date) && <div className="info-row"><span>{t('Next re-KYC due')}</span><strong>{formatDate(k.due_date)}</strong></div>}
              <div className="info-row"><span>{t('PAN')}</span><strong>{masked(k.pan_masked) || t('Not on file')}</strong></div>
              <div className="info-row"><span>{t('Aadhaar')}</span><strong className={masked(k.aadhaar_masked) ? '' : 'c-soft'}>{masked(k.aadhaar_masked) || t('Not linked')}</strong></div>
              {needsKyc ? (
                <button type="button" className="k-btn primary c-mt" onClick={() => onStartKyc?.()}>
                  {t('Complete KYC with Mitra')} <Icon name="arrow-right" />
                </button>
              ) : kycStatus === 'VERIFIED' && (
                <p className="c-paid"><Icon name="check" />{t('Your KYC is up to date. Nothing to do.')}</p>
              )}
            </div>
          </section>

          <form id="preferencesForm" className="k-panel" onSubmit={savePrefs}>
            <header className="k-panel-head"><div><h2>{t('Notification preferences')}</h2><p>{t('Choose which updates you would like to receive.')}</p></div></header>
            <div className="k-panel-body">
              {toggles.map(([key, icon, title, sub]) => (
                <label key={key} className="k-toggle-row">
                  <div>
                    <Icon name={icon} />
                    <div>
                      <strong>{title}</strong>
                      <small>{sub}</small>
                      {key === 'marketing_offers' && prefs.marketing_offers && future(prefs.offers_paused_until) &&
                        <small className="c-paused">{t('Offer suggestions are paused until {date}.', { date: formatDate(prefs.offers_paused_until!) })}</small>}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="k-switch"
                    name={key}
                    checked={Boolean(prefs[key])}
                    onChange={e => {
                      const next = { ...prefs, [key]: e.target.checked };
                      setPrefs(next);
                      setSaved(next);
                      void persistPrefs(next);
                    }}
                  />
                </label>
              ))}
              <p className="form-hint">{t('Preferences are saved here. Delivery requires a connected notification provider.')}</p>
              <div className="c-save-row">
                <button className="k-btn primary" type="submit" disabled={!dirty}>{dirty ? t('Save preferences') : t('All changes saved')}</button>
                <AnimatePresence>
                  {status && (
                    <motion.span key={status.text} role="status" className={status.ok ? 'c-saved' : 'form-error'} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                      {status.ok && <Icon name="check" />}{status.text}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </form>
        </div>

        <div className="k-page-stack">
          <section className="k-panel">
            <header className="k-panel-head">
              <div><h2>{t('Digital banking consent')}</h2></div>
              <Badge variant={hasConsent ? 'success' : 'danger'}>{hasConsent ? t('Active') : t('Revoked')}</Badge>
            </header>
            <div className="k-panel-body">
              <p className="c-body">{t('You control whether Mitra can prepare actions and service requests for you.')}</p>
              {hasConsent
                ? <button type="button" className="k-btn danger" onClick={() => setConfirmWithdraw(true)}>{t('Withdraw permission')}</button>
                : <button type="button" className="k-btn primary" onClick={toggleConsent}>{t('Restore permission')}</button>}
            </div>
          </section>

          <aside className="k-kavach-tip">
            <Icon name="help" />
            <div>
              <strong>{t('Need a hand?')}</strong>
              <p>{t('Arrange an appointment with your branch or raise a support request.')}</p>
              <button type="button" className="k-link c-mt" onClick={() => setSpec(branchSpec)}>{t('Book a branch visit')} <Icon name="arrow-right" /></button>
            </div>
          </aside>
        </div>
      </div>

      <ServiceRequestDialog spec={spec} onClose={() => setSpec(null)} />
      <Modal isOpen={confirmWithdraw} onClose={() => { setConfirmWithdraw(false); setWithdrawError(''); }} title={t('Withdraw permission?')}
        subtitle={t('Mitra will stop preparing actions and service requests for you until you restore permission.')}>
        {withdrawError && <div className="form-error" role="alert">{withdrawError}</div>}
        <div className="k-dialog-actions">
          <button type="button" className="k-btn outline" onClick={() => { setConfirmWithdraw(false); setWithdrawError(''); }}>{t('Cancel')}</button>
          <button type="button" className="k-btn danger" onClick={toggleConsent}>{t('Withdraw permission')}</button>
        </div>
      </Modal>
    </>
  );
};
