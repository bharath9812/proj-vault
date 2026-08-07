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
  products?: Product[];
  customTaxonomyOptions?: { id: string; type: string; value: string }[];
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

export interface CustomFormSection {
  id: string;
  title: string;
  icon: string;
  items: { label: string; value: string }[];
}

// Standard Default Example Spec Groups for Admin Guidance
const DEFAULT_SPEC_GROUPS: ProductSpecGroup[] = [
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
];

const DEFAULT_FEATURES: ProductFeature[] = [
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
];

export function AddProductModal({
  isOpen,
  onClose,
  onSuccess,
  editProduct,
  brands,
  categories,
  families,
  products = [],
  customTaxonomyOptions = [],
}: AddProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dynamically extract all custom seating capacities & room sizes saved in database across products & custom_taxonomy_options
  const activeDbCapacities = React.useMemo(() => {
    const defaultCaps = ['2–4 People', '4–8 People', '8–10 People', '10–16 People', '16+ People', 'Universal'];
    const set = new Set<string>();
    (customTaxonomyOptions || []).forEach((opt) => {
      if (opt.type === 'seating_capacity' && opt.value && !defaultCaps.includes(opt.value)) {
        set.add(opt.value);
      }
    });
    (products || []).forEach((p) => {
      if (p.seating_capacity && !defaultCaps.includes(p.seating_capacity)) {
        set.add(p.seating_capacity);
      }
    });
    return Array.from(set);
  }, [products, customTaxonomyOptions]);

  const activeDbRoomSizes = React.useMemo(() => {
    const defaultSizes = ['Huddle', 'Small', 'Medium', 'Large', 'Auditorium'];
    const set = new Set<string>();
    (customTaxonomyOptions || []).forEach((opt) => {
      if (opt.type === 'room_size' && opt.value && !defaultSizes.includes(opt.value)) {
        set.add(opt.value);
      }
    });
    (products || []).forEach((p) => {
      if (p.room_size && !defaultSizes.includes(p.room_size)) {
        set.add(p.room_size);
      }
    });
    return Array.from(set);
  }, [products, customTaxonomyOptions]);

  // Local Taxonomy States (synchronous UI updates)
  const [localBrands, setLocalBrands] = useState<Brand[]>(brands);
  const [localCategories, setLocalCategories] = useState<ProductCategory[]>(categories);
  const [localFamilies, setLocalFamilies] = useState<ProductFamily[]>(families);

  // In-Memory Staged New Items (STRICT RULE: Pushed to DB ONLY when "Create Hardware Product" is clicked)
  const [stagedNewBrands, setStagedNewBrands] = useState<
    { id: string; name: string; slug: string; country: string }[]
  >([]);
  const [stagedNewCategories, setStagedNewCategories] = useState<
    { id: string; name: string; slug: string; icon: string }[]
  >([]);
  const [stagedNewFamilies, setStagedNewFamilies] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  // Inline Creation Popovers/Modals State
  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandCountry, setNewBrandCountry] = useState('');

  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('category');

  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');

  // Form State
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [modelName, setModelName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [tagline, setTagline] = useState('');

  // Sizing & Capacity (supports presets + custom values)
  const [roomSize, setRoomSize] = useState('Medium');
  const [isCustomRoomSize, setIsCustomRoomSize] = useState(false);
  const [customRoomSize, setCustomRoomSize] = useState('');

  const [seatingCapacity, setSeatingCapacity] = useState('10–16 People');
  const [isCustomSeating, setIsCustomSeating] = useState(false);
  const [customSeating, setCustomSeating] = useState('');

  const [status, setStatus] = useState<'Active' | 'Discontinued' | 'Upcoming'>('Active');
  const [isFeatured, setIsFeatured] = useState(false);

  // Built-in Section Visibility Controls
  const [showImagesSection, setShowImagesSection] = useState(true);
  const [showDocsSection, setShowDocsSection] = useState(true);
  const [showSpecsSection, setShowSpecsSection] = useState(true);
  const [showCertificationsSection, setShowCertificationsSection] = useState(true);
  const [showFeaturesSection, setShowFeaturesSection] = useState(true);

  // Dynamic Custom Form Sections State
  const [customSections, setCustomSections] = useState<CustomFormSection[]>([]);

  // Staged Media: Images & Technical Documents
  const [stagedImages, setStagedImages] = useState<StagedMediaItem[]>([]);
  const [stagedDocs, setStagedDocs] = useState<StagedMediaItem[]>([]);

  // Input refs for file triggers
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Specifications & Features State
  const [specGroups, setSpecGroups] = useState<ProductSpecGroup[]>(DEFAULT_SPEC_GROUPS);
  const [features, setFeatures] = useState<ProductFeature[]>(DEFAULT_FEATURES);

  // Certifications Options & Selected Badges
  const [certOptions, setCertOptions] = useState<{ name: string; badge_color: string; icon: string }[]>([
    { name: 'Microsoft Teams Rooms', badge_color: '#6264A7', icon: 'groups' },
    { name: 'Zoom Rooms', badge_color: '#0B5CFF', icon: 'videocam' },
    { name: 'Cisco Webex', badge_color: '#005FB7', icon: 'hub' },
    { name: 'Google Meet', badge_color: '#00832D', icon: 'video_call' },
    { name: 'Barco ClickShare Approved', badge_color: '#E30613', icon: 'cast' },
    { name: 'Tencent Meeting', badge_color: '#005FB7', icon: 'hub' },
    { name: 'Universal USB UVC', badge_color: '#05162e', icon: 'usb' },
  ]);

  const [selectedCerts, setSelectedCerts] = useState<string[]>([
    'Microsoft Teams Rooms',
    'Zoom Rooms',
  ]);
  const [newCertInput, setNewCertInput] = useState('');

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

  // Synchronize modal state on open / edit / close
  useEffect(() => {
    if (isOpen) {
      // Sync props to local taxonomy lists
      setLocalBrands(brands);
      setLocalCategories(categories);
      setLocalFamilies(families);
      setStagedNewBrands([]);
      setStagedNewCategories([]);
      setStagedNewFamilies([]);

      if (editProduct) {
        setBrandId(editProduct.brand_id);
        setCategoryId(editProduct.category_id);
        setFamilyId(editProduct.family_id || '');
        setModelName(editProduct.model_name);
        setSlug(editProduct.slug);
        setSku(editProduct.sku_part_number || '');
        setTagline(editProduct.tagline || '');

        const rSize = editProduct.room_size || 'Medium';
        const defaultSizes = ['Huddle', 'Small', 'Medium', 'Large', 'Auditorium'];
        if (!defaultSizes.includes(rSize)) {
          setIsCustomRoomSize(true);
          setCustomRoomSize(rSize);
          setRoomSize('Custom');
        } else {
          setRoomSize(rSize);
        }

        const sCap = editProduct.seating_capacity || '10–16 People';
        const defaultCapacities = ['2–4 People', '4–8 People', '8–10 People', '10–16 People', '16+ People', 'Universal'];
        if (!defaultCapacities.includes(sCap)) {
          setIsCustomSeating(true);
          setCustomSeating(sCap);
          setSeatingCapacity('Custom');
        } else {
          setSeatingCapacity(sCap);
        }

        setStatus(editProduct.status || 'Active');
        setIsFeatured(editProduct.is_featured);
        setSpecGroups(editProduct.specifications || []);
        setFeatures(editProduct.features || []);

        const certs = editProduct.certifications || [];
        setSelectedCerts(certs.map((c) => c.name));
        certs.forEach((c) => {
          if (!certOptions.some((opt) => opt.name.toLowerCase() === c.name.toLowerCase())) {
            setCertOptions((prev) => [...prev, { name: c.name, badge_color: '#005FB7', icon: 'verified' }]);
          }
        });

        // Populate staged images and docs
        const existingMedia = editProduct.media || [];
        const imgItems: StagedMediaItem[] = [];
        const docItems: StagedMediaItem[] = [];

        if (editProduct.hero_image_url) {
          const heroAlreadyInMedia = existingMedia.some((m) => m.url === editProduct.hero_image_url);
          if (!heroAlreadyInMedia) {
            imgItems.push({
              url: editProduct.hero_image_url,
              previewUrl: editProduct.hero_image_url,
              title: 'Hero Cover Image',
              type: 'image',
              isHero: true,
              isUploaded: true,
              sourceMode: 'url',
            });
          }
        }

        existingMedia.forEach((m) => {
          const isHeroImg = m.url === editProduct.hero_image_url;
          const item: StagedMediaItem = {
            id: m.id,
            url: m.url,
            previewUrl: m.url,
            title: m.title,
            type: m.type,
            isHero: isHeroImg,
            isUploaded: true,
            sourceMode: 'url',
          };
          if (m.type === 'image') {
            imgItems.push(item);
          } else {
            docItems.push(item);
          }
        });

        setStagedImages(imgItems);
        setStagedDocs(docItems);

        setShowImagesSection(true);
        setShowDocsSection(true);
        setShowSpecsSection(true);
        setShowCertificationsSection(true);
        setShowFeaturesSection(true);
        setCustomSections([]);
      } else {
        // ALWAYS Reset back to full default initial state with example data when opening Add mode!
        setBrandId('');
        setCategoryId('');
        setFamilyId('');
        setModelName('');
        setSlug('');
        setSku('');
        setTagline('');
        setRoomSize('Medium');
        setIsCustomRoomSize(false);
        setCustomRoomSize('');
        setSeatingCapacity('10–16 People');
        setIsCustomSeating(false);
        setCustomSeating('');
        setStatus('Active');
        setIsFeatured(false);
        setStagedImages([]);
        setStagedDocs([]);
        setShowImagesSection(true);
        setShowDocsSection(true);
        setShowSpecsSection(true);
        setShowCertificationsSection(true);
        setShowFeaturesSection(true);
        setCustomSections([]);

        // Restore complete example spec groups for admin guidance
        setSpecGroups(DEFAULT_SPEC_GROUPS);
        setFeatures(DEFAULT_FEATURES);
        setSelectedCerts(['Microsoft Teams Rooms', 'Zoom Rooms']);
      }
    }
  }, [editProduct, isOpen, brands, categories, families]);

  // Handlers for Creating Entirely New Custom Sections
  const handleAddCustomSection = () => {
    const newSec: CustomFormSection = {
      id: 'custom-sec-' + Date.now(),
      title: 'Thermal & Electrical Power Specifications',
      icon: 'bolt',
      items: [
        { label: 'Power Consumption (Max)', value: '350 Watts / 1194 BTU/hr' },
        { label: 'Voltage Range', value: '100–240V AC, 50/60 Hz' },
      ],
    };
    setCustomSections((prev) => [...prev, newSec]);
  };

  const handleRemoveCustomSection = (id: string) => {
    setCustomSections((prev) => prev.filter((sec) => sec.id !== id));
  };

  const handleUpdateCustomSectionMeta = (
    id: string,
    field: 'title' | 'icon',
    value: string
  ) => {
    setCustomSections((prev) =>
      prev.map((sec) => (sec.id === id ? { ...sec, [field]: value } : sec))
    );
  };

  const handleAddCustomSectionItem = (sectionId: string) => {
    setCustomSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              items: [...sec.items, { label: 'New Requirement', value: 'Value' }],
            }
          : sec
      )
    );
  };

  const handleRemoveCustomSectionItem = (sectionId: string, itemIdx: number) => {
    setCustomSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const updatedItems = [...sec.items];
        updatedItems.splice(itemIdx, 1);
        return { ...sec, items: updatedItems };
      })
    );
  };

  const handleCustomSectionItemChange = (
    sectionId: string,
    itemIdx: number,
    field: 'label' | 'value',
    value: string
  ) => {
    setCustomSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const updatedItems = [...sec.items];
        updatedItems[itemIdx][field] = value;
        return { ...sec, items: updatedItems };
      })
    );
  };

  // IN-MEMORY STAGING HANDLERS FOR BRANDS, CATEGORIES, FAMILIES
  // Strict Constraint: ZERO Database queries executed until "Create Hardware Product" is clicked!
  const handleCreateBrand = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!newBrandName.trim()) return;

    const bSlug = newBrandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tempId = 'staged-brand-' + Date.now();
    const stagedItem = {
      id: tempId,
      name: newBrandName.trim(),
      slug: bSlug,
      country: newBrandCountry.trim() || 'Global',
    };

    setStagedNewBrands((prev) => [...prev, stagedItem]);
    setLocalBrands((prev) => [...prev, stagedItem as any]);
    setBrandId(tempId);
    setShowAddBrandModal(false);
    setNewBrandName('');
    setNewBrandCountry('');
  };

  const handleCreateCategory = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!newCategoryName.trim()) return;

    const cSlug = newCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tempId = 'staged-cat-' + Date.now();
    const stagedItem = {
      id: tempId,
      name: newCategoryName.trim(),
      slug: cSlug,
      icon: newCategoryIcon || 'category',
    };

    setStagedNewCategories((prev) => [...prev, stagedItem]);
    setLocalCategories((prev) => [...prev, stagedItem as any]);
    setCategoryId(tempId);
    setShowAddCategoryModal(false);
    setNewCategoryName('');
  };

  const handleCreateFamily = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!newFamilyName.trim()) return;

    const fSlug = newFamilyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tempId = 'staged-family-' + Date.now();
    const stagedItem = {
      id: tempId,
      name: newFamilyName.trim(),
      slug: fSlug,
    };

    setStagedNewFamilies((prev) => [...prev, stagedItem]);
    setLocalFamilies((prev) => [...prev, stagedItem as any]);
    setFamilyId(tempId);
    setShowAddFamilyModal(false);
    setNewFamilyName('');
  };

  if (!isOpen) return null;

  const filteredFamilies = localFamilies.filter(
    (f) => !brandId || f.brand_id === brandId || (f as any).id?.startsWith('staged-')
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

  // Image Upload & URL Handlers
  const handleImageFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newItems: StagedMediaItem[] = [];

    for (let idx = 0; idx < fileList.length; idx++) {
      const originalFile = fileList[idx];
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

  const handleRemoveImageItem = (index: number) => {
    setStagedImages((prev) => {
      const updated = prev.filter((_, idx) => idx !== index);
      if (updated.length > 0 && !updated.some((item) => item.isHero)) {
        updated[0].isHero = true;
      }
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

  // Document Upload & URL Handlers
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
      title: 'Technical Datasheet / Wiring Diagram',
      type: 'pdf_datasheet',
      isUploaded: true,
      sourceMode: 'url',
    };
    setStagedDocs((prev) => [...prev, newDoc]);
  };

  const handleRemoveDocItem = (index: number) => {
    setStagedDocs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateDocField = (
    index: number,
    field: 'title' | 'url' | 'type',
    value: string
  ) => {
    setStagedDocs((prev) => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      return updated;
    });
  };

  // Specification Group & Item Handlers
  const handleAddSpecGroup = () => {
    setSpecGroups([
      ...specGroups,
      {
        group: 'New Spec Group',
        items: [{ label: 'Parameter', value: 'Value' }],
      },
    ]);
  };

  const handleRemoveSpecGroup = (groupIndex: number) => {
    const updated = specGroups.filter((_, idx) => idx !== groupIndex);
    setSpecGroups(updated);
  };

  const handleAddSpecItem = (groupIndex: number) => {
    const updated = [...specGroups];
    updated[groupIndex].items.push({ label: 'New Spec', value: 'Spec Value' });
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

  // Feature Handlers
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

  // Certification Handlers
  const handleToggleCert = (certName: string) => {
    if (selectedCerts.includes(certName)) {
      setSelectedCerts(selectedCerts.filter((c) => c !== certName));
    } else {
      setSelectedCerts([...selectedCerts, certName]);
    }
  };

  const handleAddCustomCert = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!newCertInput.trim()) return;
    const name = newCertInput.trim();
    if (!certOptions.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setCertOptions((prev) => [...prev, { name, badge_color: '#005FB7', icon: 'verified' }]);
    }
    if (!selectedCerts.includes(name)) {
      setSelectedCerts((prev) => [...prev, name]);
    }
    setNewCertInput('');
  };

  const handleRemoveCertOption = (certName: string) => {
    setCertOptions((prev) => prev.filter((c) => c.name !== certName));
    setSelectedCerts((prev) => prev.filter((c) => c !== certName));
  };

  // Submit Pipeline: ALL Database SQL inserts and binary storage uploads happen ONLY HERE!
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

      // 0. Persist Staged Taxonomy Items (Brands, Categories, Families) ONLY NOW on submit!
      let realBrandId = brandId;
      if (brandId.startsWith('staged-brand-')) {
        const stagedB = stagedNewBrands.find((b) => b.id === brandId);
        if (stagedB) {
          setUploadStatusText(`Creating brand "${stagedB.name}" in database...`);
          const { data: newB, error: bErr } = await supabase
            .from('brands')
            .insert([{
              name: stagedB.name,
              slug: stagedB.slug,
              country: stagedB.country,
              is_active: true,
            }])
            .select()
            .single();
          if (bErr) throw bErr;
          realBrandId = newB.id;
        }
      }

      let realCategoryId = categoryId;
      if (categoryId.startsWith('staged-cat-')) {
        const stagedC = stagedNewCategories.find((c) => c.id === categoryId);
        if (stagedC) {
          setUploadStatusText(`Creating category "${stagedC.name}" in database...`);
          const { data: newC, error: cErr } = await supabase
            .from('product_categories')
            .insert([{
              name: stagedC.name,
              slug: stagedC.slug,
              icon: stagedC.icon,
              is_active: true,
            }])
            .select()
            .single();
          if (cErr) throw cErr;
          realCategoryId = newC.id;
        }
      }

      let realFamilyId = familyId;
      if (familyId && familyId.startsWith('staged-family-')) {
        const stagedF = stagedNewFamilies.find((f) => f.id === familyId);
        if (stagedF) {
          setUploadStatusText(`Creating product family "${stagedF.name}" in database...`);
          const { data: newF, error: fErr } = await supabase
            .from('product_families')
            .insert([{
              brand_id: realBrandId || null,
              category_id: realCategoryId || null,
              name: stagedF.name,
              slug: stagedF.slug,
            }])
            .select()
            .single();
          if (fErr) throw fErr;
          realFamilyId = newF.id;
        }
      }

      // 1. Process & Upload Image Files
      const finalImages: {
        id?: string;
        url: string;
        title: string;
        type: ProductMediaType;
        isHero: boolean;
        metadata?: any;
      }[] = [];

      if (showImagesSection) {
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
              metadata: { size: uploadRes.size, mimeType: uploadRes.mimeType },
            });
          } else if (item.url) {
            finalImages.push({
              id: item.id,
              url: item.url,
              title: item.title,
              type: 'image',
              isHero: !!item.isHero,
            });
          }
        }
      }

      // 2. Process & Upload Technical Document Files
      const finalDocs: {
        id?: string;
        url: string;
        title: string;
        type: ProductMediaType;
        metadata?: any;
      }[] = [];

      if (showDocsSection) {
        for (let i = 0; i < stagedDocs.length; i++) {
          const item = stagedDocs[i];
          if (item.file) {
            setUploadStatusText(`Uploading technical document ${i + 1} of ${stagedDocs.length}...`);
            const uploadRes = await uploadProductFile(
              item.file,
              folderKey,
              item.file.name
            );
            finalDocs.push({
              id: item.id,
              url: uploadRes.publicUrl,
              title: item.title,
              type: item.type,
              metadata: { size: uploadRes.size, mimeType: uploadRes.mimeType },
            });
          } else if (item.url) {
            finalDocs.push({
              id: item.id,
              url: item.url,
              title: item.title,
              type: item.type,
            });
          }
        }
      }

      // 3. Resolve Hero Image URL
      const heroItem = finalImages.find((img) => img.isHero) || finalImages[0];
      const heroUrl = heroItem ? heroItem.url : '';

      // 4. Resolve Sizing Specs
      const finalRoomSize = isCustomRoomSize ? customRoomSize || 'Medium' : roomSize;
      const finalSeatingCapacity = isCustomSeating ? customSeating || '10–16 People' : seatingCapacity;

      // Persist custom seating capacity & room size to custom_taxonomy_options table in PostgreSQL
      if (isCustomSeating && customSeating.trim()) {
        try {
          await supabase.from('custom_taxonomy_options').upsert(
            [{ type: 'seating_capacity', value: customSeating.trim() }],
            { onConflict: 'value' }
          );
        } catch (err) {
          console.warn('Notice: custom_taxonomy_options upsert seating_capacity:', err);
        }
      }

      if (isCustomRoomSize && customRoomSize.trim()) {
        try {
          await supabase.from('custom_taxonomy_options').upsert(
            [{ type: 'room_size', value: customRoomSize.trim() }],
            { onConflict: 'value' }
          );
        } catch (err) {
          console.warn('Notice: custom_taxonomy_options upsert room_size:', err);
        }
      }

      // 5. Structure Certifications payload
      const finalCertifications: ProductCertification[] = selectedCerts.map((certName) => {
        const matched = certOptions.find((c) => c.name === certName);
        return {
          name: certName,
          badge_color: matched ? matched.badge_color : '#005FB7',
          icon: matched ? matched.icon : 'verified',
        };
      });

      // 6. Combine built-in specGroups and customSections
      const convertedCustomSections: ProductSpecGroup[] = customSections.map((sec) => ({
        group: sec.title,
        items: sec.items,
      }));

      const finalSpecifications = [
        ...(showSpecsSection ? specGroups : []),
        ...convertedCustomSections,
      ];

      // 7. Database Upsert for Product Row
      setUploadStatusText('Saving product metadata in database...');

      const productPayload = {
        brand_id: realBrandId,
        category_id: realCategoryId,
        family_id: realFamilyId || null,
        model_name: modelName,
        slug: slug,
        sku_part_number: sku || null,
        tagline: tagline || null,
        room_size: finalRoomSize,
        seating_capacity: finalSeatingCapacity,
        status: status,
        hero_image_url: heroUrl || null,
        specifications: finalSpecifications,
        features: showFeaturesSection ? features : [],
        certifications: showCertificationsSection ? finalCertifications : [],
        is_featured: isFeatured,
      };

      let productId = editProduct?.id;

      if (editProduct && productId) {
        const { error: updateErr } = await supabase
          .from('products')
          .update(productPayload)
          .eq('id', productId);
        if (updateErr) throw updateErr;
      } else {
        const { data: newProd, error: insertErr } = await supabase
          .from('products')
          .insert([productPayload])
          .select()
          .single();
        if (insertErr) throw insertErr;
        productId = newProd.id;
      }

      // 8. Upsert Product Media rows
      setUploadStatusText('Linking media and document assets...');
      const savedMediaIds: string[] = [];

      for (const img of finalImages) {
        const imgPayload = {
          product_id: productId,
          title: img.title || 'Product Image',
          type: 'image',
          url: img.url,
          metadata: img.metadata || {},
        };
        if (img.id) {
          await supabase.from('product_media').update(imgPayload).eq('id', img.id);
          savedMediaIds.push(img.id);
        } else {
          const { data: newMedia } = await supabase.from('product_media').insert([imgPayload]).select().single();
          if (newMedia) savedMediaIds.push(newMedia.id);
        }
      }

      for (const doc of finalDocs) {
        const docPayload = {
          product_id: productId,
          title: doc.title || 'Technical Document',
          type: doc.type,
          url: doc.url,
          metadata: doc.metadata || {},
        };
        if (doc.id) {
          await supabase.from('product_media').update(docPayload).eq('id', doc.id);
          savedMediaIds.push(doc.id);
        } else {
          const { data: newMedia } = await supabase.from('product_media').insert([docPayload]).select().single();
          if (newMedia) savedMediaIds.push(newMedia.id);
        }
      }

      // 9. Real DB Delete for removed media items when editing an existing product
      if (editProduct && editProduct.media) {
        const mediaToDelete = editProduct.media.filter(
          (m) => !savedMediaIds.includes(m.id)
        );

        if (mediaToDelete.length > 0) {
          const idsToDelete = mediaToDelete.map((m) => m.id);
          await supabase.from('product_media').delete().in('id', idsToDelete);

          const storagePathsToDelete: string[] = [];
          for (const m of mediaToDelete) {
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
            } catch (err) {
              console.warn('Storage cleanup notice:', err);
            }
          }
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('product_catalog_updated'));
        if ('BroadcastChannel' in window) {
          try {
            const bc = new BroadcastChannel('ekms_library_sync_channel');
            bc.postMessage({ type: 'CATALOG_MUTATION' });
            bc.close();
          } catch {
            // Ignore
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
      <div className="bg-[#f7f9fc] border border-[#c5c6ce] rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">
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
                Upload high-res product photos, pin hero images, attach CAD/PDF diagrams, and create custom form sections.
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

          {/* Form Section Manager & Custom Section Creator Bar */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-[#05162e] uppercase font-mono">
              <span className="material-symbols-outlined text-[16px] text-[#005FB7]">dashboard_customize</span>
              <span>Form Section Manager:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImagesSection(!showImagesSection)}
                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 border transition-all ${
                  showImagesSection
                    ? 'bg-[#005FB7] text-white border-[#005FB7]'
                    : 'bg-[#eceef1] text-[#75777e] border-[#c5c6ce] hover:text-[#05162e]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showImagesSection ? 'check_box' : 'add'}
                </span>
                <span>3. Product Images</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDocsSection(!showDocsSection)}
                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 border transition-all ${
                  showDocsSection
                    ? 'bg-[#005FB7] text-white border-[#005FB7]'
                    : 'bg-[#eceef1] text-[#75777e] border-[#c5c6ce] hover:text-[#05162e]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showDocsSection ? 'check_box' : 'add'}
                </span>
                <span>4. Tech Docs & CAD</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSpecsSection(!showSpecsSection)}
                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 border transition-all ${
                  showSpecsSection
                    ? 'bg-[#005FB7] text-white border-[#005FB7]'
                    : 'bg-[#eceef1] text-[#75777e] border-[#c5c6ce] hover:text-[#05162e]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showSpecsSection ? 'check_box' : 'add'}
                </span>
                <span>5. Specifications</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCertificationsSection(!showCertificationsSection)}
                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 border transition-all ${
                  showCertificationsSection
                    ? 'bg-[#005FB7] text-white border-[#005FB7]'
                    : 'bg-[#eceef1] text-[#75777e] border-[#c5c6ce] hover:text-[#05162e]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showCertificationsSection ? 'check_box' : 'add'}
                </span>
                <span>6. Certifications</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFeaturesSection(!showFeaturesSection)}
                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 border transition-all ${
                  showFeaturesSection
                    ? 'bg-[#005FB7] text-white border-[#005FB7]'
                    : 'bg-[#eceef1] text-[#75777e] border-[#c5c6ce] hover:text-[#05162e]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showFeaturesSection ? 'check_box' : 'add'}
                </span>
                <span>7. Key Features</span>
              </button>

              <button
                type="button"
                onClick={handleAddCustomSection}
                className="px-3 py-1 bg-[#05162e] text-white hover:bg-[#005FB7] rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs ml-2"
                title="Create an entirely custom section with custom parameters"
              >
                <span className="material-symbols-outlined text-[15px]">extension</span>
                <span>Add Custom Form Section</span>
              </button>
            </div>
          </div>

          {/* Section 1: Classification & Taxonomy */}
          <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
              <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <span className="material-symbols-outlined text-[16px] text-[#005FB7]">account_tree</span>
                1. Hardware Classification & Brand Hierarchy
              </h3>
              <span className="text-[11px] text-[#75777e]">Required for catalog taxonomy</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#05162e]">
                    Brand <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddBrandModal(true)}
                    className="text-[11px] font-bold text-[#005FB7] hover:underline flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[13px]">add_circle</span>
                    <span>New Brand</span>
                  </button>
                </div>
                <div className="relative group">
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    required
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="">Select Manufacturer Brand</option>
                    {localBrands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({(b as any).country || 'Global'})
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] group-hover:text-[#005FB7] pointer-events-none transition-colors">
                    unfold_more
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#05162e]">
                    Discipline Category <span className="text-[#ba1a1a]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(true)}
                    className="text-[11px] font-bold text-[#005FB7] hover:underline flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[13px]">add_circle</span>
                    <span>New Category</span>
                  </button>
                </div>
                <div className="relative group">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none transition-all"
                  >
                    <option value="">Select Category</option>
                    {localCategories.map((c) => (
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#05162e]">
                    Product Family / Line
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddFamilyModal(true)}
                    className="text-[11px] font-bold text-[#005FB7] hover:underline flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[13px]">add_circle</span>
                    <span>New Line/Series</span>
                  </button>
                </div>
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
              <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
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

              {/* Dynamic Seating Capacity Matrix */}
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Seating Capacity Matrix
                </label>
                <div className="flex flex-col gap-1.5">
                  <div className="relative group">
                    <select
                      value={seatingCapacity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSeatingCapacity(val);
                        setIsCustomSeating(val === 'Custom');
                        if (val !== 'Custom') setCustomSeating('');
                      }}
                      className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none"
                    >
                      <option value="2–4 People">2–4 People (Huddle / Phone Booth)</option>
                      <option value="4–8 People">4–8 People (Small Focus Room)</option>
                      <option value="8–10 People">8–10 People (Small to Medium Room)</option>
                      <option value="10–16 People">10–16 People (Medium to Large Room)</option>
                      <option value="16+ People">16+ People (Large Boardroom / Auditorium)</option>
                      <option value="Universal">Universal / Scalable Array</option>
                      {activeDbCapacities.length > 0 && (
                        <optgroup label="Custom Capacities in Database">
                          {activeDbCapacities.map((cap) => (
                            <option key={cap} value={cap}>
                              {cap}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <option value="Custom">+ Custom Seating Capacity...</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] pointer-events-none">
                      unfold_more
                    </span>
                  </div>

                  {isCustomSeating && (
                    <input
                      type="text"
                      value={customSeating}
                      onChange={(e) => setCustomSeating(e.target.value)}
                      placeholder="Enter custom seating capacity (e.g., 24–32 People)"
                      className="w-full bg-white border border-[#005FB7] rounded px-3 py-1.5 text-xs text-[#05162e] font-semibold"
                    />
                  )}
                </div>
              </div>

              {/* Dynamic Room Size Classification */}
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">
                  Room Size Classification
                </label>
                <div className="flex flex-col gap-1.5">
                  <div className="relative group">
                    <select
                      value={roomSize}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRoomSize(val);
                        setIsCustomRoomSize(val === 'Custom');
                        if (val !== 'Custom') setCustomRoomSize('');
                      }}
                      className="w-full appearance-none bg-white border border-[#c5c6ce] hover:border-[#005FB7] focus:border-[#005FB7] rounded-lg pl-3 pr-8 py-2 text-xs font-semibold text-[#05162e] cursor-pointer shadow-2xs focus:outline-none"
                    >
                      <option value="Huddle">Huddle Space (Up to 100 sq ft)</option>
                      <option value="Small">Small Room (100–200 sq ft)</option>
                      <option value="Medium">Medium Room (200–400 sq ft)</option>
                      <option value="Large">Large Conference (400–800 sq ft)</option>
                      <option value="Auditorium">Auditorium / Multi-purpose (800+ sq ft)</option>
                      {activeDbRoomSizes.length > 0 && (
                        <optgroup label="Custom Room Sizes in Database">
                          {activeDbRoomSizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <option value="Custom">+ Custom Room Dimension...</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[18px] text-[#75777e] pointer-events-none">
                      unfold_more
                    </span>
                  </div>

                  {isCustomRoomSize && (
                    <input
                      type="text"
                      value={customRoomSize}
                      onChange={(e) => setCustomRoomSize(e.target.value)}
                      placeholder="Enter custom room size (e.g. Executive Boardroom 1,200 sq ft)"
                      className="w-full bg-white border border-[#005FB7] rounded px-3 py-1.5 text-xs text-[#05162e] font-semibold"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Product Images & Hero Card Showcase */}
          {showImagesSection && (
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
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
                    className="px-3 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    <span>Upload Image Files</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-3 py-1.5 bg-white border border-[#c5c6ce] text-[#05162e] hover:bg-[#eceef1] rounded text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">link</span>
                    <span>Add via URL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImagesSection(false)}
                    className="px-2 py-1 bg-[#eceef1] text-[#75777e] hover:text-[#ba1a1a] rounded text-[11px] font-bold"
                  >
                    Hide Section
                  </button>
                </div>
              </div>

              {/* Images Grid */}
              {stagedImages.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {stagedImages.map((img, index) => (
                    <div
                      key={index}
                      className={`border rounded-lg p-3 flex flex-col gap-2 relative transition-all ${
                        img.isHero
                          ? 'border-[#005FB7] bg-[#d6e3ff]/20 shadow-xs'
                          : 'border-[#c5c6ce] bg-[#f7f9fc]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => handlePinHeroImage(index)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
                            img.isHero
                              ? 'bg-[#005FB7] text-white shadow-xs'
                              : 'bg-white border border-[#c5c6ce] text-[#75777e] hover:border-[#005FB7]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[12px]">
                            {img.isHero ? 'star' : 'star_outline'}
                          </span>
                          <span>{img.isHero ? 'Hero Cover' : 'Pin Hero'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveImageItem(index)}
                          className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>

                      {img.previewUrl || img.url ? (
                        <div className="w-full h-32 bg-white rounded border border-[#c5c6ce] overflow-hidden flex items-center justify-center p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.previewUrl || img.url}
                            alt={img.title}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-32 bg-white rounded border border-dashed border-[#c5c6ce] flex items-center justify-center text-xs text-[#75777e]">
                          Paste image URL below
                        </div>
                      )}

                      <input
                        type="text"
                        value={img.title}
                        onChange={(e) => {
                          const updated = [...stagedImages];
                          updated[index].title = e.target.value;
                          setStagedImages(updated);
                        }}
                        placeholder="Caption / Angle Title"
                        className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-semibold text-[#05162e]"
                      />

                      {img.sourceMode === 'url' && (
                        <input
                          type="text"
                          value={img.url}
                          onChange={(e) => handleUpdateImageUrl(index, e.target.value)}
                          placeholder="https://... image URL"
                          className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-mono text-[#191c1e]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 border border-dashed border-[#c5c6ce] rounded-lg text-center bg-[#f7f9fc] flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[32px] text-[#75777e]">add_a_photo</span>
                  <p className="text-xs text-[#75777e]">
                    No images added yet. Click <strong>Upload Image Files</strong> or <strong>Add via URL</strong> above.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Technical Documents, CAD & Wiring Schematics */}
          {showDocsSection && (
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
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
                    accept=".pdf,.drawio,.xml,.dwg,.dxf,.step,.cad,.puml,.mp4,.doc,.docx,.txt"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => docFileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    <span>Upload Files</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddDocUrl}
                    className="px-3 py-1.5 bg-white border border-[#c5c6ce] text-[#05162e] hover:bg-[#eceef1] rounded text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_link</span>
                    <span>Add Document URL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDocsSection(false)}
                    className="px-2 py-1 bg-[#eceef1] text-[#75777e] hover:text-[#ba1a1a] rounded text-[11px] font-bold"
                  >
                    Hide Section
                  </button>
                </div>
              </div>

              {/* Documents List */}
              {stagedDocs.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {stagedDocs.map((doc, dIdx) => (
                    <div
                      key={dIdx}
                      className="p-3 bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 rounded bg-[#005FB7]/10 text-[#005FB7] flex items-center justify-center font-bold">
                          <span className="material-symbols-outlined text-[18px]">
                            {doc.type === 'pdf_datasheet' ? 'picture_as_pdf' : doc.type === 'drawio_svg' ? 'account_tree' : 'description'}
                          </span>
                        </div>
                        <div className="flex flex-col flex-1 gap-1">
                          <input
                            type="text"
                            value={doc.title}
                            onChange={(e) => handleUpdateDocField(dIdx, 'title', e.target.value)}
                            placeholder="Document Title (e.g. Architectural Datasheet)"
                            className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-bold text-[#05162e]"
                          />
                          {doc.sourceMode === 'url' && (
                            <input
                              type="text"
                              value={doc.url}
                              onChange={(e) => handleUpdateDocField(dIdx, 'url', e.target.value)}
                              placeholder="https://... file URL"
                              className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-mono text-[#191c1e]"
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={doc.type}
                          onChange={(e) => handleUpdateDocField(dIdx, 'type', e.target.value as any)}
                          className="bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-semibold text-[#05162e]"
                        >
                          <option value="pdf_datasheet">PDF Datasheet</option>
                          <option value="drawio_svg">Draw.io / Wiring Diagram</option>
                          <option value="cad">CAD / DWG 2D/3D</option>
                          <option value="manual">User Manual</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocItem(dIdx)}
                          className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-1 rounded"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#75777e] italic text-center py-2">
                  No supplementary engineering files attached yet. Click "Upload Files" or "Add Document URL" above.
                </p>
              )}
            </div>
          )}

          {/* Section 5: Technical Specifications Builder */}
          {showSpecsSection && (
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <span className="material-symbols-outlined text-[16px] text-[#005FB7]">tune</span>
                    5. Technical Specifications Builder (Structured Groups)
                  </h3>
                  <p className="text-[11px] text-[#75777e]">
                    Grouped engineering parameters. Add or remove entire spec groups cleanly.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddSpecGroup}
                    className="px-2.5 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span>Add Spec Group</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSpecsSection(false)}
                    className="px-2 py-1 bg-[#eceef1] text-[#75777e] hover:text-[#ba1a1a] rounded text-[11px] font-bold"
                    title="Remove Section"
                  >
                    Hide Section
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {specGroups.map((grp, gIdx) => (
                  <div
                    key={gIdx}
                    className="bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg p-4 flex flex-col gap-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-[#e6e8eb] pb-2">
                      <input
                        type="text"
                        value={grp.group}
                        onChange={(e) => handleSpecGroupTitleChange(gIdx, e.target.value)}
                        placeholder="Group Title (e.g. Acoustics)"
                        className="bg-white border border-[#c5c6ce] rounded px-2.5 py-1 text-xs font-bold text-[#05162e] focus:border-[#005FB7] focus:outline-none flex-1 max-w-sm"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddSpecItem(gIdx)}
                          className="text-xs text-[#005FB7] hover:underline font-bold flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[14px]">add_circle</span>
                          Add Parameter
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSpecGroup(gIdx)}
                          className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 border border-[#ffb4ab]"
                          title="Remove entire spec group"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                          <span>Delete Group</span>
                        </button>
                      </div>
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
          )}

          {/* Section 6: Ecosystem Platform Certifications */}
          {showCertificationsSection && (
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <span className="material-symbols-outlined text-[16px] text-[#005FB7]">verified</span>
                    6. Ecosystem Platform Certifications
                  </h3>
                  <p className="text-[11px] text-[#75777e]">
                    Toggle certifications or add custom platforms (e.g. Barco, Q-SYS, Extron NaV).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCertificationsSection(false)}
                  className="px-2 py-1 bg-[#eceef1] text-[#75777e] hover:text-[#ba1a1a] rounded text-[11px] font-bold"
                >
                  Hide Section
                </button>
              </div>

              {/* Add Custom Certification Bar */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCertInput}
                  onChange={(e) => setNewCertInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomCert(e as any);
                    }
                  }}
                  placeholder="Add Custom Certification (e.g. Extron NaV, Q-SYS Core)"
                  className="flex-1 bg-white border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#05162e] focus:border-[#005FB7] focus:outline-none font-semibold"
                />
                <button
                  type="button"
                  onClick={(e) => handleAddCustomCert(e as any)}
                  className="px-3 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  <span>Add Cert</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {certOptions.map((c) => {
                  const selected = selectedCerts.includes(c.name);
                  return (
                    <div
                      key={c.name}
                      className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                        selected
                          ? 'bg-[#005FB7] text-white border-[#005FB7] shadow-xs'
                          : 'bg-[#f7f9fc] text-[#45474c] border-[#c5c6ce] hover:border-[#005FB7]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleCert(c.name)}
                        className="flex items-center gap-1.5 text-left flex-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {selected ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <span>{c.name}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveCertOption(c.name)}
                        className="hover:opacity-75 p-0.5 rounded ml-1"
                        title="Remove certification"
                      >
                        <span className="material-symbols-outlined text-[13px]">close</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 7: Key Features & Architectural Highlights */}
          {showFeaturesSection && (
            <div className="bg-white border border-[#c5c6ce] rounded-lg p-5 flex flex-col gap-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#eceef1] pb-2.5">
                <div>
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <span className="material-symbols-outlined text-[16px] text-[#005FB7]">star</span>
                    7. Key Features & Architectural Highlights
                  </h3>
                  <p className="text-[11px] text-[#75777e]">
                    Highlight key engineering capabilities or architectural deployment benefits.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="px-2.5 py-1 bg-[#eceef1] hover:bg-[#c5c6ce] text-[#05162e] rounded text-xs font-bold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span>Add Feature</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeaturesSection(false)}
                    className="px-2 py-1 bg-[#eceef1] text-[#75777e] hover:text-[#ba1a1a] rounded text-[11px] font-bold"
                  >
                    Hide Section
                  </button>
                </div>
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
          )}

          {/* DYNAMIC ENTIRELY NEW CUSTOM FORM SECTIONS */}
          {customSections.map((sec) => (
            <div
              key={sec.id}
              className="bg-[#f0f4fa] border-2 border-[#005FB7]/40 rounded-lg p-5 flex flex-col gap-4 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-[#005FB7]/20 pb-3">
                <div className="flex items-center gap-3 flex-1 max-w-lg">
                  <div className="relative">
                    <select
                      value={sec.icon}
                      onChange={(e) => handleUpdateCustomSectionMeta(sec.id, 'icon', e.target.value)}
                      className="bg-white border border-[#005FB7] rounded px-2 py-1 text-xs font-mono font-bold text-[#005FB7] appearance-none pr-6 cursor-pointer"
                    >
                      <option value="extension">🧩 Custom</option>
                      <option value="bolt">⚡ Thermal/Power</option>
                      <option value="architecture">📐 Mounting/CAD</option>
                      <option value="shield">🛡️ Compliance/RMA</option>
                      <option value="thermostat">🌡️ Environmental</option>
                      <option value="verified">✅ Standards</option>
                      <option value="description">📜 Procedures</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    value={sec.title}
                    onChange={(e) => handleUpdateCustomSectionMeta(sec.id, 'title', e.target.value)}
                    placeholder="Enter Custom Section Title..."
                    className="bg-white border border-[#005FB7] rounded px-3 py-1.5 text-xs font-bold text-[#05162e] flex-1 focus:ring-1 focus:ring-[#005FB7]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddCustomSectionItem(sec.id)}
                    className="px-2.5 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    <span>Add Parameter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveCustomSection(sec.id)}
                    className="px-2.5 py-1 bg-[#ba1a1a]/10 hover:bg-[#ba1a1a] text-[#ba1a1a] hover:text-white rounded text-xs font-bold border border-[#ba1a1a]/30 transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    <span>Remove Section</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {sec.items.map((item, iIdx) => (
                  <div key={iIdx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) =>
                        handleCustomSectionItemChange(sec.id, iIdx, 'label', e.target.value)
                      }
                      placeholder="Parameter / Key (e.g. Max Heat Output)"
                      className="w-1/3 bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs font-semibold text-[#05162e]"
                    />
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) =>
                        handleCustomSectionItemChange(sec.id, iIdx, 'value', e.target.value)
                      }
                      placeholder="Value (e.g. 1194 BTU/hr)"
                      className="flex-1 bg-white border border-[#c5c6ce] rounded px-2 py-1 text-xs text-[#191c1e]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomSectionItem(sec.id, iIdx)}
                      className="text-[#ba1a1a] hover:bg-[#ba1a1a]/10 p-1 rounded"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

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

      {/* Inline Modal: Add New Brand */}
      {showAddBrandModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#c5c6ce] rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-xs font-bold text-[#05162e] uppercase font-mono">Create New Manufacturer Brand</h3>
              <button type="button" onClick={() => setShowAddBrandModal(false)} className="text-[#75777e] hover:text-[#05162e]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBrand(e as any); } }}
                  placeholder="e.g. Crestron, Q-SYS, Extron, Shure"
                  className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#05162e] font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">HQ Country</label>
                <input
                  type="text"
                  value={newBrandCountry}
                  onChange={(e) => setNewBrandCountry(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBrand(e as any); } }}
                  placeholder="e.g. United States, Germany, Japan"
                  className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#05162e]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowAddBrandModal(false)} className="px-3 py-1.5 rounded bg-[#eceef1] text-xs font-bold">Cancel</button>
                <button type="button" onClick={(e) => handleCreateBrand(e as any)} className="px-4 py-1.5 rounded bg-[#005FB7] text-white text-xs font-bold">Save Brand</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Modal: Add New Discipline Category */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#c5c6ce] rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-xs font-bold text-[#05162e] uppercase font-mono">Create New Discipline Category</h3>
              <button type="button" onClick={() => setShowAddCategoryModal(false)} className="text-[#75777e] hover:text-[#05162e]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(e as any); } }}
                  placeholder="e.g. Unified Communications, DSP Audio"
                  className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#05162e] font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">Icon Symbol Name</label>
                <input
                  type="text"
                  value={newCategoryIcon}
                  onChange={(e) => setNewCategoryIcon(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(e as any); } }}
                  placeholder="category, videocam, mic, hub, router"
                  className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#05162e] font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowAddCategoryModal(false)} className="px-3 py-1.5 rounded bg-[#eceef1] text-xs font-bold">Cancel</button>
                <button type="button" onClick={(e) => handleCreateCategory(e as any)} className="px-4 py-1.5 rounded bg-[#005FB7] text-white text-xs font-bold">Save Category</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Modal: Add New Product Family */}
      {showAddFamilyModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#c5c6ce] rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-xs font-bold text-[#05162e] uppercase font-mono">Create Product Family / Line</h3>
              <button type="button" onClick={() => setShowAddFamilyModal(false)} className="text-[#75777e] hover:text-[#05162e]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-[#05162e] mb-1">Family / Line Name *</label>
                <input
                  type="text"
                  required
                  value={newFamilyName}
                  onChange={(e) => setNewFamilyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateFamily(e as any); } }}
                  placeholder="e.g. Rally Series, Flex Series, Microflex"
                  className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#05162e] font-bold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowAddFamilyModal(false)} className="px-3 py-1.5 rounded bg-[#eceef1] text-xs font-bold">Cancel</button>
                <button type="button" onClick={(e) => handleCreateFamily(e as any)} className="px-4 py-1.5 rounded bg-[#005FB7] text-white text-xs font-bold">Save Family</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
