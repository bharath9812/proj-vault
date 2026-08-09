'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Product, Brand, ProductCategory } from '@/types/catalog';
import { StagedProductItem } from '@/types/project-products';

import { useDebounce } from '@/hooks/useDebounce';

interface AttachProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttachProducts: (stagedItems: StagedProductItem[]) => Promise<void> | void;
  existingProductIds?: string[];
  projectName?: string;
  projectCode?: string;
}

export function AttachProductModal({
  isOpen,
  onClose,
  onAttachProducts,
  existingProductIds = [],
  projectName = 'Project',
  projectCode = 'PRJ',
}: AttachProductModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCapacity, setSelectedCapacity] = useState('all');

  // Staged Items State (Map of productId -> StagedProductItem)
  const [stagedMap, setStagedMap] = useState<Record<string, StagedProductItem>>({});
  const [activeTab, setActiveTab] = useState<'catalog' | 'staged'>('catalog');

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Load Categories & Brands on mount
  useEffect(() => {
    let isMounted = true;
    async function loadFilters() {
      try {
        const supabase = createClient();
        const [brandRes, catRes] = await Promise.all([
          supabase.from('brands').select('*').order('sort_order', { ascending: true }),
          supabase.from('product_categories').select('*').order('sort_order', { ascending: true }),
        ]);
        if (isMounted) {
          setBrands(brandRes.data || []);
          setCategories(catRes.data || []);
        }
      } catch (err) {
        console.error('Error loading library filters:', err);
      }
    }
    loadFilters();
    return () => { isMounted = false; };
  }, []);

  // Fetch Library Products on Search/Filter Change
  useEffect(() => {
    if (!isOpen) return;
    setStagedMap({});
    setActiveTab('catalog');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function searchCatalog() {
      setLoading(true);
      try {
        const supabase = createClient();
        let query = supabase
          .from('products')
          .select(`
            *,
            brand:brands(*),
            category:product_categories(*),
            family:product_families(*),
            media:product_media(*)
          `);

        if (debouncedSearchQuery) {
          query = query.ilike('search_vector', `%${debouncedSearchQuery}%`);
        }
        
        if (selectedBrand !== 'all') {
          query = query.eq('brand_id', selectedBrand);
        }
        
        if (selectedCategory !== 'all') {
          query = query.eq('category_id', selectedCategory);
        }

        // For seating capacity / room size, we do a basic ilike if selected
        if (selectedCapacity !== 'all') {
          query = query.or(`seating_capacity.ilike.%${selectedCapacity}%,room_size.ilike.%${selectedCapacity}%`);
        }

        const { data, error } = await query.order('sort_order', { ascending: true }).limit(50);
        
        if (error) throw error;

        if (isMounted) {
          setProducts(data || []);
        }
      } catch (err) {
        console.error('Error searching library products:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    searchCatalog();
    return () => {
      isMounted = false;
    };
  }, [isOpen, debouncedSearchQuery, selectedBrand, selectedCategory, selectedCapacity]);

  // The database already filters the products!
  const filteredProducts = products;

  // Toggle or add item to staging
  const handleToggleStage = (product: Product) => {
    setStagedMap((prev) => {
      const next = { ...prev };
      if (next[product.id]) {
        delete next[product.id];
      } else {
        next[product.id] = {
          product,
          quantity: 1,
          system_role: getDefaultSystemRole(product),
          location_tag: '',
          notes: '',
        };
      }
      return next;
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setStagedMap((prev) => {
      const item = prev[productId];
      if (!item) return prev;
      const newQty = Math.max(1, item.quantity + delta);
      return {
        ...prev,
        [productId]: { ...item, quantity: newQty },
      };
    });
  };

  const handleUpdateField = (
    productId: string,
    field: 'system_role' | 'location_tag' | 'notes',
    value: string
  ) => {
    setStagedMap((prev) => {
      const item = prev[productId];
      if (!item) return prev;
      return {
        ...prev,
        [productId]: { ...item, [field]: value },
      };
    });
  };

  const stagedList = useMemo(() => Object.values(stagedMap), [stagedMap]);
  const stagedCount = stagedList.length;

  const handleConfirmAttach = async () => {
    if (stagedCount === 0) return;
    setSubmitting(true);
    try {
      await onAttachProducts(stagedList);
      setStagedMap({});
      onClose();
    } catch (err) {
      console.error('Error attaching products:', err);
    } finally {
      setSubmitting(false);
    }
  };

  function getDefaultSystemRole(p: Product): string {
    const catName = p.category?.name?.toLowerCase() || '';
    if (catName.includes('camera')) return 'Primary PTZ / Tracking Camera';
    if (catName.includes('audio') || catName.includes('dsp')) return 'Core DSP & AEC Processor';
    if (catName.includes('switch') || catName.includes('network')) return 'AV Network Switch';
    if (catName.includes('mic')) return 'Ceiling / Tabletop Microphone';
    if (catName.includes('speaker')) return 'Program / Ceiling Loudspeaker';
    if (catName.includes('display')) return 'Main Visual Display Endpoint';
    if (catName.includes('control')) return 'Touch Control Panel';
    return 'Active System Hardware';
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-[#c5c6ce] rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Top Header Bar */}
        <div className="bg-[#05162e] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#1b2b44] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#005FB7] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Attach Hardware & Products from Library
                </h3>
                <span className="bg-[#1b2b44] text-[#9ec2ff] text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-[#384762]">
                  {projectCode}
                </span>
              </div>
              <p className="text-[11px] text-[#8392b0] truncate max-w-xl">
                Search verified enterprise catalog specifications and attach to {projectName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/library"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold text-[#9ec2ff] hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded transition-colors flex items-center gap-1 border border-white/10"
              title="Open full product catalog in new tab"
            >
              <span>Explore /library</span>
              <span className="material-symbols-outlined text-[13px]">open_in_new</span>
            </a>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded transition-colors"
              title="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="bg-[#f7f9fc] border-b border-[#c5c6ce] px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Search Input with Spec & Substring Support */}
          <div className="relative flex-1 min-w-[280px]">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[17px] text-[#75777e]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by model, brand, SKU, or specs (e.g. 120fps, 4.2mp, 4K60, PoE+, Dante)..."
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-[#c5c6ce] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded text-xs text-[#191c1e] placeholder-[#75777e] outline-hidden transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[#75777e] hover:text-[#191c1e]"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>

          {/* Facet Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1.5 text-xs text-[#05162e] font-semibold focus:border-[#005FB7] outline-hidden"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Brand Filter */}
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1.5 text-xs text-[#05162e] font-semibold focus:border-[#005FB7] outline-hidden"
            >
              <option value="all">All Brands ({brands.length})</option>
              {brands.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* View Tab Switcher (Mobile/Compact Toggle) */}
            <div className="flex bg-[#e6e8eb] p-0.5 rounded text-xs font-bold shrink-0">
              <button
                onClick={() => setActiveTab('catalog')}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1 ${
                  activeTab === 'catalog'
                    ? 'bg-white text-[#05162e] shadow-xs'
                    : 'text-[#44474d] hover:text-[#05162e]'
                }`}
              >
                <span>Catalog</span>
                <span className="text-[10px] bg-[#d6e3ff] text-[#001b3c] px-1 rounded font-mono">
                  {filteredProducts.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('staged')}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1 ${
                  activeTab === 'staged'
                    ? 'bg-[#005FB7] text-white shadow-xs'
                    : 'text-[#44474d] hover:text-[#05162e]'
                }`}
              >
                <span>Selected</span>
                <span
                  className={`text-[10px] px-1 rounded font-mono ${
                    stagedCount > 0
                      ? 'bg-white text-[#005FB7] font-bold'
                      : 'bg-[#d8dadd] text-[#44474d]'
                  }`}
                >
                  {stagedCount}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Main Body (2-Pane Grid: Left Catalog, Right Staged Tray) */}
        <div className="flex-1 flex overflow-hidden bg-[#f7f9fc]">
          {/* Left Pane: Catalog Browser */}
          <div
            className={`flex-1 flex flex-col overflow-y-auto p-4 border-r border-[#c5c6ce] ${
              activeTab === 'staged' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center flex-1 py-16 text-[#44474d] gap-2">
                <span className="material-symbols-outlined text-[36px] animate-spin text-[#005FB7]">
                  progress_activity
                </span>
                <p className="text-xs font-semibold">Loading Hardware Library Catalog...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 py-16 text-center text-[#44474d] gap-2">
                <span className="material-symbols-outlined text-[40px] text-[#75777e]">
                  search_off
                </span>
                <h4 className="text-sm font-bold text-[#05162e]">No Hardware Found</h4>
                <p className="text-xs max-w-sm">
                  No products matched &quot;{searchQuery}&quot;. Try adjusting your filters or search keywords.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedBrand('all');
                    setSelectedCategory('all');
                  }}
                  className="mt-2 text-xs font-bold text-[#005FB7] hover:underline"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {filteredProducts.map((p) => {
                  const isStaged = !!stagedMap[p.id];
                  const isAlreadyInProject = existingProductIds.includes(p.id);

                  // Extract 2 key highlight specs
                  const highlightSpecs: string[] = [];
                  (p.specifications || []).forEach((g) => {
                    (g.items || []).forEach((it) => {
                      if (
                        highlightSpecs.length < 3 &&
                        (it.label.toLowerCase().includes('resolution') ||
                          it.label.toLowerCase().includes('zoom') ||
                          it.label.toLowerCase().includes('dante') ||
                          it.label.toLowerCase().includes('port') ||
                          it.label.toLowerCase().includes('poe') ||
                          it.label.toLowerCase().includes('output') ||
                          it.label.toLowerCase().includes('framerate') ||
                          it.label.toLowerCase().includes('fps'))
                      ) {
                        highlightSpecs.push(`${it.label}: ${it.value}`);
                      }
                    });
                  });

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleToggleStage(p)}
                      className={`group relative bg-white border rounded p-3 flex gap-3 transition-all cursor-pointer select-none hover:shadow-md ${
                        isStaged
                          ? 'border-[#005FB7] ring-1 ring-[#005FB7] bg-[#f2f7ff]'
                          : 'border-[#c5c6ce] hover:border-[#005FB7]'
                      }`}
                    >
                      {/* Product Thumbnail */}
                      <div className="w-16 h-16 rounded bg-[#f2f4f7] border border-[#e6e8eb] shrink-0 overflow-hidden flex items-center justify-center p-1 relative">
                        {p.hero_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.hero_image_url}
                            alt={p.model_name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="material-symbols-outlined text-[24px] text-[#75777e]">
                            devices
                          </span>
                        )}
                        {isAlreadyInProject && (
                          <span
                            className="absolute top-0 right-0 bg-[#05162e] text-white text-[8px] font-bold px-1 rounded-bl"
                            title="Already attached to this project"
                          >
                            IN USE
                          </span>
                        )}
                      </div>

                      {/* Info & Specs */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#005FB7] font-mono truncate">
                              {p.brand?.name || 'Hardware'} • {p.category?.name || 'System'}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                                isStaged
                                  ? 'bg-[#005FB7] text-white'
                                  : 'bg-[#eceef1] text-[#44474d]'
                              }`}
                            >
                              {isStaged ? 'SELECTED' : '+ SELECT'}
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-[#05162e] truncate group-hover:text-[#005FB7] transition-colors mt-0.5">
                            {p.model_name}
                          </h4>

                          {p.sku_part_number && (
                            <p className="text-[10px] font-mono text-[#75777e] truncate">
                              SKU: {p.sku_part_number}
                            </p>
                          )}
                        </div>

                        {/* Highlight Specs Badges */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {highlightSpecs.slice(0, 2).map((sp, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] font-mono bg-[#f2f4f7] border border-[#e0e3e6] text-[#44474d] px-1.5 py-0.5 rounded truncate max-w-[180px]"
                            >
                              {sp}
                            </span>
                          ))}
                          {p.room_size && (
                            <span className="text-[9px] font-mono bg-[#d6e3ff] text-[#001b3c] px-1.5 py-0.5 rounded">
                              {p.room_size}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Pane: Staged Items & System Assignment Details */}
          <div
            className={`w-full md:w-[380px] bg-white flex flex-col overflow-hidden shrink-0 border-l border-[#c5c6ce] ${
              activeTab === 'catalog' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Staged Header */}
            <div className="bg-[#f2f4f7] px-4 py-2.5 border-b border-[#c5c6ce] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#005FB7]">
                  checklist
                </span>
                <h4 className="text-xs font-bold text-[#05162e] uppercase tracking-wider">
                  Selected Hardware ({stagedCount})
                </h4>
              </div>
              {stagedCount > 0 && (
                <button
                  onClick={() => setStagedMap({})}
                  className="text-[10px] font-bold text-[#ba1a1a] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Staged List Items */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
              {stagedCount === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 py-12 text-center text-[#75777e] gap-2">
                  <span className="material-symbols-outlined text-[36px] opacity-40">
                    add_shopping_cart
                  </span>
                  <p className="text-xs font-semibold">No hardware selected yet.</p>
                  <p className="text-[11px] max-w-[220px]">
                    Click any product on the left catalog to configure and attach to this project.
                  </p>
                </div>
              ) : (
                stagedList.map((item) => (
                  <div
                    key={item.product.id}
                    className="bg-[#f7f9fc] border border-[#c5c6ce] rounded p-3 flex flex-col gap-2 relative shadow-xs"
                  >
                    {/* Item Title & Remove */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#005FB7] font-mono">
                          {item.product.brand?.name}
                        </span>
                        <h5 className="text-xs font-bold text-[#05162e] truncate">
                          {item.product.model_name}
                        </h5>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleStage(item.product);
                        }}
                        className="text-[#75777e] hover:text-[#ba1a1a] p-1 rounded transition-colors"
                        title="Remove from selection"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>

                    {/* Quantity Stepper & System Role */}
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div>
                        <label className="text-[10px] font-bold text-[#44474d] block mb-0.5">
                          Quantity
                        </label>
                        <div className="flex items-center border border-[#c5c6ce] bg-white rounded overflow-hidden">
                          <button
                            onClick={() => handleUpdateQuantity(item.product.id, -1)}
                            className="px-2 py-1 bg-[#f2f4f7] hover:bg-[#e0e3e6] text-xs font-bold text-[#05162e] transition-colors"
                          >
                            -
                          </button>
                          <span className="flex-1 text-center font-mono text-xs font-bold text-[#05162e]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(item.product.id, 1)}
                            className="px-2 py-1 bg-[#f2f4f7] hover:bg-[#e0e3e6] text-xs font-bold text-[#05162e] transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-[#44474d] block mb-0.5">
                          Location Tag
                        </label>
                        <input
                          type="text"
                          value={item.location_tag}
                          onChange={(e) =>
                            handleUpdateField(item.product.id, 'location_tag', e.target.value)
                          }
                          placeholder="e.g. Rack A - 04U"
                          className="w-full px-2 py-1 bg-white border border-[#c5c6ce] focus:border-[#005FB7] rounded text-xs text-[#05162e] outline-hidden"
                        />
                      </div>
                    </div>

                    {/* System Role */}
                    <div>
                      <label className="text-[10px] font-bold text-[#44474d] block mb-0.5">
                        System Role / Description
                      </label>
                      <input
                        type="text"
                        value={item.system_role}
                        onChange={(e) =>
                          handleUpdateField(item.product.id, 'system_role', e.target.value)
                        }
                        placeholder="e.g. Main PTZ Tracking Camera"
                        className="w-full px-2 py-1 bg-white border border-[#c5c6ce] focus:border-[#005FB7] rounded text-xs text-[#05162e] outline-hidden"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Commit Action Bar */}
            <div className="p-3 bg-[#f2f4f7] border-t border-[#c5c6ce] flex items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-[#44474d]">
                <span className="font-bold text-[#05162e]">{stagedCount}</span> item(s) •{' '}
                <span className="font-bold text-[#05162e]">
                  {stagedList.reduce((acc, it) => acc + it.quantity, 0)}
                </span>{' '}
                units
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-semibold text-[#44474d] hover:bg-[#e0e3e6] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={stagedCount === 0 || submitting}
                  onClick={handleConfirmAttach}
                  className={`px-4 py-1.5 text-xs font-bold text-white rounded transition-colors flex items-center gap-1.5 shadow-sm ${
                    stagedCount === 0 || submitting
                      ? 'bg-[#75777e] opacity-50 cursor-not-allowed'
                      : 'bg-[#005FB7] hover:bg-[#05162e]'
                  }`}
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined text-[14px] animate-spin">
                        progress_activity
                      </span>
                      <span>Attaching...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[14px]">link</span>
                      <span>Attach Hardware ({stagedCount})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
