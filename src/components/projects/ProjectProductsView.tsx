'use client';

import React, { useState, useMemo } from 'react';
import { Product } from '@/types/catalog';
import { ProjectProduct } from '@/types/project-products';
import { ProductDetailsModal } from '@/components/library/ProductDetailsModal';

interface ProjectProductsViewProps {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectProducts: ProjectProduct[];
  onOpenAttachModal: () => void;
  onUpdateQuantity: (projectProductId: string, newQty: number) => Promise<void> | void;
  onUpdateRoleOrLocation: (
    projectProductId: string,
    role: string,
    location: string
  ) => Promise<void> | void;
  onRemoveProduct: (projectProductId: string, productName: string) => Promise<void> | void;
  isReadOnly?: boolean;
}

export function ProjectProductsView({
  projectId,
  projectCode,
  projectName,
  projectProducts,
  onOpenAttachModal,
  onUpdateQuantity,
  onUpdateRoleOrLocation,
  onRemoveProduct,
  isReadOnly = false,
}: ProjectProductsViewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);

  // Edit Inline Role/Location State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editLocation, setEditLocation] = useState('');

  // Extract Categories
  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    projectProducts.forEach((pp) => {
      if (pp.product?.category) {
        map.set(pp.product.category.slug, pp.product.category.name);
      }
    });
    return Array.from(map.entries());
  }, [projectProducts]);

  // Filtered Equipment List
  const filteredList = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    return projectProducts.filter((pp) => {
      const p = pp.product;
      if (!p) return true;

      // Category filter
      if (selectedCategory !== 'all' && p.category?.slug !== selectedCategory) {
        return false;
      }

      // Keyword search
      if (q) {
        const matchName = p.model_name?.toLowerCase().includes(q);
        const matchBrand = p.brand?.name?.toLowerCase().includes(q);
        const matchSku = p.sku_part_number?.toLowerCase().includes(q);
        const matchRole = pp.system_role?.toLowerCase().includes(q);
        const matchLoc = pp.location_tag?.toLowerCase().includes(q);
        const matchSpecs = JSON.stringify(p.specifications || {}).toLowerCase().includes(q);

        if (!matchName && !matchBrand && !matchSku && !matchRole && !matchLoc && !matchSpecs) {
          return false;
        }
      }

      return true;
    });
  }, [projectProducts, searchFilter, selectedCategory]);

  // Aggregate Metrics
  const totalItems = projectProducts.length;
  const totalUnits = projectProducts.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const uniqueBrands = new Set(
    projectProducts.map((pp) => pp.product?.brand?.name).filter(Boolean)
  ).size;

  const handleStartEdit = (pp: ProjectProduct) => {
    setEditingId(pp.id);
    setEditRole(pp.system_role || '');
    setEditLocation(pp.location_tag || '');
  };

  const handleSaveEdit = async (ppId: string) => {
    await onUpdateRoleOrLocation(ppId, editRole, editLocation);
    setEditingId(null);
  };

  const handleExportCsv = () => {
    if (projectProducts.length === 0) return;
    let csv = 'SNo,Make/Brand,Model Name,SKU / Part Number,Category,System Role,Location Tag,Quantity\n';
    projectProducts.forEach((pp, idx) => {
      const p = pp.product;
      csv += `"${idx + 1}","${p?.brand?.name || ''}","${p?.model_name || ''}","${p?.sku_part_number || ''}","${p?.category?.name || ''}","${pp.system_role || ''}","${pp.location_tag || ''}","${pp.quantity || 1}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectCode || 'project'}_equipment_schedule.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      {/* 1. Top KPI Summary Metrics Bar */}
      <div className="bg-white border-b border-[#c5c6ce] px-6 py-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#75777e] block">
                Total Hardware Models
              </span>
              <span className="text-base font-bold text-[#05162e] font-mono">{totalItems}</span>
            </div>
            <div className="w-px h-6 bg-[#c5c6ce]"></div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#75777e] block">
                Total Installed Units
              </span>
              <span className="text-base font-bold text-[#005FB7] font-mono">{totalUnits}</span>
            </div>
            <div className="w-px h-6 bg-[#c5c6ce]"></div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#75777e] block">
                OEM Brands
              </span>
              <span className="text-base font-bold text-[#05162e] font-mono">{uniqueBrands}</span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={totalItems === 0}
              className="px-2.5 py-1.5 bg-[#eceef1] hover:bg-[#d8dadd] text-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 border border-[#c5c6ce] disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title="Export Hardware BOQ Schedule to CSV"
            >
              <span className="material-symbols-outlined text-[15px]">table_view</span>
              <span>Export CSV</span>
            </button>

            {!isReadOnly && (
              <button
                onClick={onOpenAttachModal}
                className="px-3 py-1.5 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">add_link</span>
                <span>Attach from Library</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Search, Filter & View Controls */}
      <div className="px-6 py-3.5 bg-[#f2f4f7] border-b border-[#c5c6ce] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-lg">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-[#75777e]">
              search
            </span>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter by model, brand, role, location, or spec..."
              className="w-full pl-8 pr-7 py-1 bg-white border border-[#c5c6ce] focus:border-[#005FB7] rounded text-xs text-[#191c1e] outline-hidden shadow-xs"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1.5 text-[#75777e] hover:text-[#191c1e]"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {availableCategories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1 text-xs text-[#05162e] font-semibold focus:border-[#005FB7] outline-hidden shrink-0"
            >
              <option value="all">All Categories</option>
              {availableCategories.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Mode Toggle: Table vs Cards */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#e6e8eb] p-0.5 rounded text-xs shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 px-2 rounded transition-colors flex items-center gap-1 ${
                viewMode === 'table'
                  ? 'bg-white text-[#05162e] font-bold shadow-xs'
                  : 'text-[#44474d] hover:text-[#05162e]'
              }`}
              title="Table View"
            >
              <span className="material-symbols-outlined text-[15px]">table_rows</span>
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1 px-2 rounded transition-colors flex items-center gap-1 ${
                viewMode === 'cards'
                  ? 'bg-white text-[#05162e] font-bold shadow-xs'
                  : 'text-[#44474d] hover:text-[#05162e]'
              }`}
              title="Visual Cards View"
            >
              <span className="material-symbols-outlined text-[15px]">grid_view</span>
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Equipment List / Table */}
      <div className="flex-1 p-6 overflow-y-auto">
        {projectProducts.length === 0 ? (
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-12 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-[#d6e3ff] text-[#001b3c] flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px] text-[#005FB7]">
                devices_other
              </span>
            </div>
            <h4 className="text-base font-bold text-[#05162e]">
              No Hardware Attached to this Project
            </h4>
            <p className="text-xs text-[#44474d] max-w-md">
              Connect products, cameras, switches, and DSP equipment from the verified Enterprise
              Hardware Library (`/library`) directly into {projectName}.
            </p>
            {!isReadOnly && (
              <button
                onClick={onOpenAttachModal}
                className="mt-2 px-4 py-2 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">add_link</span>
                <span>Attach First Hardware Item</span>
              </button>
            )}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-8 text-center flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[32px] text-[#75777e]">
              filter_alt_off
            </span>
            <p className="text-xs font-bold text-[#05162e]">No items match your filter criteria.</p>
            <button
              onClick={() => {
                setSearchFilter('');
                setSelectedCategory('all');
              }}
              className="text-xs font-bold text-[#005FB7] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* HIGH-DENSITY ENTERPRISE TABLE VIEW */
          <div className="bg-white border border-[#c5c6ce] rounded-lg overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f2f4f7] border-b border-[#c5c6ce] text-[#05162e] font-bold">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3 min-w-[220px]">Hardware Model</th>
                  <th className="p-3 w-32">Category</th>
                  <th className="p-3 min-w-[160px]">System Role</th>
                  <th className="p-3 w-36">Location Tag</th>
                  <th className="p-3 w-28 text-center">Quantity</th>
                  <th className="p-3 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e8eb]">
                {filteredList.map((pp, idx) => {
                  const p = pp.product;
                  const isEditing = editingId === pp.id;

                  return (
                    <tr
                      key={pp.id}
                      className="hover:bg-[#f7f9fc] transition-colors group text-[#191c1e]"
                    >
                      {/* SNo */}
                      <td className="p-3 text-center font-mono text-[#75777e]">{idx + 1}</td>

                      {/* Product Model & Thumbnail */}
                      <td className="p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            onClick={() => p && setSelectedProductForModal(p)}
                            className="w-10 h-10 rounded bg-[#f2f4f7] border border-[#e6e8eb] shrink-0 overflow-hidden flex items-center justify-center p-0.5 cursor-pointer hover:border-[#005FB7]"
                            title="Click to view full specifications"
                          >
                            {p?.hero_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.hero_image_url}
                                alt={p.model_name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <span className="material-symbols-outlined text-[18px] text-[#75777e]">
                                devices
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#005FB7] font-mono">
                                {p?.brand?.name || 'OEM'}
                              </span>
                              {p?.sku_part_number && (
                                <span className="text-[10px] font-mono text-[#75777e]">
                                  • SKU: {p.sku_part_number}
                                </span>
                              )}
                            </div>
                            <h5
                              onClick={() => p && setSelectedProductForModal(p)}
                              className="font-bold text-[#05162e] truncate cursor-pointer hover:text-[#005FB7] transition-colors"
                            >
                              {p?.model_name || 'Hardware Model'}
                            </h5>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3 text-[#44474d] font-medium">
                        {p?.category?.name || 'Hardware'}
                      </td>

                      {/* System Role */}
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            placeholder="e.g. Core Switch"
                            className="w-full px-2 py-1 bg-white border border-[#005FB7] rounded text-xs text-[#05162e] outline-hidden font-medium"
                          />
                        ) : (
                          <span className="text-[#05162e] font-semibold block truncate">
                            {pp.system_role || '—'}
                          </span>
                        )}
                      </td>

                      {/* Location Tag */}
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editLocation}
                            onChange={(e) => setEditLocation(e.target.value)}
                            placeholder="e.g. Rack A - 04U"
                            className="w-full px-2 py-1 bg-white border border-[#005FB7] rounded text-xs text-[#05162e] outline-hidden font-mono"
                          />
                        ) : (
                          <span className="font-mono text-[#44474d] bg-[#f2f4f7] px-1.5 py-0.5 rounded border border-[#e0e3e6] text-[11px] truncate block max-w-[130px]">
                            {pp.location_tag || 'Unassigned'}
                          </span>
                        )}
                      </td>

                      {/* Quantity Stepper */}
                      <td className="p-3 text-center">
                        {!isReadOnly ? (
                          <div className="inline-flex items-center border border-[#c5c6ce] bg-white rounded overflow-hidden shadow-2xs">
                            <button
                              onClick={() => onUpdateQuantity(pp.id, Math.max(1, pp.quantity - 1))}
                              className="px-2 py-0.5 bg-[#f2f4f7] hover:bg-[#e0e3e6] text-[11px] font-bold text-[#05162e] transition-colors"
                              title="Decrease quantity"
                            >
                              -
                            </button>
                            <span className="px-2.5 font-mono text-xs font-bold text-[#05162e]">
                              {pp.quantity || 1}
                            </span>
                            <button
                              onClick={() => onUpdateQuantity(pp.id, (pp.quantity || 1) + 1)}
                              className="px-2 py-0.5 bg-[#f2f4f7] hover:bg-[#e0e3e6] text-[11px] font-bold text-[#05162e] transition-colors"
                              title="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono font-bold text-xs text-[#05162e]">
                            {pp.quantity || 1}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(pp.id)}
                                className="px-2 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-[11px] font-bold transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 bg-[#eceef1] text-[#44474d] rounded text-[11px] font-semibold hover:bg-[#e0e3e6]"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => p && setSelectedProductForModal(p)}
                                className="p-1 hover:bg-[#d6e3ff] text-[#005FB7] rounded transition-colors"
                                title="View Specifications"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  visibility
                                </span>
                              </button>

                              {!isReadOnly && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleStartEdit(pp);
                                    }}
                                    className="p-1 hover:bg-[#eceef1] text-[#44474d] rounded transition-colors"
                                    title="Edit System Role & Location"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">
                                      edit
                                    </span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onRemoveProduct(pp.id, p?.model_name || 'Hardware');
                                    }}
                                    className="p-1 hover:bg-[#ffdad6] text-[#ba1a1a] rounded transition-colors"
                                    title="Remove from Project"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">
                                      link_off
                                    </span>
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* VISUAL CARDS GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredList.map((pp) => {
              const p = pp.product;

              return (
                <div
                  key={pp.id}
                  className="bg-white border border-[#c5c6ce] hover:border-[#005FB7] rounded-lg p-4 flex flex-col justify-between transition-all shadow-xs hover:shadow-md"
                >
                  <div>
                    {/* Top Badge & Sku */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#005FB7] font-mono">
                        {p?.brand?.name || 'Hardware'} • {p?.category?.name || 'System'}
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-[#d6e3ff] text-[#001b3c] px-2 py-0.5 rounded">
                        Qty: {pp.quantity || 1}
                      </span>
                    </div>

                    {/* Image & Title */}
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        onClick={() => p && setSelectedProductForModal(p)}
                        className="w-14 h-14 rounded bg-[#f2f4f7] border border-[#e6e8eb] shrink-0 overflow-hidden flex items-center justify-center p-1 cursor-pointer hover:border-[#005FB7]"
                      >
                        {p?.hero_image_url ? (
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
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4
                          onClick={() => p && setSelectedProductForModal(p)}
                          className="font-bold text-xs text-[#05162e] truncate cursor-pointer hover:text-[#005FB7]"
                        >
                          {p?.model_name}
                        </h4>
                        {p?.sku_part_number && (
                          <p className="text-[10px] font-mono text-[#75777e] truncate">
                            SKU: {p.sku_part_number}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Assigned Role & Location */}
                    <div className="bg-[#f7f9fc] border border-[#e6e8eb] rounded p-2.5 flex flex-col gap-1 text-[11px] mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[#75777e]">Role:</span>
                        <span className="font-bold text-[#05162e] truncate max-w-[170px]">
                          {pp.system_role || 'General System Item'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#75777e]">Location:</span>
                        <span className="font-mono text-[#005FB7] font-semibold truncate max-w-[170px]">
                          {pp.location_tag || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-2 border-t border-[#e6e8eb] flex items-center justify-between">
                    <button
                      onClick={() => p && setSelectedProductForModal(p)}
                      className="text-[11px] font-bold text-[#005FB7] hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                      <span>Full Specs</span>
                    </button>

                    {!isReadOnly && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveProduct(pp.id, p?.model_name || 'Hardware');
                        }}
                        className="text-[11px] font-bold text-[#ba1a1a] hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">link_off</span>
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Full Specifications Modal */}
      {selectedProductForModal && (
        <ProductDetailsModal
          product={selectedProductForModal}
          isOpen={!!selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
        />
      )}
    </div>
  );
}
