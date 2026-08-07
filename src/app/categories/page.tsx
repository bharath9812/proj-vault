import React from 'react';
import { ProductCatalogClient } from '@/components/library/ProductCatalogClient';

export const metadata = {
  title: 'Engineering Categories & Disciplines | Velocis EKMS',
  description: 'Enterprise discipline categories, hardware portfolios, and technical specifications.',
};

export default function CategoriesPage() {
  return <ProductCatalogClient />;
}
