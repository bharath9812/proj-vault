import React from 'react';
import { ProductCatalogClient } from '@/components/library/ProductCatalogClient';

export const metadata = {
  title: 'Engineering Templates & Catalog | Velocis EKMS',
  description: 'Standardized engineering templates and hardware specifications.',
};

export default function TemplatesPage() {
  return <ProductCatalogClient />;
}
