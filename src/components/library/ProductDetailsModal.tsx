'use client';

import React, { useState } from 'react';
import { Product, ProductMedia } from '@/types/catalog';

interface ProductDetailsModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: string) => void;
}

export function ProductDetailsModal({
  product,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: ProductDetailsModalProps) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'specs' | 'features' | 'media' | 'raw'>('specs');
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  if (!isOpen || !product) return null;

  const allMedia: Array<{ type: string; title: string; url: string; meta?: any }> = [];
  if (product.hero_image_url) {
    allMedia.push({
      type: 'image',
      title: 'Hero Overview',
      url: product.hero_image_url,
      meta: { angle: 'Main Overview' },
    });
  }
  if (product.media && product.media.length > 0) {
    product.media.forEach((m) => {
      if (m.url !== product.hero_image_url) {
        allMedia.push({
          type: m.type,
          title: m.title,
          url: m.url,
          meta: m.metadata,
        });
      }
    });
  }

  const currentMedia = allMedia[activeMediaIndex] || allMedia[0] || {
    type: 'image',
    title: product.model_name,
    url: product.hero_image_url || '/placeholder.png',
  };

  const handleCopySpecs = () => {
    let text = `# ${product.brand?.name || 'Brand'} ${product.model_name}\n`;
    text += `SKU: ${product.sku_part_number || 'N/A'}\n`;
    text += `Target Capacity: ${product.seating_capacity || 'N/A'} (${product.room_size || 'N/A'})\n\n`;
    text += `## Specifications\n`;
    (product.specifications || []).forEach((grp) => {
      text += `\n### ${grp.group}\n`;
      (grp.items || []).forEach((it) => {
        text += `- **${it.label}**: ${it.value}\n`;
      });
    });

    navigator.clipboard.writeText(text);
    setCopiedNotification('Specifications copied to clipboard in Markdown format!');
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(product, null, 2));
    setCopiedNotification('Product data copied as JSON!');
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-[#c5c6ce] rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Top Header Bar */}
        <div className="bg-[#05162e] text-white px-6 py-4 flex items-center justify-between border-b border-[#1b2b44] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {product.brand?.name?.slice(0, 2).toUpperCase() || 'HW'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#9ec2ff] font-semibold">
                  {product.brand?.name || 'Hardware'} • {product.family?.name || product.category?.name || 'System'}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    product.status === 'Active'
                      ? 'bg-[#1b431e] text-[#b8f5b8] border border-[#2e7d32]'
                      : 'bg-[#44474d] text-white'
                  }`}
                >
                  {product.status}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white truncate flex items-center gap-2">
                {product.model_name}
                {product.sku_part_number && (
                  <span className="text-xs font-mono text-[#c5c6ce] font-normal">
                    (SKU: {product.sku_part_number})
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button
                onClick={() => onEdit(product)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5 border border-white/10"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#c5c6ce] hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
              title="Close Modal"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Notification Banner if Copied */}
        {copiedNotification && (
          <div className="bg-[#e2f0d9] border-b border-[#b5d5a7] text-[#1e4620] px-6 py-2 text-xs font-medium flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {copiedNotification}
            </span>
          </div>
        )}

        {/* Modal Body - 2 Columns (Media Showcase left / Specs right) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#c5c6ce]">
          
          {/* Left Column: Media Gallery & Documents (5 Cols) */}
          <div className="lg:col-span-5 p-6 bg-[#f7f9fc] flex flex-col gap-5">
            {/* Primary Media Display Viewport */}
            <div className="relative aspect-4/3 w-full bg-[#0b1329] border border-[#c5c6ce] rounded-lg overflow-hidden flex items-center justify-center shadow-inner group p-2">
              {currentMedia.type === 'image' ? (
                <img
                  src={currentMedia.url}
                  alt={currentMedia.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-300"
                />
              ) : (
                <div className="p-6 text-center flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[48px] text-[#005FB7]">
                    {currentMedia.type.includes('pdf')
                      ? 'picture_as_pdf'
                      : currentMedia.type.includes('drawio')
                      ? 'hub'
                      : 'description'}
                  </span>
                  <span className="text-xs font-bold text-[#05162e]">
                    {currentMedia.title}
                  </span>
                  <a
                    href={currentMedia.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 px-3 py-1 bg-[#005FB7] text-white text-xs font-semibold rounded hover:bg-[#05162e] transition-colors inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    Open Attachment
                  </a>
                </div>
              )}

              {/* Seating / Room Badge Overlay on Image */}
              <div className="absolute top-3 left-3 bg-[#05162e]/90 backdrop-blur-xs text-white px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm border border-white/20">
                <span className="material-symbols-outlined text-[15px] text-[#9ec2ff]">groups</span>
                <span>{product.seating_capacity || 'Universal'}</span>
                <span className="text-[#9ec2ff]">•</span>
                <span className="text-[#e2e2e6]">{product.room_size || 'Room'}</span>
              </div>
            </div>

            {/* Thumbnail selector */}
            {allMedia.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {allMedia.map((m, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveMediaIndex(idx)}
                    className={`relative w-16 h-14 rounded border-2 shrink-0 overflow-hidden transition-all bg-[#0b1329] p-0.5 ${
                      activeMediaIndex === idx
                        ? 'border-[#005FB7] ring-2 ring-[#005FB7]/30'
                        : 'border-[#c5c6ce] opacity-70 hover:opacity-100'
                    }`}
                  >
                    {m.type === 'image' ? (
                      <img src={m.url} alt={m.title} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#eceef1]">
                        <span className="material-symbols-outlined text-[20px] text-[#005FB7]">
                          {m.type.includes('pdf') ? 'picture_as_pdf' : 'description'}
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Key Platform Certifications */}
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-4 shadow-2xs">
              <h4 className="text-xs font-bold text-[#05162e] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#005FB7]">verified</span>
                Certified Ecosystem Platforms
              </h4>
              <div className="flex flex-wrap gap-2">
                {product.certifications && product.certifications.length > 0 ? (
                  product.certifications.map((cert, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 border shadow-2xs"
                      style={{
                        backgroundColor: cert.badge_color ? `${cert.badge_color}15` : '#f2f4f7',
                        borderColor: cert.badge_color || '#c5c6ce',
                        color: cert.badge_color || '#05162e',
                      }}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {cert.icon || 'check_circle'}
                      </span>
                      <span>{cert.name}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-[#75777e] italic">Standard Universal USB / SIP / H.323 Compliant</span>
                )}
              </div>
            </div>

            {/* Attached Technical Documents / Datasheets */}
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-4 shadow-2xs">
              <h4 className="text-xs font-bold text-[#05162e] uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#005FB7]">folder_zip</span>
                  Engineering Attachments
                </span>
                <span className="text-[10px] font-mono text-[#75777e]">
                  {allMedia.filter((m) => m.type !== 'image').length} Files
                </span>
              </h4>

              <div className="flex flex-col gap-2">
                {allMedia.filter((m) => m.type !== 'image').length > 0 ? (
                  allMedia
                    .filter((m) => m.type !== 'image')
                    .map((doc, idx) => (
                      <a
                        key={idx}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2 rounded border border-[#e6e8eb] hover:border-[#005FB7] hover:bg-[#f2f4f7] transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded bg-[#e6e8eb] text-[#005FB7] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[16px]">
                              {doc.type.includes('pdf')
                                ? 'picture_as_pdf'
                                : doc.type.includes('drawio') || doc.type.includes('xml')
                                ? 'schema'
                                : doc.type.includes('cad') || doc.type.includes('dwg')
                                ? 'architecture'
                                : doc.type.includes('video') || doc.type.includes('mp4')
                                ? 'play_circle'
                                : doc.type.includes('manual')
                                ? 'menu_book'
                                : 'description'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#05162e] truncate group-hover:text-[#005FB7]">
                              {doc.title}
                            </p>
                            <p className="text-[10px] font-mono text-[#75777e] uppercase">
                              {doc.type.replace('_', ' ')} {doc.meta?.size ? `• ${doc.meta.size}` : ''}
                            </p>
                          </div>
                        </div>

                        <span className="material-symbols-outlined text-[16px] text-[#75777e] group-hover:text-[#005FB7] shrink-0">
                          download
                        </span>
                      </a>
                    ))
                ) : (
                  <p className="text-xs text-[#75777e] italic py-1">
                    No supplementary PDF or Draw.io files attached yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Full Specifications & Feature Matrix (7 Cols) */}
          <div className="lg:col-span-7 p-6 flex flex-col gap-6">
            
            {/* Tagline / Overview Statement */}
            {product.tagline && (
              <div className="bg-[#f2f4f7] border-l-4 border-[#005FB7] p-3 rounded-r text-xs text-[#191c1e] leading-relaxed">
                <span className="font-bold text-[#05162e] block mb-0.5">Engineering Highlight:</span>
                {product.tagline}
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-[#c5c6ce] pb-2">
              <button
                onClick={() => setActiveTab('specs')}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'specs'
                    ? 'bg-[#005FB7] text-white'
                    : 'text-[#44474d] hover:bg-[#eceef1]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Technical Specifications ({product.specifications?.length || 0} Groups)
              </button>
              <button
                onClick={() => setActiveTab('features')}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'features'
                    ? 'bg-[#005FB7] text-white'
                    : 'text-[#44474d] hover:bg-[#eceef1]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">featured_play_list</span>
                Key Capabilities ({product.features?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('raw')}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === 'raw'
                    ? 'bg-[#005FB7] text-white'
                    : 'text-[#44474d] hover:bg-[#eceef1]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">code</span>
                Export JSON / BOQ
              </button>
            </div>

            {/* Tab 1: Specifications Accordion / Tables */}
            {activeTab === 'specs' && (
              <div className="flex flex-col gap-4">
                {product.specifications && product.specifications.length > 0 ? (
                  product.specifications.map((group, gIdx) => (
                    <div
                      key={gIdx}
                      className="border border-[#c5c6ce] rounded-lg overflow-hidden shadow-2xs bg-white"
                    >
                      <div className="bg-[#e6e8eb] px-4 py-2.5 border-b border-[#c5c6ce] flex items-center justify-between">
                        <span className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#005FB7]" />
                          {group.group}
                        </span>
                        <span className="text-[10px] font-mono text-[#75777e]">
                          {group.items?.length || 0} parameters
                        </span>
                      </div>

                      <table className="w-full text-left text-xs border-collapse">
                        <tbody className="divide-y divide-[#e6e8eb]">
                          {(group.items || []).map((item, iIdx) => (
                            <tr
                              key={iIdx}
                              className={iIdx % 2 === 0 ? 'bg-white' : 'bg-[#f7f9fc]'}
                            >
                              <td className="py-2.5 px-4 font-semibold text-[#44474d] w-1/3 align-top border-r border-[#e6e8eb]">
                                {item.label}
                              </td>
                              <td className="py-2.5 px-4 text-[#191c1e] font-mono font-medium leading-normal">
                                {item.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center border border-dashed border-[#c5c6ce] rounded-lg text-xs text-[#75777e]">
                    No detailed specifications added for this product yet.
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Key Features Grid */}
            {activeTab === 'features' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {product.features && product.features.length > 0 ? (
                  product.features.map((feat, fIdx) => (
                    <div
                      key={fIdx}
                      className="border border-[#c5c6ce] rounded-lg p-4 bg-white shadow-2xs flex flex-col gap-2 hover:border-[#005FB7] transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-[#d6e3ff] text-[#001b3c] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[18px]">
                            {feat.icon || 'star'}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-[#05162e]">
                          {feat.title}
                        </h4>
                      </div>
                      <p className="text-xs text-[#44474d] leading-relaxed">
                        {feat.description}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-8 text-center border border-dashed border-[#c5c6ce] rounded-lg text-xs text-[#75777e]">
                    No key features documented yet.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Raw Export & BOQ Tools */}
            {activeTab === 'raw' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopySpecs}
                    className="px-4 py-2 bg-[#005FB7] text-white text-xs font-bold rounded hover:bg-[#05162e] transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    Copy Specs for BOQ / RFC
                  </button>
                  <button
                    onClick={handleCopyJson}
                    className="px-4 py-2 bg-[#f2f4f7] border border-[#c5c6ce] text-[#05162e] text-xs font-bold rounded hover:bg-[#e6e8eb] transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">data_object</span>
                    Copy Raw JSON Data
                  </button>
                </div>

                <div className="bg-[#191c1e] text-[#f2f4f7] p-4 rounded-lg font-mono text-[11px] overflow-x-auto max-h-[350px]">
                  <pre>{JSON.stringify(product, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="bg-[#f2f4f7] px-6 py-3 border-t border-[#c5c6ce] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#75777e] font-mono">
            <span>ID: {product.id}</span>
            <span>•</span>
            <span>Created: {new Date(product.created_at || Date.now()).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopySpecs}
              className="px-3.5 py-1.5 bg-white border border-[#c5c6ce] hover:bg-[#eceef1] text-[#05162e] rounded text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px] text-[#005FB7]">
                content_copy
              </span>
              Copy Specs
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-[#05162e] hover:bg-[#005FB7] text-white rounded text-xs font-semibold transition-colors shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
