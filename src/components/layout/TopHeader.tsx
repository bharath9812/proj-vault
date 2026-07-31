'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AddEmployeeModal } from '@/components/admin/AddEmployeeModal';

interface TopHeaderProps {
  breadcrumb?: {
    category?: string;
    title: string;
  };
  onSearch?: (query: string) => void;
}

export function TopHeader({ breadcrumb, onSearch }: TopHeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<any>(null);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Check active session safely
    supabase.auth
      ?.getSession()
      ?.then((res: any) => {
        setUser(res?.data?.session?.user ?? null);
      })
      ?.catch(() => {});

    // Listen for auth state changes safely
    const authListener = supabase.auth?.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener?.data?.subscription?.unsubscribe();
    };
  }, []);

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Debounced Global Supabase RPC Search
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term || term.length < 2) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('global_search', {
          query_text: term,
        });

        if (error) {
          console.warn('Global RPC search error:', error.message);
        } else {
          setSearchResults(data || []);
          setIsSearchOpen(true);
        }
      } catch (err) {
        console.error('Search request failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250); // 250ms debounce saves database calls & free tier limits

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (onSearch) {
      onSearch(e.target.value);
    }
  };

  const handleSelectSearchResult = (url: string) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    router.push(url);
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // User initials
  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'JS';

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#f7f9fc] border-b border-[#c5c6ce] flex justify-between items-center h-16 px-6 w-full select-none">
        {/* Left Title / Breadcrumb */}
        <div className="flex items-center gap-4 flex-1 max-w-2xl">
          {breadcrumb ? (
            <div className="flex items-center text-xs text-[#44474d]">
              {breadcrumb.category && (
                <>
                  <Link
                    href="/projects"
                    className="hover:text-[#005FB7] transition-colors"
                  >
                    {breadcrumb.category}
                  </Link>
                  <span className="material-symbols-outlined text-[16px] mx-1">
                    chevron_right
                  </span>
                </>
              )}
              <span className="font-bold text-[#191c1e] text-sm">
                {breadcrumb.title}
              </span>
            </div>
          ) : (
            <h2 className="text-base font-bold text-[#05162e] hidden md:block">
              Nexus Engineering
            </h2>
          )}

          {/* Global Search Bar with Live RPC Autocomplete Dropdown */}
          <div className="relative w-full max-w-md ml-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#75777e] text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => { if (searchResults.length > 0) setIsSearchOpen(true); }}
              placeholder="Global search projects, assets, categories, codes..."
              className="w-full pl-9 pr-8 py-1.5 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] placeholder-[#75777e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] transition-all"
            />
            {isSearching ? (
              <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#005FB7] text-[16px] animate-spin">
                progress_activity
              </span>
            ) : searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#75777e] hover:text-[#05162e]"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            ) : null}

            {/* Results Dropdown Overlay */}
            {isSearchOpen && (
              <div
                className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#c5c6ce] rounded-md shadow-xl z-50 max-h-96 overflow-y-auto divide-y divide-[#eceef1]"
                onMouseDown={(e) => e.preventDefault()}
              >
                {searchResults.length > 0 ? (
                  searchResults.map((res) => {
                    const iconName =
                      res.type === 'project'
                        ? 'folder_open'
                        : res.type === 'asset'
                        ? 'description'
                        : 'category';
                    const badgeColor =
                      res.type === 'project'
                        ? 'bg-[#d6e3ff] text-[#001b3c]'
                        : res.type === 'asset'
                        ? 'bg-[#e2f0d9] text-[#1e4620]'
                        : 'bg-[#fff0c2] text-[#593d00]';

                    return (
                      <div
                        key={`${res.type}-${res.id}`}
                        onClick={() => handleSelectSearchResult(res.url)}
                        className="p-2.5 hover:bg-[#f2f4f7] cursor-pointer transition-colors flex items-start gap-3 group"
                      >
                        <div className="w-7 h-7 rounded bg-[#f7f9fc] border border-[#c5c6ce] flex items-center justify-center text-[#005FB7] shrink-0 mt-0.5 group-hover:bg-[#005FB7] group-hover:text-white transition-colors">
                          <span className="material-symbols-outlined text-[16px]">
                            {iconName}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-[#05162e] truncate group-hover:text-[#005FB7] transition-colors">
                              {res.title}
                            </h4>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${badgeColor}`}
                            >
                              {res.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#44474d] truncate mt-0.5 font-mono">
                            {res.subtitle}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-[#75777e]">
                    No matching records found across database tables.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">

          {/* Notifications */}
          <button
            className="text-[#4b5f7d] hover:text-[#05162e] hover:bg-[#eceef1] transition-colors p-1.5 rounded relative"
            title="Notifications"
          >
            <span className="material-symbols-outlined text-[20px]">
              notifications
            </span>
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ba1a1a]"></span>
          </button>

          {/* Help */}
          <button
            className="text-[#4b5f7d] hover:text-[#05162e] hover:bg-[#eceef1] transition-colors p-1.5 rounded"
            title="Help & Documentation"
          >
            <span className="material-symbols-outlined text-[20px]">
              help_outline
            </span>
          </button>

          {/* User Profile & Logout Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 hover:bg-[#eceef1] p-1 rounded transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#c6dbfe] border border-[#c5c6ce] flex items-center justify-center text-xs font-bold text-[#041c36]">
                {initials}
              </div>
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-[#c5c6ce] rounded shadow-md py-1 z-50">
                <div className="px-3 py-2 border-b border-[#e0e3e6]">
                  <p className="text-xs font-bold text-[#05162e] truncate">
                    {user?.user_metadata?.full_name || 'Enterprise User'}
                  </p>
                  <p className="text-[11px] text-[#75777e] truncate">
                    {user?.email || 'authenticated'}
                  </p>
                </div>

                <Link
                  href="/admin"
                  className="w-full text-left px-3 py-2 text-xs text-[#191c1e] hover:bg-[#f2f4f7] flex items-center gap-2"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <span className="material-symbols-outlined text-[16px] text-[#005FB7]">
                    admin_panel_settings
                  </span>
                  <span>System Admin</span>
                </Link>

                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center gap-2 font-semibold transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#ba1a1a]">
                    logout
                  </span>
                  <span>Sign Out / Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Add Employee Modal */}
      <AddEmployeeModal
        isOpen={showAddEmployeeModal}
        onClose={() => setShowAddEmployeeModal(false)}
      />
    </>
  );
}
