import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { post } from '../../services/api';
import { Icon } from '../common/Icon';
import { motion, pageMotion } from '../common/Animate';
import { PageHero } from './SiteChrome';

interface ApplicationStatus {
  reference: string;
  product: string;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'NOT_APPROVED' | 'WITHDRAWN';
  next_step: string;
  submitted_at: string;
  updated_at: string;
}

const TONE: Record<ApplicationStatus['status'], string> = { UNDER_REVIEW: 'warn', APPROVED: 'ok', NOT_APPROVED: 'danger', WITHDRAWN: '' };

const LABEL: Record<ApplicationStatus['status'], string> = {
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  NOT_APPROVED: 'Not approved',
  WITHDRAWN: 'Withdrawn',
};

type Step = { label: string; state: 'done' | 'current' | 'next'; date?: string; icon?: string };

/** The timeline, built only from what the status response says: received, under review, then the decision. */
const timeline = (r: ApplicationStatus): Step[] => {
  const received: Step = { label: 'Application received', state: 'done', date: r.submitted_at, icon: 'check' };
  if (r.status === 'WITHDRAWN') return [received, { label: LABEL.WITHDRAWN, state: 'done', date: r.updated_at, icon: 'undo' }];
  if (r.status === 'UNDER_REVIEW') return [received, { label: LABEL.UNDER_REVIEW, state: 'current', date: r.updated_at, icon: 'clock' }, { label: 'Decision', state: 'next' }];
  return [received, { label: LABEL.UNDER_REVIEW, state: 'done', icon: 'check' },
    { label: LABEL[r.status], state: 'done', date: r.updated_at, icon: r.status === 'APPROVED' ? 'check' : 'close' }];
};

/** Public page: an applicant checks status with the reference and the mobile number used to apply. */
export const TrackApplicationPage: React.FC<{ reference?: string; onAsk: (prompt: string) => void }> = ({ reference: initial = '', onAsk }) => {
  const { t, lang } = useI18n();
  const [reference, setReference] = useState(decodeURIComponent(initial).toUpperCase());
  const [mobile, setMobile] = useState('');
  const [result, setResult] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await post<ApplicationStatus>('/api/applications/status', { reference: reference.trim(), mobile: mobile.trim() }));
    } catch (err: any) {
      setError(err.status === 404 ? t('No application matches that reference and mobile number.') : (err.message || t('Could not check the status. Please try again.')));
    } finally {
      setBusy(false);
    }
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-IN' : `${lang}-IN`, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <PageHero eyebrow={t('Help')} title={t('Track application')} intro={t('Enter your application reference and the mobile number you applied with.')} />
      <section className="k-section k-track">
        <div>
          <form onSubmit={submit} className="k-card k-track-form">
            <label>{t('Application reference')}
              <input value={reference} onChange={e => setReference(e.target.value.toUpperCase())} placeholder="SAV-APP-1A2B3C" required maxLength={20} />
            </label>
            <label>{t('Mobile number')}
              <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 98765 43210" required inputMode="tel" maxLength={20} />
            </label>
            <button className="k-btn primary lg wide" type="submit" disabled={busy}>{busy ? t('Checking…') : t('Check status')}</button>
            {error && <p role="alert" className="k-form-error"><Icon name="alert" />{error}</p>}
          </form>
          {result && (
            <motion.article className="k-card k-track-result" aria-live="polite" {...pageMotion}>
              <span className={`k-pill ${TONE[result.status]}`}>{t(LABEL[result.status])}</span>
              <h2>{result.product}</h2>
              <p className="k-track-ref">{result.reference}</p>
              <ol className="k-steps">
                {timeline(result).map(s => (
                  <li key={s.label} className={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
                    <span className="k-step-dot">{s.icon && <Icon name={s.icon} />}</span>
                    <span>
                      <strong>{t(s.label)}</strong>
                      <small>
                        {s.state === 'done' ? t('Done') : s.state === 'current' ? t('In progress') : t('Next')}
                        {s.date && ` · ${s.state === 'current' ? `${t('Last update')}: ` : ''}${date(s.date)}`}
                      </small>
                    </span>
                  </li>
                ))}
              </ol>
              <p>{result.next_step}</p>
            </motion.article>
          )}
        </div>
        <aside className="k-track-help">
          <h2>{t('Where is my reference?')}</h2>
          <p>{t('It is shown on the confirmation screen right after you apply, for example SAV-APP-1A2B3C.')}</p>
          <a className="kl-link" href="#/" onClick={e => { e.preventDefault(); onAsk(t('What is the status of my application?')); }}>{t('Or ask Mitra')} <Icon name="arrow-right" /></a>
        </aside>
      </section>
    </>
  );
};
