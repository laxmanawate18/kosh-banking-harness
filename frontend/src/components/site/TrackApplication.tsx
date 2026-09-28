import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { post } from '../../services/api';

interface ApplicationStatus {
  reference: string;
  product: string;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'NOT_APPROVED' | 'WITHDRAWN';
  next_step: string;
  submitted_at: string;
  updated_at: string;
}

const LABEL: Record<ApplicationStatus['status'], string> = {
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  NOT_APPROVED: 'Not approved',
  WITHDRAWN: 'Withdrawn',
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
      <div className="k-page-hero">
        <div className="k-crumbs"><a href="#/">{t('Home')}</a><span>{t('Track application')}</span></div>
        <h1>{t('Track application')}</h1>
        <p>{t('Enter your application reference and the mobile number you applied with.')}</p>
      </div>
      <section className="k-section" style={{ paddingTop: 28, maxWidth: 560 }}>
        <form onSubmit={submit} className="k-card" style={{ display: 'grid', gap: 14, padding: 24 }}>
          <label>{t('Application reference')}
            <input value={reference} onChange={e => setReference(e.target.value.toUpperCase())} placeholder="SAV-APP-1A2B3C" required
              maxLength={20} style={{ display: 'block', width: '100%', marginTop: 6 }} />
          </label>
          <label>{t('Mobile number')}
            <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91 98765 43210" required inputMode="tel"
              maxLength={20} style={{ display: 'block', width: '100%', marginTop: 6 }} />
          </label>
          <button className="k-btn" type="submit" disabled={busy}>{busy ? t('Checking…') : t('Check status')}</button>
          {error && <p role="alert" style={{ color: '#ff9b91', margin: 0 }}>{error}</p>}
        </form>
        {result && (
          <article className="k-card" aria-live="polite" style={{ marginTop: 18, padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>{t(LABEL[result.status])}</h2>
            <p><strong>{result.product}</strong> · {result.reference}</p>
            <p>{t('Submitted')}: {date(result.submitted_at)} · {t('Last update')}: {date(result.updated_at)}</p>
            <p>{result.next_step}</p>
          </article>
        )}
        <p style={{ marginTop: 18 }}>
          <a href="#/" onClick={e => { e.preventDefault(); onAsk(t('What is the status of my application?')); }}>{t('Or ask Mitra')}</a>
        </p>
      </section>
    </>
  );
};
