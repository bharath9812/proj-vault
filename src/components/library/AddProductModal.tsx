'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Brand,
  ProductCategory,
  ProductFamily,
  Product,
  ProductSpecGroup,
  ProductFeature,
  ProductCertification,
  ProductMediaType,
  ProductMedia,
} from '@/types/catalog';
import { uploadProductFile } from '@/lib/storage-upload';
import { normalizeImageToHeroRatio } from '@/lib/image-normalizer';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editProduct?: Product | null;
  brands: Brand[];
  categories: ProductCategory[];
  families: ProductFamily[];
}

export interface StagedMediaItem {
  id?: string;
  file?: File;
  url: string;
  previewUrl?: string;
  title: string;
  type: ProductMediaType;
  isHero?: boolean;
  isUploaded?: boolean;
  sizeFormatted?: string;
  sourceMode: 'upload' | 'url';
}

export function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
  editProduct,
  brands,
  categories,
  families,
}: AddProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [modelName, setModelName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [tagline, setTagline] = useState('');
  const [roomSize, setRoomSize] = useState('Medium');
  const [seatingCapacity, setSeatingCapacity] = useState('10–16 People');
  const [status, setStatus] = useState<'Active' | 'Discontinued' | 'Upcoming'>('Active');
  const [isFeatured, setIsFeatured] = useState(false);

  // Staged Media: Images
  const [stagedImages, setStagedImages] = useState<StagedMediaItem[]>([]);
  // Staged Media: Technical Documents & Attachments
  const [stagedDocs, setStagedDocs] = useState<StagedMediaItem[]>([]);

  // Input refs for file triggers
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Specifications
  const [specGroups, setSpecGroups] = useState<ProductSpecGroup[]>([
    {
      group: 'Camera & Optics',
      items: [
        { label: 'Resolution', value: '4K Ultra HD @ 30fps' },
        { label: 'Zoom', value: '5x Optical Zoom' },
        { label: 'Field of View', value: '90° Diagonal' },
      ],
    },
    {
      group: 'Audio & Acoustics',
      items: [
        { label: 'Microphones', value: '6 Beamforming MEMS mics' },
        { label: 'Speakers', value: 'Dual high-fidelity stereo woofers' },
      ],
    },
    {
      group: 'Connectivity & Ports',
      items: [
        { label: 'HDMI Out', value: '2x HDMI 2.0' },
        { label: 'USB Ports', value: 'USB 3.0 / USB-C' },
        { label: 'Network', value: 'Gigabit Ethernet PoE' },
      ],
    },
  ]);

  // Features
  const [features, setFeatures] = useState<ProductFeature[]>([
    {
      title: 'AI Auto-Framing',
      description: 'Intelligent speaker tracking and continuous group view framing.',
      icon: 'auto_awesome',
    },
    {
      title: 'Appliance Mode',
      description: 'Runs native Teams Rooms or Zoom Rooms without dedicated PC.',
      icon: 'token',
    },
  ]);

  // Certifications
  const [selectedCerts, setSelectedCerts] = useState<string[]>([
    'Microsoft Teams Rooms',
    'Zoom Rooms',
  ]);

  const CERT_OPTIONS = [
    { name: 'Microsoft Teams Rooms', badge_color: '#6264A7', icon: 'groups' },
    { name: 'Zoom Rooms', badge_color: '#0B5CFF', icon: 'videocam' },
    { name: 'Cisco Webex', badge_color: '#005FB7', icon: 'hub' },
    { name: 'Google Meet', badge_color: '#00832D', icon: 'video_call' },
    { name: 'Tencent Meeting', badge_color: '#005FB7', icon: 'hub' },
    { name: 'Universal USB UVC', badge_color: '#05162e', icon: 'usb' },
  ];

  // Helper: Format bytes to human string
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper: Detect document type from extension
  const detectDocType = (name: string): ProductMediaType => {
    const ext = name.toLowerCase().split('.').pop() || '';
    if (['pdf'].includes(ext)) return 'pdf_datasheet';
    if (['drawio', 'xml'].includes(ext)) return 'drawio_svg';
    if (['dwg', 'dxf', 'step', 'cad'].includes(ext)) return 'cad';
    if (['puml', 'plantuml'].includes(ext)) return 'plantuml' as any;
    if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    if (['doc', 'docx', 'manual', 'txt'].includes(ext)) return 'manual';
    return 'pdf_datasheet';
  };

  // Sync edit mode
  useEffect(() => {
    if (editProduct) {
      setBrandId(editProduct.brand_id);
      setCategoryId(editProduct.category_id);
      setFamilyId(editProduct.family_id || '');
      setModelName(editProduct.model_name);
      setSlug(editProduct.slug);
      setSku(editProduct.sku_part_number || '');
      setTagline(editProduct.tagline || '');
      setRoomSize(editProduct.room_size || 'Medium');
      setSeatingCapacity(editProduct.seating_capacity || '10–16 People');
      setStatus(editProduct.status || 'Active');
      setIsFeatured(editProduct.is_featured);
      setSpecGroups(editProduct.specifications || []);
      setFeatures(editProduct.features || []);
      setSelectedCerts((editProduct.certifications || []).map((c) => c.name));

      // Populate staged images
      const existingMedia = editProduct.media || [];
      const imgItems: StagedMediaItem[] = [];
      const docItems: StagedMediaItem[] = [];

      // Include hero image if not in media
      if (editProduct.hero_image_url) {
        const heroAlreadyInMedia = existingMedia.some((m) => m.url === editProduct.hero_image_url);
        if (!heroAlreadyInMedia) {
          imgItems.push({
            url: editProduct.hero_image_url,
            previewUrl: editProduct.hero_image_url,
            title: `${editProduct.model_name} Main Product View`,
            type: 'image',
            isHero: true,
            isUploaded: true,
            sourceMode: 'url',
          });
        }
      }

      existingMedia.forEach((m) => {
        if (m.type === 'image') {
          imgItems.push({
            id: m.id,
            url: m.url,
            previewUrl: m.url,
            title: m.title || 'Product Image',
            type: 'image',
            isHero: m.is_featured || m.url === editProduct.hero_image_url,
            isUploaded: true,
            sourceMode: 'url',
          });
        } else {
          docItems.push({
            id: m.id,
            url: m.url,
            previewUrl: m.url,
            title: m.title || 'Engineering Document',
            type: m.type,
            isUploaded: true,
            sourceMode: 'url',
          });
        }
      });

      // Ensure at least one image is marked hero
      if (imgItems.length > 0 && !imgItems.some((i) => i.isHero)) {
        imgItems[0].isHero = true;
      }

      setStagedImages(imgItems);
      setStagedDocs(docItems);
    } else {
      if (brands.length > 0) setBrandId(brands[0].id);
      if (categories.length > 0) setCategoryId(categories[0].id);
      setModelName('');
      setSlug('');
      setSku('');
      setTagline('');
      setStagedImages([
        {
          url: '/products/logitech-rally-bar.svg',
          previewUrl: '/products/logitech-rally-bar.svg',
          title: 'Primary Product Showcase',
          type: 'image',
          isHero: true,
          isUploaded: true,
          sourceMode: 'url',
        },
      ]);
      setStagedDocs([]);
    }
  }, [editProduct, brands, categories]);

  if (!isOpen) return null;

  const filteredFamilies = families.filter(
    (f) => !brandId || f.brand_id === brandId
  );

  const handleModelNameChange = (val: string) => {
    setModelName(val);
    if (!editProduct) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  // ----------------------------------------------------
  // Image Upload & URL Handlers
  // ----------------------------------------------------
  const handleImageFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newItems: StagedMediaItem[] = [];

    for (let idx = 0; idx < fileList.length; idx++) {
      const originalFile = fileList[idx];
      // Normalize any image format/aspect to fit 16:9 hero card ratio
      const normalizedFile = await normalizeImageToHeroRatio(originalFile);
      const objUrl = URL.createObjectURL(normalizedFile);
      const isFirst = stagedImages.length === 0 && idx === 0;

      newItems.push({
        file: normalizedFile,
        url: objUrl,
        previewUrl: objUrl,
        title: originalFile.name.replace(/\.[^/.]+$/, ''),
        type: 'image',
        isHero: isFirst,
        isUploaded: false,
        sizeFormatted: formatBytes(normalizedFile.size),
        sourceMode: 'upload',
      });
    }

    setStagedImages((prev) => [...prev, ...newItems]);
    if (imageFileInputRef.current) imageFileInputRef.current.value = '';
  };

  const handleAddImageUrl = () => {
    const isFirst = stagedImages.length === 0;
    const newItem: StagedMediaItem = {
      url: '',
      previewUrl: '',
      title: 'New Product Angle / Render',
      type: 'image',
      isHero: isFirst,
      isUploaded: true,
      sourceMode: 'url',
    };
    setStagedImages((prev) => [...prev, newItem]);
  };

  const handlePinHeroImage = (index: number) => {
    setStagedImages((prev) =>
      prev.map((item, idx) => ({
        ...item,
        isHero: idx === index,
      }))
    );
  };

  const handleRemoveImage = (index: number) => {
    setStagedImages((prev) => {
      const filtered = prev.filter((_, idx) => idx !== index);
      // If we removed the hero, make the first one the hero
      if (filtered.length > 0 && !filtered.some((i) => i.isHero)) {
        filtered[0].isHero = true;
      }
      return filtered;
    });
  };

  const handleUpdateImageTitle = (index: number, title: string) => {
    setStagedImages((prev) => {
      const updated = [...prev];
      updated[index].title = title;
      return updated;
    });
  };

  const handleUpdateImageUrl = (index: number, url: string) => {
    setStagedImages((prev) => {
      const updated = [...prev];
      updated[index].url = url;
      updated[index].previewUrl = url;
      return updated;
    });
  };

  // ----------------------------------------------------
  // Document Upload & URL Handlers
  // ----------------------------------------------------
  const handleDocFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newDocs: StagedMediaItem[] = Array.from(files).map((file) => {
      const objUrl = URL.createObjectURL(file);
      const detected = detectDocType(file.name);
      return {
        file,
        url: objUrl,
        previewUrl: objUrl,
        title: file.name.replace(/\.[^/.]+$/, ''),
        type: detected,
        isUploaded: false,
        sizeFormatted: formatBytes(file.size),
        sourceMode: 'upload',
      };
    });

    setStagedDocs((prev) => [...prev, ...newDocs]);
    if (docFileInputRef.current) docFileInputRef.current.value = '';
  };

  const handleAddDocUrl = () => {
    const newDoc: StagedMediaItem = {
      url: '',
      previewUrl: '',
      title: 'Technical Datasheet / Manual',
      type: 'pdf_datasheet',
      isUploaded: true,
      sourceMode: 'url',
    };
    setStagedDocs((prev) => [...prev, newDoc]);
  };

  const handleRemoveDoc = (index: number) => {
    setStagedDocs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateDoc = (index: number, field: keyof StagedMediaItem, value: any) => {
    setStagedDocs((prev) => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      return updated;
    });
  };

  // ----------------------------------------------------
  // Specification Groups Handlers
  // ----------------------------------------------------
  const handleAddSpecGroup = () => {
    setSpecGroups([
      ...specGroups,
      {
        group: 'New Specification Group',
        items: [{ label: 'Parameter', value: 'Value' }],
      },
    ]);
  };

  const handleAddSpecItem = (groupIndex: number) => {
    const updated = [...specGroups];
    updated[groupIndex].items.push({ label: '', value: '' });
    setSpecGroups(updated);
  };

  const handleRemoveSpecItem = (groupIndex: number, itemIndex: number) => {
    const updated = [...specGroups];
    updated[groupIndex].items.splice(itemIndex, 1);
    setSpecGroups(updated);
  };

  const handleSpecItemChange = (
    groupIndex: number,
    itemIndex: number,
    field: 'label' | 'value',
    value: string
  ) => {
    const updated = [...specGroups];
    updated[groupIndex].items[itemIndex][field] = value;
    setSpecGroups(updated);
  };

  const handleSpecGroupTitleChange = (groupIndex: number, newTitle: string) => {
    const updated = [...specGroups];
    updated[groupIndex].group = newTitle;
    setSpecGroups(updated);
  };

  // ----------------------------------------------------
  // Features Handlers
  // ----------------------------------------------------
  const handleAddFeature = () => {
    setFeatures([
      ...features,
      {
        title: 'New Key Capability',
        description: 'Describe feature capability and engineering benefit.',
        icon: 'star',
      },
    ]);
  };

  const handleFeatureChange = (
    index: number,
    field: 'title' | 'description' | 'icon',
    value: string
  ) => {
    const updated = [...features];
    updated[index][field] = value;
    setFeatures(updated);
  };

  const handleRemoveFeature = (index: number) => {
    const updated = [...features];
    updated.splice(index, 1);
    setFeatures(updated);
  };

  const handleToggleCert = (certName: string) => {
    if (selectedCerts.includes(certName)) {
      setSelectedCerts(selectedCerts.filter((c) => c !== certName));
    } else {
      setSelectedCerts([...selectedCerts, certName]);
    }
  };

  // ----------------------------------------------------
  // Submit & Direct Storage Upload Pipeline
  // ----------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandId || !categoryId || !modelName || !slug) {
      setErrorMsg('Please fill in Brand, Category, Model Name, and Slug.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setUploadStatusText('Preparing product records...');

    try {
      const supabase = createClient();
      const folderKey = slug || 'devices';

      // 1. Process & Upload Image Files
      const finalImages: {
        id?: string;
        url: string;
        title: string;
        type: ProductMediaType;
        isHero: boolean;
        metadata?: any;
      }[] = [];

      for (let i = 0; i < stagedImages.length; i++) {
        const item = stagedImages[i];
        if (item.file) {
          setUploadStatusText(`Uploading product image ${i + 1} of ${stagedImages.length}...`);
          const uploadRes = await uploadProductFile(
            item.file,
            folderKey,
            item.file.name
          );
          finalImages.push({
            id: item.id,
            url: uploadRes.publicUrl,
            title: item.title,
            type: 'image',
            isHero: !!item.isHero,
            metadata: { size: uploadRes.size, mime: uploadRes.mimeType },
          });
        } else if (item.url && item.url.trim().length > 0) {
          finalImages.push({
            id: item.id,
            url: item.url.trim(),
            title: item.title,
            type: 'image',
            isHero: !!item.isHero,
          });
        }
      }

      // 2. Process & Upload Document Files
      const finalDocs: {
        id?: string;
        url: string;
        title: string;
        type: ProductMediaType;
        metadata?: any;
      }[] = [];

      for (let i = 0; i < stagedDocs.length; i++) {
        const doc = stagedDocs[i];
        if (doc.file) {
          setUploadStatusText(`Uploading document ${i + 1} of ${stagedDocs.length}...`);
          const uploadRes = await uploadProductFile(
            doc.file,
            folderKey,
            doc.file.name
          );
          finalDocs.push({
            id: doc.id,
            url: uploadRes.publicUrl,
            title: doc.title,
            type: doc.type,
            metadata: { size: uploadRes.size, mime: uploadRes.mimeType },
          });
        } else if (doc.url && doc.url.trim().length > 0) {
          finalDocs.push({
            id: doc.id,
            url: doc.url.trim(),
            title: doc.title,
            type: doc.type,
          });
        }
      }

      // Determine hero image URL
      const heroItem = finalImages.find((img) => img.isHero) || finalImages[0];
      const finalHeroImageUrl = heroItem ? heroItem.url : '/products/logitech-rally-bar.svg';

      setUploadStatusText('Saving product catalog specifications to database...');

      const finalCertifications: ProductCertification[] = selectedCerts.map(
        (certName) => {
          const match = CERT_OPTIONS.find((c) => c.name === certName);
          return {
            name: certName,
            badge_color: match?.badge_color || '#005FB7',
            icon: match?.icon || 'check_circle',
          };
        }
      );

      const productPayload = {
        brand_id: brandId,
        category_id: categoryId,
        family_id: familyId || null,
        model_name: modelName,
        slug: slug,
        sku_part_number: sku || null,
        tagline: tagline || null,
        room_size: roomSize,
        seating_capacity: seatingCapacity,
        status: status,
        hero_image_url: finalHeroImageUrl,
        is_featured: isFeatured,
        specifications: specGroups,
        features: features,
        certifications: finalCertifications,
      };

      let createdProductId = editProduct?.id;

      if (editProduct) {
        const { error } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', editProduct.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert([productPayload])
          .select('id')
          .single();

        if (error) throw error;
        createdProductId = data.id;
      }

      // Sync product_media records
      if (createdProductId) {
        if (editProduct && editProduct.media && editProduct.media.length > 0) {
          const currentMediaIds = [...finalImages, ...finalDocs]
            .map((m) => m.id)
            .filter((id): id is string => Boolean(id));
          const removedMedia = editProduct.media.filter(
            (m) => !currentMediaIds.includes(m.id)
          );

          if (removedMedia.length > 0) {
            const removedIds = removedMedia.map((m) => m.id);
            await supabase.from('product_media').delete().in('id', removedIds);
          }
        }

        // Process images
        for (let idx = 0; idx < finalImages.length; idx++) {
          const img = finalImages[idx];
          const imgPayload = {
            product_id: createdProductId,
            type: 'image',
            title: img.title || `${modelName} Photo ${idx + 1}`,
            url: img.url,
            sort_order: idx + 1,
            is_featured: img.isHero,
            metadata: img.metadata || {},
          };

          if (img.id) {
            await supabase.from('product_media').update(imgPayload).eq('id', img.id);
          } else {
            await supabase.from('product_media').insert([imgPayload]);
          }
        }

        // Process documents
        for (let idx = 0; idx < finalDocs.length; idx++) {
          const doc = finalDocs[idx];
          const docPayload = {
            product_id: createdProductId,
            type: doc.type,
            title: doc.title || `${modelName} Attachment ${idx + 1}`,
            url: doc.url,
            sort_order: finalImages.length + idx + 1,
            is_featured: false,
            metadata: doc.metadata || {},
          };

          if (doc.id) {
            await supabase.from('product_media').update(docPayload).eq('id', doc.id);
          } else {
            await supabase.from('product_media').insert([docPayload]);
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving product:', err);
      setErrorMsg(err.message || 'Failed to save product. Check input and storage connectivity.');
    } finally {
      setLoading(false);
      setUploadStatusText(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#fcfcff] border border-[#c5c6ce] rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#c5c6ce] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#005FB7]/10 text-[#005FB7] flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[20px]">
                {editProduct ? 'edit_note' : 'add_box'}
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-[#05162e]">
                {editProduct ? `Edit Hardware Model: ${editProduct.model_name}` : 'Add New Hardware Product'}
              </h2>
              <p className="text-xs text-[#75777e]">
                Upload high-res product photos, pin the hero card image, and specify technical engineering specs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#c5c6ce] hover:bg-[#eceef1] text-[#45474c] flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {errorMsg && (
            <div className="p-3 bg-[#ba1a1a]/10 border border-[#ba1a1a]/30 rounded-lg text-[#ba1a1a] text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Classification & Taxonomy */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#005FB7]">account_tree</span>
                1. Hardware Classification & Brand Hierarchy
              </h3>
              <span className="text-[11px] text-[#75777e]">Required for catalog taxonomy</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Brand <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative group">
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    required
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="">Select Manufacturer Brand</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.country || 'Global'})
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                    unfold_more
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Discipline Category <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative group">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                    unfold_more
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Product Family / Line
                </label>
                <div className="relative group">
                  <select
                    value={familyId}
                    onChange={(e) => setFamilyId(e.target.value)}
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="">No Specific Family (Standalone)</option>
                    {filteredFamilies.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                    unfold_more
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Model Identification & Sizing */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#005FB7]">badge</span>
                2. Model Identification & Deployment Sizing
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Model Name <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => handleModelNameChange(e.target.value)}
                  placeholder="e.g. Rally Bar + Tap IP"
                  required
                  className="w-full bg-white border border-[#c5c6ce] rounded px-3 py-2 text-xs font-semibold text-[#191c1e] focus:border-[#005FB7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  URL Slug <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="rally-bar-tap-ip"
                  required
                  className="w-full bg-white border border-[#c5c6ce] rounded px-3 py-2 text-xs font-mono text-[#191c1e] focus:border-[#005FB7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  SKU / Part Number
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="960-001308 / CS-BAR-K9"
                  className="w-full bg-white border border-[#c5c6ce] rounded px-3 py-2 text-xs font-mono text-[#191c1e] focus:border-[#005FB7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Engineering Tagline / Summary
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Premier all-in-one video bar for medium rooms."
                  className="w-full bg-white border border-[#c5c6ce] rounded px-3 py-2 text-xs text-[#191c1e] focus:border-[#005FB7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Seating Capacity Matrix
                </label>
                <div className="relative group">
                  <select
                    value={seatingCapacity}
                    onChange={(e) => setSeatingCapacity(e.target.value)}
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="2–4 People">2–4 People (Huddle / Phone Booth)</option>
                    <option value="4–8 People">4–8 People (Small Focus Room)</option>
                    <option value="8–10 People">8–10 People (Small to Medium Room)</option>
                    <option value="10–16 People">10–16 People (Medium to Large Room)</option>
                    <option value="16+ People">16+ People (Large Boardroom / Auditorium)</option>
                    <option value="Universal">Universal / Scalable Array</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                    unfold_more
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Room Size Classification
                </label>
                <div className="relative group">
                  <select
                    value={roomSize}
                    onChange={(e) => setRoomSize(e.target.value)}
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="Huddle">Huddle Space (Up to 100 sq ft)</option>
                    <option value="Small">Small Room (100–200 sq ft)</option>
                    <option value="Medium">Medium Room (200–400 sq ft)</option>
                    <option value="Large">Large Conference (400–800 sq ft)</option>
                    <option value="Auditorium">Auditorium / Multi-purpose (800+ sq ft)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                    unfold_more
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Dual Image Showcase & Pin Hero Image */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#005FB7]">photo_library</span>
                  3. Product Images & Hero Card Showcase
                </h3>
                <p className="text-[11px] text-[#75777e] mt-0.5">
                  Upload multiple product images or provide URLs. Pin one as the <strong className="text-[#005FB7]">⭐ Hero Card Cover</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={imageFileInputRef}
                  onChange={handleImageFilesSelected}
                  multiple
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#005FB7] text-white text-xs font-bold rounded hover:bg-[#05162e] transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  Upload Image Files
                </button>
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  className="px-3 py-1.5 bg-[#eceef1] text-[#05162e] text-xs font-bold rounded hover:bg-[#c5c6ce] transition-colors flex items-center gap-1.5 border border-[#c5c6ce]"
                >
                  <span className="material-symbols-outlined text-[16px]">add_link</span>
                  Add via URL
                </button>
              </div>
            </div>

            {/* Images Grid */}
            {stagedImages.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {stagedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className={`relative rounded-lg border-2 p-3 flex flex-col gap-2 transition-all bg-[#f7f9fc] ${
                      img.isHero
                        ? 'border-[#005FB7] ring-2 ring-[#005FB7]/20 shadow-md bg-blue-50/20'
                        : 'border-[#c5c6ce] hover:border-[#75777e]'
                    }`}
                  >
                    {/* Hero Badge Tag */}
                    <div className="flex items-center justify-between">
                      {img.isHero ? (
                        <span className="px-2 py-0.5 bg-[#005FB7] text-white text-[10px] font-mono font-bold rounded flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">star</span>
                          HERO CARD COVER
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePinHeroImage(idx)}
                          className="px-2 py-0.5 bg-white border border-[#c5c6ce] text-[#005FB7] text-[10px] font-semibold rounded hover:bg-[#005FB7] hover:text-white transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[12px]">push_pin</span>
                          Pin as Hero
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-1 rounded transition-colors"
                        title="Remove Image"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>

                    {/* Preview Box */}
                    <div className="aspect-16/9 w-full bg-[#0b1329] rounded overflow-hidden flex items-center justify-center border border-[#c5c6ce] p-1">
                      {img.previewUrl ? (
                        <img
                          src={img.previewUrl}
                          alt={img.title}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-3 text-[#c5c6ce] text-[11px] flex flex-col items-center">
                          <span className="material-symbols-outlined text-[24px]">broken_image</span>
                          <span>No Image URL</span>
                        </div>
                      )}
                    </div>

                    {/* Title & Metadata */}
                    <input
                      type="text"
                      value={img.title}
                      onChange={(e) => handleUpdateImageTitle(idx, e.target.value)}
                      placeholder="Angle / Description (e.g. Front View)"
                      className="w-full bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs text-[#05162e] font-medium focus:border-[#005FB7] focus:outline-none"
                    />

                    {/* Direct URL input if in URL mode */}
                    {img.sourceMode === 'url' ? (
                      <input
                        type="text"
                        value={img.url}
                        onChange={(e) => handleUpdateImageUrl(idx, e.target.value)}
                        placeholder="https://... or /products/image.svg"
                        className="w-full bg-white border border-[#c5c6ce] rounded px-2 py-1 text-[11px] font-mono text-[#45474c] focus:border-[#005FB7] focus:outline-none"
                      />
                    ) : (
                      <div className="flex items-center justify-between text-[10px] text-[#75777e] font-mono">
                        <span className="flex items-center gap-1 text-[#005FB7]">
                          <span className="material-symbols-outlined text-[13px]">cloud_upload</span>
                          Direct File Upload
                        </span>
                        <span>{img.sizeFormatted}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => imageFileInputRef.current?.click()}
                className="border-2 border-dashed border-[#c5c6ce] hover:border-[#005FB7] rounded-lg p-6 text-center cursor-pointer transition-colors bg-[#f7f9fc]"
              >
                <span className="material-symbols-outlined text-[36px] text-[#005FB7] mb-1">
                  add_photo_alternate
                </span>
                <p className="text-xs font-bold text-[#05162e]">
                  Click to Upload High-Res Product Photos or Drag & Drop
                </p>
                <p className="text-[11px] text-[#75777e] mt-1">
                  Supports SVG, PNG, WebP, JPG. Direct cloud upload with automatic hero card assignment.
                </p>
              </div>
            )}
          </div>

          {/* Section 4: Engineering Documents, CAD & Technical Attachments */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#005FB7]">folder_zip</span>
                  4. Technical Documents, CAD & Wiring Schematics
                </h3>
                <p className="text-[11px] text-[#75777e] mt-0.5">
                  Attach PDF datasheets, Draw.io wiring diagrams, CAD/DWG drawings, and user manuals.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={docFileInputRef}
                  onChange={handleDocFilesSelected}
                  multiple
                  accept=".pdf,.dwg,.dxf,.drawio,.xml,.puml,.docx,.xlsx,.zip,.mp4"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => docFileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#005FB7] text-white text-xs font-bold rounded hover:bg-[#05162e] transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">upload_file</span>
                  Upload Files
                </button>
                <button
                  type="button"
                  onClick={handleAddDocUrl}
                  className="px-3 py-1.5 bg-[#eceef1] text-[#05162e] text-xs font-bold rounded hover:bg-[#c5c6ce] transition-colors flex items-center gap-1.5 border border-[#c5c6ce]"
                >
                  <span className="material-symbols-outlined text-[16px]">add_link</span>
                  Add Document URL
                </button>
              </div>
            </div>

            {/* Documents List */}
            {stagedDocs.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {stagedDocs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg flex flex-col md:flex-row md:items-center gap-3 justify-between"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded bg-[#005FB7]/10 text-[#005FB7] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[18px]">
                          {doc.type.includes('pdf')
                            ? 'picture_as_pdf'
                            : doc.type.includes('drawio')
                            ? 'schema'
                            : doc.type.includes('cad')
                            ? 'architecture'
                            : 'description'}
                        </span>
                      </div>

                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={doc.title}
                          onChange={(e) => handleUpdateDoc(idx, 'title', e.target.value)}
                          placeholder="Document Title (e.g. Single Line Diagram)"
                          className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs text-[#05162e] font-semibold focus:border-[#005FB7] focus:outline-none"
                        />

                        <div className="relative group">
                          <select
                            value={doc.type}
                            onChange={(e) => handleUpdateDoc(idx, 'type', e.target.value)}
                            className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded pl-2.5 pr-7 py-1 text-xs text-[#05162e] font-medium focus:outline-none cursor-pointer"
                          >
                            <option value="pdf_datasheet">PDF Datasheet / RFC Spec</option>
                            <option value="drawio_svg">Draw.io / XML Diagram</option>
                            <option value="cad">CAD / DWG / DXF Drawing</option>
                            <option value="manual">User / Installation Manual</option>
                            <option value="video">Product Video / Tutorial</option>
                          </select>
                          <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                            unfold_more
                          </span>
                        </div>

                        {doc.sourceMode === 'url' ? (
                          <input
                            type="text"
                            value={doc.url}
                            onChange={(e) => handleUpdateDoc(idx, 'url', e.target.value)}
                            placeholder="https://... URL"
                            className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-mono text-[#45474c] focus:border-[#005FB7] focus:outline-none"
                          />
                        ) : (
                          <div className="flex items-center text-[11px] text-[#005FB7] font-mono bg-white border border-[#c5c6ce] rounded px-2 py-1">
                            <span>Ready to Upload ({doc.sizeFormatted})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(idx)}
                      className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-1.5 rounded transition-colors self-end md:self-center"
                      title="Remove Attachment"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#75777e] italic py-2">
                No supplementary engineering files attached yet. Click &quot;Upload Files&quot; or &quot;Add Document URL&quot; above.
              </p>
            )}
          </div>

          {/* Section 5: Ecosystem Certifications */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-3 shadow-2xs">
            <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 border-b border-[#eceef1] pb-2.5">
              <span className="material-symbols-outlined text-[16px] text-[#005FB7]">verified</span>
              5. Ecosystem Platform Certifications
            </h3>

            <div className="flex flex-wrap gap-2.5">
              {CERT_OPTIONS.map((c) => {
                const selected = selectedCerts.includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => handleToggleCert(c.name)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                      selected
                        ? 'bg-[#005FB7] text-white border-[#005FB7] shadow-xs'
                        : 'bg-[#f7f9fc] text-[#45474c] border-[#c5c6ce] hover:border-[#005FB7]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {selected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 6: Dynamic Specifications Matrix */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <div>
                <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#005FB7]">tune</span>
                  6. Technical Specifications Builder (Structured JSON)
                </h3>
                <p className="text-[11px] text-[#75777e]">
                  Grouped parameters exported for BOQ / RFC engineering comparison.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddSpecGroup}
                className="px-2.5 py-1 bg-[#eceef1] hover:bg-[#c5c6ce] text-[#05162e] rounded text-xs font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Add Group
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {specGroups.map((grp, gIdx) => (
                <div
                  key={gIdx}
                  className="bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={grp.group}
                      onChange={(e) => handleSpecGroupTitleChange(gIdx, e.target.value)}
                      placeholder="Group Title (e.g. Acoustics)"
                      className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1 text-xs font-bold text-[#05162e] focus:border-[#005FB7] focus:outline-none flex-1 max-w-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSpecItem(gIdx)}
                      className="text-xs text-[#005FB7] hover:underline font-semibold flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">add_circle</span>
                      Add Parameter
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grp.items.map((item, iIdx) => (
                      <div key={iIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) =>
                            handleSpecItemChange(gIdx, iIdx, 'label', e.target.value)
                          }
                          placeholder="Label (e.g. FoV)"
                          className="w-1/3 bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-medium text-[#05162e]"
                        />
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) =>
                            handleSpecItemChange(gIdx, iIdx, 'value', e.target.value)
                          }
                          placeholder="Value (e.g. 120°)"
                          className="flex-1 bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs text-[#191c1e]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSpecItem(gIdx, iIdx)}
                          className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 7: Key Capabilities & Features */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#005FB7]">star</span>
                7. Key Features & Architectural Highlights
              </h3>
              <button
                type="button"
                onClick={handleAddFeature}
                className="px-2.5 py-1 bg-[#eceef1] hover:bg-[#c5c6ce] text-[#05162e] rounded text-xs font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Add Feature
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {features.map((feat, fIdx) => (
                <div
                  key={fIdx}
                  className="bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg p-3 flex flex-col gap-2 relative"
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(fIdx)}
                    className="absolute top-2 right-2 text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-0.5 rounded"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>

                  <input
                    type="text"
                    value={feat.title}
                    onChange={(e) => handleFeatureChange(fIdx, 'title', e.target.value)}
                    placeholder="Feature Title (e.g. Dual 48MP AI Optics)"
                    className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1 text-xs font-bold text-[#05162e] pr-7"
                  />
                  <textarea
                    value={feat.description}
                    onChange={(e) => handleFeatureChange(fIdx, 'description', e.target.value)}
                    placeholder="Feature description and room deployment benefits."
                    rows={2}
                    className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1 text-xs text-[#45474c]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 8: Status & Priority */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="w-4 h-4 text-[#005FB7] rounded focus:ring-0"
                />
                <span className="text-xs font-bold text-[#05162e]">
                  ⭐ Mark as Featured Catalog Showcase
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#05162e]">Lifecycle Status:</label>
              <div className="relative group">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] rounded-lg pl-2.5 pr-7 py-1 text-xs font-bold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none"
                >
                  <option value="Active">Active Production</option>
                  <option value="Upcoming">Upcoming / In Evaluation</option>
                  <option value="Discontinued">Discontinued / Legacy</option>
                </select>
                <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                  unfold_more
                </span>
              </div>
            </div>
          </div>

          {/* Upload Progress Status Overlay */}
          {loading && uploadStatusText && (
            <div className="p-3 bg-[#005FB7]/10 border border-[#005FB7]/30 rounded-lg flex items-center gap-3 text-xs font-bold text-[#005FB7]">
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              <span>{uploadStatusText}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="border-t border-[#c5c6ce] pt-4 flex items-center justify-end gap-3 sticky bottom-0 bg-[#fcfcff] py-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-white border border-[#c5c6ce] text-[#45474c] text-xs font-bold rounded-lg hover:bg-[#eceef1] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#005FB7] text-white text-xs font-bold rounded-lg hover:bg-[#05162e] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                  Saving & Uploading...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  {editProduct ? 'Save Changes' : 'Create Hardware Product'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
