import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LotusMark, Rangoli } from '../common/KoshLogo';
import { Icon } from '../common/Icon';
import { fetchProducts } from '../../services/products';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { UtilityBar, SiteHeader, SiteFooter, useHashRoute } from '../site/SiteChrome';
import { HomePage } from '../site/HomePage';
import { ProductsPage } from '../site/ProductsPage';
import { CalculatorsPage } from '../site/Calculators';
import { TrackApplicationPage } from '../site/TrackApplication';
import { RatesPage, FeesPage, HelpPage, FaqsPage, SegmentsPage, LearnPage, NotFound } from '../site/InfoPages';
import type { Product, ProductCategory } from '../../types/products';
import { motion, pageMotion } from '../common/Animate';
import { useMotionValueEvent, useScroll } from 'framer-motion';
import { ScrollProgress } from '../site/Story';

/** Long pages you read top to bottom get the reading-progress bar ('' is Home). */
const READING = ['', 'rates', 'fees', 'help', 'faqs', 'for', 'learn'];

export const AuthScreen: React.FC = () => {
  const { t } = useI18n();
  const { publicConfig } = useAuth();
  const { setIsOpen, sendMessage } = useChat();
  const route = useHashRoute();
  const loginRef = useRef<HTMLDialogElement>(null);
  const siteRef = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  // Each page names itself in the browser tab and to screen readers: the page's own heading, once it has rendered.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const heading = (document.querySelector('main h1, h1') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim();
      document.title = heading ? `${heading} | Kosh, a product demo` : 'Kosh, a product demo | not a real bank';
    }, 400);
    return () => window.clearTimeout(id);
  }, [route.join('/')]);

  useEffect(() => {
    fetchProducts('all')
      .then(d => { setProducts(d.products || []); setCategories(d.categories || []); })
      .catch(err => console.error('Error loading products:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (route[0] === 'products') setCategory(route[1] || 'all');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [route.join('/')]);

  const openLogin = useCallback(() => {
    const dialog = loginRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const handler = () => openLogin();
    window.addEventListener('open-login-modal', handler);
    return () => window.removeEventListener('open-login-modal', handler);
  }, [openLogin]);

  // Ask Mitra (App.tsx renders it next to .k-site) folds to its lotus while the visitor reads down past 200px and
  // unfolds on the way back up; site.css keys off data-fab. A motion value, so scrolling never re-renders the page.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', y => {
    const el = siteRef.current, d = y - (scrollY.getPrevious() ?? 0);
    if (!el || (y > 200 && Math.abs(d) < 6)) return;
    const fab = y > 200 && d > 0 ? 'mini' : 'full';
    if (el.dataset.fab !== fab) el.dataset.fab = fab;
  });

  const continueSecurely = () => {
    const start = publicConfig?.oauth_start_url || '/api/auth/start';
    window.location.assign(`${start}?return_to=/`);
  };

  const askMitra = (prompt: string) => {
    setIsOpen(true);
    sendMessage(prompt);
  };

  const page = (() => {
    switch (route[0]) {
      case undefined: return <HomePage onLogin={openLogin} onAsk={askMitra} />;
      case 'products': return <ProductsPage products={products} categories={categories} loading={loading} category={category} onCategory={setCategory} />;
      case 'rates': return <RatesPage products={products} />;
      case 'fees': return <FeesPage />;
      case 'help': return <HelpPage onAsk={askMitra} />;
      case 'faqs': return <FaqsPage onAsk={askMitra} />;
      case 'for': return <SegmentsPage id={route[1]} onAsk={askMitra} />;
      case 'learn': return <LearnPage />;
      case 'calculators': return <CalculatorsPage tab={route[1]} onAsk={askMitra} />;
      case 'track': return <TrackApplicationPage reference={route[1]} onAsk={askMitra} onLogin={openLogin} />;
      default: return <NotFound />;
    }
  })();

  return (
    <div ref={siteRef} className={`k-site ${route[0] ? '' : 'is-lux'}`}>
      {READING.includes(route[0] ?? '') && <ScrollProgress />}
      <UtilityBar />
      <SiteHeader route={route} onLogin={openLogin} />
      <motion.main id="main" tabIndex={-1} key={route[0] || 'home'} style={{ outline: 'none' }} {...pageMotion}>{page}</motion.main>
      <SiteFooter onAsk={askMitra} />

      <dialog ref={loginRef} className="k-login" aria-labelledby="login-title"
        onClick={e => { if (e.target === e.currentTarget) loginRef.current?.close(); }}>
        <div className="k-login-art">
          <Rangoli className="k-art-motif" />
          <LotusMark size={64} className="k-lotus-lg" />
          <strong id="login-title">{t('Login to Kosh')}</strong>
          <span>{t('Bharosa, har kadam.')}</span>
          <ul>
            <li><Icon name="security" /> {t('Sentinel checks every payment')}</li>
            <li><Icon name="lock" /> {t('Your session ends after 10 minutes idle')}</li>
            <li><Icon name="alert" /> {t('Kosh never asks for OTP on call')}</li>
          </ul>
        </div>
        <div className="k-login-body">
          <button type="button" className="k-close" aria-label={t('Close')} onClick={() => loginRef.current?.close()}><Icon name="close" /></button>
          <div className="k-login-form">
            <div className="k-eyebrow">Secure sign-in</div>
            <h2>Welcome back</h2>
            <p>Continue to Kosh’s protected identity service to sign in.</p>
            <button type="button" className="k-btn primary wide" onClick={continueSecurely}>
              Continue securely <span aria-hidden="true">→</span>
            </button>
            <p className="k-hint" style={{ marginTop: 14, fontSize: '12px', color: '#9c9ea6', lineHeight: 1.5 }}>
              Demo sign-in: Customer (Mobile OTP: <code>246810</code>), Bank Officer (<code>Officer@2468</code>), and Admin AI (<code>Admin@2468</code>).
            </p>
          </div>
        </div>
      </dialog>
    </div>
  );
};
