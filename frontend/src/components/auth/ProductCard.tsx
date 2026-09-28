import React from 'react';
import type { Product } from '../../types/products';
import { Icon } from '../common/Icon';
import { FeatureIcon, type FeatureIconName } from '../common/FeatureIcon';
import { useI18n } from '../../i18n';

interface ProductCardProps {
  product: Product;
  onApply: (product: Product) => void;
  onAskAI: (product: Product) => void;
}

const ICON: Record<string, FeatureIconName> = { savings: 'savings', cards: 'cards', deposits: 'deposits', loans: 'loans', wealth: 'rates' };

export const ProductCard: React.FC<ProductCardProps> = ({ product, onApply, onAskAI }) => {
  const { t } = useI18n();
  const perks = [product.min_balance, product.joining_fee, product.tenure_range, product.welcome_bonus].filter(Boolean) as string[];
  const cmp = product.competitor_comparison;
  return (
    <article className={`k-product reveal fi-host ${product.featured ? 'featured' : ''}`}>
      <header>
        <FeatureIcon name={ICON[product.category] || 'rewards'} size={48} />
        <div>
          <span className="k-product-cat">{t(product.category_label)}</span>
          <h3>{product.title}</h3>
        </div>
        {product.badge && <span className={`k-pill ${product.featured ? 'warn' : 'brand'}`}>{product.badge}</span>}
      </header>

      <p className="k-product-tag">{product.tagline}</p>

      <div className="k-product-rate">
        <strong>{product.headline_rate}</strong>
        <span>{t('Rate or benefit')}</span>
      </div>

      {perks.length > 0 && <div className="k-product-perks">{perks.map(p => <span key={p} className="k-pill">{p}</span>)}</div>}

      <ul className="k-product-features">
        {product.features.map((f, i) => <li key={i}><Icon name="check" />{f}</li>)}
      </ul>

      {cmp?.kosh && (
        <details className="k-product-compare">
          <summary><Icon name="chevron-right" /> {t('How Kosh compares')}</summary>
          <div><b>Kosh</b> {cmp.kosh}</div>
          {cmp.hdfc && <div><b>HDFC</b> {cmp.hdfc}</div>}
          {cmp.sbi && <div><b>SBI</b> {cmp.sbi}</div>}
        </details>
      )}

      {product.fact_metadata && (
        <p className="k-product-fine">{t('Reviewed {date}.', { date: product.fact_metadata.last_reviewed_at })} {product.disclosure}</p>
      )}

      <footer>
        <button type="button" className="k-btn primary" onClick={() => onApply(product)}>{t('Apply now')}</button>
        <button type="button" className="k-btn outline" onClick={() => onAskAI(product)}>{t('Ask Mitra')}</button>
      </footer>
    </article>
  );
};
