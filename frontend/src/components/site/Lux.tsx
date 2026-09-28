import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { Card3D } from '../common/Card3D';
import { FeatureIcon, type FeatureIconName } from '../common/FeatureIcon';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { prefersReducedMotion } from '../common/motion';
import { rich, useScrollProgress, WordReveal } from './Story';
import '../../lux.css';

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;
type Mount = (host: HTMLElement, opts: { still: boolean }) => () => void;

/** Smooth, weighted scrolling for the public site (Lenis). Off for reduced motion; inner scrollers opt out. */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null, raf = 0, dead = false;
    import('lenis').then(({ default: Lenis }) => {
      if (dead) return;
      lenis = new Lenis({
        lerp: 0.1,
        wheelMultiplier: 0.9,
        prevent: (node: HTMLElement) => !!node.closest?.('dialog, [popover], [data-lenis-prevent]'),
      });
      const tick = (t: number) => { lenis?.raf(t); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    });
    return () => { dead = true; cancelAnimationFrame(raf); lenis?.destroy(); };
  }, [enabled]);
}

/** Buttons that lean toward the cursor (fine pointers only). */
const magnetic = {
  onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const el = e.currentTarget, r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${(e.clientX - r.left - r.width / 2) * 0.22}px`);
    el.style.setProperty('--my', `${(e.clientY - r.top - r.height / 2) * 0.3}px`);
  },
  onPointerLeave(e: React.PointerEvent<HTMLElement>) {
    e.currentTarget.style.setProperty('--mx', '0px');
    e.currentTarget.style.setProperty('--my', '0px');
  },
};

/** Lazy three.js scene: the chunk loads on demand and the mount function owns the canvas. */
const lazyScene = (load: () => Promise<Mount>) => lazy(async () => {
  const mount = await load();
  const Scene: React.FC = () => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => mount(ref.current!, { still: prefersReducedMotion() }), []);
    return <div ref={ref} className="kl-canvas" />;
  };
  return { default: Scene };
});
const CardScene = lazyScene(() => import('./cardScene').then(m => m.mountCardScene));
const RingScene = lazyScene(() => import('./ringScene').then(m => m.mountRingScene));
const SpheresScene = lazyScene(() => import('./spheresScene').then(m => m.mountSpheresScene));

const hasWebGL = () => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
};

/** Renders children only once the slot comes within ~one screen of the viewport. */
const NearView: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '100% 0px' });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="kl-canvas">{near && <Suspense fallback={null}>{children}</Suspense>}</div>;
};

export const LuxHero: React.FC<{ onOpen: () => void; onLogin: () => void }> = ({ onOpen, onLogin }) => {
  const { t } = useI18n();
  const [webgl] = useState(hasWebGL);

  // Marks the page so the floating "Ask Mitra" button takes the glass style.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.hero = 'lux';
    return () => { delete root.dataset.hero; };
  }, []);

  return (
    <section className="kl-hero" aria-labelledby="hero-title">
      <div className="kl-grain" aria-hidden="true" />
      <Rangoli className="kl-hero-rangoli" rings={22} />
      <div className="kl-hero-inner">
        <div className="kl-hero-copy">
          <span className="kl-eyebrow"><span lang="hi">नमस्ते</span><i />{t('Private-grade banking for every Indian')}</span>
          <h1 id="hero-title">
            <span className="kl-line" style={{ '--d': 0 } as Vars}>{t('Bharosa,')}</span>
            <em className="kl-line" style={{ '--d': 1 } as Vars}>{t('har kadam.')}</em>
          </h1>
          <p className="kl-hero-sub">{t('One account for savings, cards, deposits and loans. Mitra answers in your language. Sentinel guards every rupee.')}</p>
          <div className="kl-actions">
            <button type="button" className="kl-btn gold" onClick={onOpen} {...magnetic}>
              <span>{t('Open an account')}</span><Icon name="arrow-right" />
            </button>
            <button type="button" className="kl-link" onClick={onLogin}>{t('Login')} <Icon name="arrow-right" /></button>
          </div>
        </div>
        <div className="kl-card3d" aria-hidden="true">
          <div className="kl-card-glow" />
          {webgl
            ? <Suspense fallback={<div className="kl-canvas kl-canvas-wait" />}><CardScene /></Suspense>
            : <div className="kl-card-css"><Card3D float /></div>}
        </div>
      </div>
      <ul className="kl-trustline" aria-label={t('Why bank with Kosh')}>
        <li>{t('Deposits insured up to ₹5 lakh by DICGC')}</li>
        <li>{t('Sentinel checks every payment')}</li>
        <li>{t('Mitra answers 24×7 in English, हिन्दी and मराठी')}</li>
      </ul>
      <span className="kl-scroll-cue" aria-hidden="true"><i /></span>
    </section>
  );
};

/* ------------------------------------------------------------------ card wheel */

export const CardRing: React.FC = () => {
  const { t } = useI18n();
  const [webgl] = useState(hasWebGL);
  return (
    <section className="kl-ring" aria-labelledby="ring-title">
      <div className="kl-ring-copy">
        <span className="kl-eyebrow">{t('Cards and accounts')}</span>
        <h2 id="ring-title">{rich(t('do more with *every rupee*.'))}</h2>
        <p>{t('Accounts, cards, deposits and loans in one place. Reminders before every due date, no hidden charges, and a clear view of what your money earns.')}</p>
        <a className="kl-link" href="#/products">{t('Explore products')} <Icon name="arrow-right" /></a>
      </div>
      <div className="kl-ring-stage" aria-hidden="true">
        {webgl ? <NearView><RingScene /></NearView> : <div className="kl-card-css"><Card3D float /></div>}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ pinned sideways rail */

type Tile = { icon: string; kicker: string; title: string; href?: string; ask?: string; art: 'qr' | 'card' | 'bill' | 'chat' | FeatureIconName; glow: string };
const TILES: Tile[] = [
  { icon: 'scan', kicker: 'Scan and pay', title: 'pay any UPI QR in a second', href: '#/products/savings', art: 'qr', glow: '#dfe3ea' },
  { icon: 'cards', kicker: 'Kosh metal cards', title: 'cards that pay you back', href: '#/products/cards', art: 'card', glow: '#e2b964' },
  { icon: 'deposits', kicker: 'Deposits', title: 'grow it with FDs up to 8.10%', href: '#/products/deposits', art: 'deposits', glow: '#9fb3d6' },
  { icon: 'bills', kicker: 'Bills and recharge', title: 'bills paid before they are due', href: '#/products/savings', art: 'bill', glow: '#c99a82' },
  { icon: 'ai-banker', kicker: 'Mitra', title: 'a banker who speaks your language', ask: 'Namaste Mitra! What can you help me with?', art: 'chat', glow: '#ece6d8' },
  { icon: 'security', kicker: 'Sentinel', title: 'every payment checked first', href: '#/help', art: 'kavach', glow: '#aebfb6' },
  { icon: 'building', kicker: 'Loans', title: 'home loans, approved in minutes', href: '#/products/loans', art: 'loans', glow: '#d4a24c' },
];

const TileArt: React.FC<{ art: Tile['art'] }> = ({ art }) => {
  const { t } = useI18n();
  if (art === 'card') {
    return (
      <span className="kl-art-card">
        <span className="kl-art-card-b" /><span className="kl-art-card-f"><LotusMark size={26} /><b>kosh</b><i /><small>•••• 5521</small></span>
      </span>
    );
  }
  if (art === 'qr' || art === 'bill' || art === 'chat') {
    return (
      <span className="kl-art-phone">
        <span className="kl-art-notch" />
        {art === 'qr' && <span className="kl-art-qr"><span /><em>₹1,240</em><small>{t('Paid in 0.8 seconds')}</small></span>}
        {art === 'bill' && <span className="kl-art-bill"><small>BESCOM</small><em>₹3,450</em><span className="kl-art-pill">{t('Autopay on')}</span><small>{t('Due 20 Sept')}</small></span>}
        {art === 'chat' && (
          <span className="kl-art-chat">
            <span className="me">Mera balance kitna hai?</span>
            <span className="bot">₹4,10,000 · दोन खाती</span>
            <span className="me">FD kholni hai</span>
          </span>
        )}
      </span>
    );
  }
  return <span className="kl-art-icon"><FeatureIcon name={art} variant="bare" size={150} /></span>;
};

export const UpgradeRail: React.FC<{ onAsk: (prompt: string) => void }> = ({ onAsk }) => {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const ref = useScrollProgress<HTMLElement>('pin');

  // Pinned on wide screens: vertical scroll moves the rail sideways. Phones get a native swipe rail.
  useEffect(() => {
    const measure = () => {
      const el = track.current;
      const wide = window.matchMedia('(min-width: 901px)').matches && !prefersReducedMotion();
      setShift(el && wide ? Math.max(0, el.scrollWidth - el.clientWidth) : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    return () => ro.disconnect();
  }, []);

  return (
    <section ref={ref} className={`kl-upgrade ${shift ? 'is-pinned' : ''}`} style={shift ? { height: `calc(100svh + ${shift}px)` } : undefined} aria-labelledby="upgrade-title">
      <div className="kl-upgrade-stick">
        <h2 id="upgrade-title">{rich(t('upgrade your money. *bit by bit.*'))}</h2>
        <div ref={track} className="kl-upgrade-track" style={{ '--shift': shift } as Vars}>
          {TILES.map(tile => {
            const body = (
              <>
                <span className="kl-tile-kicker"><Icon name={tile.icon} />{t(tile.kicker)}</span>
                <strong>{t(tile.title)}</strong>
                <span className="kl-tile-more">{t('Know more')} <Icon name="arrow-right" /></span>
                <span className="kl-tile-art" aria-hidden="true"><TileArt art={tile.art} /></span>
              </>
            );
            const style = { '--glow': tile.glow } as Vars;
            return tile.ask
              ? <button key={tile.kicker} type="button" className="kl-tile fi-host" style={style} onClick={() => onAsk(t(tile.ask!))}>{body}</button>
              : <a key={tile.kicker} href={tile.href} className="kl-tile fi-host" style={style}>{body}</a>;
          })}
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ rewards */

export const Rewards: React.FC = () => {
  const { t } = useI18n();
  const [webgl] = useState(hasWebGL);
  return (
    <section className="kl-rewards" aria-labelledby="rewards-title">
      <div className="kl-rewards-stage" aria-hidden="true">{webgl && <NearView><SpheresScene /></NearView>}</div>
      <div className="kl-rewards-copy">
        <h2 id="rewards-title">{rich(t('rewards that *find* you.'))}</h2>
        <p>{t('Cashback on UPI, points on every card swipe and members-only offers from brands you love. No coupons to chase.')}</p>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ safety statement */

export const SafetyStatement: React.FC = () => {
  const { t } = useI18n();
  return (
    <section className="kl-safe" aria-labelledby="safe-title">
      <FeatureIcon name="kavach" variant="bare" size={64} />
      <h2 id="safe-title" className="kl-eyebrow">{t('Your money is yours. Keeping it safe is ours.')}</h2>
      <WordReveal className="kl-safe-text" text={t('Every payment is checked by *Sentinel* before it leaves your account. OTPs stay inside a trusted Kosh screen, never in chat. Your data is encrypted and *never sold*.')} />
    </section>
  );
};

/* ------------------------------------------------------------------ editorial photo stories */

const STORIES = [
  { img: 'family', alt: 'A family celebrating at home with their baby', kicker: 'Savings and deposits', title: 'Every milestone, *saved*.', line: 'Zero-balance savings and FDs up to 8.10% for the moments that matter.', href: '#/products/savings' },
  { img: 'kisan', alt: 'A farmer in a white turban standing in his cattle shed', kicker: 'Kisan banking', title: 'Harvests deserve *fair* credit.', line: 'Kisan credit and crop loans at fair rates, explained in your language.', href: '#/for/kisan' },
  { img: 'dukaan', alt: 'A shopkeeper on a phone call at his kirana store', kicker: 'Small business', title: 'Your dukaan, *digital*.', line: 'UPI QR, a current account and quick working capital for your shop.', href: '#/for/business' },
];

export const Editorial: React.FC = () => {
  const { t } = useI18n();
  const ref = useScrollProgress<HTMLDivElement>('view');
  return (
    <section className="kl-editorial" aria-labelledby="editorial-title">
      <div className="kl-editorial-head">
        <span className="kl-eyebrow dark">{t('Made for every kadam')}</span>
        <h2 id="editorial-title">{rich(t('real lives. *real* banking.'))}</h2>
        <p>{t('From a first salary to a family milestone, a harvest or a busy shop, Kosh fits the life you already live.')}</p>
      </div>
      <div ref={ref} className="kl-stories">
        {STORIES.map((s, i) => (
          <a key={s.img} href={s.href} className="kl-story" style={{ '--i': i } as Vars}>
            <span className="kl-photo">
              <img src={`/img/people/${s.img}-800.webp`} srcSet={`/img/people/${s.img}-800.webp 800w, /img/people/${s.img}-1600.webp 1600w`}
                sizes="(max-width: 900px) 100vw, 60vw" alt={t(s.alt)} loading="lazy" decoding="async" />
            </span>
            <span className="kl-story-copy">
              <small>{t(s.kicker)}</small>
              <strong>{rich(t(s.title))}</strong>
              <span>{t(s.line)}</span>
              <span className="kl-story-go">{t('Explore')} <Icon name="arrow-right" /></span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
};
