import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { FeatureIcon, type FeatureIconName } from '../common/FeatureIcon';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { prefersReducedMotion } from '../common/motion';
import '../../story.css';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/**
 * Publishes the scroll progress (0 → 1) of the returned ref as the CSS variable --p; CSS does the rest.
 * 'pin': a tall section with a sticky child (0 when its top reaches the viewport top, 1 when its bottom reaches the bottom).
 * 'view': 0 as it enters from below, 1 once its centre reaches 40% of the viewport.
 */
export function useScrollProgress<T extends HTMLElement>(mode: 'pin' | 'view' = 'view', onProgress?: (p: number) => void) {
  const ref = useRef<T>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      const raw = mode === 'pin' ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (vh * 0.6 + r.height * 0.5);
      const p = Math.min(1, Math.max(0, raw));
      el.style.setProperty('--p', p.toFixed(4));
      cb.current?.(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [mode]);
  return ref;
}

/** "*word*" in a translated string becomes the italic serif accent. */
export const rich = (text: string) =>
  text.split(/(\*[^*]+\*)/).map((part, i) => (part.startsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : part));

/** CRED-style paragraph: each word lights up as you scroll past it. "*…*" marks accent phrases. */
export const WordReveal: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const ref = useScrollProgress<HTMLParagraphElement>('view');
  let hot = false;
  const words = text.split(/\s+/).filter(Boolean).map(raw => {
    const starts = raw.startsWith('*');
    if (starts) hot = true;
    const word = { text: raw.replace(/\*/g, ''), hot };
    if (/\*[^\p{L}\p{N}]*$/u.test(raw) && (!starts || raw.length > 1)) hot = false;
    return word;
  });
  return (
    <p ref={ref} className={`ks-reveal ${className}`} style={{ '--n': words.length } as Vars}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span className={w.hot ? 'ks-w hot' : 'ks-w'} style={{ '--i': i } as Vars}>{w.text}</span>{' '}
        </React.Fragment>
      ))}
    </p>
  );
};

export const Manifesto: React.FC = () => {
  const { t } = useI18n();
  return (
    <section className="ks-manifesto" aria-label={t('Our promise')}>
      <Rangoli className="ks-manifesto-rangoli" />
      <div className="ks-manifesto-inner">
        <span className="k-eyebrow">{t('Not just a bank')}</span>
        <WordReveal text={t('The story of Kosh begins with *bharosa*. We believe every Indian deserves a bank that speaks *their language*, protects *every rupee* and never hides the fine print. Zero balance. Zero jargon. *Mitra* by your side, *Kavach* at your gate. This is banking that feels like *home*.')} />
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ counters */

const Counter: React.FC<{ to: number; decimals?: number; prefix?: string; suffix?: string }> = ({ to, decimals = 0, prefix = '', suffix = '' }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = (v: number) => prefix + v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    el.textContent = fmt(0);
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / 1400);
        el.textContent = fmt(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return <span ref={ref} aria-hidden="true">{fmt(to)}</span>;
};

const STATS: { to: number; decimals?: number; prefix?: string; suffix?: string; label: string }[] = [
  { to: 5, prefix: '₹', suffix: 'L', label: 'Deposits insured by DICGC, per depositor' },
  { to: 8.1, decimals: 2, suffix: '%', label: 'FD interest for 444 days (illustrative)' },
  { to: 0, prefix: '₹', label: 'To open an account. No minimum balance.' },
  { to: 3, label: 'Languages Mitra speaks: English, हिन्दी, मराठी' },
];

export const Stats: React.FC = () => {
  const { t } = useI18n();
  return (
    <section className="ks-stats" aria-labelledby="stats-title">
      <div className="ks-stats-inner">
        <h2 id="stats-title" className="reveal">{rich(t('the numbers *speak* for us.'))}</h2>
        <dl>
          {STATS.map(s => (
            <div key={s.label} className="reveal">
              <dt>{t(s.label)}</dt>
              <dd aria-label={`${s.prefix || ''}${s.to}${s.suffix || ''}`}><Counter {...s} /></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ folding leaflet */

const SEGMENTS: { id: string; icon: FeatureIconName; label: string; line: string }[] = [
  { id: 'seniors', icon: 'senior', label: 'Senior citizens', line: 'Extra 0.50% on deposits and doorstep banking' },
  { id: 'women', icon: 'women', label: 'Women', line: 'Lower loan rates and savings built around you' },
  { id: 'students', icon: 'student', label: 'Students', line: 'Zero-balance account and education loans' },
  { id: 'nri', icon: 'nri', label: 'NRI banking', line: 'NRE and NRO accounts and easy transfers home' },
  { id: 'kisan', icon: 'kisan', label: 'Kisan (farmers)', line: 'Kisan credit and crop loans at fair rates' },
  { id: 'business', icon: 'business', label: 'Small business', line: 'Current accounts, UPI QR and quick working capital' },
];

export const Leaflet: React.FC = () => {
  const { t } = useI18n();
  const ref = useScrollProgress<HTMLDivElement>('view');
  return (
    <section className="k-section ks-leaflet-section" aria-labelledby="everyone-title">
      <div className="k-section-head reveal">
        <span className="k-eyebrow">{t('Banking for everyone')}</span>
        <h2 id="everyone-title">{rich(t('A bank for *every* Indian.'))}</h2>
      </div>
      <div ref={ref} className="ks-leaflet">
        {SEGMENTS.map((s, i) => (
          <a key={s.id} href={`#/for/${s.id}`} className="ks-panel fi-host" style={{ '--i': i } as Vars}>
            <FeatureIcon name={s.icon} size={64} />
            <strong>{t(s.label)}</strong>
            <small>{t(s.line)}</small>
            <Icon name="arrow-right" className="icon ks-panel-go" />
          </a>
        ))}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ door-of-light finale */

export const DoorFinale: React.FC<{ onOpen: () => void; onAsk: (prompt: string) => void }> = ({ onOpen, onAsk }) => {
  const { t } = useI18n();
  const ref = useScrollProgress<HTMLElement>('pin');
  return (
    <section ref={ref} className="ks-finale" aria-labelledby="finale-title">
      <div className="ks-finale-stick">
        <div className="ks-light" aria-hidden="true" />
        <div className="ks-finale-copy">
          <LotusMark size={56} />
          <h2 id="finale-title">{rich(t('Bharosa, *har kadam.*'))}</h2>
          <p>{t('Open a zero-balance Kosh account in about five minutes. No branch visit, no paperwork.')}</p>
          <div className="k-hero-actions">
            <button type="button" className="k-btn accent lg" onClick={onOpen}>{t('Open an account')} <Icon name="arrow-right" /></button>
            <button type="button" className="k-btn on-band lg" onClick={() => onAsk(t('Namaste Mitra! What can you help me with?'))}>{t('Ask Mitra')}</button>
          </div>
        </div>
        <div className="ks-door left" aria-hidden="true"><Rangoli className="ks-door-art" /></div>
        <div className="ks-door right" aria-hidden="true"><Rangoli className="ks-door-art" /></div>
      </div>
    </section>
  );
};

/** Thin saffron bar showing how far down the page you are (CSS scroll timeline; hidden where unsupported). */
export const ScrollProgress: React.FC = () => <div className="ks-progress" aria-hidden="true" />;
