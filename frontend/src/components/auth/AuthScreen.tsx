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
import { useSmoothScroll } from '../site/Lux';
import { CalculatorsPage } from '../site/Calculators';
import { TrackApplicationPage } from '../site/TrackApplication';
import { RatesPage, FeesPage, HelpPage, FaqsPage, SegmentsPage, LearnPage, NotFound } from '../site/InfoPages';
import type { Product, ProductCategory } from '../../types/products';

export const AuthScreen: React.FC = () => {
  useSmoothScroll();
  const { t } = useI18n();
  const { publicConfig } = useAuth();
  const { setIsOpen, sendMessage } = useChat();
  const route = useHashRoute();
  const loginRef = useRef<HTMLDialogElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    fetchProducts('all')
      .then(d => { setProducts(d.products || []); setCategories(d.categories || []); })
      .catch(err => console.error('Error loading products:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (route[0] === 'products') setCategory(route[1] || 'all');
    window.scrollTo({ top: 0 });
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
      case 'track': return <TrackApplicationPage reference={route[1]} onAsk={askMitra} />;
      default: return <NotFound />;
    }
  })();

  return (
    <div className={`k-site ${route[0] ? '' : 'is-lux'}`}>
      <UtilityBar />
      <SiteHeader route={route} onLogin={openLogin} />
      <main id="main" tabIndex={-1} key={route[0] || 'home'} className="k-page-enter" style={{ outline: 'none' }}>{page}</main>
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
          </div>
        </div>
      </dialog>
    </div>
  );
};
