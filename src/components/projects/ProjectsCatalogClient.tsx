'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopHeader } from '@/components/layout/TopHeader';
import { MOCK_PROJECTS, Project } from '@/lib/data';
import { createClient } from '@/lib/supabase/client';

interface QueuedFile {
  id: string;
  name: string;
  section: string;
  rendererType: 'pdf' | 'excel' | 'drawio' | 'plantuml' | 'image' | 'markdown' | 'text' | 'code' | 'download';
  size: string;
  fileDataUrl?: string;
  source?: string;
}

export function ProjectsCatalogClient() {
  const [projectsList, setProjectsList] = useState<Project[]>(MOCK_PROJECTS);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'high'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // New Project Form State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCode, setNewCode] = useState('NX-2026-901');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Audio Visual & ELV');
  const [newClient, setNewClient] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Multi-File Attachment Queue State
  const [attachFilesEnabled, setAttachFilesEnabled] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch Live Projects from Supabase & Local Cache
  useEffect(() => {
    async function loadProjects() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('projects')
          .select('*, assets(count)')
          .order('created_at', { ascending: false });

        let mergedProjects: Project[] = [];

        if (data && data.length > 0) {
          mergedProjects = data.map((item: any) => ({
            id: item.project_code || item.id,
            name: item.name,
            category: item.category || 'Audio Visual & ELV',
            client: item.client || 'Enterprise Client',
            location: item.location || 'Riyadh, KSA',
            revision: item.revision || 'v1.0',
            status: item.status || 'In Design',
            engineer: {
              name: item.engineer_name || 'Lead Engineer',
              initials: item.engineer_initials || 'LE',
            },
            lastUpdated: 'Recently',
            fileCount: item.assets?.[0]?.count || 0,
            highValue: item.high_value ?? true,
            myProject: true,
            description: item.description || '',
          }));
        }

        // Merge with local storage cache
        try {
          const storedStr = localStorage.getItem('ekms_created_projects');
          if (storedStr) {
            const storedList = JSON.parse(storedStr);
            storedList.forEach((localItem: any) => {
              if (
                !mergedProjects.some(
                  (p) =>
                    p.id.toLowerCase() === (localItem.id || localItem.project_code)?.toLowerCase()
                )
              ) {
                mergedProjects.unshift({
                  id: localItem.project_code || localItem.id,
                  name: localItem.name,
                  category: localItem.category || 'Audio Visual & ELV',
                  client: localItem.client || 'Enterprise Client',
                  location: localItem.location || 'Site Location',
                  revision: 'v1.0',
                  status: 'In Design',
                  engineer: { name: 'Lead Engineer', initials: 'LE' },
                  lastUpdated: 'Recently',
                  fileCount: localItem.files ? localItem.files.length : 0,
                  highValue: true,
                  myProject: true,
                  description: localItem.description || '',
                });
              }
            });
          }
        } catch (e) {
          console.warn('Error reading local cache projects:', e);
        }

        // Deduplicate merged projects by ID
        const uniqueProjectsMap = new Map<string, Project>();
        mergedProjects.forEach((p) => {
          const k = p.id.toLowerCase();
          if (!uniqueProjectsMap.has(k)) {
            uniqueProjectsMap.set(k, p);
          }
        });

        const deduplicatedProjects = Array.from(uniqueProjectsMap.values());
        if (deduplicatedProjects.length > 0) {
          setProjectsList(deduplicatedProjects);
        }
      } catch (err) {
        console.error('Exception querying Supabase projects:', err);
      }
    }

    loadProjects();
  }, []);

  const addFilesToQueue = (filesList: FileList | File[]) => {
    const filesArray = Array.from(filesList);
    if (filesArray.length === 0) return;

    filesArray.forEach((f, idx) => {
      const lowerName = f.name.toLowerCase();
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
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const newItem: QueuedFile = {
          id: `q-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          name: f.name,
          section: detectedSection,
          rendererType: detectedRenderer,
          size: formattedSize,
          fileDataUrl: dataUrl,
        };
        setAttachedFiles((prev) => [...prev, newItem]);
      };
      reader.readAsDataURL(f);
    });
  };

  const handleMultipleFilesSelected = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemoveQueuedFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateQueuedFile = (
    id: string,
    field: 'section' | 'rendererType',
    value: string
  ) => {
    setAttachedFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteProject = async (projectId: string, projectTitle: string) => {
    if (
      !confirm(
        `Are you sure you want to delete project "${projectTitle}" (${projectId})?\n\nThis action will permanently remove the project, all attached technical files, comments, and audit traces.`
      )
    ) {
      return;
    }

    try {
      const supabase = createClient();

      // 1. Helper to avoid PostgreSQL UUID cast errors
      const isUuid = (str: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      // 2. Fetch project record to get its real UUID id and project_code
      const { data: projRecord } = await supabase
        .from('projects')
        .select('id, project_code')
        .or(isUuid(projectId) ? `id.eq.${projectId},project_code.eq.${projectId}` : `project_code.eq.${projectId}`)
        .maybeSingle();

      const realUuid = projRecord?.id;
      const realCode = projRecord?.project_code || projectId;

      // 3. Delete child assets from assets table using real UUID if available
      if (realUuid) {
        await supabase.from('assets').delete().eq('project_id', realUuid);
        await supabase.from('comments').delete().eq('project_id', realUuid);
      }

      // 4. Delete files from Supabase Storage bucket
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

      // 5. Delete project record from projects table
      if (realUuid) {
        await supabase.from('projects').delete().eq('id', realUuid);
        await supabase.from('activity_logs').insert({
          user_name: 'Lead Engineer',
          action: 'deleted project',
          details: { asset_name: projectTitle }
        });
        await supabase.from('projects').delete().eq('project_code', realCode);
      }

      // 4. Update UI state
      setProjectsList((prev) =>
        prev.filter(
          (p) =>
            p.id.toLowerCase() !== projectId.toLowerCase() &&
            p.id.toLowerCase() !== realCode.toLowerCase()
        )
      );
      setSelectedIds((prev) => prev.filter((id) => id !== projectId && id !== realCode));

      // 5. Remove from local cache
      try {
        localStorage.removeItem(`ekms_project_files_${projectId.toLowerCase()}`);
        localStorage.removeItem(`ekms_project_files_${realCode.toLowerCase()}`);

        const storedStr = localStorage.getItem('ekms_created_projects');
        if (storedStr) {
          const storedList = JSON.parse(storedStr);
          const updated = storedList.filter(
            (p: any) =>
              p.id?.toLowerCase() !== projectId.toLowerCase() &&
              p.project_code?.toLowerCase() !== projectId.toLowerCase() &&
              p.id?.toLowerCase() !== realCode.toLowerCase() &&
              p.project_code?.toLowerCase() !== realCode.toLowerCase()
          );
          localStorage.setItem('ekms_created_projects', JSON.stringify(updated));
        }
      } catch (e) {
        console.warn('Error updating local storage cache on delete:', e);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  const filteredProjects = projectsList.filter((proj) => {
    if (activeTab === 'my' && !proj.myProject) return false;
    if (activeTab === 'high' && !proj.highValue) return false;
    if (categoryFilter !== 'All' && proj.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        proj.name.toLowerCase().includes(q) ||
        proj.id.toLowerCase().includes(q) ||
        proj.client.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProjects.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProjects.map((p) => p.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newClient) return;
    setCreating(true);

    try {
      const supabase = createClient();

      // 1. Insert Project into Supabase
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .insert({
          project_code: newCode,
          name: newName,
          category: newCategory,
          client: newClient,
          location: newLocation,
          revision: 'v1.0',
          status: 'In Design',
          engineer_name: 'Lead Engineer',
          engineer_initials: 'LE',
          high_value: true,
          description: newDescription,
        })
        .select()
        .single();

      if (projData) {
        await supabase.from('activity_logs').insert({
          project_id: projData.id,
          user_name: 'Lead Engineer',
          action: 'created project',
          details: { asset_name: projData.name }
        });
      }

      if (projErr) {
        if (projErr.message) {
          console.warn('Supabase project creation info:', projErr.message);
        }
      }

      // 2. Upload file binaries to Supabase Storage & insert metadata into public.assets
      const targetProjectId = projData?.id || newCode;

      if (attachFilesEnabled && attachedFiles.length > 0) {
        await Promise.all(
          attachedFiles.map(async (file) => {
            try {
              let blobToUpload: Blob | null = null;
              let mimeType = 'application/octet-stream';

              if (file.fileDataUrl) {
                const base64 = file.fileDataUrl.split(',')[1] || file.fileDataUrl;
                const binaryStr = atob(base64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                  bytes[i] = binaryStr.charCodeAt(i);
                }
                mimeType = file.fileDataUrl.match(/:(.*?);/)?.[1] || 'application/octet-stream';
                blobToUpload = new Blob([bytes], { type: mimeType });
              } else {
                // Fetch sample file binaries from local endpoints for initial attached files
                if (file.name.endsWith('.drawio')) {
                  const res = await fetch('/api/drawio');
                  if (res.ok) {
                    const text = await res.text();
                    blobToUpload = new Blob([text], { type: 'application/xml' });
                    mimeType = 'application/xml';
                  }
                } else if (file.name.endsWith('.pdf')) {
                  const res = await fetch(`/api/pdf?file=${encodeURIComponent(file.name)}`);
                  if (res.ok) {
                    blobToUpload = await res.blob();
                    mimeType = 'application/pdf';
                  }
                }
              }

              if (blobToUpload) {
                const projectFolder = newCode || targetProjectId;
                const storagePath = `${projectFolder}/${file.name}`;
                await supabase.storage.from('assets').upload(storagePath, blobToUpload, {
                  contentType: mimeType,
                  upsert: true,
                  cacheControl: '86400', // Cache for 1 day to save bandwidth
                });
              }
            } catch (storageErr) {
              console.warn('Supabase storage upload error:', storageErr);
            }
          })
        );

        const assetsToInsert = attachedFiles.map((file, index) => ({
          project_id: targetProjectId,
          name: file.name,
          folder: file.section,
          type: file.rendererType.toUpperCase(),
          size_display: file.size,
          size_bytes: 4500000,
          renderer_type: file.rendererType,
          render_enabled: true,
          version: 'v1.0',
          section: file.section,
          display_order: index + 1,
          storage_path: `${targetProjectId}/${file.name}`,
        }));

        await supabase.from('assets').insert(assetsToInsert);
      }

      const newProjFiles = attachedFiles.map((file, idx) => ({
        id: `f-${Date.now()}-${idx}`,
        name: file.name,
        folder: file.section,
        type: file.rendererType.toUpperCase(),
        size: file.size,
        updatedAt: 'Just now',
        rendererType: file.rendererType,
        renderEnabled: true,
        version: 'v1.0',
        section: file.section,
        displayOrder: idx + 1,
      }));

      const newProjRecord = {
        id: newCode,
        project_code: newCode,
        name: newName,
        category: newCategory,
        client: newClient,
        location: newLocation,
        description: newDescription,
        files: newProjFiles,
      };

      try {
        const storedStr = localStorage.getItem('ekms_created_projects') || '[]';
        const storedList = JSON.parse(storedStr);
        storedList.unshift(newProjRecord);
        localStorage.setItem('ekms_created_projects', JSON.stringify(storedList));
        localStorage.setItem(`ekms_project_files_${newCode.toLowerCase()}`, JSON.stringify(newProjFiles));
      } catch (e) {
        console.warn('Could not update ekms_created_projects cache:', e);
      }

      const newProj: Project = {
        id: newCode,
        name: newName,
        category: newCategory,
        client: newClient,
        location: newLocation,
        revision: 'v1.0',
        status: 'In Design',
        engineer: { name: 'Lead Engineer', initials: 'LE' },
        lastUpdated: 'Just now',
        fileCount: attachFilesEnabled ? attachedFiles.length : 0,
        highValue: true,
        myProject: true,
        description: newDescription,
      };

      setProjectsList([newProj, ...projectsList]);
      setShowNewModal(false);
      setNewName('');
      setNewClient('');
      setNewDescription('');
      setAttachedFiles([]);
      setNewCode(`NX-2026-${Math.floor(100 + Math.random() * 900)}`);
    } catch (err) {
      console.error('Exception creating project:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader onSearch={setSearchQuery} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#c5c6ce] bg-[#f7f9fc] flex justify-between items-end">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-[#05162e]">
              Project Catalog
            </h1>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setActiveTab('all')}
                className={`text-xs font-semibold pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === 'all'
                    ? 'text-[#05162e] border-[#005FB7] font-bold'
                    : 'text-[#44474d] border-transparent hover:text-[#05162e]'
                }`}
              >
                All Projects ({projectsList.length})
              </button>
              <button
                onClick={() => setActiveTab('my')}
                className={`text-xs font-semibold pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === 'my'
                    ? 'text-[#05162e] border-[#005FB7] font-bold'
                    : 'text-[#44474d] border-transparent hover:text-[#05162e]'
                }`}
              >
                My Projects ({projectsList.filter((p) => p.myProject).length})
              </button>
              <button
                onClick={() => setActiveTab('high')}
                className={`text-xs font-semibold pb-2 px-1 border-b-2 transition-colors ${
                  activeTab === 'high'
                    ? 'text-[#05162e] border-[#005FB7] font-bold'
                    : 'text-[#44474d] border-transparent hover:text-[#05162e]'
                }`}
              >
                High Value Megaprojects (
                {projectsList.filter((p) => p.highValue).length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-2">
            {selectedIds.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.length} selected projects completely?`)) {
                    selectedIds.forEach((id) => handleDeleteProject(id, id));
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#ba1a1a] text-white text-xs font-bold hover:bg-[#05162e] transition-colors shadow-sm mr-2"
              >
                <span className="material-symbols-outlined text-[16px]">
                  delete
                </span>
                <span>Delete ({selectedIds.length})</span>
              </button>
            )}
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#005FB7] text-white text-xs font-bold hover:bg-[#05162e] transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">
                add
              </span>
              Register New Project
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-6 py-3 bg-white border-b border-[#c5c6ce] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#44474d] uppercase tracking-wider">
              Category:
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-[#c5c6ce] rounded px-3 py-1 text-xs text-[#05162e] bg-white focus:outline-none focus:border-[#005FB7]"
            >
              <option value="All">All Categories</option>
              <option value="Audio Visual & ELV">Audio Visual & ELV</option>
              <option value="Networking & Telecommunications">
                Networking & Telecommunications
              </option>
              <option value="Building Automation Systems (BAS)">
                Building Automation Systems (BAS)
              </option>
              <option value="Cloud & Data Centers">Cloud & Data Centers</option>
              <option value="Cyber & Physical Security">
                Cyber & Physical Security
              </option>
            </select>
          </div>

          <div className="text-xs text-[#75777e]">
            Showing <strong className="text-[#05162e]">{filteredProjects.length}</strong> engineering projects
          </div>
        </div>

        {/* Projects Data Table */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white border border-[#c5c6ce] rounded shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#f2f4f7] font-bold text-[#05162e] border-b border-[#c5c6ce] select-none">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === filteredProjects.length &&
                        filteredProjects.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-[#c5c6ce]"
                    />
                  </th>
                  <th className="p-3 w-32">Project Code</th>
                  <th className="p-3">Project Title & Scope</th>
                  <th className="p-3 w-48">Category</th>
                  <th className="p-3 w-40">Client</th>
                  <th className="p-3 w-36">Location</th>
                  <th className="p-3 w-20 text-center">Files</th>
                  <th className="p-3 w-20 text-center">Revision</th>
                  <th className="p-3 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c5c6ce] text-[#191c1e]">
                {filteredProjects.map((proj, idx) => (
                  <tr
                    key={`${proj.id}-${idx}`}
                    className={`hover:bg-[#f7f9fc] transition-colors ${
                      selectedIds.includes(proj.id) ? 'bg-[#d6e3ff]/30' : ''
                    }`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(proj.id)}
                        onChange={() => toggleSelectRow(proj.id)}
                        className="rounded border-[#c5c6ce]"
                      />
                    </td>
                    <td className="p-3 font-mono font-bold text-[#005FB7]">
                      <Link
                        href={`/projects/${encodeURIComponent(proj.id)}`}
                        className="hover:underline"
                      >
                        {proj.id}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/projects/${encodeURIComponent(proj.id)}`}
                        className="font-bold text-[#05162e] hover:text-[#005FB7] transition-colors block"
                      >
                        {proj.name}
                      </Link>
                      {proj.description && (
                        <p className="text-[11px] text-[#75777e] truncate max-w-md mt-0.5">
                          {proj.description}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-[#44474d]">{proj.category}</td>
                    <td className="p-3 font-semibold text-[#05162e]">
                      {proj.client}
                    </td>
                    <td className="p-3 text-[#44474d]">{proj.location}</td>
                    <td className="p-3 text-center font-mono font-bold text-[#005FB7]">
                      {proj.fileCount}
                    </td>
                    <td className="p-3 text-center font-mono font-semibold text-[#44474d]">
                      {proj.revision}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/projects/${encodeURIComponent(proj.id)}`}
                          className="px-2.5 py-1 rounded bg-[#d6e3ff] text-[#001b3c] hover:bg-[#005FB7] hover:text-white transition-colors text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <span>Open</span>
                          <span className="material-symbols-outlined text-[14px]">
                            arrow_forward
                          </span>
                        </Link>
                        <button
                          onClick={() => handleDeleteProject(proj.id, proj.name)}
                          className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
                          title={`Delete project ${proj.id}`}
                        >
                          <span className="material-symbols-outlined text-[16px]">
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
      </main>

      {/* Register New EKMS Project & Add Multiple Files Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-[#c5c6ce] rounded-lg w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-[#05162e] text-white flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">
                  create_new_folder
                </span>
                Register New EKMS Project & Attach Files
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-[#8392b0] hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={handleCreateProject}
              className="p-5 flex flex-col gap-4 overflow-y-auto flex-1"
            >
              {/* Section 1: Project Metadata */}
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-[#005FB7] uppercase tracking-wider border-b border-[#e0e3e6] pb-1">
                  1. Project Identification
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#44474d] block mb-1">
                      Project Code / ID *
                    </label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      className="w-full bg-[#f2f4f7] border border-[#c5c6ce] rounded px-3 py-1.5 text-xs font-mono font-bold text-[#05162e]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#44474d] block mb-1">
                      Engineering Category
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#191c1e] bg-white focus:outline-none focus:border-[#005FB7]"
                    >
                      <option>Audio Visual & ELV</option>
                      <option>Networking & Telecommunications</option>
                      <option>Building Automation Systems (BAS)</option>
                      <option>Cloud & Data Centers</option>
                      <option>Cyber & Physical Security</option>
                      <option>Extra Low Voltage (ELV)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#44474d] block mb-1">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SRM Auditorium & Command Center Facility"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#44474d] block mb-1">
                      Client Organization *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SRM Institute / Apex Holdings"
                      value={newClient}
                      onChange={(e) => setNewClient(e.target.value)}
                      className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#44474d] block mb-1">
                      Location / Site
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Vijayawada, India"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      className="w-full border border-[#c5c6ce] rounded px-3 py-1.5 text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#44474d] block mb-1">
                    Engineering Scope / Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="120-240 seater auditorium matrix routing, acoustics, and low-voltage distribution..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full border border-[#c5c6ce] rounded p-2 text-xs focus:outline-none focus:border-[#005FB7]"
                  />
                </div>
              </div>

              {/* Section 2: Multi-File Attachments Queue & Drag-and-Drop Box */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-[#e0e3e6] pb-1">
                  <h4 className="text-xs font-bold text-[#005FB7] uppercase tracking-wider">
                    2. Attach Initial Technical Files ({attachedFiles.length})
                  </h4>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#44474d] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachFilesEnabled}
                      onChange={(e) => setAttachFilesEnabled(e.target.checked)}
                      className="rounded border-[#c5c6ce] text-[#005FB7]"
                    />
                    <span>Attach Files to Project</span>
                  </label>
                </div>

                {attachFilesEnabled && (
                  <div className="p-4 bg-[#f7f9fc] border border-[#c5c6ce] rounded-lg flex flex-col gap-3">
                    {/* Drag & Drop Action Box */}
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-2 border-dashed rounded transition-colors ${
                        isDragging
                          ? 'border-[#005FB7] bg-[#d6e3ff]/40'
                          : 'border-[#c5c6ce] bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[32px] text-[#005FB7]">
                          cloud_upload
                        </span>
                        <div>
                          <p className="text-xs font-bold text-[#05162e]">
                            Drag & Drop files here, or click button to browse
                          </p>
                          <p className="text-[11px] text-[#75777e]">
                            Select multiple CAD (.dwg), PDF, Excel (.xlsx), PlantUML (.puml), or Markdown (.md) files at once
                          </p>
                        </div>
                      </div>

                      <label className="px-4 py-2 bg-[#005FB7] text-white hover:bg-[#05162e] transition-colors rounded text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0">
                        <span className="material-symbols-outlined text-[16px]">
                          folder_open
                        </span>
                        <span>+ Add Files</span>
                        <input
                          type="file"
                          multiple
                          onChange={handleMultipleFilesSelected}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Queued Files List Table */}
                    {attachedFiles.length > 0 ? (
                      <div className="border border-[#c5c6ce] rounded bg-white overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-[#f2f4f7] font-bold text-[#05162e] border-b border-[#c5c6ce]">
                            <tr>
                              <th className="p-2.5">File Title / Name</th>
                              <th className="p-2.5 w-32">Section</th>
                              <th className="p-2.5 w-36">Renderer Format</th>
                              <th className="p-2.5 w-20">Size</th>
                              <th className="p-2.5 w-12 text-center">Del</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#c5c6ce]">
                            {attachedFiles.map((file) => (
                              <tr key={file.id} className="hover:bg-[#f7f9fc]">
                                <td className="p-2 font-semibold text-[#05162e] truncate max-w-[180px]">
                                  {file.name}
                                </td>
                                <td className="p-2">
                                  <select
                                    value={file.section}
                                    onChange={(e) =>
                                      handleUpdateQueuedFile(
                                        file.id,
                                        'section',
                                        e.target.value
                                      )
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
                                      handleUpdateQueuedFile(
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
                                    onClick={() => handleRemoveQueuedFile(file.id)}
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
                      <p className="text-xs text-[#75777e] italic text-center py-2">
                        No files queued. Drag files above or click "+ Add Files" to select multiple files at once.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="flex justify-end gap-2 pt-3 border-t border-[#e6e8eb] mt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded border border-[#c5c6ce] text-xs font-semibold text-[#4b5f7d] hover:bg-[#eceef1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded bg-[#005FB7] text-white text-xs font-bold hover:bg-[#05162e] transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                >
                  {creating ? (
                    <span>Saving Project & {attachedFiles.length} Files...</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">
                        check_circle
                      </span>
                      <span>
                        Save & Initialize Project ({attachedFiles.length} Files)
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
