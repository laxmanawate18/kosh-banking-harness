import React from 'react';
import { ProductsCatalogView } from '../auth/ProductsCatalogView';
import { Leaflet } from './Story';
import { PageHero } from './SiteChrome';
import { useI18n } from '../../i18n';
import type { Product, ProductCategory } from '../../types/products';

interface ProductsPageProps {
  products: Product[];
  categories: ProductCategory[];
  loading: boolean;
  category: string;
  onCategory: (c: string) => void;
}

const HEAD: Record<string, [string, string]> = {
  all: ['All products', 'Compare every Kosh account, card, deposit and loan in one place.'],
  savings: ['Savings accounts', 'Zero-balance accounts you can open in minutes, with interest on every rupee.'],
  cards: ['Credit cards', 'Clear fees, instant card controls and rewards you can actually use.'],
  deposits: ['Fixed deposits', 'Lock in a fixed rate for a fixed term. Senior citizens earn 0.50% more.'],
  loans: ['Home and personal loans', 'Transparent rates and an EMI you can plan before you apply.'],
  wealth: ['Investments', 'Demat and portfolio tools linked to your Kosh account.'],
};

/** The full catalogue moved off the home page: compare every account, card, deposit and loan here. */
export const ProductsPage: React.FC<ProductsPageProps> = props => {
  const { t } = useI18n();
  const [title, intro] = HEAD[props.category] || HEAD.all;
  return (
    <>
      <PageHero title={t(title)} intro={t(intro)} trail={props.category === 'all' ? [] : [['All products', '#/products']]} />
      <section id="products" className="k-section">
        <ProductsCatalogView {...props} />
      </section>
      <Leaflet />
    </>
  );
};
