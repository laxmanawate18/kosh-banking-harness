import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { FeatureIcon, type FeatureIconName } from '../common/FeatureIcon';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { DoorCarvings, FlapBoard, Glyph, Motes, TempleDoor } from './StoryArt';
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
      const raw = mode === 'pin' ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (vh * 0.44 + r.height * 0.36);
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

/**
 * CRED-style paragraph: each word lights up as you scroll past it. "*…*" marks accent phrases.
 * `glyphs` (optional): one decorative mark per accent phrase, placed after it from the start (no reflow) and switched
 * to .on once the phrase is lit; CSS plays the moment.
 */
export const WordReveal: React.FC<{ text: string; className?: string; glyphs?: React.ReactNode[] }> = ({ text, className = '', glyphs }) => {
  const reduce = useReducedMotion();
  const [lit, setLit] = useState(0);
  let hot = false;
  const words = text.split(/\s+/).filter(Boolean).map(raw => {
    const starts = raw.startsWith('*');
    if (starts) hot = true;
    const word = { text: raw.replace(/\*/g, ''), hot, end: false };
    if (/\*[^\p{L}\p{N}]*$/u.test(raw) && (!starts || raw.length > 1)) { hot = false; word.end = true; }
    return word;
  });
  const ends = glyphs ? words.flatMap((w, i) => (w.end ? [i] : [])) : [];
  const ref = useScrollProgress<HTMLParagraphElement>('view', glyphs && (p => setLit(ends.filter(i => p * (words.length + 6) - i >= 0.9).length)));
  return (
    <p ref={ref} className={`ks-reveal ${className}`} style={{ '--n': words.length } as Vars}>
      {words.map((w, i) => {
        const k = ends.indexOf(i), g = glyphs?.[k];
        return (
          <React.Fragment key={i}>
            <span className={w.hot ? 'ks-w hot' : 'ks-w'} style={{ '--i': i } as Vars}>{w.text}</span>
            {g ? <>{'\u00a0'}<span className={reduce || k < lit ? 'ks-glyph on' : 'ks-glyph'} aria-hidden="true">{g}</span>{' '}</> : ' '}
          </React.Fragment>
        );
      })}
    </p>
  );
};

const GLYPHS = [0, 1, 2, 3, 4, 5].map(n => <Glyph key={n} n={n} />);

/** The promise: glyphs bloom beside the accent words; the rangoli below is a floor that turns as you scroll. */
export const Manifesto: React.FC = () => {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const turn = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-40, 50]);
  return (
    <section ref={ref} className={`ks-manifesto${inView ? '' : ' ks-idle'}`} aria-label={t('Our promise')}>
      <div className="ks-floor" aria-hidden="true">
        <motion.div className="ks-floor-plane" style={{ rotateX: 66, rotateZ: turn }}>
          <Rangoli className="ks-floor-art" rings={18} />
          <Rangoli className="ks-floor-art inner" rings={12} />
        </motion.div>
      </div>
      <div className="ks-manifesto-inner">
        <span className="k-eyebrow">{t('Not just a bank')}</span>
        <WordReveal glyphs={GLYPHS} text={t('The story of Kosh begins with *bharosa*. We believe every Indian deserves a bank that speaks *their language*, protects *every rupee* and never hides the fine print. Zero balance. Zero jargon. *Mitra* by your side, *Sentinel* at your gate. This is banking that feels like *home*.')} />
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ departure board */

const STATS: { to: number; decimals?: number; prefix?: string; suffix?: string; label: string }[] = [
  { to: 5, prefix: '₹', suffix: 'L', label: 'Deposits insured by DICGC, per depositor' },
  { to: 8.1, decimals: 2, suffix: '%', label: 'FD interest for 444 days (illustrative)' },
  { to: 0, prefix: '₹', label: 'To open an account. No minimum balance.' },
  { to: 3, label: 'Languages Mitra speaks: English, Hindi, Marathi' },
];
const figure = (s: typeof STATS[number]) =>
  (s.prefix ?? '') + s.to.toLocaleString('en-IN', { minimumFractionDigits: s.decimals ?? 0, maximumFractionDigits: s.decimals ?? 0 }) + (s.suffix ?? '');

/** The figures arrive like a split-flap departure board, digit by digit and stat by stat. */
export const Stats: React.FC = () => {
  const { t } = useI18n();
  const still = !!useReducedMotion();
  const board = useRef<HTMLDListElement>(null);
  const run = useInView(board, { once: true, amount: 0.45 });
  return (
    <section className="ks-stats" aria-labelledby="stats-title">
      <div className="ks-stats-inner">
        <h2 id="stats-title" className="reveal">{rich(t('the numbers *speak* for us.'))}</h2>
        <dl ref={board}>
          {STATS.map((s, i) => (
            <div key={s.label} className="reveal">
              <dt>{t(s.label)}</dt>
              <dd><span className="sr-only">{`${s.prefix || ''}${s.to}${s.suffix || ''}`}</span><span aria-hidden="true"><FlapBoard text={figure(s)} run={run} still={still} delay={i * 70} /></span></dd>
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
        <span className="kl-eyebrow"><i />{t('Banking for everyone')}</span>
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

/* ------------------------------------------------------------------ temple-door finale */

/** Pinned: carved temple doors swing open on their hinges with the scroll, light fans out and the lotus rises. */
export const DoorFinale: React.FC<{ onOpen: () => void; onAsk: (prompt: string) => void; children?: React.ReactNode }> = ({ onOpen, onAsk, children }) => {
  const { t } = useI18n();
  const ref = useScrollProgress<HTMLElement>('pin');
  const inView = useInView(ref);
  return (
    <section ref={ref} className={`ks-finale${inView ? '' : ' ks-idle'}`} aria-labelledby="finale-title">
      <div className="ks-finale-stick">
        <div className="ks-light" aria-hidden="true" />
        {children /* the journey's card returns here (Journey.tsx) */}
        <div className="ks-rays" aria-hidden="true" />
        <div className="ks-finale-copy">
          <span className="ks-lotus" aria-hidden="true"><i /><LotusMark size={56} /></span>
          <h2 id="finale-title">{rich(t('Bharosa, *har kadam.*'))}</h2>
          <p>{t('Open a zero-balance Kosh account in about five minutes. No branch visit, no paperwork.')}</p>
          <div className="k-hero-actions">
            <button type="button" className="k-btn accent lg" onClick={onOpen}>{t('Open an account')} <Icon name="arrow-right" /></button>
            <button type="button" className="k-btn on-band lg" onClick={() => onAsk(t('Namaste Mitra! What can you help me with?'))}>{t('Ask Mitra')}</button>
          </div>
        </div>
        <DoorCarvings />
        <TempleDoor side="left" />
        <TempleDoor side="right" />
        <Motes />
      </div>
    </section>
  );
};

/** Thin accent bar showing how far down the page you are: scroll position drives scaleX directly (transform only, no React renders). */
export const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  return <motion.div className="ks-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />;
};
