export interface Project {
  id: string;
  name: string;
  category: string;
  client: string;
  location: string;
  revision: string;
  status: 'In Design' | 'Approved' | 'Under Review' | 'Archived';
  engineer: {
    name: string;
    initials: string;
  };
  lastUpdated: string;
  fileCount: number;
  highValue: boolean;
  myProject: boolean;
  description: string;
}

export interface FileItem {
  id: string;
  name: string;
  folder: string;
  type: string;
  size: string;
  updatedAt: string;
  rendererType: 'pdf' | 'excel' | 'drawio' | 'plantuml' | 'image' | 'markdown' | 'text' | 'code' | 'download';
  renderEnabled: boolean;
  version: string;
  section: string;
  displayOrder: number;
  url?: string;
  content?: string;
  fileDataUrl?: string;
  fileBlobUrl?: string;
}

export const MOCK_CATEGORIES = [
  {
    id: 'cat-1',
    code: 'AV-ELV',
    name: 'Audio Visual & ELV',
    description: 'Command center matrix systems, videowalls, DSP audio processors, public address, and low voltage controls.',
    fileCount: 142,
    projectCount: 24,
    templateCount: 18,
    icon: 'devices',
  },
  {
    id: 'cat-2',
    code: 'BAS-SMART',
    name: 'Smart Building & BAS',
    description: 'Building automation systems, HVAC controls, occupancy sensors, power monitoring, and IoT gateways.',
    fileCount: 88,
    projectCount: 15,
    templateCount: 12,
    icon: 'precision_manufacturing',
  },
  {
    id: 'cat-3',
    code: 'INFRA',
    name: 'Infrastructure',
    description: 'Fiber optic backbones, structural cabling, traffic management, bridges, and municipal communications.',
    fileCount: 112,
    projectCount: 31,
    templateCount: 24,
    icon: 'domain',
  },
  {
    id: 'cat-4',
    code: 'ENV-IND',
    name: 'Environmental & Industrial',
    description: 'SCADA automation, water treatment logic, PLC diagrams, and environmental sensor networks.',
    fileCount: 64,
    projectCount: 11,
    templateCount: 9,
    icon: 'water_drop',
  },
  {
    id: 'cat-5',
    code: 'CLOUD-DC',
    name: 'Data Centers & Cloud',
    description: 'Hyper-scale facility power, chilled water loops, tier IV redundancy specs, and high-density server racks.',
    fileCount: 195,
    projectCount: 42,
    templateCount: 31,
    icon: 'dns',
  },
];

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'P-2408',
    name: 'Command Center Infrastructure',
    category: 'Audio Visual & ELV',
    client: 'Ministry of Interior',
    location: 'Riyadh, KSA',
    revision: 'v2.4',
    status: 'In Design',
    engineer: { name: 'J. Smith', initials: 'JS' },
    lastUpdated: '10 mins ago',
    fileCount: 42,
    highValue: true,
    myProject: true,
    description: 'Mission-critical command center AV matrix control, videowall processors, low-voltage power distribution, and redundancy topologies.',
  },
  {
    id: 'NX-2024-001',
    name: 'Alpha Tower Substructure',
    category: 'Smart Building & BAS',
    client: 'Apex Holdings',
    location: 'Riyadh, KSA',
    revision: 'v1.2',
    status: 'In Design',
    engineer: { name: 'J. Smith', initials: 'JS' },
    lastUpdated: '2h ago',
    fileCount: 18,
    highValue: true,
    myProject: true,
    description: 'Substructure engineering schematics, HVAC integration, building management system controllers.',
  },
  {
    id: 'NX-2024-045',
    name: 'Dubai Marina Bridge Extension',
    category: 'Infrastructure',
    client: 'RTA',
    location: 'Dubai, UAE',
    revision: 'v3.0',
    status: 'Approved',
    engineer: { name: 'A. Khan', initials: 'AK' },
    lastUpdated: '1d ago',
    fileCount: 65,
    highValue: true,
    myProject: false,
    description: 'Structural monitoring sensors, fiber optic network backbone, bridge traffic management systems.',
  },
  {
    id: 'NX-2023-892',
    name: 'Eco-Park Water Treatment',
    category: 'Environmental & Industrial',
    client: 'City Council',
    location: 'Abu Dhabi, UAE',
    revision: 'v0.9',
    status: 'Under Review',
    engineer: { name: 'L. Muller', initials: 'LM' },
    lastUpdated: '3d ago',
    fileCount: 29,
    highValue: false,
    myProject: false,
    description: 'SCADA system diagrams, water filtration logic, pump station PLC automation.',
  },
  {
    id: 'NX-2024-102',
    name: 'Global Data Center Hyper-Scale Site',
    category: 'Data Centers & Cloud',
    client: 'CloudCorp Inc',
    location: 'Dammam, KSA',
    revision: 'v1.0',
    status: 'In Design',
    engineer: { name: 'S. Patel', initials: 'SP' },
    lastUpdated: '5d ago',
    fileCount: 110,
    highValue: true,
    myProject: true,
    description: '100MW hyper-scale facility power distribution, chilled water loops, tier IV redundancy specs.',
  },
];

export const MOCK_PROJECT_FILES: FileItem[] = [
  {
    id: 'f-1',
    name: '120 Seater and 240 Seater.drawio',
    folder: 'Drawings',
    type: 'DWG / DRAWIO',
    size: '9.1 MB',
    updatedAt: '2h ago',
    rendererType: 'drawio',
    renderEnabled: true,
    version: 'v1.0',
    section: 'Drawings',
    displayOrder: 1,
  },
  {
    id: 'f-2',
    name: 'BIOphore.drawio-2.pdf',
    folder: 'Drawings',
    type: 'PDF / BLUEPRINT',
    size: '14.2 MB',
    updatedAt: '4h ago',
    rendererType: 'pdf',
    renderEnabled: true,
    version: 'v1.0',
    section: 'Drawings',
    displayOrder: 2,
  },
  {
    id: 'f-3',
    name: 'BIOphore.drawio.pdf',
    folder: 'Drawings',
    type: 'PDF / BLUEPRINT',
    size: '12.8 MB',
    updatedAt: '1d ago',
    rendererType: 'pdf',
    renderEnabled: true,
    version: 'v1.0',
    section: 'Drawings',
    displayOrder: 3,
  },
  {
    id: 'f-4',
    name: '09 Jul 2026 120 and 240 updated for final (2).xlsx',
    folder: 'BOQ',
    type: 'XLSX / BOQ',
    size: '840 KB',
    updatedAt: 'Just now',
    rendererType: 'excel',
    renderEnabled: true,
    version: 'v1.0',
    section: 'BOQ',
    displayOrder: 4,
  },
];
