'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TopHeader } from '@/components/layout/TopHeader';
import { createClient } from '@/lib/supabase/client';

const CACHE_KEY = 'velocis_dashboard_cache_v2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes TTL

interface DashboardCache {
  timestamp: number;
  projects: any[];
  categories: any[];
  activityLogs: any[];
  assetsCount: number;
  productsCount: number;
  productMediaCount: number;
  brandCounts: { name: string; count: number }[];
  statusBreakdown: { [status: string]: number };
}

export default function ExecutiveDashboard() {
  const [searchFilter, setSearchFilter] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [assetsCount, setAssetsCount] = useState<number>(0);
  const [productsCount, setProductsCount] = useState<number>(0);
  const [productMediaCount, setProductMediaCount] = useState<number>(0);
  const [brandCounts, setBrandCounts] = useState<{ name: string; count: number }[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ [status: string]: number }>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');
  const [isCachedLoad, setIsCachedLoad] = useState(false);

  // Optimized Fetcher with Selective Projections & Aggregations
  const fetchFreshDashboardData = useCallback(async (forceBypassCache = false) => {
    if (forceBypassCache) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const supabase = createClient();

      const [
        { data: projectsData, error: projectsErr },
        { data: categoriesData, error: categoriesErr },
        { data: logsData, error: logsErr },
        { count: aCount, error: assetsErr },
        { count: pCount, error: productsErr },
        { count: pmCount, error: pmErr },
        { data: brandsData },
        { data: productsBrandData },
      ] = await Promise.all([
        // 1. Projects: Select only required lightweight fields (saves bandwidth & DB memory)
        supabase
          .from('projects')
          .select('id, project_code, name, category, revision, status, high_value, created_at')
          .order('created_at', { ascending: false }),

        // 2. Categories
        supabase
          .from('categories')
          .select('id, code, name, icon, description, project_count, template_count')
          .order('name', { ascending: true }),

        // 3. Activity Logs: Limit 5 recent audit entries
        supabase
          .from('activity_logs')
          .select('id, user_name, action, details, created_at')
          .order('created_at', { ascending: false })
          .limit(5),

        // 4. Asset Count: Exact head query (0 data payload transferred)
        supabase.from('assets').select('*', { count: 'exact', head: true }),

        // 5. Hardware Products Count (/library PIM)
        supabase.from('products').select('*', { count: 'exact', head: true }),

        // 6. Hardware Media Attachments Count (/library PIM)
        supabase.from('product_media').select('*', { count: 'exact', head: true }),

        // 7. Brands list
        supabase.from('brands').select('id, name'),

        // 8. Products brand association for dynamic brand aggregation
        supabase.from('products').select('brand_id'),
      ]);

      if (projectsErr) throw projectsErr;
      if (categoriesErr) throw categoriesErr;
      if (logsErr) throw logsErr;
      if (assetsErr) throw assetsErr;
      if (productsErr) console.warn('Products count error:', productsErr.message);
      if (pmErr) console.warn('Product media count error:', pmErr.message);

      const loadedProjects = projectsData || [];
      const loadedCategories = categoriesData || [];
      const loadedLogs = logsData || [];
      const loadedAssetsCount = aCount || 0;
      const loadedProductsCount = pCount || 0;
      const loadedPmCount = pmCount || 0;

      // Dynamic Status Breakdown Aggregation
      const sMap: { [status: string]: number } = {};
      loadedProjects.forEach((p: any) => {
        const s = p.status || 'Active';
        sMap[s] = (sMap[s] || 0) + 1;
      });

      // Dynamic Brand Count Aggregation for /library Widget
      const bCountMap: { [brandId: string]: number } = {};
      (productsBrandData || []).forEach((p: any) => {
        if (p.brand_id) {
          bCountMap[p.brand_id] = (bCountMap[p.brand_id] || 0) + 1;
        }
      });

      const aggregatedBrands = (brandsData || [])
        .map((b: any) => ({
          name: b.name,
          count: bCountMap[b.id] || 0,
        }))
        .sort((a: any, b: any) => b.count - a.count);

      // Update React State
      setProjects(loadedProjects);
      setCategories(loadedCategories);
      setActivityLogs(loadedLogs);
      setAssetsCount(loadedAssetsCount);
      setProductsCount(loadedProductsCount);
      setProductMediaCount(loadedPmCount);
      setBrandCounts(aggregatedBrands);
      setStatusBreakdown(sMap);

      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastUpdatedTime(timeStr);
      setIsCachedLoad(false);

      // Persist to Client Session Cache (TTL 5 mins)
      const cachePayload: DashboardCache = {
        timestamp: now,
        projects: loadedProjects,
        categories: loadedCategories,
        activityLogs: loadedLogs,
        assetsCount: loadedAssetsCount,
        productsCount: loadedProductsCount,
        productMediaCount: loadedPmCount,
        brandCounts: aggregatedBrands,
        statusBreakdown: sMap,
      };

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial Load: Check Smart Session Cache before making DB network calls
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const cached: DashboardCache = JSON.parse(cachedRaw);
          const age = Date.now() - cached.timestamp;

          if (age < CACHE_TTL_MS && cached.projects && cached.projects.length >= 0) {
            // Serve instantly from local cache without sending DB queries
            setProjects(cached.projects);
            setCategories(cached.categories || []);
            setActivityLogs(cached.activityLogs || []);
            setAssetsCount(cached.assetsCount || 0);
            setProductsCount(cached.productsCount || 0);
            setProductMediaCount(cached.productMediaCount || 0);
            setBrandCounts(cached.brandCounts || []);
            setStatusBreakdown(cached.statusBreakdown || {});
            setLastUpdatedTime(new Date(cached.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            setIsCachedLoad(true);
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn('Could not read dashboard cache:', e);
      }
    }

    // Cache missing or expired: Fetch fresh data
    fetchFreshDashboardData(false);
  }, [fetchFreshDashboardData]);

  // Event-Driven Incremental Cache Invalidation
  useEffect(() => {
    const handleMutationEvent = () => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(CACHE_KEY);
      }
      fetchFreshDashboardData(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('user_profile_updated', handleMutationEvent);
      window.addEventListener('velocis_data_updated', handleMutationEvent);
      window.addEventListener('product_catalog_updated', handleMutationEvent);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('user_profile_updated', handleMutationEvent);
        window.removeEventListener('velocis_data_updated', handleMutationEvent);
        window.removeEventListener('product_catalog_updated', handleMutationEvent);
      }
    };
  }, [fetchFreshDashboardData]);

  const handleManualRefresh = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CACHE_KEY);
    }
    fetchFreshDashboardData(true);
  };

  const filteredProjects = projects.filter(
    (p: any) =>
      p.name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.project_code?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.id?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const totalHighValueProjects = projects.filter((p: any) => p.high_value).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader onSearch={setSearchFilter} />

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1440px] w-full mx-auto select-none">
        {/* Executive Banner & Command Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[#c5c6ce] pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#005FB7] uppercase tracking-wider font-mono">
                Executive Command Center
              </span>
              <span className="text-[#c5c6ce]">•</span>
              <span className="text-[11px] text-[#75777e] font-mono flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isCachedLoad ? 'bg-[#2e7d32]' : 'bg-[#005FB7] animate-pulse'}`}></span>
                {isCachedLoad ? 'Cached (0 DB Calls)' : 'Live DB Sync'}
                {lastUpdatedTime && ` • Synced at ${lastUpdatedTime}`}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#05162e] mt-0.5">
              Velocis Engineering Repository Analytics
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || isLoading}
              className="p-1.5 rounded bg-white border border-[#c5c6ce] text-[#05162e] hover:bg-[#eceef1] transition-colors shadow-xs flex items-center gap-1 text-xs font-semibold disabled:opacity-50"
              title="Force refresh live database stats"
            >
              <span className={`material-symbols-outlined text-[16px] text-[#005FB7] ${isRefreshing ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>{isRefreshing ? 'Syncing...' : 'Refresh Data'}</span>
            </button>

            <Link
              href="/library"
              className="px-3 py-1.5 rounded bg-white border border-[#005FB7] text-xs font-bold text-[#005FB7] hover:bg-[#d6e3ff] transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
              <span>Hardware PIM (/library)</span>
            </Link>

            <Link
              href="/projects?new=true"
              className="px-4 py-1.5 rounded bg-[#005FB7] text-xs font-bold text-white hover:bg-[#05162e] transition-colors shadow-sm flex items-center gap-1.5 border border-[#005FB7]"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>New Project</span>
            </Link>
          </div>
        </div>

        {/* Analyst KPI Summary Cards (5-Column Responsive Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Active Engineering Projects */}
          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-xs hover:border-[#005FB7] transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                Active Projects
              </span>
              <span className="p-1.5 bg-[#d4e3ff] text-[#041c36] rounded">
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : projects.length}
              </div>
              <div className="text-[11px] text-[#00468a] font-mono font-semibold mt-1 flex items-center gap-1">
                <span>In Repository</span>
                <span>•</span>
                <span className="text-[#2e7d32]">{statusBreakdown['In Design'] || 0} Design</span>
              </div>
            </div>
          </div>

          {/* Card 2: Indexed Technical Assets */}
          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-xs hover:border-[#005FB7] transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                Indexed Asset Files
              </span>
              <span className="p-1.5 bg-[#c6dbfe] text-[#4c607e] rounded">
                <span className="material-symbols-outlined text-[18px]">description</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : assetsCount.toLocaleString()}
              </div>
              <div className="text-[11px] text-[#44474d] font-mono mt-1">
                CAD, BIM, XLSX, Draw.io
              </div>
            </div>
          </div>

          {/* Card 3: Certified Hardware PIM (/library) */}
          <Link
            href="/library"
            className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-xs hover:border-[#005FB7] transition-all group"
          >
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d] group-hover:text-[#005FB7]">
                Hardware PIM Models
              </span>
              <span className="p-1.5 bg-[#e2f0d9] text-[#1e4620] rounded group-hover:bg-[#005FB7] group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[18px]">devices</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e] group-hover:text-[#005FB7] transition-colors">
                {isLoading ? '...' : productsCount}
              </div>
              <div className="text-[11px] text-[#1e4620] font-mono font-semibold mt-1 flex items-center justify-between">
                <span>{brandCounts.length} Brands</span>
                <span>•</span>
                <span>{productMediaCount} Media</span>
              </div>
            </div>
          </Link>

          {/* Card 4: Megaprojects Portfolio */}
          <div className="bg-white border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-xs hover:border-[#005FB7] transition-all">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#44474d]">
                High-Value Contracts
              </span>
              <span className="p-1.5 bg-[#d6e3ff] text-[#001b3c] rounded">
                <span className="material-symbols-outlined text-[18px]">stars</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-[#05162e]">
                {isLoading ? '...' : totalHighValueProjects}
              </div>
              <div className="text-[11px] text-[#44474d] font-mono mt-1">
                $5M+ threshold
              </div>
            </div>
          </div>

          {/* Card 5: Query & Cache Performance Indicator */}
          <div className="bg-[#f2f4f7] border border-[#c5c6ce] rounded p-4 flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-[#191c1e]">
                DB Efficiency KPI
              </span>
              <span className="p-1.5 bg-[#eceef1] text-[#005FB7] rounded border border-[#c5c6ce]">
                <span className="material-symbols-outlined text-[18px]">bolt</span>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-sm font-bold text-[#05162e] font-mono">
                {isCachedLoad ? '0 DB Requests' : 'Incremental Query'}
              </div>
              <div className="text-[11px] text-[#75777e] font-mono mt-1">
                {isCachedLoad ? 'Instant session cache' : 'Selective field sync'}
              </div>
            </div>
          </div>
        </div>

        {/* Hardware Catalog PIM Integration Banner (/library) */}
        <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#05162e] text-white flex items-center justify-center font-bold shrink-0">
              <span className="material-symbols-outlined text-[22px] text-[#9ec2ff]">inventory_2</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider font-mono">
                  Hardware PIM & Specification Repository (/library)
                </h3>
                <span className="px-2 py-0.5 bg-[#e2f0d9] text-[#1e4620] text-[10px] font-mono font-bold rounded uppercase">
                  Fully Integrated
                </span>
              </div>
              <p className="text-xs text-[#44474d] mt-0.5">
                Standardized enterprise hardware products, 16:9 normalized hero vectors, and spec sheets across lead brands.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {brandCounts.map((b) => (
              <Link
                key={b.name}
                href="/library"
                className="px-2.5 py-1 rounded bg-[#f7f9fc] border border-[#c5c6ce] hover:border-[#005FB7] text-xs font-semibold text-[#05162e] flex items-center gap-1.5 hover:bg-[#d6e3ff] transition-colors"
              >
                <span>{b.name}</span>
                <span className="px-1.5 py-0.2 rounded bg-[#005FB7] text-white text-[10px] font-mono font-bold">
                  {b.count}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Main Section: Left Project Table + Right Activity & Admin Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Recent Projects Table & Discipline Breakdown */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Projects Table Card */}
            <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-xs flex flex-col">
              <div className="p-4 bg-[#f2f4f7] border-b border-[#c5c6ce] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-[#05162e]">
                    dataset
                  </span>
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider font-mono">
                    Recent Project Documentation ({filteredProjects.length})
                  </h3>
                </div>
                <Link
                  href="/projects"
                  className="text-xs font-semibold text-[#005FB7] hover:underline flex items-center gap-1"
                >
                  <span>View All Projects</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#e6e8eb] text-[#191c1e] text-xs font-semibold border-b border-[#c5c6ce]">
                    <tr>
                      <th className="py-2.5 px-4">Project ID</th>
                      <th className="py-2.5 px-4">Project Title</th>
                      <th className="py-2.5 px-4">Discipline Category</th>
                      <th className="py-2.5 px-4">Rev</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e6e8eb] text-xs text-[#191c1e]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#75777e]">
                          <div className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined animate-spin text-[#005FB7]">progress_activity</span>
                            <span>Loading repository analytics...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredProjects.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#75777e]">
                          No projects matching query.
                        </td>
                      </tr>
                    ) : (
                      filteredProjects.map((project: any) => (
                        <tr
                          key={project.id}
                          className="hover:bg-[#f2f4f7] transition-colors group"
                        >
                          <td className="py-3 px-4 font-mono text-[#005FB7] font-semibold truncate max-w-[120px]">
                            {project.project_code || project.id.substring(0, 8)}
                          </td>
                          <td className="py-3 px-4 font-bold text-[#05162e]">
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
                          <td className="py-3 px-4 font-mono text-[#05162e] font-semibold">
                            {project.revision || 'v1.0'}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                project.status === 'In Design'
                                  ? 'bg-[#d6e3ff] text-[#001b3c]'
                                  : project.status === 'Approved'
                                  ? 'bg-[#e2f0d9] text-[#1e4620]'
                                  : 'bg-[#eceef1] text-[#44474d]'
                              }`}
                            >
                              {project.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              href={`/projects/${project.id}`}
                              className="px-2.5 py-1 rounded bg-[#005FB7] text-white font-bold text-[11px] hover:bg-[#05162e] transition-colors inline-flex items-center gap-1 shadow-2xs"
                            >
                              <span>Open</span>
                              <span className="material-symbols-outlined text-[14px]">
                                arrow_forward
                              </span>
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Discipline Categories Breakdown Grid */}
            <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-xs flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-[#e6e8eb] pb-2">
                <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider font-mono flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                    category
                  </span>
                  Engineering Disciplines Coverage
                </h3>
                <Link
                  href="/categories"
                  className="text-xs font-semibold text-[#005FB7] hover:underline"
                >
                  Explore All Categories
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories?id=${cat.id}`}
                    className="border border-[#c5c6ce] hover:border-[#005FB7] rounded p-3 bg-[#f7f9fc] hover:bg-white transition-all group flex flex-col gap-2 shadow-2xs"
                  >
                    <div className="flex justify-between items-center">
                      <div className="w-7 h-7 rounded bg-[#1b2b44] text-white flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px]">
                          {cat.icon || 'folder'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-[#005FB7] bg-[#d4e3ff] px-1.5 py-0.5 rounded">
                        {cat.code}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#05162e] group-hover:text-[#005FB7] transition-colors">
                        {cat.name}
                      </h4>
                      <p className="text-[11px] text-[#44474d] mt-0.5 line-clamp-1">
                        {cat.description}
                      </p>
                    </div>
                    <div className="text-[10px] font-mono text-[#75777e] pt-1.5 border-t border-[#e6e8eb] flex justify-between">
                      <span>{cat.project_count || 0} Projects</span>
                      <span>{cat.template_count || 0} Templates</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Real-Time Audit Activity Stream & Actions */}
          <div className="flex flex-col gap-6">
            {/* Repository Audit Activity Stream */}
            <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-xs flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-[#e6e8eb] pb-3">
                <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider font-mono flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                    history
                  </span>
                  Repository Audit Stream
                </h3>
                <span className="text-[10px] text-[#75777e] font-mono">Live Logs</span>
              </div>

              <div className="flex flex-col gap-3">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log) => {
                    const initials = log.user_name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'SYS';
                    const date = new Date(log.created_at);
                    const timeAgo = Math.floor((new Date().getTime() - date.getTime()) / 60000);
                    const displayTime = timeAgo < 60 ? `${timeAgo || 1} mins ago` : timeAgo < 1440 ? `${Math.floor(timeAgo / 60)} hours ago` : `${Math.floor(timeAgo / 1440)} days ago`;

                    return (
                      <div key={log.id} className="flex items-start gap-3 text-xs p-2.5 rounded bg-[#f7f9fc] border border-[#e6e8eb] shadow-2xs">
                        <div className="w-6 h-6 rounded-full bg-[#1b2b44] text-white flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">
                          {initials}
                        </div>
                        <div>
                          <p className="text-[#191c1e]">
                            <span className="font-bold text-[#05162e]">{log.user_name || 'System'}</span> {log.action}
                            {log.details?.asset_name && (
                              <>
                                {' '}
                                <span className="font-mono text-[#005FB7] font-semibold">{log.details.asset_name}</span>
                              </>
                            )}
                          </p>
                          <span className="text-[10px] text-[#75777e] font-mono mt-0.5 block">{displayTime}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-[#75777e] p-4 text-center border border-[#e6e8eb] rounded bg-[#f7f9fc]">
                    No recent activity logs recorded.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Executive Actions */}
            <div className="bg-[#1b2b44] text-white rounded p-4 flex flex-col gap-3 shadow-xs border border-[#1b2b44]">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#8392b0]">
                  bolt
                </span>
                Direct Repository Actions
              </h3>
              <p className="text-xs text-[#8392b0]">
                Quick administrative links for lead engineers and project managers.
              </p>
              <div className="flex flex-col gap-2 mt-1">
                <Link
                  href="/projects?new=true"
                  className="w-full py-2 px-3 bg-[#005FB7] hover:bg-[#00468a] text-white rounded text-xs font-bold flex items-center justify-between transition-colors shadow-2xs"
                >
                  <span>Register New Engineering Project</span>
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </Link>

                <Link
                  href="/library"
                  className="w-full py-2 px-3 bg-[#05162e] hover:bg-[#002a57] text-[#8392b0] hover:text-white rounded text-xs font-bold flex items-center justify-between transition-colors border border-[#384762]"
                >
                  <span>Open Hardware Catalog (/library)</span>
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                </Link>

                <Link
                  href="/admin"
                  className="w-full py-2 px-3 bg-[#05162e] hover:bg-[#002a57] text-[#8392b0] hover:text-white rounded text-xs font-bold flex items-center justify-between transition-colors border border-[#384762]"
                >
                  <span>Provision Employees (/admin)</span>
                  <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
