import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../common/Icon';
import { KoshLogo, Rangoli } from '../common/KoshLogo';
import { DisplayControls } from '../common/Preferences';
import { prefersReducedMotion } from '../common/motion';

/** Public pages live under #/…; anything else (or empty) is the home page. */
export function useHashRoute(): string[] {
  const read = () => {
    const h = window.location.hash;
    return h.startsWith('#/') ? h.slice(2).split('/').filter(Boolean) : [];
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const TICKER = [
  'Kosh will never ask for your OTP, PIN or password on call, SMS or chat.',
  'Cyber fraud? Call 1930 or report at cybercrime.gov.in.',
  'Digital arrest is a scam. No police or court asks for money on a video call.',
];

const FESTIVE_COLORS = ['#f5b53d', '#e8740c', '#e5487a', '#4c5bd4', '#0c7461'];

export const UtilityBar: React.FC = () => {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const next = () => setIndex(n => (n + 1) % TICKER.length);
  // One quiet line that changes every few seconds; paused, or manual-only with reduced motion.
  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const id = setInterval(next, 6000);
    return () => clearInterval(id);
  }, [paused]);
  return (
    <div className="k-utility">
      <div className="k-utility-inner">
        <button
          type="button"
          className="k-skip"
          onClick={() => document.getElementById('main')?.focus()}
        >
          {t('Skip to main content')}
        </button>
        <strong style={{ flexShrink: 0, color: '#fff', fontSize: 13 }}>{t('PRODUCT DEMO — not a real bank')}</strong>
        <div className={`k-ticker ${paused ? 'paused' : ''}`} role="region" aria-label={t('Safety notices')}>
          <button
            type="button"
            className="k-ticker-btn"
            aria-label={paused ? t('Play notices') : t('Pause notices')}
            aria-pressed={paused}
            onClick={() => setPaused(p => !p)}
          >
            <Icon name={paused ? 'play' : 'pause'} />
          </button>
          <p key={index} className="k-ticker-line"><Icon name="shield" /> <span>{t(TICKER[index])}</span></p>
          <button type="button" className="k-ticker-btn" aria-label={t('Next notice')} onClick={next}>
            <Icon name="chevron-right" />
          </button>
        </div>
        <div className="k-utility-tools">
          <DisplayControlsCompact />
        </div>
      </div>
    </div>
  );
};

/** A−/A/A+ and contrast/theme in the dark utility bar, via the shared popover on small screens. */
const DisplayControlsCompact: React.FC = () => {
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="k-icon-btn" popoverTarget="k-site-display" aria-label={t('Display settings')}>
        <Icon name="text" />
      </button>
      <div id="k-site-display" popover="auto" className="k-popover" style={{ inset: '48px 16px auto auto' }}>
        <h2>{t('Display')}</h2>
        <DisplayControls />
      </div>
    </>
  );
};

/** Inner-page hero in the Home language: breadcrumb, gold-thread eyebrow, serif headline whose last word is the accent. */
export const PageHero: React.FC<{ eyebrow: string; title: string; intro: string; trail?: [string, string][] }> = ({ eyebrow, title, intro, trail = [] }) => {
  const { t } = useI18n();
  const cut = title.lastIndexOf(' ') + 1;
  return (
    <div className="k-page-hero">
      <Rangoli className="k-page-hero-art" rings={18} />
      <div className="k-page-hero-inner">
        <nav className="k-crumbs" aria-label={t('Breadcrumb')}>
          {[['Home', '#/'], ...trail].map(([label, href]) => (
            <React.Fragment key={href}><a href={href}>{t(label)}</a><Icon name="chevron-right" /></React.Fragment>
          ))}
          <span aria-current="page">{title}</span>
        </nav>
        <span className="kl-eyebrow"><i />{eyebrow}</span>
        <h1>{title.slice(0, cut)}<em>{title.slice(cut)}</em></h1>
        <p>{intro}</p>
      </div>
    </div>
  );
};

/** Pages without their own nav item light up the closest one. */
const NAV_ALIAS: Record<string, string> = {
  '#/products': '#/products/savings', '#/products/deposits': '#/products/savings', '#/products/wealth': '#/products/savings',
  '#/fees': '#/rates', '#/faqs': '#/help', '#/learn': '#/help', '#/track': '#/help',
};

const NAV: [string, string][] = [
  ['Accounts', '#/products/savings'],
  ['Cards', '#/products/cards'],
  ['Loans', '#/products/loans'],
  ['Rates', '#/rates'],
  ['Calculators', '#/calculators'],
  ['Help', '#/help'],
];

export const SiteHeader: React.FC<{ route: string[]; onLogin: () => void }> = ({ route, onLogin }) => {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const current = '#/' + route.join('/');
  const section = NAV_ALIAS[route[0] === 'products' ? current : '#/' + route[0]] || current;

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => setOpen(false), [current]);

  return (
    <header className={`k-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="k-header-inner">
        <a href="#/" aria-label={t('Kosh home')}><KoshLogo size={38} tagline /></a>
        <nav className={`k-nav ${open ? 'open' : ''}`} aria-label={t('Primary')}>
          {NAV.map(([label, href]) => (
            <a key={href} href={href} aria-current={section.startsWith(href) ? 'page' : undefined}>{t(label)}</a>
          ))}
          <a className="k-nav-extra" href="#/products/savings">{t('Open an account')}</a>
        </nav>
        <div className="k-header-cta">
          <button type="button" className="k-btn outline sm" onClick={onLogin}>
            <Icon name="lock" /> {t('Login')}
          </button>
          <a className="k-btn accent sm" href="#/products/savings">{t('Open an account')}</a>
          <button
            type="button"
            className="k-icon-btn k-burger"
            aria-label={t('Menu')}
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
        <div className="k-festive-lights" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} style={{ '--c': FESTIVE_COLORS[i % 5], '--delay': `${(i % 6) * 0.25}s` } as React.CSSProperties} />
          ))}
        </div>
      </div>
    </header>
  );
};

export const SiteFooter: React.FC<{ onAsk: (q: string) => void }> = ({ onAsk }) => {
  const { t } = useI18n();
  return (
    <footer className="k-footer">
      <div className="k-footer-border" aria-hidden="true" />
      <div className="k-footer-grid">
        <div>
          <KoshLogo size={44} tone="light" tagline />
          <p>{t('Kosh is a demonstration digital bank. Rates are illustrative and no real money moves.')}</p>
        </div>
        <nav aria-label={t('Bank with us')}>
          <h2>{t('Bank with us')}</h2>
          <a href="#/products/savings">{t('Savings accounts')}</a>
          <a href="#/products/cards">{t('Credit cards')}</a>
          <a href="#/products/deposits">{t('Fixed deposits')}</a>
          <a href="#/products/loans">{t('Loans')}</a>
          <a href="#/rates">{t('Interest rates')}</a>
          <a href="#/fees">{t('Fees and charges')}</a>
        </nav>
        <nav aria-label={t('Banking for everyone')}>
          <h2>{t('Banking for everyone')}</h2>
          <a href="#/for/seniors">{t('Senior citizens')}</a>
          <a href="#/for/women">{t('Women')}</a>
          <a href="#/for/students">{t('Students')}</a>
          <a href="#/for/nri">{t('NRI banking')}</a>
          <a href="#/for/kisan">{t('Kisan (farmers)')}</a>
          <a href="#/for/business">{t('Small business')}</a>
        </nav>
        <nav aria-label={t('Help')}>
          <h2>{t('Help')}</h2>
          <a href="#/track">{t('Track application')}</a>
          <a href="#/help">{t('Help and grievances')}</a>
          <a href="#/faqs">{t('FAQs')}</a>
          <a href="#/learn">{t('Safe banking guide')}</a>
          <a href="#/calculators">{t('Calculators')}</a>
          <a href="#/" onClick={e => { e.preventDefault(); onAsk(t('I need help with my banking.')); }}>{t('Ask Mitra')}</a>
        </nav>
      </div>
      <div className="k-regulatory">
        <div>
          <strong><Icon name="shield" /> {t('Demo environment')}</strong>
          <p>{t('Kosh is a demonstration bank built to showcase Mitra and Kavach. It is not a licensed bank, holds no real deposits and is not insured by DICGC. Never enter real OTPs, PINs or card details.')}</p>
        </div>
        <div>
          <strong><Icon name="building" /> {t('Regulated banking')}</strong>
          <p>{t('Indian banks are regulated by the Reserve Bank of India. Unresolved complaints can go to the RBI Integrated Ombudsman at cms.rbi.org.in.')}</p>
        </div>
        <div>
          <strong><Icon name="phone" /> {t('Report cyber fraud')}</strong>
          <p>{t('Call 1930 or visit cybercrime.gov.in. Never share OTP, PIN, CVV or passwords.')}</p>
        </div>
      </div>
      <div className="k-footer-base">
        <span>© {new Date().getFullYear()} Kosh · {t('A product demo, not a bank')}</span>
        <span>{t('Bharosa, har kadam.')}</span>
      </div>
      {/* The Kosh seal in the bottom-left corner, opposite Ask Mitra; on Home the golden thread ties off around it. */}
      <a href="#/" className="k-footer-seal" aria-label={t('Kosh home')}><KoshLogo size={44} tone="light" /></a>
    </footer>
  );
};

