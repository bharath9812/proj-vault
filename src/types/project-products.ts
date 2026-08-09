import { Product } from './catalog';

export interface ProjectProduct {
  id: string;
  project_id: string;
  product_id: string;
  quantity: number;
  system_role?: string | null;
  location_tag?: string | null;
  notes?: string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  product?: Product;
}

export interface StagedProductItem {
  product: Product;
  quantity: number;
  system_role: string;
  location_tag: string;
  notes: string;
}
