import React, { useState } from 'react';
import type { Product, ProductCategory } from '../../types/products';
import { ProductCard } from './ProductCard';
import { InstantOnboardingModal } from './InstantOnboardingModal';
import { useChat } from '../../context/ChatContext';
import { useI18n } from '../../i18n';
import { ActiveIndicator, AnimatePresence, DUR, Stagger } from '../common/Animate';

interface ProductsCatalogViewProps {
  products: Product[];
  categories: ProductCategory[];
  loading: boolean;
  category: string;
  onCategory: (id: string) => void;
}

export const ProductsCatalogView: React.FC<ProductsCatalogViewProps> = ({ products, categories, loading, category, onCategory }) => {
  const { t } = useI18n();
  const { setIsOpen, sendMessage } = useChat();
  const [selected, setSelected] = useState<Product | null>(null);
  const visible = category === 'all' ? products : products.filter(p => p.category === category);
  const chips = categories.some(c => c.id === 'all') ? categories : [{ id: 'all', label: 'All Products' }, ...categories];

  const handleAskAI = (p: Product) => {
    setIsOpen(true);
    sendMessage(t('Tell me about {product}, including important terms and tradeoffs, and help me decide whether it matches my needs.', { product: p.title }));
  };

  return (
    <div>
      <div className="k-cat-chips" role="group" aria-label={t('Product categories')}>
        {chips.map(c => (
          <button key={c.id} type="button" aria-pressed={category === c.id} className={category === c.id ? 'active' : ''} onClick={() => onCategory(c.id)}>
            {category === c.id && <ActiveIndicator id="product-category" />}
            {t(c.label)}
          </button>
        ))}
      </div>
      <p role="status" className="k-cat-count">
        {loading ? t('Loading products…') : visible.length === 1
          ? t('1 product. Illustrative rates, eligibility applies.')
          : t('{n} products. Illustrative rates, eligibility applies.', { n: visible.length })}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <Stagger key={loading ? 'loading' : category} className="k-product-grid" exit={{ opacity: 0, transition: { duration: DUR.fast } }}>
          {loading
            ? [0, 1, 2].map(i => <div key={i} className="k-skeleton" aria-hidden="true" />)
            : visible.map(p => <ProductCard key={p.id} product={p} onApply={setSelected} onAskAI={handleAskAI} />)}
        </Stagger>
      </AnimatePresence>

      <InstantOnboardingModal key={selected?.id} isOpen={!!selected} onClose={() => setSelected(null)} product={selected} />
    </div>
  );
};
