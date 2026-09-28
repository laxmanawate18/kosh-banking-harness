import React from 'react';
import { ProductsCatalogView } from '../auth/ProductsCatalogView';
import { Leaflet } from './Story';
import type { Product, ProductCategory } from '../../types/products';

interface ProductsPageProps {
  products: Product[];
  categories: ProductCategory[];
  loading: boolean;
  category: string;
  onCategory: (c: string) => void;
}

/** The full catalogue moved off the home page: compare every account, card, deposit and loan here. */
export const ProductsPage: React.FC<ProductsPageProps> = props => (
  <>
    <section id="products" className="k-section">
      <ProductsCatalogView {...props} />
    </section>
    <Leaflet />
  </>
);
