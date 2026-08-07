'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Brand, ProductCategory, ProductFamily, Product } from '@/types/catalog';

interface ManageTaxonomyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  brands: Brand[];
  categories: ProductCategory[];
  families: ProductFamily[];
  products: Product[];
  customTaxonomyOptions?: { id: string; type: string; value: string }[];
}

export function ManageTaxonomyModal({
  isOpen,
  onClose,
  onRefresh,
  brands,
  categories,
  families,
  products,
  customTaxonomyOptions = [],
}: ManageTaxonomyModalProps) {
  const [activeTab, setActiveTab] = useState<'brands' | 'categories' | 'families' | 'sizing'>('brands');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Edit States
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBrandCountry, setEditBrandCountry] = useState('');

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');

  const [editingFamId, setEditingFamId] = useState<string | null>(null);
  const [editFamName, setEditFamName] = useState('');

  const handleDeleteCustomOption = async (optValue: string) => {
    if (!confirm(`Are you sure you want to delete custom option "${optValue}" from database taxonomy?`)) return;
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('custom_taxonomy_options').delete().eq('value', optValue);
      setStatusMsg(`Custom option "${optValue}" deleted successfully.`);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete custom option.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // ----------------------------------------------------
  // BRAND MANAGEMENT
  // ----------------------------------------------------
  const handleUpdateBrand = async (brandId: string) => {
    if (!editBrandName.trim()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const slug = editBrandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const { error } = await supabase
        .from('brands')
        .update({ name: editBrandName.trim(), slug, country: editBrandCountry.trim() })
        .eq('id', brandId);

      if (error) throw error;
      setStatusMsg(`Brand "${editBrandName}" updated.`);
      setEditingBrandId(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update brand.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBrand = async (brand: Brand) => {
    const attachedCount = products.filter((p) => p.brand_id === brand.id || p.brand?.id === brand.id).length;
    if (attachedCount > 0) {
      alert(
        `Cannot delete brand "${brand.name}": It currently has ${attachedCount} products associated with it. Please re-assign or delete those products first.`
      );
      return;
    }

    if (!confirm(`Are you sure you want to delete brand "${brand.name}"?`)) return;

    setLoading(true);
    try {
      const supabase = createClient();
      // Clean up families linked to brand
      await supabase.from('product_families').delete().eq('brand_id', brand.id);
      const { error } = await supabase.from('brands').delete().eq('id', brand.id);
      if (error) throw error;

      setStatusMsg(`Brand "${brand.name}" deleted successfully.`);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete brand.');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // CATEGORY MANAGEMENT
  // ----------------------------------------------------
  const handleUpdateCategory = async (catId: string) => {
    if (!editCatName.trim()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const slug = editCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const { error } = await supabase
        .from('product_categories')
        .update({ name: editCatName.trim(), slug, icon: editCatIcon.trim() || 'category' })
        .eq('id', catId);

      if (error) throw error;
      setStatusMsg(`Category "${editCatName}" updated.`);
      setEditingCatId(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update category.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: ProductCategory) => {
    const attachedCount = products.filter((p) => p.category_id === cat.id || p.category?.id === cat.id).length;
    if (attachedCount > 0) {
      alert(
        `Cannot delete category "${cat.name}": It currently has ${attachedCount} products assigned to it.`
      );
      return;
    }

    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.from('product_families').delete().eq('category_id', cat.id);
      const { error } = await supabase.from('product_categories').delete().eq('id', cat.id);
      if (error) throw error;

      setStatusMsg(`Category "${cat.name}" deleted successfully.`);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category.');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // PRODUCT FAMILY MANAGEMENT
  // ----------------------------------------------------
  const handleUpdateFamily = async (famId: string) => {
    if (!editFamName.trim()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const slug = editFamName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const { error } = await supabase
        .from('product_families')
        .update({ name: editFamName.trim(), slug })
        .eq('id', famId);

      if (error) throw error;
      setStatusMsg(`Family "${editFamName}" updated.`);
      setEditingFamId(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update family.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFamily = async (fam: ProductFamily) => {
    const attachedCount = products.filter((p) => p.family_id === fam.id || p.family?.id === fam.id).length;
    if (attachedCount > 0) {
      alert(`Cannot delete family "${fam.name}": ${attachedCount} products belong to this family.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete family "${fam.name}"?`)) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('product_families').delete().eq('id', fam.id);
      if (error) throw error;

      setStatusMsg(`Family "${fam.name}" deleted successfully.`);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete family.');
    } finally {
      setLoading(false);
    }
  };

  // Unique Room Sizes & Seating Capacities used across products and custom_taxonomy_options
  const uniqueRoomSizes = Array.from(
    new Set([
      ...products.map((p) => p.room_size).filter((v): v is string => Boolean(v && v.trim())),
      ...(customTaxonomyOptions || [])
        .filter((opt) => opt.type === 'room_size')
        .map((opt) => opt.value),
    ])
  );

  const uniqueSeatingCaps = Array.from(
    new Set([
      ...products.map((p) => p.seating_capacity).filter((v): v is string => Boolean(v && v.trim())),
      ...(customTaxonomyOptions || [])
        .filter((opt) => opt.type === 'seating_capacity')
        .map((opt) => opt.value),
    ])
  );

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#c5c6ce] rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden select-none">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#c5c6ce] flex items-center justify-between bg-[#f7f9fc]">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[22px] text-[#005FB7]">tune</span>
            <div>
              <h2 className="text-sm font-bold text-[#05162e] uppercase font-mono">
                Manage Hardware Taxonomy & Custom Options
              </h2>
              <p className="text-xs text-[#75777e]">
                Edit or delete manufacturer brands, discipline categories, product lines, and custom sizing parameters.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#c5c6ce] hover:bg-[#eceef1] text-[#45474c] flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#c5c6ce] bg-[#f2f4f7] px-4">
          <button
            onClick={() => setActiveTab('brands')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'brands'
                ? 'border-[#005FB7] text-[#005FB7] bg-white'
                : 'border-transparent text-[#45474c] hover:text-[#05162e]'
            }`}
          >
            <span>Brands ({brands.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'categories'
                ? 'border-[#005FB7] text-[#005FB7] bg-white'
                : 'border-transparent text-[#45474c] hover:text-[#05162e]'
            }`}
          >
            <span>Categories ({categories.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('families')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'families'
                ? 'border-[#005FB7] text-[#005FB7] bg-white'
                : 'border-transparent text-[#45474c] hover:text-[#05162e]'
            }`}
          >
            <span>Product Families ({families.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('sizing')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'sizing'
                ? 'border-[#005FB7] text-[#005FB7] bg-white'
                : 'border-transparent text-[#45474c] hover:text-[#05162e]'
            }`}
          >
            <span>Active Room & Capacity Values</span>
          </button>
        </div>

        {/* Status Toast */}
        {statusMsg && (
          <div className="px-4 py-2 bg-[#e2f0d9] text-[#1e4620] text-xs font-semibold flex items-center justify-between border-b border-[#b5d5a7]">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg(null)} className="hover:underline">Dismiss</button>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: BRANDS */}
          {activeTab === 'brands' && (
            <div className="flex flex-col gap-3">
              {brands.map((b) => {
                const count = products.filter((p) => p.brand_id === b.id || p.brand?.id === b.id).length;
                const isEditing = editingBrandId === b.id;

                return (
                  <div
                    key={b.id}
                    className="p-3 bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg flex items-center justify-between gap-3 shadow-2xs"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editBrandName}
                          onChange={(e) => setEditBrandName(e.target.value)}
                          placeholder="Brand Name"
                          className="px-2.5 py-1 text-xs font-bold border border-[#005FB7] rounded bg-white"
                        />
                        <input
                          type="text"
                          value={editBrandCountry}
                          onChange={(e) => setEditBrandCountry(e.target.value)}
                          placeholder="Country"
                          className="px-2.5 py-1 text-xs border border-[#c5c6ce] rounded bg-white w-32"
                        />
                        <button
                          onClick={() => handleUpdateBrand(b.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-[#005FB7] text-white text-xs font-bold rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingBrandId(null)}
                          className="px-2 py-1 bg-[#eceef1] text-xs font-bold rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-[#05162e] text-white flex items-center justify-center font-bold text-xs font-mono">
                            {b.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#05162e]">{b.name}</h4>
                            <span className="text-[11px] font-mono text-[#75777e]">
                              {b.country || 'Global'} • {count} Products Active
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingBrandId(b.id);
                              setEditBrandName(b.name);
                              setEditBrandCountry(b.country || '');
                            }}
                            className="px-2.5 py-1 bg-white border border-[#c5c6ce] hover:border-[#005FB7] text-xs font-semibold rounded text-[#05162e]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBrand(b)}
                            disabled={loading}
                            className="px-2.5 py-1 bg-white border border-[#ffb4ab] text-[#ba1a1a] hover:bg-[#ba1a1a]/10 text-xs font-bold rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="flex flex-col gap-3">
              {categories.map((c) => {
                const count = products.filter((p) => p.category_id === c.id || p.category?.id === c.id).length;
                const isEditing = editingCatId === c.id;

                return (
                  <div
                    key={c.id}
                    className="p-3 bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg flex items-center justify-between gap-3 shadow-2xs"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          className="px-2.5 py-1 text-xs font-bold border border-[#005FB7] rounded bg-white flex-1"
                        />
                        <input
                          type="text"
                          value={editCatIcon}
                          onChange={(e) => setEditCatIcon(e.target.value)}
                          placeholder="Icon"
                          className="px-2.5 py-1 text-xs font-mono border border-[#c5c6ce] rounded bg-white w-28"
                        />
                        <button
                          onClick={() => handleUpdateCategory(c.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-[#005FB7] text-white text-xs font-bold rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="px-2 py-1 bg-[#eceef1] text-xs font-bold rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-[#1b2b44] text-white flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">{c.icon || 'category'}</span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#05162e]">{c.name}</h4>
                            <span className="text-[11px] font-mono text-[#75777e]">
                              Slug: {c.slug} • {count} Products
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingCatId(c.id);
                              setEditCatName(c.name);
                              setEditCatIcon(c.icon || 'category');
                            }}
                            className="px-2.5 py-1 bg-white border border-[#c5c6ce] hover:border-[#005FB7] text-xs font-semibold rounded text-[#05162e]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(c)}
                            disabled={loading}
                            className="px-2.5 py-1 bg-white border border-[#ffb4ab] text-[#ba1a1a] hover:bg-[#ba1a1a]/10 text-xs font-bold rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: PRODUCT FAMILIES */}
          {activeTab === 'families' && (
            <div className="flex flex-col gap-3">
              {families.map((f) => {
                const count = products.filter((p) => p.family_id === f.id || p.family?.id === f.id).length;
                const parentBrand = brands.find((b) => b.id === f.brand_id);
                const isEditing = editingFamId === f.id;

                return (
                  <div
                    key={f.id}
                    className="p-3 bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg flex items-center justify-between gap-3 shadow-2xs"
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editFamName}
                          onChange={(e) => setEditFamName(e.target.value)}
                          className="px-2.5 py-1 text-xs font-bold border border-[#005FB7] rounded bg-white flex-1"
                        />
                        <button
                          onClick={() => handleUpdateFamily(f.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-[#005FB7] text-white text-xs font-bold rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingFamId(null)}
                          className="px-2 py-1 bg-[#eceef1] text-xs font-bold rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <h4 className="text-xs font-bold text-[#05162e]">{f.name}</h4>
                          <span className="text-[11px] font-mono text-[#75777e]">
                            Brand: {parentBrand?.name || 'Global'} • {count} Models Linked
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingFamId(f.id);
                              setEditFamName(f.name);
                            }}
                            className="px-2.5 py-1 bg-white border border-[#c5c6ce] hover:border-[#005FB7] text-xs font-semibold rounded text-[#05162e]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFamily(f)}
                            disabled={loading}
                            className="px-2.5 py-1 bg-white border border-[#ffb4ab] text-[#ba1a1a] hover:bg-[#ba1a1a]/10 text-xs font-bold rounded"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: ACTIVE SIZING & CAPACITIES */}
          {activeTab === 'sizing' && (
            <div className="flex flex-col gap-5">
              <div>
                <h4 className="text-xs font-bold text-[#05162e] uppercase font-mono mb-2">
                  Active Seating Capacities in Database ({uniqueSeatingCaps.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {uniqueSeatingCaps.map((cap) => {
                    const customOpt = (customTaxonomyOptions || []).find(
                      (opt) => opt.type === 'seating_capacity' && opt.value === cap
                    );
                    return (
                      <span
                        key={cap}
                        className="px-2.5 py-1 bg-[#d4e3ff] text-[#041c36] rounded text-xs font-semibold font-mono flex items-center gap-1.5"
                      >
                        <span>{cap}</span>
                        {customOpt && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomOption(cap)}
                            className="hover:text-[#ba1a1a] p-0.5 rounded transition-colors"
                            title="Delete custom option from database"
                          >
                            <span className="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-[#c5c6ce] pt-4">
                <h4 className="text-xs font-bold text-[#05162e] uppercase font-mono mb-2">
                  Active Room Dimensions in Database ({uniqueRoomSizes.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {uniqueRoomSizes.map((room) => {
                    const customOpt = (customTaxonomyOptions || []).find(
                      (opt) => opt.type === 'room_size' && opt.value === room
                    );
                    return (
                      <span
                        key={room}
                        className="px-2.5 py-1 bg-[#c6dbfe] text-[#4c607e] rounded text-xs font-semibold font-mono flex items-center gap-1.5"
                      >
                        <span>{room}</span>
                        {customOpt && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomOption(room)}
                            className="hover:text-[#ba1a1a] p-0.5 rounded transition-colors"
                            title="Delete custom option from database"
                          >
                            <span className="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#c5c6ce] bg-[#f7f9fc] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#005FB7] text-white text-xs font-bold rounded hover:bg-[#05162e] transition-colors"
          >
            Done & Close
          </button>
        </div>
      </div>
    </div>
  );
}
