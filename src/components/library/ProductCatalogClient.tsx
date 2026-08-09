'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Brand, ProductCategory, ProductFamily, Product } from '@/types/catalog';
import { ProductDetailsModal } from './ProductDetailsModal';
import { AddProductModal } from './AddProductModal';
import { ManageTaxonomyModal } from './ManageTaxonomyModal';
import { TopHeader } from '@/components/layout/TopHeader';

// ============================================================================
// Enterprise 2-Tier Caching Architecture for Hardware Catalog & Library
// Tier 1: In-Memory RAM Cache (Instant sub-millisecond route switching: 0ms)
// Tier 2: Session Storage Cache (Persistent across tab reloads: 1-5ms)
// SWR: Stale-While-Revalidate background syncing
// ============================================================================

interface CatalogCachePayload {
  brands: Brand[];
  categories: ProductCategory[];
  families: ProductFamily[];
  products: Product[];
  customTaxonomyOptions: { id: string; type: string; value: string }[];
  timestamp: number;
}

const CATALOG_CACHE_KEY = 'ekms_library_catalog_cache_v2';
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 Minutes TTL
const CATALOG_STALE_TTL_MS = 3 * 60 * 1000; // 3 Minutes Revalidation threshold

let MEMORY_CATALOG_CACHE: CatalogCachePayload | null = null;

export function invalidateLibraryCache() {
  MEMORY_CATALOG_CACHE = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CATALOG_CACHE_KEY);
    } catch {
      // Ignore
    }
  }
}

export function ProductCatalogClient() {
  const [loading, setLoading] = useState(true);
  const [isCachedLoad, setIsCachedLoad] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customTaxonomyOptions, setCustomTaxonomyOptions] = useState<
    { id: string; type: string; value: string }[]
  >([]);

  // Filters State
  const [selectedBrandSlug, setSelectedBrandSlug] = useState<string>('all');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [selectedFamilySlug, setSelectedFamilySlug] = useState<string>('all');
  const [selectedCapacity, setSelectedCapacity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'brands'>('grid');

  // Modals
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isManageTaxonomyOpen, setIsManageTaxonomyOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const applyCacheData = (cached: CatalogCachePayload) => {
    setBrands(cached.brands || []);
    setCategories(cached.categories || []);
    setFamilies(cached.families || []);
    setProducts(cached.products || []);
    setCustomTaxonomyOptions(cached.customTaxonomyOptions || []);
    setLastSyncTime(new Date(cached.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIsCachedLoad(true);
    setLoading(false);
  };

  const fetchFreshData = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
    } else {
      setIsRevalidating(true);
    }

    try {
      const supabase = createClient();

      const [brandsRes, catRes, famRes, prodRes, customOptRes] = await Promise.all([
        supabase.from('brands').select('*').order('sort_order', { ascending: true }),
        supabase.from('product_categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('product_families').select('*').order('sort_order', { ascending: true }),
        supabase
          .from('products')
          .select(`
            *,
            brand:brands(*),
            category:product_categories(*),
            family:product_families(*),
            media:product_media(*)
          `)
          .order('sort_order', { ascending: true }),
        supabase.from('custom_taxonomy_options').select('*').order('created_at', { ascending: true }),
      ]);

      const freshPayload: CatalogCachePayload = {
        brands: brandsRes.data || [],
        categories: catRes.data || [],
        families: famRes.data || [],
        products: prodRes.data || [],
        customTaxonomyOptions: customOptRes.data || [],
        timestamp: Date.now(),
      };

      // Write to Tier 1 RAM Cache
      MEMORY_CATALOG_CACHE = freshPayload;

      // Write to Tier 2 SessionStorage Cache
      try {
        sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(freshPayload));
      } catch (e) {
        console.warn('SessionStorage quota exceeded for catalog cache:', e);
      }

      setBrands(freshPayload.brands);
      setCategories(freshPayload.categories);
      setFamilies(freshPayload.families);
      setProducts(freshPayload.products);
      setCustomTaxonomyOptions(freshPayload.customTaxonomyOptions);
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsCachedLoad(false);
    } catch (err) {
      console.error('Error loading hardware catalog data:', err);
    } finally {
      setLoading(false);
      setIsRevalidating(false);
    }
  }, []);

  const loadData = useCallback(async (forceBypassCache = false) => {
    if (forceBypassCache) {
      invalidateLibraryCache();
      await fetchFreshData(false);
      return;
    }

    // 1. Check Tier 1 (In-Memory RAM Cache)
    if (MEMORY_CATALOG_CACHE) {
      applyCacheData(MEMORY_CATALOG_CACHE);
      const age = Date.now() - MEMORY_CATALOG_CACHE.timestamp;
      if (age > CATALOG_STALE_TTL_MS) {
        // Silently revalidate in the background
        fetchFreshData(true);
      }
      return;
    }

    // 2. Check Tier 2 (SessionStorage Cache)
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(CATALOG_CACHE_KEY);
        if (raw) {
          const parsed: CatalogCachePayload = JSON.parse(raw);
          const age = Date.now() - parsed.timestamp;
          if (age < CATALOG_CACHE_TTL_MS && parsed.products && parsed.products.length >= 0) {
            MEMORY_CATALOG_CACHE = parsed;
            applyCacheData(parsed);
            if (age > CATALOG_STALE_TTL_MS) {
              fetchFreshData(true);
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to parse catalog session cache:', e);
      }
    }

    // 3. Cache Miss (Cold Load) -> Fetch directly
    await fetchFreshData(false);
  }, [fetchFreshData]);

  useEffect(() => {
    loadData();
    fetchFreshData(true);
    
    // 1. Listen for local catalog mutation events from Add/Edit/Delete modals
    const handleLocalUpdate = () => loadData(true);
    window.addEventListener('product_catalog_updated', handleLocalUpdate);

    // 2. Multi-Tab Synchronization via BroadcastChannel
    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel('ekms_library_sync_channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'CATALOG_MUTATION') {
          invalidateLibraryCache();
          fetchFreshData(true);
        }
      };
    }

    // 3. Tab Visibility & Focus Revalidation:
    // If user switches back to this tab after another user modified data, silently check
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const lastTime = MEMORY_CATALOG_CACHE?.timestamp || 0;
        // If older than 45 seconds, revalidate quietly
        if (Date.now() - lastTime > 45 * 1000) {
          fetchFreshData(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 4. Supabase Realtime WebSocket Subscription for Multi-User Live Collaboration
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel('ekms-library-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          invalidateLibraryCache();
          fetchFreshData(true);
          showToast('Hardware catalog updated in real-time by engineering team.');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brands' },
        () => {
          invalidateLibraryCache();
          fetchFreshData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_categories' },
        () => {
          invalidateLibraryCache();
          fetchFreshData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_families' },
        () => {
          invalidateLibraryCache();
          fetchFreshData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'custom_taxonomy_options' },
        () => {
          invalidateLibraryCache();
          fetchFreshData(true);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('product_catalog_updated', handleLocalUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
      try {
        supabase.removeChannel(realtimeChannel);
      } catch {
        // Ignore fallback client disconnect
      }
    };
  }, [loadData, fetchFreshData]);

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}" from the hardware catalog?`)) {
      return;
    }

    try {
      const supabase = createClient();

      // 1. Clean up associated binary files from Supabase Storage product-media bucket
      const prod = products.find((p) => p.id === id);
      if (prod && prod.media && prod.media.length > 0) {
        const storagePathsToDelete: string[] = [];
        for (const m of prod.media) {
          if (m.url && m.url.includes('/product-media/')) {
            const parts = m.url.split('/product-media/');
            if (parts[1]) {
              storagePathsToDelete.push(decodeURIComponent(parts[1].split('?')[0]));
            }
          }
        }
        if (storagePathsToDelete.length > 0) {
          try {
            await supabase.storage.from('product-media').remove(storagePathsToDelete);
          } catch (storageErr) {
            console.warn('Storage cleanup warning:', storageErr);
          }
        }
      }

      // 2. Cascade delete database records
      await supabase.from('product_media').delete().eq('product_id', id);
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;

      invalidateLibraryCache();
      showToast(`Product "${name}" was deleted successfully.`);
      if (selectedProductForModal?.id === id) {
        setSelectedProductForModal(null);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('product_catalog_updated'));
      }
      loadData(true);
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Failed to delete product: ' + err.message);
    }
  };

  // Dynamic room size & seating capacity options merged from products & custom_taxonomy_options
  const allCapacityAndRoomSizeOptions = React.useMemo(() => {
    const set = new Set<string>();
    (products || []).forEach((p) => {
      if (p.seating_capacity && p.seating_capacity.trim()) set.add(p.seating_capacity.trim());
      if (p.room_size && p.room_size.trim()) set.add(p.room_size.trim());
    });
    (customTaxonomyOptions || []).forEach((opt) => {
      if (opt.value && opt.value.trim()) set.add(opt.value.trim());
    });
    return Array.from(set);
  }, [products, customTaxonomyOptions]);

  // Filter logic
  const filteredProducts = products.filter((p) => {
    // Brand filter
    if (selectedBrandSlug !== 'all') {
      if (p.brand?.slug !== selectedBrandSlug) return false;
    }

    // Category filter
    if (selectedCategorySlug !== 'all') {
      if (p.category?.slug !== selectedCategorySlug) return false;
    }

    // Family filter
    if (selectedFamilySlug !== 'all') {
      if (p.family?.slug !== selectedFamilySlug) return false;
    }

    // Capacity / Room Size filter
    if (selectedCapacity !== 'all') {
      const q = selectedCapacity.toLowerCase();
      const matchSeat = p.seating_capacity?.toLowerCase().includes(q);
      const matchRoom = p.room_size?.toLowerCase().includes(q);
      if (!matchSeat && !matchRoom) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.model_name?.toLowerCase().includes(q);
      const matchSku = p.sku_part_number?.toLowerCase().includes(q);
      const matchBrand = p.brand?.name?.toLowerCase().includes(q);
      const matchTagline = p.tagline?.toLowerCase().includes(q);
      const matchSpecs = JSON.stringify(p.specifications || {}).toLowerCase().includes(q);
      const matchCerts = (p.certifications || []).some((c) =>
        c.name.toLowerCase().includes(q)
      );

      if (!matchName && !matchSku && !matchBrand && !matchTagline && !matchSpecs && !matchCerts) {
        return false;
      }
    }

    return true;
  });

  const availableFamilies = families.filter((f) => {
    if (selectedBrandSlug === 'all') return true;
    const currentBrand = brands.find((b) => b.slug === selectedBrandSlug);
    return currentBrand ? f.brand_id === currentBrand.id : true;
  });

  const handleCopyQuickSpecs = (p: Product) => {
    let text = `${p.brand?.name || ''} ${p.model_name} (SKU: ${p.sku_part_number || 'N/A'})\n`;
    text += `Target Capacity: ${p.seating_capacity || 'N/A'} • ${p.room_size || ''}\n`;
    (p.specifications || []).slice(0, 2).forEach((g) => {
      text += `\n[${g.group}]\n`;
      (g.items || []).slice(0, 3).forEach((it) => {
        text += `• ${it.label}: ${it.value}\n`;
      });
    });
    navigator.clipboard.writeText(text);
    showToast(`Quick specifications copied for ${p.model_name}!`);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader onSearch={setSearchQuery} />

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1600px] w-full mx-auto select-none">
        
        {/* Top Title & Action Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[#c5c6ce] pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#005FB7] uppercase tracking-wider bg-[#d6e3ff] px-2 py-0.5 rounded">
                Hardware PIM & Spec Repository
              </span>
              <span className="text-xs font-mono text-[#75777e]">
                {products.length} Models Indexed • {brands.length} Certified Brands
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0 flex items-center gap-1 border shadow-2xs transition-colors ${
                  isCachedLoad
                    ? 'bg-[#e2f0d9] text-[#1e4620] border-[#b5d5a7]'
                    : isRevalidating
                    ? 'bg-[#fff0c2] text-[#593d00] border-[#ffe082]'
                    : 'bg-[#d6e3ff] text-[#001b3c] border-[#9ec2ff]'
                }`}
                title={
                  isCachedLoad
                    ? `Loaded instantly from Local Client Cache (0 DB Calls).\nLast synced: ${lastSyncTime || 'Recently'}`
                    : 'Synced live with Supabase PostgreSQL.'
                }
              >
                <span className={`material-symbols-outlined text-[13px] ${isRevalidating ? 'animate-spin' : ''}`}>
                  {isCachedLoad ? 'bolt' : isRevalidating ? 'sync' : 'database'}
                </span>
                <span>
                  {isCachedLoad ? 'Instant Cache (0 DB Calls)' : isRevalidating ? 'Background Syncing...' : 'Live DB Synced'}
                </span>
                {lastSyncTime && <span className="opacity-75">• {lastSyncTime}</span>}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-[#05162e] mt-1">
              Engineering Hardware Library & Multi-Brand Catalog
            </h1>
            <p className="text-xs text-[#44474d] mt-1">
              Standardized video conferencing systems, PTZ cameras, beamforming microphones, touch consoles, and wiring topologies.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* View Mode Toggle */}
            <div className="bg-[#e6e8eb] p-0.5 rounded flex items-center border border-[#c5c6ce]">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#05162e] shadow-xs'
                    : 'text-[#44474d] hover:text-[#05162e]'
                }`}
                title="Grid Cards View"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-[#05162e] shadow-xs'
                    : 'text-[#44474d] hover:text-[#05162e]'
                }`}
                title="High-Density Specs Table"
              >
                <span className="material-symbols-outlined text-[16px]">table_rows</span>
                Specs Table
              </button>
              <button
                onClick={() => setViewMode('brands')}
                className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'brands'
                    ? 'bg-white text-[#05162e] shadow-xs'
                    : 'text-[#44474d] hover:text-[#05162e]'
                }`}
                title="Brand Portfolios"
              >
                <span className="material-symbols-outlined text-[16px]">domain</span>
                Brands ({brands.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => loadData(true)}
                disabled={loading || isRevalidating}
                className="p-2 bg-white border border-[#c5c6ce] hover:border-[#005FB7] hover:bg-[#f7f9fc] text-[#44474d] hover:text-[#005FB7] rounded text-xs font-bold transition-all shadow-2xs disabled:opacity-50"
                title="Force refresh hardware catalog from Supabase Database"
              >
                <span className={`material-symbols-outlined text-[18px] ${loading || isRevalidating ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>

              <button
                onClick={() => setIsManageTaxonomyOpen(true)}
                className="px-3.5 py-2 bg-white border border-[#c5c6ce] hover:border-[#005FB7] text-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
                title="Edit or delete brands, categories, families, and sizing parameters"
              >
                <span className="material-symbols-outlined text-[18px] text-[#005FB7]">tune</span>
                <span>Manage Taxonomy</span>
              </button>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsAddModalOpen(true);
                }}
                className="px-4 py-2 bg-[#005FB7] hover:bg-[#05162e] text-white rounded text-xs font-bold transition-colors flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>Add Product</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toast Banner */}
        {toastMessage && (
          <div className="bg-[#e2f0d9] border border-[#b5d5a7] text-[#1e4620] px-4 py-2 rounded text-xs font-medium flex items-center justify-between shadow-xs animate-in fade-in">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {toastMessage}
            </span>
            <button onClick={() => setToastMessage(null)} className="text-[#1e4620] hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Brand Selector Bar (Pill Tabs with Logos) */}
        <div className="bg-white border border-[#c5c6ce] rounded-lg p-3 shadow-2xs flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[#e6e8eb] pb-2">
            <span className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#005FB7]">branding_watermark</span>
              Select Hardware Brand
            </span>
            <span className="text-[11px] font-mono text-[#75777e]">
              Showing {filteredProducts.length} of {products.length} Products
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => {
                setSelectedBrandSlug('all');
                setSelectedFamilySlug('all');
              }}
              className={`px-3.5 py-1.5 rounded text-xs font-bold transition-all shrink-0 flex items-center gap-2 border ${
                selectedBrandSlug === 'all'
                  ? 'bg-[#05162e] text-white border-[#05162e] shadow-2xs'
                  : 'bg-[#f7f9fc] text-[#44474d] border-[#c5c6ce] hover:bg-[#e6e8eb]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">apps</span>
              <span>All Brands</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedBrandSlug === 'all' ? 'bg-white/20 text-white' : 'bg-[#e6e8eb] text-[#05162e]'}`}>
                {products.length}
              </span>
            </button>

            {brands.map((b) => {
              const count = products.filter((p) => p.brand?.id === b.id).length;
              const isSelected = selectedBrandSlug === b.slug;

              return (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBrandSlug(b.slug);
                    setSelectedFamilySlug('all');
                  }}
                  className={`px-3.5 py-1.5 rounded text-xs font-bold transition-all shrink-0 flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-[#005FB7] text-white border-[#005FB7] shadow-2xs'
                      : 'bg-[#f7f9fc] text-[#05162e] border-[#c5c6ce] hover:bg-white hover:border-[#005FB7]'
                  }`}
                >
                  <span className="w-5 h-5 rounded bg-white/20 flex items-center justify-center text-[10px] font-mono font-bold">
                    {b.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>{b.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-[#e6e8eb] text-[#05162e]'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Filter Bar: Categories, Seating Capacities & Product Families */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-white border border-[#c5c6ce] rounded-xl p-3.5 shadow-2xs">
          
          {/* Discipline Category Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#45474c] uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#005FB7]">category</span>
              Discipline Category
            </label>
            <div className="relative group">
              <select
                value={selectedCategorySlug}
                onChange={(e) => setSelectedCategorySlug(e.target.value)}
                className={`w-full appearance-none rounded-lg pl-3 pr-8 py-2 text-xs font-semibold cursor-pointer border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#005FB7]/20 ${
                  selectedCategorySlug !== 'all'
                    ? 'bg-[#eff6ff] text-[#005FB7] border-[#005FB7]'
                    : 'bg-[#f7f9fc] text-[#05162e] border-[#c5c6ce] hover:border-[#005FB7] hover:bg-white'
                }`}
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                unfold_more
              </span>
            </div>
          </div>

          {/* Product Family Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#45474c] uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#005FB7]">device_hub</span>
              Product Family Series
            </label>
            <div className="relative group">
              <select
                value={selectedFamilySlug}
                onChange={(e) => setSelectedFamilySlug(e.target.value)}
                className={`w-full appearance-none rounded-lg pl-3 pr-8 py-2 text-xs font-semibold cursor-pointer border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#005FB7]/20 ${
                  selectedFamilySlug !== 'all'
                    ? 'bg-[#eff6ff] text-[#005FB7] border-[#005FB7]'
                    : 'bg-[#f7f9fc] text-[#05162e] border-[#c5c6ce] hover:border-[#005FB7] hover:bg-white'
                }`}
              >
                <option value="all">All Families ({availableFamilies.length})</option>
                {availableFamilies.map((f) => (
                  <option key={f.id} value={f.slug}>{f.name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                unfold_more
              </span>
            </div>
          </div>

          {/* Seating Capacity / Room Size Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-[#45474c] uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#005FB7]">groups</span>
              Seating Capacity / Space
            </label>
            <div className="relative group">
              <select
                value={selectedCapacity}
                onChange={(e) => setSelectedCapacity(e.target.value)}
                className={`w-full appearance-none rounded-lg pl-3 pr-8 py-2 text-xs font-semibold cursor-pointer border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#005FB7]/20 ${
                  selectedCapacity !== 'all'
                    ? 'bg-[#eff6ff] text-[#005FB7] border-[#005FB7]'
                    : 'bg-[#f7f9fc] text-[#05162e] border-[#c5c6ce] hover:border-[#005FB7] hover:bg-white'
                }`}
              >
                <option value="all">All Room Sizes & Capacities ({allCapacityAndRoomSizeOptions.length})</option>
                {allCapacityAndRoomSizeOptions.map((cap) => (
                  <option key={cap} value={cap}>
                    {cap}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                unfold_more
              </span>
            </div>
          </div>

          {/* Search text indicator & quick reset */}
          <div className="flex flex-col justify-end">
            <button
              onClick={() => {
                setSelectedBrandSlug('all');
                setSelectedCategorySlug('all');
                setSelectedFamilySlug('all');
                setSelectedCapacity('all');
                setSearchQuery('');
              }}
              className="w-full py-2 px-3 bg-[#f7f9fc] border border-[#c5c6ce] hover:border-[#ba1a1a] hover:bg-[#fff5f5] hover:text-[#ba1a1a] text-[#45474c] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
              Reset All Filters
            </button>
          </div>
        </div>

        {/* MAIN VIEW: 1. GRID CARDS VIEW */}
        {viewMode === 'grid' && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="bg-white border border-[#c5c6ce] rounded-lg overflow-hidden shadow-2xs animate-pulse flex flex-col justify-between h-[420px]"
                  >
                    <div className="p-4 bg-[#f2f4f7] h-11 border-b border-[#e6e8eb] flex items-center justify-between">
                      <div className="h-3 bg-[#c5c6ce] rounded w-24" />
                      <div className="h-4 bg-[#e2e2e6] rounded w-14" />
                    </div>
                    <div className="aspect-16/9 bg-[#f7f9fc] flex items-center justify-center border-b border-[#e6e8eb]">
                      <span className="material-symbols-outlined text-[32px] text-[#75777e]/40">photo_library</span>
                    </div>
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <div className="h-5 bg-[#e2e2e6] rounded w-3/4" />
                      <div className="h-3 bg-[#eceef1] rounded w-1/2" />
                      <div className="h-12 bg-[#f7f9fc] border border-[#e6e8eb] rounded mt-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white border border-dashed border-[#c5c6ce] rounded-lg p-12 text-center flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-[48px] text-[#75777e]">
                  devices_off
                </span>
                <h3 className="text-sm font-bold text-[#05162e]">No hardware models found matching filters</h3>
                <p className="text-xs text-[#44474d]">
                  Try clearing your brand, room size, or search query filters above.
                </p>
                <button
                  onClick={() => {
                    setSelectedBrandSlug('all');
                    setSelectedCategorySlug('all');
                    setSelectedCapacity('all');
                    setSearchQuery('');
                  }}
                  className="mt-2 px-4 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {filteredProducts.map((p) => {
                  const firstSpecGroup = p.specifications?.[0];
                  const videoSpecs = p.specifications?.find((s) => s.group.toLowerCase().includes('video') || s.group.toLowerCase().includes('camera'));
                  const audioSpecs = p.specifications?.find((s) => s.group.toLowerCase().includes('audio'));

                  return (
                    <div
                      key={p.id}
                      className="bg-white border border-[#c5c6ce] hover:border-[#005FB7] rounded-lg overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {/* Card Header Bar */}
                        <div className="px-4 py-3 bg-[#f2f4f7] border-b border-[#e6e8eb] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#005FB7] uppercase tracking-wider font-mono">
                              {p.brand?.name || 'Brand'}
                            </span>
                            {p.family?.name && (
                              <>
                                <span className="text-[#c5c6ce]">•</span>
                                <span className="text-xs font-semibold text-[#44474d]">
                                  {p.family.name} Series
                                </span>
                              </>
                            )}
                          </div>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              p.status === 'Active'
                                ? 'bg-[#e2f0d9] text-[#1e4620] border border-[#b5d5a7]'
                                : 'bg-[#e6e8eb] text-[#44474d]'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>

                        {/* Image Showcase with Overlay Badge */}
                        <div
                          onClick={() => setSelectedProductForModal(p)}
                          className="relative aspect-16/9 w-full bg-white border-b border-[#e2e8f0] overflow-hidden cursor-pointer flex items-center justify-center group-hover:opacity-95 transition-opacity p-3"
                        >
                          <img
                            src={p.hero_image_url || '/products/logitech-rally-bar.svg'}
                            alt={p.model_name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-300"
                          />

                          {/* Seating Capacity Badge Overlay */}
                          <div className="absolute bottom-2.5 left-2.5 bg-[#05162e]/90 backdrop-blur-xs text-white px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm border border-white/20">
                            <span className="material-symbols-outlined text-[15px] text-[#9ec2ff]">groups</span>
                            <span>{p.seating_capacity || 'Universal'}</span>
                            <span className="text-[#9ec2ff]">•</span>
                            <span className="text-[#e2e2e6]">{p.room_size || 'Room'}</span>
                          </div>

                          {/* Media Assets Count Badge Overlay */}
                          {p.media && p.media.length > 0 && (
                            <div className="absolute top-2.5 right-2.5 bg-[#05162e]/90 backdrop-blur-xs text-white px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1 shadow-sm border border-white/20">
                              <span className="material-symbols-outlined text-[12px] text-[#9ec2ff]">perm_media</span>
                              <span>{p.media.length} {p.media.length === 1 ? 'Asset' : 'Assets'}</span>
                            </div>
                          )}

                          {/* Inspect Overlay Trigger */}
                          <div className="absolute inset-0 bg-[#005FB7]/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-[#05162e]/90 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow-md">
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                              Inspect Specs
                            </span>
                          </div>
                        </div>

                        {/* Product Title & Tagline */}
                        <div className="p-4 flex flex-col gap-3">
                          <div>
                            <h3
                              onClick={() => setSelectedProductForModal(p)}
                              className="text-base font-bold text-[#05162e] hover:text-[#005FB7] cursor-pointer transition-colors"
                            >
                              {p.model_name}
                            </h3>
                            {p.sku_part_number && (
                              <p className="text-[11px] font-mono text-[#75777e] mt-0.5">
                                SKU: {p.sku_part_number}
                              </p>
                            )}
                          </div>

                          {p.tagline && (
                            <p className="text-xs text-[#44474d] leading-relaxed line-clamp-2">
                              {p.tagline}
                            </p>
                          )}

                          {/* Technical Highlights Snippets */}
                          <div className="bg-[#f7f9fc] border border-[#e6e8eb] rounded p-2.5 flex flex-col gap-1.5 text-xs">
                            {videoSpecs?.items?.[0] && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-[#75777e] font-semibold flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-[#005FB7]">videocam</span>
                                  Optics / Video:
                                </span>
                                <span className="font-mono font-medium text-[#05162e] text-right truncate max-w-[180px]">
                                  {videoSpecs.items[0].value}
                                </span>
                              </div>
                            )}
                            {audioSpecs?.items?.[0] && (
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-[#75777e] font-semibold flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-[#005FB7]">mic</span>
                                  Acoustics:
                                </span>
                                <span className="font-mono font-medium text-[#05162e] text-right truncate max-w-[180px]">
                                  {audioSpecs.items[0].value}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Platform Certifications */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(p.certifications || []).slice(0, 3).map((cert, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border shadow-2xs"
                                style={{
                                  backgroundColor: cert.badge_color ? `${cert.badge_color}12` : '#f2f4f7',
                                  borderColor: cert.badge_color || '#c5c6ce',
                                  color: cert.badge_color || '#05162e',
                                }}
                              >
                                <span className="material-symbols-outlined text-[12px]">
                                  {cert.icon || 'check'}
                                </span>
                                {cert.name}
                              </span>
                            ))}
                            {(p.certifications || []).length > 3 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[#75777e] bg-[#f2f4f7]">
                                +{(p.certifications || []).length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom Actions */}
                      <div className="p-3 border-t border-[#e6e8eb] bg-[#f7f9fc] flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleCopyQuickSpecs(p)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#44474d] hover:text-[#005FB7] hover:bg-white rounded transition-colors flex items-center gap-1"
                          title="Copy Markdown specs for BOQ"
                        >
                          <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          Copy
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1 text-[#75777e] hover:text-[#05162e] hover:bg-white rounded transition-colors"
                            title="Edit Product"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id, p.model_name)}
                            className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
                            title="Delete Product"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                          <button
                            onClick={() => setSelectedProductForModal(p)}
                            className="px-3 py-1 bg-[#005FB7] hover:bg-[#05162e] text-white rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <span>Specs & Media</span>
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* MAIN VIEW: 2. HIGH-DENSITY SPECS TABLE */}
        {viewMode === 'table' && (
          <div className="bg-white border border-[#c5c6ce] rounded-lg overflow-hidden shadow-sm">
            <div className="p-3 bg-[#f2f4f7] border-b border-[#c5c6ce] flex justify-between items-center">
              <span className="text-xs font-bold text-[#05162e] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#005FB7]">table_chart</span>
                Hardware Specifications Matrix ({filteredProducts.length} Items)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#e6e8eb] text-[#191c1e] font-semibold border-b border-[#c5c6ce]">
                  <tr>
                    <th className="py-2.5 px-3">Brand</th>
                    <th className="py-2.5 px-3">Model & SKU</th>
                    <th className="py-2.5 px-3">Category / Family</th>
                    <th className="py-2.5 px-3">Capacity & Space</th>
                    <th className="py-2.5 px-3">Resolution & Zoom</th>
                    <th className="py-2.5 px-3">Certifications</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e6e8eb]">
                  {filteredProducts.map((p) => {
                    const videoSpecs = p.specifications?.find((s) => s.group.toLowerCase().includes('video') || s.group.toLowerCase().includes('camera'));
                    const resItem = videoSpecs?.items?.find((i) => i.label.toLowerCase().includes('res') || i.label.toLowerCase().includes('zoom'));

                    return (
                      <tr key={p.id} className="hover:bg-[#f2f4f7] transition-colors">
                        <td className="py-3 px-3 font-bold text-[#005FB7]">
                          {p.brand?.name || 'Brand'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            onClick={() => setSelectedProductForModal(p)}
                            className="font-bold text-[#05162e] hover:text-[#005FB7] cursor-pointer block"
                          >
                            {p.model_name}
                          </span>
                          <span className="text-[10px] font-mono text-[#75777e]">
                            {p.sku_part_number || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#44474d]">
                          <div>{p.category?.name || 'General'}</div>
                          {p.family?.name && (
                            <div className="text-[10px] text-[#75777e]">{p.family.name} Series</div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-[#05162e] bg-[#e6e8eb] px-2 py-0.5 rounded text-[11px]">
                            {p.seating_capacity || 'Universal'}
                          </span>
                          <div className="text-[10px] text-[#75777e] mt-0.5">{p.room_size}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#191c1e]">
                          {resItem?.value || '4K Ultra HD'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(p.certifications || []).map((c, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.2 rounded text-[9px] font-bold border"
                                style={{
                                  backgroundColor: c.badge_color ? `${c.badge_color}10` : '#f2f4f7',
                                  borderColor: c.badge_color || '#c5c6ce',
                                  color: c.badge_color || '#05162e',
                                }}
                              >
                                {c.name.replace('Microsoft ', '').replace('Rooms', '')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              p.status === 'Active'
                                ? 'bg-[#e2f0d9] text-[#1e4620]'
                                : 'bg-[#e6e8eb] text-[#44474d]'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedProductForModal(p)}
                              className="px-2.5 py-1 bg-[#005FB7] text-white rounded text-xs font-semibold hover:bg-[#05162e] transition-colors"
                            >
                              Inspect
                            </button>
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setIsAddModalOpen(true);
                              }}
                              className="p-1 text-[#75777e] hover:text-[#05162e] rounded"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MAIN VIEW: 3. BRANDS SHOWCASE VIEW */}
        {viewMode === 'brands' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {brands.map((b) => {
              const brandProducts = products.filter((p) => p.brand?.id === b.id);

              return (
                <div
                  key={b.id}
                  className="bg-white border border-[#c5c6ce] rounded-lg p-5 shadow-2xs flex flex-col justify-between hover:border-[#005FB7] transition-all"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded bg-[#05162e] text-white font-bold flex items-center justify-center text-sm">
                        {b.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-mono font-bold text-[#005FB7] bg-[#d6e3ff] px-2 py-0.5 rounded">
                        {b.country || 'Global'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-[#05162e]">{b.name}</h3>
                      <p className="text-xs text-[#44474d] mt-1 leading-relaxed">
                        {b.description}
                      </p>
                    </div>

                    {/* Associated Models Count */}
                    <div className="mt-2 bg-[#f7f9fc] border border-[#e6e8eb] rounded p-2.5 flex items-center justify-between text-xs">
                      <span className="text-[#44474d] font-semibold">Active Hardware Models:</span>
                      <span className="font-mono font-bold text-[#05162e]">{brandProducts.length} Models</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#e6e8eb] flex items-center justify-between">
                    {b.website_url && (
                      <a
                        href={b.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#005FB7] hover:underline font-semibold flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        Official Portal
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setSelectedBrandSlug(b.slug);
                        setViewMode('grid');
                      }}
                      className="px-3 py-1 bg-[#05162e] hover:bg-[#005FB7] text-white rounded text-xs font-semibold transition-colors"
                    >
                      View Products →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Inspector Modal */}
        <ProductDetailsModal
          product={selectedProductForModal}
          isOpen={!!selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
          onEdit={(prod) => {
            setSelectedProductForModal(null);
            setEditingProduct(prod);
            setIsAddModalOpen(true);
          }}
          onDelete={(id) => {
            if (selectedProductForModal) {
              handleDeleteProduct(id, selectedProductForModal.model_name);
            }
          }}
        />

        {/* Add/Edit Product Modal */}
        <AddProductModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            showToast(
              editingProduct
                ? 'Product updated successfully in catalog!'
                : 'New product added successfully to catalog!'
            );
            loadData();
          }}
          editProduct={editingProduct}
          brands={brands}
          categories={categories}
          families={families}
          products={products}
          customTaxonomyOptions={customTaxonomyOptions}
        />

        {/* Taxonomy & Dropdown Manager Modal */}
        <ManageTaxonomyModal
          isOpen={isManageTaxonomyOpen}
          onClose={() => setIsManageTaxonomyOpen(false)}
          onRefresh={loadData}
          brands={brands}
          categories={categories}
          families={families}
          products={products}
          customTaxonomyOptions={customTaxonomyOptions}
        />
      </main>
    </div>
  );
}
