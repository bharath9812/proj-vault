'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { TopHeader } from '@/components/layout/TopHeader';
import { createClient } from '@/lib/supabase/client';
import { MOCK_PROJECTS, MOCK_PROJECT_FILES, FileItem } from '@/lib/data';
import { DrawioOfficialViewer } from '@/components/renderers/DrawioOfficialViewer';
import { PdfViewer } from '@/components/renderers/PdfViewer';
import {
  fetchAssetWith3TierCache,
  invalidateAssetCache,
  purgeAllAssetCaches,
  saveToL1,
  saveToL2,
} from '@/lib/cache/asset-cache-engine';

interface ProjectDetailsClientProps {
  decodedId: string;
}

interface QueuedFile {
  id: string;
  name: string;
  section: string;
  rendererType: 'pdf' | 'excel' | 'drawio' | 'plantuml' | 'image' | 'markdown' | 'text' | 'code' | 'download';
  size: string;
  fileDataUrl?: string;
  source?: string;
  latencyMs?: number;
  cacheTier?: 'L1' | 'L2' | 'L3';
}

export function ProjectDetailsClient({ decodedId }: ProjectDetailsClientProps) {
  const router = useRouter();

  const [project, setProject] = useState<any>({
    id: decodedId,
    project_code: decodedId,
    name: 'Command Center Infrastructure',
    category: 'Audio Visual & ELV',
    client: 'Ministry of Interior',
    location: 'Riyadh, KSA',
    status: 'In Design',
    engineer_name: 'Lead Engineer',
    description:
      'Mission-critical command center AV matrix control, videowall processors, low-voltage power distribution.',
  });
  
  const [isEditingProjectInfo, setIsEditingProjectInfo] = useState(false);
  const [editProjectData, setEditProjectData] = useState<any>(null);
  const [savingProjectInfo, setSavingProjectInfo] = useState(false);

  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [activeFile, setActiveFile] = useState<FileItem | null>(null);
  const [centerViewMode, setCenterViewMode] = useState<'renderer' | 'fileList'>('renderer');

  // Excel SheetJS Dynamic Workbook Parsing State
  const [excelSheets, setExcelSheets] = useState<string[]>(['120', '240']);
  const [activeExcelSheet, setActiveExcelSheet] = useState<string>('120');
  const [dynamicExcelData, setDynamicExcelData] = useState<{ [sheetName: string]: any[][] }>({});

  // (PDF rendering now handled by PdfViewer component — no sheet state needed)

  // Layout Controls
  const [leftTreeCollapsed, setLeftTreeCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rightPanelTab, setRightPanelTab] = useState<'metadata' | 'downloads' | 'activity' | 'comments'>('metadata');
  const [comments, setComments] = useState<any[]>([]);
  const [assetActivityLogs, setAssetActivityLogs] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');

  // Add File Modal State
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isModalDragging, setIsModalDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Dynamic Excel Parsing via SheetJS when active file changes
  useEffect(() => {
    if (!activeFile) return;

    const lowerName = activeFile.name.toLowerCase();
    if (activeFile.rendererType === 'excel' || lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')) {
      if (activeFile.fileDataUrl) {
        try {
          const base64Data = activeFile.fileDataUrl.split(',')[1] || activeFile.fileDataUrl;
          const wb = XLSX.read(base64Data, { type: 'base64' });

          if (wb.SheetNames && wb.SheetNames.length > 0) {
            setExcelSheets(wb.SheetNames);
            if (!wb.SheetNames.includes(activeExcelSheet)) {
              setActiveExcelSheet(wb.SheetNames[0]);
            }

            const parsedSheets: { [key: string]: any[][] } = {};
            wb.SheetNames.forEach((sheetName) => {
              const ws = wb.Sheets[sheetName];
              const jsonRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
              
              // Find max non-empty column index across all rows
              let maxColIndex = -1;
              jsonRows.forEach((row) => {
                if (Array.isArray(row)) {
                  for (let i = row.length - 1; i >= 0; i--) {
                    if (row[i] !== undefined && row[i] !== null && String(row[i]).trim() !== '') {
                      if (i > maxColIndex) maxColIndex = i;
                      break;
                    }
                  }
                }
              });

              // Trim rows to maxColIndex
              if (maxColIndex >= 0) {
                const cleanedRows = jsonRows.map((row) => {
                  if (!Array.isArray(row)) return [];
                  return row.slice(0, maxColIndex + 1);
                }).filter((row: any) => row.some((cell: any) => cell !== undefined && cell !== null && String(cell).trim() !== ''));

                parsedSheets[sheetName] = cleanedRows;
              } else {
                parsedSheets[sheetName] = jsonRows;
              }
            });
            setDynamicExcelData(parsedSheets);
          }
        } catch (err) {
          console.warn('Dynamic SheetJS parsing fallback:', err);
        }
      }
    }
  }, [activeFile]);

  // Fetch Live Data from Supabase & Local Cache
  useEffect(() => {
    async function loadProjectData() {
      try {
        const supabase = createClient();

        // 1. Check local session storage for project files (dedicated key or created projects cache)
        let localFiles: FileItem[] = [];
        let foundLocalProject = false;
        try {
          const dedicatedKey = `ekms_project_files_${decodedId.toLowerCase()}`;
          const dedicatedStr = localStorage.getItem(dedicatedKey);
          if (dedicatedStr) {
            const parsed = JSON.parse(dedicatedStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localFiles = parsed;
            }
          }

          const storedProjectsStr = localStorage.getItem('ekms_created_projects');
          if (storedProjectsStr) {
            const storedProjects = JSON.parse(storedProjectsStr);
            const foundLocal = storedProjects.find(
              (p: any) =>
                p.id?.toLowerCase() === decodedId.toLowerCase() ||
                p.project_code?.toLowerCase() === decodedId.toLowerCase()
            );
            if (foundLocal) {
              foundLocalProject = true;
              setProject({
                id: foundLocal.id || decodedId,
                project_code: foundLocal.id || decodedId,
                name: foundLocal.name,
                category: foundLocal.category || 'Audio Visual & ELV',
                client: foundLocal.client || 'Enterprise Client',
                location: foundLocal.location || 'Site Location',
                revision: 'v1.0',
                status: 'In Design',
                engineer_name: 'Lead Engineer',
                engineer_initials: 'BR',
                description: foundLocal.description || '',
              });
              if (localFiles.length === 0 && foundLocal.files && foundLocal.files.length > 0) {
                localFiles = foundLocal.files;
              }
            }
          }
        } catch (e) {
          console.warn('Could not parse local projects cache:', e);
        }

        // 2. Fetch Project from Supabase
        const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        
        const { data: projData } = await supabase
          .from('projects')
          .select('*')
          .or(isUuid(decodedId) ? `project_code.eq.${decodedId},id.eq.${decodedId}` : `project_code.eq.${decodedId}`)
          .single();

        if (projData) {
          setProject(projData);

          const { data: assetsData, error: assetsErr } = await supabase
            .from('assets')
            .select('*')
            .or(
              isUuid(projData.project_code)
                ? `project_id.eq.${projData.id},project_id.eq.${projData.project_code}`
                : `project_id.eq.${projData.id}`
            )
            .order('display_order', { ascending: true });

          if (assetsData && assetsData.length > 0) {
            const mappedAssets: FileItem[] = assetsData.map((item: any) => ({
              id: item.id,
              name: item.name,
              folder: item.folder || item.section || 'Drawings',
              type: item.type || 'DWG / CAD',
              size: item.size_display || '4.5 MB',
              updatedAt: 'Recently',
              rendererType: item.renderer_type as any,
              renderEnabled: item.render_enabled ?? true,
              version: item.version || 'v1.0',
              section: item.section || item.folder || 'Drawings',
              displayOrder: item.display_order || 1,
              content: item.content || undefined,
              fileDataUrl: item.content || item.file_data_url || undefined,
              source: item.content || item.file_data_url ? 'PostgreSQL (Local Cache)' : 'Cloud Storage CDN',
            }));

            setFileList(mappedAssets);
            setActiveFile(mappedAssets[0]);
            return;
          }
        }

        // If local storage files found, use them
        if (localFiles.length > 0) {
          setFileList(localFiles);
          setActiveFile(localFiles[0]);
          return;
        }

        if (foundLocalProject) {
          // New custom project created with 0 files
          setFileList([]);
          setActiveFile(null);
          return;
        }

        const defaultFiles: FileItem[] = [
          {
            id: 'f-1',
            name: '120 Seater and 240 Seater.drawio',
            folder: 'Drawings',
            type: 'DRAWIO / SVG',
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
            updatedAt: '3h ago',
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
            updatedAt: '3h ago',
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
            type: 'XLSX / SPREADSHEET',
            size: '3.4 MB',
            updatedAt: '1h ago',
            rendererType: 'excel',
            renderEnabled: true,
            version: 'v2.4',
            section: 'BOQ',
            displayOrder: 4,
          },
        ];

        // Merge default files with any custom files added locally for mock project P-2408
        const finalFiles = [...defaultFiles];
        localFiles.forEach((lf) => {
          if (!finalFiles.some((df) => df.id === lf.id || df.name === lf.name)) {
            finalFiles.push(lf);
          }
        });

        setFileList(finalFiles);
        setActiveFile(finalFiles[0]);
      } catch (err) {
        console.error('Error loading project details:', err);
      }
    }

    loadProjectData();
  }, [decodedId]);

  const saveProjectFilesToCache = (files: FileItem[]) => {
    try {
      const dedicatedKey = `ekms_project_files_${decodedId.toLowerCase()}`;
      localStorage.setItem(dedicatedKey, JSON.stringify(files));

      const storedProjectsStr = localStorage.getItem('ekms_created_projects') || '[]';
      const storedProjects = JSON.parse(storedProjectsStr);
      const idx = storedProjects.findIndex(
        (p: any) =>
          p.id?.toLowerCase() === decodedId.toLowerCase() ||
          p.project_code?.toLowerCase() === decodedId.toLowerCase()
      );
      if (idx >= 0) {
        storedProjects[idx].files = files;
        localStorage.setItem('ekms_created_projects', JSON.stringify(storedProjects));
      }
    } catch (e) {
      console.warn('Could not save files to local cache:', e);
    }
  };

  // UNTAMPERED FILE DOWNLOAD HANDLER
  const handleDownloadFile = (file: FileItem) => {
    // If exact raw fileDataUrl (Base64 Data URI) exists, download untampered original bytes
    if (file.fileDataUrl && !file.fileDataUrl.endsWith('loaded')) {
      const a = document.createElement('a');
      a.href = file.fileDataUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // Fallback text/binary blob download if no Base64 URL attached
    const blob = new Blob([file.content || `Untampered File Asset Payload: ${file.name}`], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // FETCH ASSET VIA ENTERPRISE 3-TIER MULTI-LEVEL CACHE ENGINE
  useEffect(() => {
    if (!activeFile || !project) return;
    if (activeFile.id.startsWith('f-') && activeFile.updatedAt === '2h ago') return;
    
    // If already fully loaded with measured source and latency, avoid duplicate fetch
    if (activeFile.fileDataUrl && activeFile.source && activeFile.latencyMs !== undefined) return;
    
    let isMounted = true;
    
    const fetchStorageAsset = async () => {
      try {
        const supabase = createClient();
        const projectFolder = project.project_code || project.id;
        const storagePath = `${projectFolder}/${activeFile.name}`;
        
        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(storagePath);
        
        // Lookup Tier 1 (L1 RAM) -> Tier 2 (L2 CacheStorage) -> Tier 3 (Cloud CDN / Supabase Storage)
        const result = await fetchAssetWith3TierCache({
          projectId: project.project_code || project.id,
          fileName: activeFile.name,
          version: activeFile.version || 'v1.0',
          storagePublicUrl: publicUrl,
          rendererType: activeFile.rendererType,
          fallbackContent: activeFile.content,
        });

        if (isMounted) {
          setActiveFile((prev: any) =>
            prev?.id === activeFile.id
              ? {
                  ...prev,
                  content: result.text || prev?.content,
                  fileDataUrl: result.dataUrl,
                  source: result.source,
                  latencyMs: result.latencyMs,
                  cacheTier: result.tier,
                }
              : prev
          );
          setFileList((prevList: any) =>
            prevList.map((f: any) =>
              f.id === activeFile.id
                ? {
                    ...f,
                    content: result.text || f.content,
                    fileDataUrl: result.dataUrl,
                    source: result.source,
                    latencyMs: result.latencyMs,
                    cacheTier: result.tier,
                  }
                : f
            )
          );
        }
      } catch (err) {
        console.error('Failed to download asset from storage:', err);
      }
    };
    
    fetchStorageAsset();
    
    return () => { isMounted = false; };
  }, [activeFile?.id, project?.id]);

  // FETCH COMMENTS AND ACTIVITY LOGS
  useEffect(() => {
    if (!activeFile || activeFile.id.startsWith('f-') || !project) return;
    
    let isMounted = true;
    
    const fetchAssetMeta = async () => {
      try {
        const supabase = createClient();
        const [
          { data: cData },
          { data: aData }
        ] = await Promise.all([
          supabase.from('comments').select('*').eq('asset_id', activeFile.id).order('created_at', { ascending: true }),
          supabase.from('activity_logs').select('*').eq('asset_id', activeFile.id).order('created_at', { ascending: false })
        ]);
        
        if (isMounted) {
          setComments(cData || []);
          setAssetActivityLogs(aData || []);
        }
      } catch (err) {
        console.error('Failed to fetch asset metadata', err);
      }
    };
    
    fetchAssetMeta();

    const handleProfileUpdate = async () => {
      fetchAssetMeta();
      if (project?.id) {
        try {
          const supabase = createClient();
          const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
          const { data: projData } = await supabase
            .from('projects')
            .select('*')
            .or(isUuid(project.id) ? `project_code.eq.${project.id},id.eq.${project.id}` : `project_code.eq.${project.id}`)
            .single();
          if (projData && isMounted) {
            setProject(projData);
          }
        } catch (e) {}
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('user_profile_updated', handleProfileUpdate);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('user_profile_updated', handleProfileUpdate);
      }
    };
  }, [activeFile, project?.id]);


  const handleSaveProjectInfo = async () => {
    if (!editProjectData || !project) return;
    
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    if (!isUuid(project.id)) {
      alert("Cannot save: This is a local preview project and is not saved in the database yet.");
      setIsEditingProjectInfo(false);
      return;
    }

    setSavingProjectInfo(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('projects')
        .update({
          name: editProjectData.name,
          category: editProjectData.category,
          client: editProjectData.client,
          location: editProjectData.location,
          engineer_name: editProjectData.engineer_name,
          description: editProjectData.description,
          status: editProjectData.status
        })
        .eq('id', project.id);
        
      if (error) throw error;
      
      await supabase.from('activity_logs').insert({
        project_id: project.id,
        user_name: editProjectData.engineer_name || 'Lead Engineer',
        action: `updated project metadata (Status: ${editProjectData.status})`,
        details: { asset_name: editProjectData.name }
      });

      setProject(editProjectData);
      setIsEditingProjectInfo(false);
    } catch (err: any) {
      console.error('Error saving project info:', err);
      alert(err.message || 'Failed to save project info.');
    } finally {
      setSavingProjectInfo(false);
    }
  };

  const handleDownloadAllZip = () => {
    if (fileList.length === 0) return;
    fileList.forEach((file: any) => handleDownloadFile(file));
  };

  const handleDeleteIndividualFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete file "${fileName}" from this project?`)) {
      return;
    }

    try {
      const supabase = createClient();

      // 1. Delete physical file from Supabase Storage
      try {
        const projectFolder = project.project_code || project.id;
        const storagePath = `${projectFolder}/${fileName}`;
        await supabase.storage.from('assets').remove([storagePath]);
      } catch (storageErr) {
        console.warn('Supabase storage cleanup error:', storageErr);
      }

      // 2. Delete metadata from PostgreSQL
      await supabase.from('assets').delete().eq('id', fileId);

      await supabase.from('activity_logs').insert({
        project_id: project.id,
        user_name: project.engineer_name || 'Lead Engineer',
        action: 'deleted asset',
        details: { asset_name: fileName }
      });

      const updated = fileList.filter((f: any) => f.id !== fileId);
      setFileList(updated);

      if (activeFile?.id === fileId) {
        setActiveFile(updated.length > 0 ? updated[0] : null);
      }

      // Update local storage cache
      saveProjectFilesToCache(updated);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleDeleteEntireProject = async () => {
    const code = project.project_code || project.id;
    if (
      !confirm(
        `Are you sure you want to permanently DELETE project "${project.name}" (${code})?\n\nThis action cannot be undone. All technical files, comments, and project records will be erased.`
      )
    ) {
      return;
    }

    try {
      const supabase = createClient();

      const isUuid = (str: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      const { data: projRecord } = await supabase
        .from('projects')
        .select('id, project_code')
        .or(isUuid(code) ? `id.eq.${code},project_code.eq.${code}` : `project_code.eq.${code}`)
        .maybeSingle();

      const realUuid = projRecord?.id || (project.id && isUuid(project.id) ? project.id : null);
      const realCode = projRecord?.project_code || code;

      if (realUuid) {
        await supabase.from('assets').delete().eq('project_id', realUuid);
        await supabase.from('comments').delete().eq('project_id', realUuid);
      }

      // Clear Supabase Storage files
      try {
        const folderPaths = [realUuid, realCode].filter(Boolean);
        for (const folder of folderPaths) {
          if (!folder) continue;
          const { data: files } = await supabase.storage.from('assets').list(folder);
          if (files && files.length > 0) {
            const filesToRemove = files.map((f: any) => `${folder}/${f.name}`);
            await supabase.storage.from('assets').remove(filesToRemove);
          }
        }
      } catch (storageErr) {
        console.warn('Storage cleanup error:', storageErr);
      }

      if (realUuid) {
        await supabase.from('projects').delete().eq('id', realUuid);
      } else {
        await supabase.from('projects').delete().eq('project_code', realCode);
      }

      // Clear from local storage
      try {
        localStorage.removeItem(`ekms_project_files_${code.toLowerCase()}`);
        localStorage.removeItem(`ekms_project_files_${realCode.toLowerCase()}`);

        const storedStr = localStorage.getItem('ekms_created_projects');
        if (storedStr) {
          const storedList = JSON.parse(storedStr);
          const updated = storedList.filter(
            (p: any) =>
              p.id?.toLowerCase() !== code.toLowerCase() &&
              p.project_code?.toLowerCase() !== code.toLowerCase() &&
              p.id?.toLowerCase() !== realCode.toLowerCase()
          );
          localStorage.setItem('ekms_created_projects', JSON.stringify(updated));
        }
      } catch (e) {
        console.warn('Error clearing deleted project from local storage:', e);
      }

      router.push('/projects');
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !activeFile) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('comments').insert({
        asset_id: activeFile.id,
        author_name: project.engineer_name || 'Lead Engineer',
        text: newComment,
      }).select().single();
      
      if (error) throw error;
      
      const newLog = {
        id: String(Date.now()),
        project_id: project.id,
        asset_id: activeFile.id,
        user_name: project.engineer_name || 'Lead Engineer',
        action: 'added an engineering note',
        details: { asset_name: activeFile.name },
        created_at: new Date().toISOString()
      };
      
      await supabase.from('activity_logs').insert({
        project_id: newLog.project_id,
        asset_id: newLog.asset_id,
        user_name: newLog.user_name,
        action: newLog.action,
        details: newLog.details
      });

      setComments([...comments, data]);
      setAssetActivityLogs([newLog, ...assetActivityLogs]);
      setNewComment('');
    } catch (err) {
      console.error('Error posting comment:', err);
    }
  };

  // Single & Multi-File Queue Handler with Exact Base64 Data URL Reading
  const addFilesToModalQueue = (filesList: FileList | File[]) => {
    const filesArray = Array.from(filesList);
    if (filesArray.length === 0) return;

    filesArray.forEach((f: any, idx: any) => {
      const fileName = f.name;
      const lowerName = fileName.toLowerCase();
      let detectedRenderer: QueuedFile['rendererType'] = 'text';
      let detectedSection = 'Specifications';

      if (lowerName.endsWith('.dwg') || lowerName.endsWith('.drawio')) {
        detectedRenderer = 'drawio';
        detectedSection = 'Drawings';
      } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')) {
        detectedRenderer = 'excel';
        detectedSection = 'BOQ';
      } else if (lowerName.endsWith('.puml')) {
        detectedRenderer = 'plantuml';
        detectedSection = 'Specifications';
      } else if (lowerName.endsWith('.md')) {
        detectedRenderer = 'markdown';
        detectedSection = 'Specifications';
      } else if (
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.log') ||
        lowerName.endsWith('.conf') ||
        lowerName.endsWith('.sh') ||
        lowerName.endsWith('.json') ||
        lowerName.endsWith('.yaml') ||
        lowerName.endsWith('.yml') ||
        lowerName.endsWith('.ini')
      ) {
        detectedRenderer = 'text';
        detectedSection = 'Specifications';
      } else if (lowerName.endsWith('.pdf')) {
        detectedRenderer = 'pdf';
        detectedSection = 'Drawings';
      } else if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        detectedRenderer = 'image';
        detectedSection = 'Drawings';
      }

      const formattedSize =
        f.size > 1024 * 1024
          ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(f.size / 1024))} KB`;

      const reader = new FileReader();
      reader.onload = (e: any) => {
        const dataUrl = e.target?.result as string;
        const newItem: QueuedFile = {
          id: `q-modal-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          name: fileName,
          section: detectedSection,
          rendererType: detectedRenderer,
          size: formattedSize,
          fileDataUrl: dataUrl,
        };
        setQueuedFiles((prev: any) => [...prev, newItem]);
      };

      reader.readAsDataURL(f);
    });
  };

  const handleModalFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToModalQueue(e.target.files);
      e.target.value = '';
    }
  };

  const handleModalDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsModalDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToModalQueue(e.dataTransfer.files);
    }
  };

  const handleModalDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsModalDragging(true);
  };

  const handleModalDragLeave = () => {
    setIsModalDragging(false);
  };

  const handleRemoveModalQueuedFile = (id: string) => {
    setQueuedFiles((prev: any) => prev.filter((f: any) => f.id !== id));
  };

  const handleUpdateModalQueuedFile = (
    id: string,
    field: 'name' | 'section' | 'rendererType',
    value: string
  ) => {
    setQueuedFiles((prev: any) =>
      prev.map((f: any) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  const handleUploadAllQueuedFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (queuedFiles.length === 0) return;
    setUploading(true);

    try {
      const supabase = createClient();
      const newAssets: FileItem[] = queuedFiles.map((f: any, idx: any) => ({
        id: `f-${Date.now()}-${idx}`,
        name: f.name,
        folder: f.section,
        type: f.rendererType.toUpperCase(),
        size: f.size,
        updatedAt: 'Just now',
        rendererType: f.rendererType,
        renderEnabled: true,
        version: 'v1.0',
        section: f.section,
        displayOrder: fileList.length + idx + 1,
        fileDataUrl: f.fileDataUrl,
      }));

      // Upload binary files to Supabase Storage & insert metadata into public.assets
      if (project.id) {
        await Promise.all(
          queuedFiles.map(async (f: any) => {
            if (f.fileDataUrl) {
              try {
                const base64 = f.fileDataUrl.split(',')[1] || f.fileDataUrl;
                const binaryStr = atob(base64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                const mime = f.fileDataUrl.match(/:(.*?);/)?.[1] || 'application/octet-stream';
                const blob = new Blob([bytes], { type: mime });

                const projectFolder = project.project_code || project.id;
                const storagePath = `${projectFolder}/${f.name}`;
                await supabase.storage.from('assets').upload(storagePath, blob, {
                  contentType: mime,
                  upsert: true,
                  cacheControl: '86400', // Cache for 1 day to save bandwidth
                });
              } catch (storageErr) {
                console.warn('Supabase storage upload error:', storageErr);
              }
            }
          })
        );

        const assetsToInsert = queuedFiles.map((f: any, idx: any) => ({
          project_id: project.id,
          name: f.name,
          folder: f.section,
          type: f.rendererType.toUpperCase(),
          size_display: f.size,
          size_bytes: 4500000,
          renderer_type: f.rendererType,
          render_enabled: true,
          version: 'v1.0',
          section: f.section,
          display_order: fileList.length + idx + 1,
          storage_path: `${project.id}/${f.name}`,
        }));

        const { data: insertedAssets, error: insertError } = await supabase.from('assets').insert(assetsToInsert).select();
        
        if (insertedAssets && insertedAssets.length > 0) {
          const logsToInsert = insertedAssets.map((asset: any) => ({
            project_id: project.id,
            asset_id: asset.id,
            user_name: project.engineer_name || 'Lead Engineer',
            action: 'uploaded asset',
            details: { asset_name: asset.name }
          }));
          await supabase.from('activity_logs').insert(logsToInsert);
        }
      }

      const updatedList = [...fileList, ...newAssets];
      setFileList(updatedList);
      setActiveFile(newAssets[0]);
      setShowAddFileModal(false);
      setQueuedFiles([]);

      // Save to cache (dedicated key + ekms_created_projects)
      saveProjectFilesToCache(updatedList);
    } catch (err) {
      console.error('Error adding files:', err);
    } finally {
      setUploading(false);
    }
  };

  // EXACT 100% VERBATIM EXCEL BOQ DATA FOR SHEET 120 (MATCHING SCREENSHOT 1 PRECISELY)
  const EXCEL_BOQ_DATA_120_EXACT = [
    {
      category: 'Video System',
      items: [
        { sno: '1', desc: '75" Interactive display, brightness 450cd/sqm. Android 14', make: 'Newline', model: 'TT-7523QA', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: '75" non interactive Android 14, 24X7 hours operation', make: 'Newline', model: 'STV-7524-Plus', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: 'Customised Push Pull mount Bracket', make: 'Lumi/legrand/NT', model: 'LPA77-696/', qty: '3', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'Mini Pc i5/16gb and 512SSD with windows 11pro OS', make: 'HP/ DELL', model: 'QVS1260', qty: '1', warranty: '36 Months minimum', remarks: 'Touch control from Display' },
      ],
    },
    {
      category: 'Camera System',
      items: [
        { sno: '1', desc: '4K AI Auto-Tracking 20x Zoom PTZ Camera', make: 'Lumens/Clear one', model: 'VC-TR61/Unite 260 Pro', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: 'AI-Box1 CamConnect Processor/video mixer', make: 'Lumens/Clear one', model: 'CamConnect Pro', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Audio System',
      items: [
        { sno: '1', desc: 'Digital Wireless Handheld Microphone(SET) - With rechargeable Batteries', make: 'SHURE/SENNHEISER', model: 'QLXD/SLXD /EW-D 835-S (', qty: '2', warranty: '36 Months minimum', remarks: 'Need to use UA8/UHF Antennas for Wireless(if not using qlxd)' },
        { sno: '2', desc: 'Digital Wireless Lavalier Microphone(SET) - With rechargeable Batteries', make: 'SHURE/SENNHEISER', model: 'QLXD/SLXD/EW-D ME 2 (', qty: '1', warranty: '36 Months minimum', remarks: 'Need to use UA8/UHF Antennas for Wireless(if not using qlxd)' },
        { sno: '3', desc: 'Digital Wireless Headworn Microphone(SET) - With rechargeable Batteries', make: 'SHURE/SENNHEISER', model: 'QLXD(SM39)/EW-D ME 3', qty: '1', warranty: '36 Months minimum', remarks: 'Need to use UA8/UHF Antennas for Wireless(if not using qlxd)' },
        { sno: '4', desc: 'Battery Charger', make: 'SHURE/SENNHEISER', model: 'SBC200/CHG 2 EU/SB900A', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '5', desc: 'Digital Signal Processor /Hear Clear AEC', make: 'Bose/BSS/QSC/BIAMP', model: 'BLU-101+BLU-DAN/Core 8', qty: '1', warranty: '36 Months minimum', remarks: 'DANTE & Analog support/ if any add on cards' },
        { sno: '', desc: 'DSP Extender/USB Audio Interface', make: 'Bose/BSS/QSC/BIAMP', model: 'BLU-USB', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '6', desc: 'Quad-channel power amplifier 4 X 240W 100V', make: 'Crown /Bose/JBL/QSC', model: 'DCi4|600/ CAP424/ PSX24', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '7', desc: 'Ceiling Tile Microphone with DANTE & Analogue output', make: 'SHURE/SENNHEISER', model: 'MXA-902-60CM/TeamConnect Ceil', qty: '2', warranty: '36 Months minimum', remarks: 'With Bracke and releated voice lift' },
        { sno: '8', desc: 'Ceiling Speakers 30w', make: 'Audac/Bose/JBL/QSC', model: 'Control 414C/T / DM5C', qty: '10', warranty: '36 Months minimum', remarks: '' },
        { sno: '9', desc: 'FOH Speaker', make: 'JBL/Bose/QSC', model: 'CBT 100-LA-1/MA12EX', qty: '2', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Control system',
      items: [
        { sno: '1', desc: '4-Series™ Control System', make: 'Crestron/AMX', model: 'CP4N/MCP - 108', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: '7 in. Wall Mount Touch Screen, Black Smooth', make: 'Crestron/AMX', model: 'TSW-770-B-S', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: 'Horizon® 2 Keypad with Cresnet® Communications, Custom Engraved, Black', make: 'Crestron/AMX', model: 'PCN-B ENGRAVED/M', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: '40x1G PoE+ 960W and 8xSFP+ Managed Switch', make: 'Netgear', model: 'GSM4248PX', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Switching System',
      items: [
        { sno: '1', desc: '8x8 4K60 4:4:4 HDR AV Switcher', make: 'Crestron/AMX', model: 'HD-MD8X8-4KZ-E/PR-0808', qty: '1', warranty: '36 Months minimum', remarks: 'Requried DM I/O' },
        { sno: '2', desc: '4K60 4:4:4 Transmitter & Receiver and 2x1 Auto-Switcher for HDMI & USB-C', make: 'Kramer', model: 'SWT3-21-HU-TR', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: '4K60 4:4:4 Transmitter & Receiver and 2x1 Auto-Switcher for HDMI & USB-C', make: 'Kramer', model: 'SWT3-21-HU-TR', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'AV over ip encoder 1G', make: 'Crestron/AMX', model: 'DM-NVX-384/N2612S', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '5', desc: 'AV over ip decoder 1G', make: 'Crestron/AMX', model: 'DM-NVX-D200/N2622S', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Interface System/Installation Etc',
      items: [
        { sno: '1', desc: 'XLR Connectors with face plates(4i/p)', make: 'Reputed', model: 'Various', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: 'AV Patch Cables, Lan Cable, Speaker Cable, Audio Cable, Connectors, Brackets, etc.', make: 'BELDEN 8473/kramer /', model: 'Lot', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: 'Floor mount box with HDMI, C port and LAN Ports', make: 'Custom', model: 'Custom', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'Installation, Commissioning & programming of DSP', make: 'Custom', model: 'Job', qty: '1', warranty: '36 Months minimum', remarks: 'Programming sholud be done on SRMAP mail id' },
        { sno: '5', desc: 'Mic receiver bracker for wall mount', make: 'Reputed', model: 'Various', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '6', desc: '22 U Floor Rack with accessories', make: 'legrand', model: 'Valrack', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '7', desc: 'HDMI Cables', make: 'Honywell/ Kramer', model: 'Lot', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
  ];

  // EXACT 100% VERBATIM EXCEL BOQ DATA FOR SHEET 240 (MATCHING SCREENSHOT 2 PRECISELY)
  const EXCEL_BOQ_DATA_240_EXACT = [
    {
      category: 'Video System',
      items: [
        { sno: '1', desc: 'LED Screen with controller /P1.8(including Fabrication )', make: 'LG/Samsung/Panasonic', model: 'Size: 3600mm x 2025mm - 1 Screen(s); 11.8 ft x 6.6 ft; Total Cabinets: 36', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: 'Motorized Digital Podium(with touch screen, laptop table top, cable cuby,2 mic)', make: 'EIS Tech/Peoplelink', model: 'ET-501XA Digital Podium/PCU-PDP-EP-DELTA Plus/Epodium', qty: '1', warranty: '36 Months minimum', remarks: 'Mini PC Will be in Podium' },
        { sno: '3', desc: '55" tv with floor stage movable small stand', make: 'lg/Samsung', model: 'QB 55C/55UL5Q', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'Mini Pc i5/16gb and 512SSD with windows 11pro OS', make: 'HP/ DELL', model: 'QVS1260', qty: '1', warranty: '36 Months minimum', remarks: 'For video conference system from podium' },
      ],
    },
    {
      category: 'Camera System',
      items: [
        { sno: '1', desc: '4K AI Auto-Tracking 20x Zoom PTZ Camera', make: 'Lumens', model: 'VC-TR61/Unite 260 Pro', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: 'AI-Box1 CamConnect Processor/video mixer', make: 'Lumens', model: 'CamConnect Pro/LC 200', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: 'ATEM Television Studio', make: 'Black magic', model: 'HD8 ISO', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Audio System',
      items: [
        { sno: '1', desc: 'Digital Wireless Handheld Microphone(SET) - With rechargeable Batteries', make: 'SHURE/SENNHEISER', model: 'QLXD/SLXD /EW-D 835-S (SET)', qty: '4', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: 'Digital Wireless Lavalier Microphone(SET) - With rechargeable Batteries', make: 'SHURE/SENNHEISER', model: 'QLXD/SLXD/EW-D ME 2 (SET)', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: 'Digital Wireless Headworn Microphone(SET) - With rechargeable Batteries', make: 'SHURE/SENNHEISER', model: 'QLXD/SLXD(SM39)EW-D ME 3 (SET)', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'Battery Charger', make: 'SHURE/SENNHEISER', model: 'SBC200/CHG 2 EU/SB900B-A', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '5', desc: 'Digital Signal Processor /Hear Clear AEC', make: 'Bose/BSS/QSC/BIAMP', model: 'Blu -101+BLU-DAN/Core 8 flex', qty: '1', warranty: '36 Months minimum', remarks: 'DANTE & Analog support/ if any add on cards' },
        { sno: '', desc: 'DSP Extender/USB Audio Interface', make: 'Bose/BSS/QSC/BIAMP', model: 'Blu-USB', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '6', desc: 'Gooseneck microphone', make: 'SHURE/SENNHEISER', model: 'MX418D/C/MEG 14-40 or MAT-133 SB', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '7', desc: 'Eight-channel, 600W @ 8Ω Power Amplifier, 70V/100V', make: 'JBL/Bose/crown/AUDAC', model: 'DCi8X600N/SMA350', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '8', desc: 'Array Speakers(3x2 nos)SITC of Compact Two -way Loudspeaker', make: 'JBL/Bose/QSC/AUDAC', model: 'CBT 70J-1/KYRA 12', qty: '6', warranty: '36 Months minimum', remarks: '' },
        { sno: '9', desc: 'Wall mount Speakers', make: 'JBL /Bose/QSC', model: 'Control-28-1/ 402 Series', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '10', desc: 'Stage monitors', make: 'JBL/Bose/QSC/AUDAC', model: 'JBL-EON710D-EK/VEXO110A', qty: '3', warranty: '36 Months minimum', remarks: '' },
        { sno: '11', desc: 'Wireless mic antena set', make: 'SHURE/SENNHEISER', model: 'UA874/ ADP UHF (470 - 1075 MHZ)/UA844+SWB-IN', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '12', desc: 'Mini Stagebox 16i', make: 'Soundcraft /Behringer /Allen & Heath/sound craft', model: 'Soundcraft Mini Stagebox', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '13', desc: 'XLR floor stage box 3x3(I/O)', make: 'Reputed', model: '', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '14', desc: 'Audiovan Flip Top Popup Box,with 2 XLR, hdmi,2 lan support', make: 'Reputed', model: '', qty: '2', warranty: '36 Months minimum', remarks: '' },
        { sno: '15', desc: 'Audio mixer 16 channel', make: 'Soundcraft /Behringer /Allen & Heath/sound craft', model: 'Si Expression 1+MADI/ MGX16-22', qty: '1', warranty: '36 Months minimum', remarks: 'Prefered for digital' },
      ],
    },
    {
      category: 'Control system',
      items: [
        { sno: '1', desc: '4-Series™ Control System', make: 'Crestron/AMX', model: 'CP4N', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: '7 in. Wall Mount Touch Screen, Black Smooth', make: 'Crestron/AMX', model: 'TSW-770-B-S', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: '11" iPad Wi-Fi 128GB silver', make: 'Apple', model: 'iPad', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'TAB chaging set', make: 'Apple iPad', model: 'APPLE IPAD', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '5', desc: '40x1G PoE+ 960W and 8xSFP+ Managed Switch', make: 'Netgear', model: 'GSM4248PX', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '6', desc: 'wireless access point', make: 'Net gear', model: 'WAX610', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Switching System',
      items: [
        { sno: '1', desc: '4x4 4K60 4:4:4 HDR AV Switcher', make: 'Crestron/AMX', model: 'HD-MD8X8-4KZ-E/PR-0404', qty: '1', warranty: '36 Months minimum', remarks: 'Requried DM I/O' },
        { sno: '2', desc: '4x2 4K60 4:4:4 HDR AV Switcher with 4 x USB 3.2 Gen 1 Industrial Sharing', make: 'Crestron/AMX/Atlona', model: 'HD-MD4X2-4KZ-E/PR-0402/AT-OME-MS42-HDBT', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '3', desc: 'wall plate TX and RX Audio support', make: 'Kramer/Crestron/AMX/Atlona', model: 'DM-TX-4KZ-100-C-1G-B-T/HD-RXCA-4KZ-101/AT-OME-EX-WP-KIT', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '4', desc: 'AV over ip encoder 1G', make: 'Crestron/AMX', model: 'DM-NVX-384/N2612S', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '5', desc: 'AV over ip decoder 1G', make: 'Crestron/AMX', model: 'DM-NVX-D200/N2622S', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '6', desc: 'TX and RX for camera', make: 'Kramer/Crestron/AMX/Atlona', model: 'HU-TR/DM-TX-4KZ-100-C-1G-B-T/HD-RXCA-4KZ-101/DXLite/AT-OME-EX', qty: '3', warranty: '36 Months minimum', remarks: '' },
      ],
    },
    {
      category: 'Interface System/Installation Etc',
      items: [
        { sno: '1', desc: 'XLR Connectors with face plates(4i/p)', make: 'Reputed', model: 'Various', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '2', desc: 'antena cable ,AV Patch Cables, Lan Cable, Speaker Cable, Audio Cable, Cob3/kramer /Belden 1855A / Sennheiser/', make: 'BELDEN 1855A / Sennheiser /', model: 'Lot', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '5', desc: 'Installation, Commissioning & programming of DSP', make: 'Custom', model: 'Job', qty: '1', warranty: '36 Months minimum', remarks: 'Programming sholud be done on SRMAP mail id' },
        { sno: '6', desc: '22 U Floor Rack with accessories', make: 'legrand', model: 'Valrack', qty: '1', warranty: '36 Months minimum', remarks: '' },
        { sno: '7', desc: 'HDMI Cables', make: 'Honywell/ Kramer', model: 'Lot', qty: '1', warranty: '36 Months minimum', remarks: '' },
      ],
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#f7f9fc]">
      <TopHeader
        breadcrumb={{
          category: 'Projects',
          title: `${project.project_code || project.id}: ${project.name}`,
        }}
      />

      {/* 3-Pane Command Center Workspace */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Panel: File Tree Explorer */}
        {!leftTreeCollapsed && (
          <aside className="w-72 bg-white border-r border-[#c5c6ce] flex flex-col overflow-hidden select-none shrink-0 z-20">
            <div className="p-3 border-b border-[#c5c6ce] bg-[#f2f4f7] flex justify-between items-center">
              <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider">
                Project Repository
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowAddFileModal(true)}
                  className="text-[10px] font-bold text-white bg-[#005FB7] hover:bg-[#05162e] px-2 py-0.5 rounded flex items-center gap-1 transition-colors shadow-sm"
                  title="Add Files to Project"
                >
                  <span className="material-symbols-outlined text-[12px]">
                    add
                  </span>
                  Add File
                </button>
                <button
                  onClick={() => setLeftTreeCollapsed(true)}
                  className="p-1 hover:bg-[#e0e3e6] rounded text-[#44474d]"
                  title="Collapse Tree Explorer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    chevron_left
                  </span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {fileList.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-6 text-[#75777e] gap-2 my-8 border border-dashed rounded bg-[#f7f9fc]">
                  <span className="material-symbols-outlined text-[32px] text-[#005FB7]">
                    folder_open
                  </span>
                  <p className="text-xs font-bold text-[#05162e]">No files attached yet</p>
                  <p className="text-[11px]">Click "+ Add File" above to attach single or multiple drawings.</p>
                </div>
              ) : (
                <>
                  {/* Drawings Section */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#eceef1] rounded text-xs font-bold text-[#05162e]">
                      <span className="material-symbols-outlined text-[16px] text-[#005FB7]">
                        folder_open
                      </span>
                      <span>Drawings & Schematics</span>
                    </div>
                    <div className="ml-2 border-l border-[#c5c6ce] pl-1.5 flex flex-col gap-1 mt-1">
                      {fileList
                        .filter(
                          (f: any) => f.section === 'Drawings' || f.folder === 'Drawings'
                        )
                        .map((file: any) => (
                          <div
                            key={file.id}
                            className={`flex items-center justify-between px-2 py-1.5 rounded text-xs group transition-colors ${
                              activeFile?.id === file.id && centerViewMode === 'renderer'
                                ? 'bg-[#d6e3ff] text-[#001b3c] font-bold border-l-2 border-[#005FB7]'
                                : 'text-[#44474d] hover:bg-[#eceef1] hover:text-[#05162e]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setActiveFile(file);
                                setCenterViewMode('renderer');
                              }}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            >
                              <span className="material-symbols-outlined text-[16px] text-[#4b5f7d] shrink-0">
                                {file.rendererType === 'image' ? 'image' : 'draft'}
                              </span>
                              <span className="truncate">{file.name}</span>
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0 ml-1">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDownloadFile(file);
                                }}
                                className="p-1 text-[#005FB7] hover:bg-white hover:text-[#05162e] rounded transition-colors"
                                title={`Download untampered ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  download
                                </span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteIndividualFile(file.id, file.name);
                                }}
                                className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
                                title={`Delete ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Specifications Section */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#eceef1] rounded text-xs font-bold text-[#05162e]">
                      <span className="material-symbols-outlined text-[16px] text-[#005FB7]">
                        folder
                      </span>
                      <span>Specifications & Architecture</span>
                    </div>
                    <div className="ml-2 border-l border-[#c5c6ce] pl-1.5 flex flex-col gap-1 mt-1">
                      {fileList
                        .filter(
                          (f: any) =>
                            f.section === 'Specifications' ||
                            f.folder === 'Specifications'
                        )
                        .map((file: any) => (
                          <div
                            key={file.id}
                            className={`flex items-center justify-between px-2 py-1.5 rounded text-xs group transition-colors ${
                              activeFile?.id === file.id && centerViewMode === 'renderer'
                                ? 'bg-[#d6e3ff] text-[#001b3c] font-bold border-l-2 border-[#005FB7]'
                                : 'text-[#44474d] hover:bg-[#eceef1] hover:text-[#05162e]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setActiveFile(file);
                                setCenterViewMode('renderer');
                              }}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            >
                              <span className="material-symbols-outlined text-[16px] text-[#4b5f7d] shrink-0">
                                {file.rendererType === 'markdown'
                                  ? 'article'
                                  : 'account_tree'}
                              </span>
                              <span className="truncate">{file.name}</span>
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0 ml-1">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDownloadFile(file);
                                }}
                                className="p-1 text-[#005FB7] hover:bg-white hover:text-[#05162e] rounded transition-colors"
                                title={`Download untampered ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  download
                                </span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteIndividualFile(file.id, file.name);
                                }}
                                className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
                                title={`Delete ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* BOQ Section */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#eceef1] rounded text-xs font-bold text-[#05162e]">
                      <span className="material-symbols-outlined text-[16px] text-[#005FB7]">
                        folder
                      </span>
                      <span>Bill of Quantities (BOQ)</span>
                    </div>
                    <div className="ml-2 border-l border-[#c5c6ce] pl-1.5 flex flex-col gap-1 mt-1">
                      {fileList
                        .filter((f: any) => f.section === 'BOQ' || f.folder === 'BOQ')
                        .map((file: any) => (
                          <div
                            key={file.id}
                            className={`flex items-center justify-between px-2 py-1.5 rounded text-xs group transition-colors ${
                              activeFile?.id === file.id && centerViewMode === 'renderer'
                                ? 'bg-[#d6e3ff] text-[#001b3c] font-bold border-l-2 border-[#005FB7]'
                                : 'text-[#44474d] hover:bg-[#eceef1] hover:text-[#05162e]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setActiveFile(file);
                                setCenterViewMode('renderer');
                              }}
                              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            >
                              <span className="material-symbols-outlined text-[16px] text-[#4b5f7d] shrink-0">
                                table_chart
                              </span>
                              <span className="truncate">{file.name}</span>
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0 ml-1">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDownloadFile(file);
                                }}
                                className="p-1 text-[#005FB7] hover:bg-white hover:text-[#05162e] rounded transition-colors"
                                title={`Download untampered ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  download
                                </span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteIndividualFile(file.id, file.name);
                                }}
                                className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
                                title={`Delete ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Download All Package Button */}
            <div className="p-3 border-t border-[#c5c6ce] bg-[#f2f4f7]">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDownloadAllZip();
                }}
                className="w-full bg-[#05162e] text-white hover:bg-[#005FB7] transition-colors py-2 rounded text-xs font-bold flex items-center justify-center gap-2 border border-[#05162e]"
              >
                <span className="material-symbols-outlined text-[16px]">
                  folder_zip
                </span>
                <span>Download All Files (.zip)</span>
              </button>
            </div>
          </aside>
        )}

        {/* Center Panel: Workspace & Full-Width Single Active Document Renderer */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#f7f9fc] relative overflow-hidden">
          {/* Renderer Header Toolbar: Structured in 2 Clean Sub-Bar Rows */}
          <div className="bg-white border-b border-[#c5c6ce] flex flex-col select-none shrink-0 shadow-sm z-10">
            {/* Top Row: Navigation Tabs & Main Actions */}
            <div className="h-11 px-3 flex items-center justify-between gap-3 border-b border-[#eceef1]">
              {/* Left: Repository Expand + View Tabs */}
              <div className="flex items-center gap-2 shrink-0">
                {leftTreeCollapsed && (
                  <button
                    onClick={() => setLeftTreeCollapsed(false)}
                    className="px-2 py-1 bg-[#eceef1] border border-[#c5c6ce] hover:bg-[#005FB7] hover:text-white text-[#005FB7] rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"
                    title="Expand Repository Tree"
                  >
                    <span className="material-symbols-outlined text-[15px]">chevron_right</span>
                    <span>Repository</span>
                  </button>
                )}

                <div className="flex bg-[#eceef1] rounded p-0.5 text-xs font-semibold shrink-0">
                  <button
                    onClick={() => setCenterViewMode('renderer')}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      centerViewMode === 'renderer'
                        ? 'bg-white text-[#05162e] font-bold shadow-sm'
                        : 'text-[#44474d] hover:text-[#05162e]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">visibility</span>
                    <span>Active Renderer</span>
                  </button>
                  <button
                    onClick={() => setCenterViewMode('fileList')}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      centerViewMode === 'fileList'
                        ? 'bg-white text-[#05162e] font-bold shadow-sm'
                        : 'text-[#44474d] hover:text-[#05162e]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">inventory_2</span>
                    <span>All Files ({fileList.length})</span>
                  </button>
                </div>
              </div>

              {/* Right: Asset Download & Delete Actions */}
              <div className="flex items-center gap-2 shrink-0">

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteEntireProject();
                  }}
                  className="px-3 py-1 bg-[#ba1a1a] text-white hover:bg-[#05162e] transition-colors rounded text-xs font-bold flex items-center gap-1 shadow-sm"
                  title="Delete Project Trace"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>Delete Project</span>
                </button>

                {rightPanelCollapsed && (
                  <button
                    onClick={() => setRightPanelCollapsed(false)}
                    className="p-1.5 bg-[#eceef1] border border-[#c5c6ce] hover:bg-[#005FB7] hover:text-white text-[#005FB7] rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-sm ml-1"
                    title="Expand Metadata Inspector"
                  >
                    <span className="material-symbols-outlined text-[15px]">chevron_left</span>
                    <span>Inspector</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sub Row 2: Active Asset Name & Zoom Controls */}
            {centerViewMode === 'renderer' && activeFile && (
              <div className="h-9 px-3 bg-[#f7f9fc] flex items-center justify-between text-xs border-t border-[#eceef1]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[16px] text-[#005FB7] shrink-0">
                    {activeFile.rendererType === 'excel' ? 'table_chart' : activeFile.rendererType === 'drawio' ? 'draft' : 'description'}
                  </span>
                  <span className="font-bold text-[#05162e] font-mono truncate max-w-[320px]">
                    {activeFile.name}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#005FB7] bg-[#d6e3ff] px-1.5 py-0.5 rounded shrink-0">
                    {activeFile.version}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0 flex items-center gap-1 border shadow-2xs transition-colors ${
                      activeFile.cacheTier === 'L1' || activeFile.source?.includes('L1') || activeFile.source?.includes('RAM') || activeFile.source?.includes('Memory')
                        ? 'bg-[#e2f0d9] text-[#1e4620] border-[#b5d5a7]'
                        : activeFile.cacheTier === 'L2' || activeFile.source?.includes('L2') || activeFile.source?.includes('CacheStorage') || activeFile.source?.includes('Browser')
                        ? 'bg-[#d0f0fd] text-[#004a6b] border-[#92daf7]'
                        : activeFile.source?.includes('CDN') || activeFile.source?.includes('Hit')
                        ? 'bg-[#e8def8] text-[#4a2574] border-[#d0bcff]'
                        : 'bg-[#d6e3ff] text-[#001b3c] border-[#9ec2ff]'
                    }`}
                    title={`3-Tier Cache Engine:\n• Tier: ${activeFile.cacheTier || (activeFile.source?.includes('RAM') ? 'L1' : activeFile.source?.includes('Cache') ? 'L2' : 'L3')}\n• Source: ${activeFile.source || 'Supabase Direct Storage'}\n• Latency: ${activeFile.latencyMs !== undefined ? `${activeFile.latencyMs} ms` : 'N/A'}`}
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {activeFile.cacheTier === 'L1' || activeFile.source?.includes('RAM') || activeFile.source?.includes('Memory')
                        ? 'bolt'
                        : activeFile.cacheTier === 'L2' || activeFile.source?.includes('Cache') || activeFile.source?.includes('Browser')
                        ? 'save'
                        : activeFile.source?.includes('CDN')
                        ? 'cloud_done'
                        : 'cloud_download'}
                    </span>
                    <span>
                      Source: {activeFile.source || 'Supabase Direct Storage'}
                      {activeFile.latencyMs !== undefined && (
                        <span className="ml-1 opacity-90 font-semibold">• {activeFile.latencyMs} ms</span>
                      )}
                    </span>
                  </span>
                </div>

                {/* Clean Zoom Bar */}
                <div className="flex items-center gap-1 bg-white border border-[#c5c6ce] rounded px-1 py-0.5 shrink-0 shadow-xs">
                  <button
                    onClick={() => setZoomLevel((z: any) => Math.max(50, z - 25))}
                    className="p-0.5 hover:bg-[#eceef1] text-[#44474d] rounded transition-colors"
                    title="Zoom Out"
                  >
                    <span className="material-symbols-outlined text-[15px]">zoom_out</span>
                  </button>
                  <span className="text-[11px] font-mono font-bold px-2 text-[#05162e]">
                    {zoomLevel}%
                  </span>
                  <button
                    onClick={() => setZoomLevel((z: any) => Math.min(200, z + 25))}
                    className="p-0.5 hover:bg-[#eceef1] text-[#44474d] rounded transition-colors"
                    title="Zoom In"
                  >
                    <span className="material-symbols-outlined text-[15px]">zoom_in</span>
                  </button>
                  <div className="w-px h-3 bg-[#c5c6ce] mx-0.5"></div>
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="p-0.5 hover:bg-[#eceef1] text-[#44474d] rounded transition-colors"
                    title="Reset Zoom (100%)"
                  >
                    <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mode 1: Single Active Document Renderer */}
          {centerViewMode === 'renderer' ? (
            <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start bg-[#e6e8eb]/40">
              <div
                className="bg-white border border-[#c5c6ce] rounded shadow-sm w-full h-full min-h-[580px] p-6 transition-all overflow-auto flex flex-col"
                style={{
                  zoom: `${zoomLevel}%`,
                }}
              >
                {!activeFile ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-20 text-[#75777e]">
                    <span className="material-symbols-outlined text-[48px] text-[#005FB7]">
                      folder_open
                    </span>
                    <p className="text-sm font-bold text-[#05162e]">No active file selected</p>
                    <p className="text-xs">Click "+ Add File" above to attach single or multiple technical files</p>
                    <button
                      onClick={() => setShowAddFileModal(true)}
                      className="mt-2 px-4 py-2 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      <span>+ Attach Technical Files</span>
                    </button>
                  </div>
                ) : (() => {
                  const lowerName = activeFile.name.toLowerCase();

                  const getFileTextContent = (file: FileItem): string => {
                    if (file.content) return file.content;
                    if (file.fileDataUrl) {
                      if (file.fileDataUrl.startsWith('data:')) {
                        try {
                          const parts = file.fileDataUrl.split(',');
                          if (parts.length > 1) {
                            return decodeURIComponent(escape(atob(parts[1])));
                          }
                        } catch (e) {
                          try {
                            return atob(file.fileDataUrl.split(',')[1]);
                          } catch (err) {}
                        }
                      }
                      return file.fileDataUrl;
                    }
                    return '';
                  };

                  // 1. Plain Text / Command Log / Config Renderer (.txt, .log, .conf, .sh, .json, etc.)
                  if (
                    activeFile.rendererType === 'text' ||
                    lowerName.endsWith('.txt') ||
                    lowerName.endsWith('.log') ||
                    lowerName.endsWith('.conf') ||
                    lowerName.endsWith('.sh') ||
                    lowerName.endsWith('.json') ||
                    lowerName.endsWith('.yaml') ||
                    lowerName.endsWith('.yml') ||
                    lowerName.endsWith('.ini')
                  ) {
                    const textContent = getFileTextContent(activeFile);
                    const ext = activeFile.name.includes('.')
                      ? activeFile.name.substring(activeFile.name.lastIndexOf('.')).toLowerCase()
                      : '.txt';

                    return (
                      <div className="flex flex-col gap-3 w-full h-full flex-1 min-h-0">
                        {/* Renderer Header */}
                        <div className="flex justify-between items-center border-b border-[#c5c6ce] pb-2 shrink-0">
                          <div>
                            <h4 className="text-xs font-bold text-[#05162e] flex items-center gap-1.5">
                              {activeFile.name}
                              <span className="px-1.5 py-0.5 bg-[#005FB7] text-white text-[10px] font-mono rounded uppercase">
                                {ext.replace('.', '') || 'TXT'}
                              </span>
                            </h4>
                            <p className="text-[10px] text-[#44474d]">
                              Plain Text Document • Technical Configuration / Command Log Asset
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (textContent) {
                                  navigator.clipboard.writeText(textContent);
                                  alert('Copied text content to clipboard!');
                                }
                              }}
                              className="px-2.5 py-1 bg-[#eceef1] text-[#05162e] hover:bg-[#c5c6ce] rounded text-xs font-semibold transition-colors border border-[#c5c6ce] flex items-center gap-1"
                              title="Copy raw text to clipboard"
                            >
                              <span className="material-symbols-outlined text-[14px]">content_copy</span>
                              <span>Copy Text</span>
                            </button>
                            <button
                              onClick={() => handleDownloadFile(activeFile)}
                              className="px-3 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">download</span>
                              <span>Download {ext || '.txt'}</span>
                            </button>
                          </div>
                        </div>

                        {/* High Density Monospace Plain Text View */}
                        <div className="flex-1 bg-[#05162e] text-[#e1e2e5] border border-[#c5c6ce] rounded-lg shadow-inner overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap min-h-[500px]">
                          {textContent || 'Empty text file content.'}
                        </div>
                      </div>
                    );
                  }

                  // 2. PDF Viewer — renders actual PDF files using native browser engine
                  if (
                    (activeFile.rendererType === 'pdf' || lowerName.endsWith('.pdf')) &&
                    !lowerName.endsWith('.txt')
                  ) {
                    return (
                      <PdfViewer
                        fileName={activeFile.name}
                        fileDataUrl={activeFile.fileDataUrl}
                        onDownload={() => handleDownloadFile(activeFile)}
                      />
                    );
                  }

                  // 2. High-Density Excel BOQ Spreadsheet Renderer with SheetJS (Dynamic Parsing + Exact Verbatim Rows)
                  if (
                    activeFile.rendererType === 'excel' ||
                    lowerName.endsWith('.xlsx') ||
                    lowerName.endsWith('.csv')
                  ) {
                    // Check if dynamic parsed sheets exist for this uploaded file
                    const hasDynamicData =
                      dynamicExcelData[activeExcelSheet] && dynamicExcelData[activeExcelSheet].length > 0;

                    const currentBoqSections =
                      activeExcelSheet === '240' ? EXCEL_BOQ_DATA_240_EXACT : EXCEL_BOQ_DATA_120_EXACT;

                    return (
                      <div className="flex flex-col gap-3 w-full h-full min-h-0 flex-1">
                        {/* Renderer Header */}
                        <div className="flex justify-between items-center border-b border-[#c5c6ce] pb-2 shrink-0">
                          <div>
                            <h4 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
                              <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                                table_chart
                              </span>
                              {activeFile.name}
                            </h4>
                            <p className="text-[11px] text-[#44474d]">
                              Parsed SheetJS High-Density Equipment Bill of Quantities (Worksheet: <strong className="text-[#005FB7]">{activeExcelSheet}</strong>)
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 bg-[#d4e3ff] text-[#041c36] text-xs font-mono font-bold rounded">
                              .xlsx Spreadsheet
                            </span>
                            <button
                              onClick={() => handleDownloadFile(activeFile)}
                              className="px-2.5 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                download
                              </span>
                              <span>Download Original XLSX</span>
                            </button>
                          </div>
                        </div>

                        {/* High Density Table Body */}
                        <div className="flex-1 overflow-auto border border-[#001b3c] rounded bg-white font-sans text-xs">
                          {hasDynamicData ? (
                            /* Dynamic SheetJS Parsed Table for Uploaded XLSX Files */
                            <table className="w-full text-left border-collapse text-[11px]">
                              <tbody className="divide-y divide-[#c5c6ce] text-[#05162e]">
                                {dynamicExcelData[activeExcelSheet].map((rowArr: any, rowIdx: any) => {
                                  const isHeader = rowIdx === 0 || rowArr.some((c: any) => String(c).toUpperCase() === 'DESCRIPTION' || String(c).toUpperCase() === 'MAKE' || String(c).toUpperCase() === 'SNO' || String(c).toUpperCase() === 'S/N');
                                  const isSectionHeader = !isHeader && (rowArr.length === 1 || (rowArr.filter((c: any) => String(c).trim() !== '').length === 1 && !rowArr[0]?.toString().match(/^\d+$/)));

                                  if (isHeader) {
                                    return (
                                      <tr
                                        key={rowIdx}
                                        className="bg-[#05162e] text-white font-bold sticky top-0 z-10 text-xs"
                                      >
                                        {rowArr.map((cell: any, cellIdx: number) => (
                                          <td
                                            key={cellIdx}
                                            className="p-2.5 border-r border-[#1b3a60] uppercase tracking-wider"
                                          >
                                            {String(cell)}
                                          </td>
                                        ))}
                                      </tr>
                                    );
                                  }

                                  if (isSectionHeader) {
                                    return (
                                      <tr key={rowIdx} className="bg-[#e2f0d9] font-bold text-[#05162e] border-y border-[#b5d5a7]">
                                        <td colSpan={rowArr.length} className="p-2 pl-3 tracking-wider text-[11px] uppercase">
                                          {rowArr.find((c: any) => String(c).trim() !== '')}
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return (
                                    <tr
                                      key={rowIdx}
                                      className="hover:bg-[#f2f4f7] transition-colors"
                                    >
                                      {rowArr.map((cell: any, cellIdx: number) => {
                                        const cellText = String(cell);
                                        const isModelCol = cellIdx === 3 || cellText.includes('-') || cellText.includes('/');
                                        const isQtyCol = cellIdx === 4 || cellText.match(/^\d+$/);
                                        
                                        return (
                                          <td
                                            key={cellIdx}
                                            className={`p-2 border-r border-[#c5c6ce] ${
                                              isModelCol ? 'font-mono text-[#005FB7] font-semibold' : ''
                                            }`}
                                          >
                                            {cellText}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            /* Full Complete Verbatim Render for 09 Jul 2026 120 and 240 updated for final (2).xlsx */
                            <table className="w-full text-left border-collapse text-[11px]">
                              <thead className="bg-[#05162e] text-white font-bold sticky top-0 z-10">
                                <tr>
                                  <th className="border-r border-[#1b3a60] p-2 w-12 text-center">
                                    {activeExcelSheet === '240' ? 'S/N' : 'Sno'}
                                  </th>
                                  <th className="border-r border-[#1b3a60] p-2">
                                    Description
                                  </th>
                                  <th className="border-r border-[#1b3a60] p-2 w-36">
                                    Make
                                  </th>
                                  <th className="border-r border-[#1b3a60] p-2 w-48">
                                    Model
                                  </th>
                                  <th className="border-r border-[#1b3a60] p-2 w-12 text-center">
                                    Qty
                                  </th>
                                  <th className="border-r border-[#1b3a60] p-2 w-36">
                                    Warranty
                                  </th>
                                  <th className="p-2 w-52">
                                    Remarks
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#c5c6ce] text-[#05162e]">
                                {currentBoqSections.map((sec, secIdx) => (
                                  <React.Fragment key={secIdx}>
                                    {/* Section Header Row (Light Green Highlighted matching Excel) */}
                                    <tr className="bg-[#e2f0d9] font-bold text-[#05162e] border-y border-[#b5d5a7]">
                                      <td colSpan={7} className="p-1.5 pl-3 tracking-wider text-[11px]">
                                        {sec.category}
                                      </td>
                                    </tr>
                                    {/* Item Rows */}
                                    {sec.items.map((item, itemIdx) => (
                                      <tr key={itemIdx} className="hover:bg-[#f2f4f7] transition-colors">
                                        <td className="border-r border-[#c5c6ce] p-1.5 text-center font-mono font-semibold">
                                          {item.sno}
                                        </td>
                                        <td className="border-r border-[#c5c6ce] p-1.5 font-medium">
                                          {item.desc}
                                        </td>
                                        <td className="border-r border-[#c5c6ce] p-1.5 text-[#44474d]">
                                          {item.make}
                                        </td>
                                        <td className="border-r border-[#c5c6ce] p-1.5 font-mono text-[#005FB7]">
                                          {item.model}
                                        </td>
                                        <td className="border-r border-[#c5c6ce] p-1.5 text-center font-mono font-bold">
                                          {item.qty}
                                        </td>
                                        <td className="border-r border-[#c5c6ce] p-1.5 text-[#44474d]">
                                          {item.warranty}
                                        </td>
                                        <td className="p-1.5 text-[#75777e] italic text-[10px]">
                                          {item.remarks}
                                        </td>
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                ))}

                                {/* Verbatim Excel Footer Notes Section */}
                                <tr className="bg-[#f2f4f7]">
                                  <td colSpan={7} className="p-2 border-t border-[#c5c6ce] text-[10px] text-[#44474d]">
                                    <p className="font-bold">
                                      {activeExcelSheet === '240'
                                        ? 'Note : For video conference mini PC will be used from podium. Audio and video should come from mini PC'
                                        : 'Note : For video conference mini PC will be used . Audio and video should come from mini PC'}
                                    </p>
                                    <p className="mt-1">
                                      If any items are missing, they can be added under the above-mentioned approved makes during the final BOQ preparation.
                                    </p>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Interactive Dynamic Sheet Tabs */}
                        <div className="flex items-center gap-1 pt-2 border-t border-[#c5c6ce] shrink-0 bg-[#f2f4f7] px-2 py-1 rounded">
                          <span className="text-[11px] font-bold text-[#44474d] mr-2">Worksheets:</span>
                          {excelSheets.map((sheetName) => (
                            <button
                              key={sheetName}
                              onClick={() => setActiveExcelSheet(sheetName)}
                              className={`px-3 py-1 text-xs font-mono font-bold rounded transition-colors ${
                                activeExcelSheet === sheetName
                                  ? 'bg-[#005FB7] text-white shadow-sm'
                                  : 'bg-white border border-[#c5c6ce] text-[#05162e] hover:bg-[#eceef1]'
                              }`}
                            >
                              {sheetName}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // 3. OFFICIAL DRAW.IO EMBED VIEWER (NATIVE GRAPH ENGINE WITH EXACT CONNECTORS & MULTI-PAGE SUPPORT)
                  if (
                    activeFile.rendererType === 'drawio' ||
                    lowerName.endsWith('.dwg') ||
                    lowerName.endsWith('.drawio')
                  ) {
                    return (
                      <DrawioOfficialViewer
                        fileName={activeFile.name}
                        xmlDataUrl={activeFile.fileDataUrl}
                        xmlRawContent={activeFile.content}
                        onDownload={() => handleDownloadFile(activeFile)}
                      />
                    );
                  }

                  // 4. Image Renderer
                  if (activeFile.rendererType === 'image' || lowerName.endsWith('.png') || lowerName.endsWith('.jpg')) {
                    if (activeFile.fileDataUrl) {
                      return (
                        <div className="flex flex-col gap-3 w-full h-full flex-1 items-center justify-center">
                          <img
                            src={activeFile.fileDataUrl}
                            alt={activeFile.name}
                            className="max-w-full max-h-[550px] object-contain border border-[#c5c6ce] rounded shadow-sm"
                          />
                        </div>
                      );
                    }
                  }

                  // 5. PlantUML Renderer
                  if (activeFile.rendererType === 'plantuml') {
                    return (
                      <div className="flex flex-col gap-4 w-full h-full">
                        <div className="flex justify-between items-center border-b border-[#c5c6ce] pb-3">
                          <div>
                            <h4 className="text-sm font-bold text-[#05162e]">
                              {activeFile.name} (PlantUML Specification)
                            </h4>
                            <p className="text-xs text-[#44474d]">
                              Text-based UML diagram renderer
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-[#d4e3ff] text-[#041c36] text-xs font-mono font-bold rounded">
                              .puml
                            </span>
                            <button
                              onClick={() => handleDownloadFile(activeFile)}
                              className="px-2.5 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                download
                              </span>
                              <span>Download PUML</span>
                            </button>
                          </div>
                        </div>
                        <pre className="bg-[#05162e] text-white p-5 rounded font-mono text-xs leading-relaxed overflow-x-auto border border-[#05162e] w-full flex-1">
                          {activeFile.content ||
                            `@startuml\ntitle ${activeFile.name}\nnode ${project.name}\nnode ${activeFile.name}\n${project.name} -> ${activeFile.name} : 100G Link\n@enduml`}
                        </pre>
                      </div>
                    );
                  }

                  // 6. Markdown Renderer
                  if (activeFile.rendererType === 'markdown') {
                    return (
                      <div className="flex flex-col gap-4 w-full h-full">
                        <div className="flex justify-between items-center border-b border-[#c5c6ce] pb-3">
                          <div>
                            <h4 className="text-sm font-bold text-[#05162e]">
                              {activeFile.name} (Markdown Specification)
                            </h4>
                            <p className="text-xs text-[#44474d]">
                              Structured documentation renderer
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-[#eceef1] text-[#05162e] text-xs font-mono font-bold rounded">
                              .md
                            </span>
                            <button
                              onClick={() => handleDownloadFile(activeFile)}
                              className="px-2.5 py-1 bg-[#005FB7] text-white hover:bg-[#05162e] rounded text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                download
                              </span>
                              <span>Download MD</span>
                            </button>
                          </div>
                        </div>
                        <pre className="bg-[#f7f9fc] border border-[#c5c6ce] p-5 rounded font-sans text-xs text-[#191c1e] leading-relaxed whitespace-pre-wrap w-full flex-1 overflow-auto">
                          {activeFile.content ||
                            `# Technical Specification: ${activeFile.name}\n\n## Overview\n- File Name: ${activeFile.name}\n- Project: ${project.name}\n- Category: ${project.category}\n- Client: ${project.client}`}
                        </pre>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col items-center justify-center gap-4 text-center py-16">
                      <span className="material-symbols-outlined text-[56px] text-[#005FB7]">
                        description
                      </span>
                      <div>
                        <h4 className="text-base font-bold text-[#05162e]">
                          {activeFile.name}
                        </h4>
                        <p className="text-xs text-[#44474d] mt-1">
                          {activeFile.type} • {activeFile.size}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownloadFile(activeFile)}
                        className="px-4 py-2 bg-[#005FB7] text-white rounded text-xs font-semibold hover:bg-[#05162e] transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          download
                        </span>
                        Download Untampered Binary Asset
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* Mode 2: High Density Table of All Project Files & Download Links */
            <div className="flex-1 overflow-auto p-4 bg-[#f7f9fc] w-full">
              <div className="bg-white border border-[#c5c6ce] rounded shadow-sm overflow-hidden flex flex-col min-w-full">
                <div className="p-4 bg-[#f2f4f7] border-b border-[#c5c6ce] flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-[#05162e]">
                      Available Files & Downloads Repository
                    </h3>
                    <p className="text-xs text-[#44474d]">
                      Full file inventory for project: {project.project_code || project.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleDownloadAllZip();
                      }}
                      className="px-3 py-1.5 bg-[#05162e] text-white rounded text-xs font-bold hover:bg-[#005FB7] transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        folder_zip
                      </span>
                      <span>Download All (.zip)</span>
                    </button>
                    <button
                      onClick={() => setShowAddFileModal(true)}
                      className="px-3 py-1.5 bg-[#005FB7] text-white rounded text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        add
                      </span>
                      <span>Add File</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                    <thead className="bg-[#f2f4f7] font-bold text-[#05162e] border-b border-[#c5c6ce]">
                      <tr>
                        <th className="p-3">File Name</th>
                        <th className="p-3 w-28">Section</th>
                        <th className="p-3 w-36">Format Type</th>
                        <th className="p-3 w-20">Revision</th>
                        <th className="p-3 w-24">File Size</th>
                        <th className="p-3 w-44 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c5c6ce] text-[#191c1e]">
                      {fileList.map((file) => (
                        <tr key={file.id} className="hover:bg-[#f7f9fc] transition-colors">
                          <td className="p-3 font-semibold text-[#05162e] flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined text-[18px] text-[#005FB7] shrink-0">
                              {file.rendererType === 'excel'
                                ? 'table_chart'
                                : file.rendererType === 'drawio'
                                ? 'draft'
                                : file.rendererType === 'plantuml'
                                ? 'account_tree'
                                : 'description'}
                            </span>
                            <span className="truncate">{file.name}</span>
                          </td>
                          <td className="p-3 text-[#44474d]">{file.section}</td>
                          <td className="p-3 font-mono text-[#005FB7] font-bold">
                            {file.type}
                          </td>
                          <td className="p-3 font-mono font-bold text-[#05162e]">
                            {file.version}
                          </td>
                          <td className="p-3 font-mono text-[#44474d]">{file.size}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setActiveFile(file);
                                  setCenterViewMode('renderer');
                                }}
                                className="px-2 py-1 rounded bg-[#d6e3ff] text-[#001b3c] hover:bg-[#005FB7] hover:text-white transition-colors text-[11px] font-bold flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  visibility
                                </span>
                                <span>Render</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDownloadFile(file);
                                }}
                                className="px-2 py-1 rounded bg-[#005FB7] text-white hover:bg-[#05162e] transition-colors text-[11px] font-bold flex items-center gap-1 shadow-sm"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  download
                                </span>
                                <span>Download</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteIndividualFile(file.id, file.name);
                                }}
                                className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
                                title={`Delete ${file.name}`}
                              >
                                <span className="material-symbols-outlined text-[15px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel: Metadata & Inspector with Dedicated Downloads Tab */}
        {!rightPanelCollapsed ? (
          <aside className="w-80 bg-white border-l border-[#c5c6ce] flex flex-col overflow-hidden select-none shrink-0 z-20">
            <div className="border-b border-[#c5c6ce] bg-[#f2f4f7] flex justify-between items-center text-xs font-semibold text-[#44474d] pr-2">
              <div className="flex-1 flex overflow-x-auto">
                <button
                  onClick={() => setRightPanelTab('metadata')}
                  className={`px-3 py-2.5 text-center border-b-2 whitespace-nowrap transition-colors ${
                    rightPanelTab === 'metadata'
                      ? 'border-[#005FB7] text-[#05162e] font-bold bg-white'
                      : 'border-transparent hover:text-[#05162e]'
                  }`}
                >
                  Metadata
                </button>
                <button
                  onClick={() => setRightPanelTab('downloads')}
                  className={`px-3 py-2.5 text-center border-b-2 whitespace-nowrap transition-colors ${
                    rightPanelTab === 'downloads'
                      ? 'border-[#005FB7] text-[#05162e] font-bold bg-white'
                      : 'border-transparent hover:text-[#05162e]'
                  }`}
                >
                  Downloads ({fileList.length})
                </button>
                <button
                  onClick={() => setRightPanelTab('activity')}
                  className={`px-3 py-2.5 text-center border-b-2 whitespace-nowrap transition-colors ${
                    rightPanelTab === 'activity'
                      ? 'border-[#005FB7] text-[#05162e] font-bold bg-white'
                      : 'border-transparent hover:text-[#05162e]'
                  }`}
                >
                  Activity
                </button>
                <button
                  onClick={() => setRightPanelTab('comments')}
                  className={`px-3 py-2.5 text-center border-b-2 whitespace-nowrap transition-colors ${
                    rightPanelTab === 'comments'
                      ? 'border-[#005FB7] text-[#05162e] font-bold bg-white'
                      : 'border-transparent hover:text-[#05162e]'
                  }`}
                >
                  Comments
                </button>
              </div>
              <button
                onClick={() => setRightPanelCollapsed(true)}
                className="p-1 hover:bg-[#e0e3e6] rounded text-[#44474d] shrink-0 ml-1"
                title="Collapse Inspector"
              >
                <span className="material-symbols-outlined text-[16px]">
                  chevron_right
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
              {rightPanelTab === 'metadata' && (
                <div className="flex flex-col gap-4">
                  {activeFile && (
                    <div className="bg-[#f7f9fc] border border-[#c5c6ce] rounded p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-[#05162e] uppercase text-[11px] tracking-wider text-[#005FB7]">
                          Active Asset Metadata
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleDownloadFile(activeFile);
                            }}
                            className="text-[#005FB7] hover:underline text-[11px] font-bold flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              download
                            </span>
                            <span>Download</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleDeleteIndividualFile(activeFile.id, activeFile.name);
                            }}
                            className="text-[#ba1a1a] hover:underline text-[11px] font-bold flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              delete
                            </span>
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[#75777e] block">Asset ID</span>
                          <span className="font-mono text-[#05162e] font-semibold truncate block">
                            {activeFile.id}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#75777e] block">Revision</span>
                          <span className="font-mono font-bold text-[#005FB7]">
                            {activeFile.version}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#75777e] block">MIME Type</span>
                          <span className="font-mono text-[#44474d]">
                            {activeFile.type}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#75777e] block">File Size</span>
                          <span className="font-mono text-[#44474d]">
                            {activeFile.size}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border border-[#c5c6ce] rounded p-3 flex flex-col gap-2.5 bg-white shadow-2xs">
                    <h4 className="font-bold text-[#05162e] text-xs pb-1 border-b border-[#eceef1] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>Project Info</span>
                        {!isEditingProjectInfo ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditProjectData(project);
                                setIsEditingProjectInfo(true);
                              }}
                              className="p-0.5 text-[#005FB7] hover:bg-[#eceef1] rounded"
                              title="Edit Project Info"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                            <button
                              onClick={() => setShowShareModal(true)}
                              className="p-0.5 text-[#2e5b15] hover:bg-[#e2f0d9] rounded"
                              title="Share Project Publicly"
                            >
                              <span className="material-symbols-outlined text-[14px]">share</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleSaveProjectInfo}
                              disabled={savingProjectInfo}
                              className="px-2 py-0.5 bg-[#005FB7] text-white rounded text-[10px] hover:bg-[#05162e] transition-colors disabled:opacity-50"
                            >
                              {savingProjectInfo ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setIsEditingProjectInfo(false)}
                              disabled={savingProjectInfo}
                              className="p-0.5 text-[#ba1a1a] hover:bg-[#ffdad6] rounded text-[10px] disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditingProjectInfo ? (
                        <span className="px-1.5 py-0.5 bg-[#d6e3ff] text-[#001b3c] text-[10px] font-mono font-bold rounded">
                          {project.status || 'In Design'}
                        </span>
                      ) : (
                        <select
                          className="px-1 py-0.5 bg-[#f7f9fc] border border-[#c5c6ce] rounded text-[10px] font-mono font-bold text-[#05162e]"
                          value={editProjectData?.status || 'In Design'}
                          onChange={(e) => setEditProjectData({ ...editProjectData, status: e.target.value })}
                        >
                          <option value="In Design">In Design</option>
                          <option value="In Progress">In Progress</option>
                          <option value="On Hold">On Hold</option>
                          <option value="Completed">Completed</option>
                        </select>
                      )}
                    </h4>

                    {/* Project Title */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-[#75777e]">Project Title</span>
                      {!isEditingProjectInfo ? (
                        <span className="text-xs font-bold text-[#05162e] leading-snug">
                          {project.name}
                        </span>
                      ) : (
                        <input
                          type="text"
                          className="w-full px-2 py-1 text-xs border border-[#c5c6ce] rounded bg-[#f7f9fc]"
                          value={editProjectData?.name || ''}
                          onChange={(e) => setEditProjectData({ ...editProjectData, name: e.target.value })}
                        />
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 text-xs pt-1 border-t border-[#f0f2f5]">
                      <div className="flex justify-between items-center">
                        <span className="text-[#75777e]">Project ID</span>
                        <span className="font-mono font-bold text-[#005FB7]">
                          {project.project_code || project.id}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[#75777e] shrink-0">Category</span>
                        {!isEditingProjectInfo ? (
                          <span className="font-semibold text-right text-[#05162e] truncate">
                            {project.category}
                          </span>
                        ) : (
                          <input
                            type="text"
                            className="w-2/3 px-1.5 py-0.5 text-xs text-right border border-[#c5c6ce] rounded bg-[#f7f9fc]"
                            value={editProjectData?.category || ''}
                            onChange={(e) => setEditProjectData({ ...editProjectData, category: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[#75777e] shrink-0">Client</span>
                        {!isEditingProjectInfo ? (
                          <span className="text-[#05162e] font-medium truncate">{project.client}</span>
                        ) : (
                          <input
                            type="text"
                            className="w-2/3 px-1.5 py-0.5 text-xs text-right border border-[#c5c6ce] rounded bg-[#f7f9fc]"
                            value={editProjectData?.client || ''}
                            onChange={(e) => setEditProjectData({ ...editProjectData, client: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[#75777e] shrink-0">Location</span>
                        {!isEditingProjectInfo ? (
                          <span className="text-[#05162e] truncate">{project.location}</span>
                        ) : (
                          <input
                            type="text"
                            className="w-2/3 px-1.5 py-0.5 text-xs text-right border border-[#c5c6ce] rounded bg-[#f7f9fc]"
                            value={editProjectData?.location || ''}
                            onChange={(e) => setEditProjectData({ ...editProjectData, location: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[#75777e] shrink-0">Lead Engineer</span>
                        {!isEditingProjectInfo ? (
                          <span className="font-semibold text-[#05162e] truncate">
                            {project.engineer_name || 'Lead Engineer'}
                          </span>
                        ) : (
                          <input
                            type="text"
                            className="w-2/3 px-1.5 py-0.5 text-xs text-right border border-[#c5c6ce] rounded bg-[#f7f9fc]"
                            value={editProjectData?.engineer_name || ''}
                            onChange={(e) => setEditProjectData({ ...editProjectData, engineer_name: e.target.value })}
                          />
                        )}
                      </div>
                    </div>

                    {/* Engineering Scope & Description */}
                    <div className="flex flex-col gap-1 pt-2 border-t border-[#f0f2f5]">
                      <span className="text-[11px] font-bold text-[#75777e]">Engineering Scope & Description</span>
                      {!isEditingProjectInfo ? (
                        project.description && (
                          <p className="text-[11px] text-[#44474d] leading-relaxed bg-[#f7f9fc] p-2 rounded border border-[#e0e3e6]">
                            {project.description}
                          </p>
                        )
                      ) : (
                        <textarea
                          className="w-full text-[11px] p-2 border border-[#c5c6ce] rounded bg-[#f7f9fc] min-h-[60px]"
                          value={editProjectData?.description || ''}
                          onChange={(e) => setEditProjectData({ ...editProjectData, description: e.target.value })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Dedicated Downloads Tab in Inspector Panel */}
              {rightPanelTab === 'downloads' && (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center pb-2 border-b border-[#e0e3e6]">
                    <span className="font-bold text-[#05162e]">
                      All Downloads ({fileList.length})
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleDownloadAllZip();
                      }}
                      className="text-[11px] font-bold text-[#005FB7] hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        folder_zip
                      </span>
                      <span>Zip All</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {fileList.map((file) => (
                      <div
                        key={file.id}
                        className={`p-2.5 rounded border transition-colors flex items-center justify-between gap-2 ${
                          activeFile?.id === file.id
                            ? 'bg-[#d6e3ff]/40 border-[#005FB7]'
                            : 'bg-[#f7f9fc] border-[#c5c6ce] hover:border-[#005FB7]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <p className="font-semibold text-[#05162e] truncate">
                            {file.name}
                          </p>
                          <p className="text-[11px] text-[#75777e] font-mono">
                            {file.type} • {file.size}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleDownloadFile(file);
                            }}
                            className="p-1.5 bg-[#005FB7] text-white hover:bg-[#05162e] rounded transition-colors shadow-sm"
                            title={`Download untampered ${file.name}`}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              download
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleDeleteIndividualFile(file.id, file.name);
                            }}
                            className="p-1.5 bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white rounded transition-colors shadow-sm"
                            title={`Delete ${file.name}`}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rightPanelTab === 'activity' && (
                <div className="flex flex-col gap-3">
                  {assetActivityLogs.length > 0 ? (
                    assetActivityLogs.map((log: any) => {
                      const date = new Date(log.created_at);
                      const timeAgo = Math.floor((new Date().getTime() - date.getTime()) / 60000);
                      const displayTime = timeAgo < 60 ? `${timeAgo || 1} mins ago` : timeAgo < 1440 ? `${Math.floor(timeAgo / 60)} hours ago` : `${Math.floor(timeAgo / 1440)} days ago`;

                      return (
                        <div key={log.id} className="border-l-2 border-[#005FB7] pl-3 py-1 flex flex-col gap-0.5">
                          <span className="font-bold text-[#05162e] text-xs">
                            {log.action}
                          </span>
                          <span className="text-[#75777e] text-[11px]">
                            By {log.user_name || 'System'} • {displayTime}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-[11px] text-[#75777e] text-center p-4 border border-dashed border-[#c5c6ce] rounded">
                      No activity logs available for this asset.
                    </div>
                  )}
                </div>
              )}

              {rightPanelTab === 'comments' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    {comments.length > 0 ? (
                      comments.map((c) => {
                        const date = new Date(c.created_at);
                        const timeAgo = Math.floor((new Date().getTime() - date.getTime()) / 60000);
                        const displayTime = timeAgo < 60 ? `${timeAgo || 1} mins ago` : timeAgo < 1440 ? `${Math.floor(timeAgo / 60)} hours ago` : `${Math.floor(timeAgo / 1440)} days ago`;

                        return (
                          <div
                            key={c.id}
                            className="bg-[#f7f9fc] border border-[#c5c6ce] rounded p-2.5 flex flex-col gap-1"
                          >
                            <div className="flex justify-between font-bold text-[#05162e] text-xs">
                              <span>{c.author_name || 'Unknown'}</span>
                              <span className="text-[10px] text-[#75777e]">
                                {displayTime}
                              </span>
                            </div>
                            <p className="text-[#44474d] text-xs">{c.text}</p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[11px] text-[#75777e] text-center p-4 border border-dashed border-[#c5c6ce] rounded">
                        No engineering notes yet.
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={handleAddComment}
                    className="flex flex-col gap-2 pt-2 border-t"
                  >
                    <textarea
                      rows={3}
                      placeholder="Add engineering note or @mention..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="w-full border border-[#c5c6ce] rounded p-2 text-xs focus:outline-none focus:border-[#005FB7]"
                    />
                    <button
                      type="submit"
                      className="py-1.5 px-3 bg-[#005FB7] text-white rounded font-semibold text-xs hover:bg-[#05162e] transition-colors self-end"
                    >
                      Post Comment
                    </button>
                  </form>
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setRightPanelCollapsed(false)}
            className="absolute right-2 top-2 z-30 bg-white border border-[#c5c6ce] shadow rounded p-1 text-[#005FB7] hover:bg-[#f2f4f7]"
            title="Expand Inspector Panel"
          >
            <span className="material-symbols-outlined text-[16px]">
              chevron_left
            </span>
          </button>
        )}
      </div>

      {/* Add Single or Multiple Files Modal with Drag & Drop and Auto Title Extraction */}
      {showAddFileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-[#c5c6ce] rounded-lg w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-[#05162e] text-white flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">
                  note_add
                </span>
                Attach Technical Files to Project: {project.project_code || project.id}
              </h3>
              <button
                onClick={() => {
                  setShowAddFileModal(false);
                  setQueuedFiles([]);
                }}
                className="text-[#8392b0] hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            {/* Modal Content Form */}
            <form
              onSubmit={handleUploadAllQueuedFiles}
              className="p-5 flex flex-col gap-4 overflow-y-auto flex-1"
            >
              {/* Drag & Drop Action Box */}
              <div
                onDrop={handleModalDrop}
                onDragOver={handleModalDragOver}
                onDragLeave={handleModalDragLeave}
                className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-2 border-dashed rounded transition-colors ${
                  isModalDragging
                    ? 'border-[#005FB7] bg-[#d6e3ff]/40'
                    : 'border-[#c5c6ce] bg-[#f7f9fc]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[32px] text-[#005FB7]">
                    cloud_upload
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#05162e]">
                      Drag & Drop single or multiple files here, or click button to browse
                    </p>
                    <p className="text-[11px] text-[#75777e]">
                      Auto-extracts file titles from CAD (.dwg), PDF, Excel (.xlsx), PlantUML (.puml), or Markdown (.md)
                    </p>
                  </div>
                </div>

                <label className="px-4 py-2 bg-[#005FB7] text-white hover:bg-[#05162e] transition-colors rounded text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-[16px]">
                    folder_open
                  </span>
                  <span>+ Browse Files</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleModalFileInput}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Queued Files Table */}
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-[#005FB7] uppercase tracking-wider">
                  Files Queued for Attachment ({queuedFiles.length})
                </h4>

                {queuedFiles.length > 0 ? (
                  <div className="border border-[#c5c6ce] rounded bg-white overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#f2f4f7] font-bold text-[#05162e] border-b border-[#c5c6ce] sticky top-0">
                        <tr>
                          <th className="p-2.5">Auto-Extracted File Title</th>
                          <th className="p-2.5 w-32">Section</th>
                          <th className="p-2.5 w-36">Renderer Format</th>
                          <th className="p-2.5 w-20">Size</th>
                          <th className="p-2.5 w-12 text-center">Del</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#c5c6ce]">
                        {queuedFiles.map((file) => (
                          <tr key={file.id} className="hover:bg-[#f7f9fc]">
                            <td className="p-2">
                              <input
                                type="text"
                                value={file.name}
                                onChange={(e) =>
                                  handleUpdateModalQueuedFile(file.id, 'name', e.target.value)
                                }
                                className="w-full border border-[#c5c6ce] bg-white rounded px-2 py-1 text-xs text-[#05162e] font-semibold focus:outline-none focus:border-[#005FB7]"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={file.section}
                                onChange={(e) =>
                                  handleUpdateModalQueuedFile(file.id, 'section', e.target.value)
                                }
                                className="w-full border border-[#c5c6ce] bg-white rounded p-1 text-[11px] text-[#05162e]"
                              >
                                <option>Drawings</option>
                                <option>BOQ</option>
                                <option>Specifications</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <select
                                value={file.rendererType}
                                onChange={(e) =>
                                  handleUpdateModalQueuedFile(
                                    file.id,
                                    'rendererType',
                                    e.target.value
                                  )
                                }
                                className="w-full border border-[#c5c6ce] bg-white rounded p-1 text-[11px] font-mono text-[#005FB7]"
                              >
                                <option value="drawio">Draw.io (.dwg)</option>
                                <option value="excel">Excel (.xlsx)</option>
                                <option value="pdf">PDF (.pdf)</option>
                                <option value="text">Text (.txt)</option>
                                <option value="plantuml">PlantUML (.puml)</option>
                                <option value="image">Image (.png)</option>
                                <option value="markdown">Markdown (.md)</option>
                              </select>
                            </td>
                            <td className="p-2 font-mono text-[11px] text-[#75777e]">
                              {file.size}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveModalQueuedFile(file.id)}
                                className="text-[#ba1a1a] hover:text-[#05162e] p-1 rounded"
                                title="Remove from queue"
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  delete
                                </span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-[#75777e] italic text-center py-4 border border-dashed rounded bg-white">
                    No files queued. Drag files into the box above or click "+ Browse Files" to select single or multiple files.
                  </p>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="flex justify-end gap-2 pt-3 border-t border-[#e6e8eb] mt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFileModal(false);
                    setQueuedFiles([]);
                  }}
                  className="px-4 py-2 rounded border border-[#c5c6ce] text-xs font-semibold text-[#4b5f7d] hover:bg-[#eceef1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || queuedFiles.length === 0}
                  className="px-5 py-2 rounded bg-[#005FB7] text-white text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                >
                  {uploading ? (
                    <span>Attaching {queuedFiles.length} Files...</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">
                        check_circle
                      </span>
                      <span>
                        Save & Attach {queuedFiles.length} File{queuedFiles.length !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
