import React from 'react';
import { ProductCatalogClient } from '@/components/library/ProductCatalogClient';

export const metadata = {
  title: 'Hardware Catalog & Engineering Library | Velocis EKMS',
  description: 'Enterprise multi-brand hardware catalog, video conferencing systems, PTZ cameras, seating capacity matrix, and technical specifications.',
};

export default function EngineeringLibraryPage() {
  return <ProductCatalogClient />;
}
