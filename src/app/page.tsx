'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopHeader } from '@/components/layout/TopHeader';
import { createClient } from '@/lib/supabase/client';

export default function ExecutiveDashboard() {
  const [searchFilter, setSearchFilter] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [assetsCount, setAssetsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const supabase = createClient();
        
        const [
          { data: projectsData, error: projectsError },
          { data: categoriesData, error: categoriesError },
          { data: logsData, error: logsError },
          { count, error: assetsError }
        ] = await Promise.all([
          supabase.from('projects').select('*').order('created_at', { ascending: false }),
          supabase.from('categories').select('*').order('name', { ascending: true }),
          supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(5),
          supabase.from('assets').select('*', { count: 'exact', head: true })
        ]);
          
        if (projectsError) throw projectsError;
        if (categoriesError) throw categoriesError;
        if (logsError) throw logsError;
        if (assetsError) throw assetsError;
        
        setProjects(projectsData || []);
        setCategories(categoriesData || []);
        setActivityLogs(logsData || []);
        setAssetsCount(count || 0);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);

  const filteredProjects = projects.filter(
    (p) =>
      p.name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.project_code?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.id?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader onSearch={setSearchFilter} />

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1440px] w-full mx-auto">
        {/* Page Banner & Executive Title */}
        <div className="flex justify-between items-end border-b border-[#c5c6ce] pb-4">
          <div>
            <span className="text-xs font-semibold text-[#005FB7] uppercase tracking-wider">
              Executive Overview
            </span>
            <h1 className="text-2xl font-bold text-[#05162e] mt-0.5">
              Nexus Engineering Command Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/projects"
              className="px-3.5 py-1.5 rounded border border-[#c5c6ce] text-xs font-semibold text-[#4b5f7d] hover:bg-[#eceef1] transition-colors"
            >
              View Full Catalog
            </Link>
            <Link
              href="/projects?new=true"
              className="px-4 py-1.5 rounded bg-[#005FB7] text-xs font-semibold text-white hover:bg-[#05162e] transition-colors shadow-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Project
            </Link>
          </div>
        </div>

        {/* High-Level Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                Active Engineering Projects
              </span>
              <span className="p-1.5 bg-[#d4e3ff] text-[#041c36] rounded">
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : projects.length}
              </div>
              <div className="text-xs text-[#00468a] font-medium mt-1">
                Active in repository
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                Indexed Technical Assets
              </span>
              <span className="p-1.5 bg-[#c6dbfe] text-[#4c607e] rounded">
                <span className="material-symbols-outlined text-[18px]">description</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : assetsCount.toLocaleString()}
              </div>
              <div className="text-xs text-[#44474d] font-medium mt-1">
                CAD, BIM, Specs, BOQs
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                Pending Engineering Reviews
              </span>
              <span className="p-1.5 bg-[#ffdad6] text-[#93000a] rounded">
                <span className="material-symbols-outlined text-[18px]">fact_check</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : projects.filter((p) => p.status === 'Under Review' || p.status === 'In Progress').length}
              </div>
              <div className="text-xs text-[#ba1a1a] font-medium mt-1">
                Requires senior sign-off
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                High-Value Megaprojects
              </span>
              <span className="p-1.5 bg-[#d6e3ff] text-[#001b3c] rounded">
                <span className="material-symbols-outlined text-[18px]">stars</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : projects.filter((p) => p.high_value).length}
              </div>
              <div className="text-xs text-[#44474d] font-medium mt-1">
                $5M+ contract threshold
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Layout: Left Table + Right Activity Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Recent Projects Data Table */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-sm flex flex-col">
              <div className="p-4 bg-[#f2f4f7] border-b border-[#c5c6ce] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-[#05162e]">
                    dataset
                  </span>
                  <h3 className="text-sm font-bold text-[#05162e]">
                    Recent Project Documentation
                  </h3>
                </div>
                <Link
                  href="/projects"
                  className="text-xs font-semibold text-[#005FB7] hover:underline"
                >
                  View All ({projects.length})
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#e6e8eb] text-[#191c1e] text-xs font-semibold border-b border-[#c5c6ce]">
                    <tr>
                      <th className="py-2.5 px-4">Project ID</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Rev</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e6e8eb] text-xs text-[#191c1e]">
                    {filteredProjects.map((project) => (
                      <tr
                        key={project.id}
                        className="hover:bg-[#f2f4f7] transition-colors group"
                      >
                        <td className="py-3 px-4 font-mono text-[#44474d] truncate max-w-[120px]">
                          {project.project_code || project.id.substring(0, 8)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#05162e]">
                          <Link
                            href={`/projects/${project.id}`}
                            className="hover:text-[#005FB7] transition-colors"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-[#44474d]">
                          {project.category}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#05162e]">
                          {project.revision}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              project.status === 'In Design'
                                ? 'bg-[#d6e3ff] text-[#001b3c]'
                                : project.status === 'Approved'
                                ? 'bg-[#eceef1] text-[#44474d]'
                                : 'bg-[#d4e3ff] text-[#041c36]'
                            }`}
                          >
                            {project.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/projects/${project.id}`}
                            className="px-2.5 py-1 rounded bg-[#005FB7] text-white font-semibold text-[11px] hover:bg-[#05162e] transition-colors inline-flex items-center gap-1"
                          >
                            <span>Open</span>
                            <span className="material-symbols-outlined text-[14px]">
                              arrow_forward
                            </span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Discipline Categories Quick Grid */}
            <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-[#e6e8eb] pb-2">
                <h3 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                    category
                  </span>
                  Engineering Disciplines
                </h3>
                <Link
                  href="/categories"
                  className="text-xs font-semibold text-[#005FB7] hover:underline"
                >
                  Explore All
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories?id=${cat.id}`}
                    className="border border-[#c5c6ce] hover:border-[#005FB7] rounded p-3 bg-[#f7f9fc] hover:bg-white transition-all group flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-center">
                      <div className="w-7 h-7 rounded bg-[#1b2b44] text-white flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px]">
                          {cat.icon}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-[#005FB7] bg-[#d4e3ff] px-1.5 py-0.5 rounded">
                        {cat.code}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#05162e] group-hover:text-[#005FB7] transition-colors">
                        {cat.name}
                      </h4>
                      <p className="text-[11px] text-[#44474d] mt-1 line-clamp-1">
                        {cat.description}
                      </p>
                    </div>
                    <div className="text-[11px] text-[#75777e] pt-1 border-t border-[#e6e8eb] flex justify-between">
                      <span>{cat.project_count || 0} Projects</span>
                      <span>{cat.template_count || 0} Templates</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Real-Time Audit & Activity Stream */}
          <div className="flex flex-col gap-6">
            <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-[#e6e8eb] pb-3">
                <h3 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                    history
                  </span>
                  Repository Activity Stream
                </h3>
                <span className="text-[11px] text-[#75777e] font-mono">Live Audit Log</span>
              </div>

              <div className="flex flex-col gap-3">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log) => {
                    const initials = log.user_name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'SYS';
                    const date = new Date(log.created_at);
                    const timeAgo = Math.floor((new Date().getTime() - date.getTime()) / 60000);
                    const displayTime = timeAgo < 60 ? `${timeAgo || 1} mins ago` : timeAgo < 1440 ? `${Math.floor(timeAgo / 60)} hours ago` : `${Math.floor(timeAgo / 1440)} days ago`;

                    return (
                      <div key={log.id} className="flex items-start gap-3 text-xs p-2.5 rounded bg-[#f7f9fc] border border-[#e6e8eb]">
                        <div className="w-6 h-6 rounded bg-[#c6dbfe] text-[#041c36] flex items-center justify-center font-bold text-[10px] shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="text-[#191c1e]">
                            <span className="font-bold">{log.user_name || 'System'}</span> {log.action}
                            {log.details?.asset_name && (
                              <>
                                {' '}
                                <span className="font-mono text-[#005FB7]">{log.details.asset_name}</span>
                              </>
                            )}
                          </p>
                          <span className="text-[10px] text-[#75777e] mt-0.5 block">{displayTime}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-[#75777e] p-4 text-center border border-[#e6e8eb] rounded bg-[#f7f9fc]">
                    No recent activity
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-[#1b2b44] text-white rounded p-4 flex flex-col gap-3 shadow-sm">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#8392b0]">
                  bolt
                </span>
                Quick Administration
              </h3>
              <p className="text-xs text-[#8392b0]">
                Direct repository actions for lead engineers and project managers.
              </p>
              <div className="flex flex-col gap-2 mt-1">
                <Link
                  href="/projects?new=true"
                  className="w-full py-2 px-3 bg-[#005FB7] hover:bg-[#00468a] text-white rounded text-xs font-semibold flex items-center justify-between transition-colors"
                >
                  <span>Register New Engineering Project</span>
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </Link>
                <Link
                  href="/library"
                  className="w-full py-2 px-3 bg-[#05162e] hover:bg-[#002a57] text-[#8392b0] hover:text-white rounded text-xs font-semibold flex items-center justify-between transition-colors border border-[#384762]"
                >
                  <span>Download Document Templates</span>
                  <span className="material-symbols-outlined text-[16px]">download</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
