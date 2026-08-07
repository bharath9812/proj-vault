export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  website_url?: string | null;
  description?: string | null;
  country?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  description?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductFamily {
  id: string;
  brand_id: string;
  category_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductSpecItem {
  label: string;
  value: string;
}

export interface ProductSpecGroup {
  group: string;
  items: ProductSpecItem[];
}

export interface ProductFeature {
  title: string;
  description: string;
  icon?: string;
}

export interface ProductCertification {
  name: string;
  badge_color?: string;
  icon?: string;
}

export type ProductMediaType =
  | 'image'
  | 'pdf_datasheet'
  | 'drawio_svg'
  | 'manual'
  | 'video'
  | 'cad'
  | 'firmware';

export interface ProductMedia {
  id: string;
  product_id: string;
  type: ProductMediaType;
  title: string;
  url: string;
  thumbnail_url?: string | null;
  sort_order: number;
  is_featured: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface Product {
  id: string;
  brand_id: string;
  category_id: string;
  family_id?: string | null;
  model_name: string;
  slug: string;
  sku_part_number?: string | null;
  tagline?: string | null;
  room_size?: string | null;
  seating_capacity?: string | null;
  status: 'Active' | 'Discontinued' | 'Upcoming';
  hero_image_url?: string | null;
  is_featured: boolean;
  sort_order: number;
  specifications: ProductSpecGroup[];
  features: ProductFeature[];
  certifications: ProductCertification[];
  created_at?: string;
  updated_at?: string;
  // Joins
  brand?: Brand;
  category?: ProductCategory;
  family?: ProductFamily;
  media?: ProductMedia[];
}
