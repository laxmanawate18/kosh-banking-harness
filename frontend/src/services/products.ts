import { get, post } from './api';
import type { Product, ProductCategory, ProductApplyPayload, ProductApplyResponse } from '../types/products';

export async function fetchProducts(category?: string): Promise<{ products: Product[]; categories: ProductCategory[]; total_count: number }> {
  const qs = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
  return get(`/api/products${qs}`);
}

export async function applyForProduct(payload: ProductApplyPayload): Promise<ProductApplyResponse> {
  return post('/api/products/apply', payload);
}

