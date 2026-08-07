'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSidebar } from '@/context/SidebarContext';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchSession = () => {
      supabase.auth
        ?.getSession()
        ?.then((res: any) => {
          setUser(res?.data?.session?.user ?? null);
        })
        ?.catch(() => {});
    };

    fetchSession();

    const authListener = supabase.auth?.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
    });

    const handleProfileUpdate = () => {
      fetchSession();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('user_profile_updated', handleProfileUpdate);
    }

    return () => {
      authListener?.data?.subscription?.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('user_profile_updated', handleProfileUpdate);
      }
    };
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/', icon: 'dashboard' },
    { label: 'Projects', href: '/projects', icon: 'folder_open' },
    { label: 'Engineering Library', href: '/library', icon: 'menu_book' },
    { label: 'Categories', href: '/categories', icon: 'category', underDev: true },
    { label: 'Templates', href: '/templates', icon: 'description', underDev: true },
    { label: 'Admin', href: '/admin', icon: 'admin_panel_settings' },
  ];

  const footerItems = [
    { label: 'Settings', href: '/admin', icon: 'settings' },
    { label: 'Support', href: '/admin', icon: 'help_outline' },
  ];

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'VE';

  const userName = user?.user_metadata?.full_name || 'Enterprise User';
  const userEmail = user?.email || 'authenticated';

  return (
    <aside
      className={`fixed h-full left-0 top-0 bg-[#f7f9fc] border-r border-[#c5c6ce] flex flex-col z-50 select-none overflow-x-hidden transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-[64px]' : 'w-[260px]'
      }`}
    >
      {/* Brand Header */}
      <div className="p-3 border-b border-[#c5c6ce] flex flex-col gap-2.5 overflow-x-hidden">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            {/* VE Brand Logo Always Visible */}
            <div className="w-8 h-8 rounded bg-[#05162e] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs">
              VE
            </div>
            {/* Clean Expand Toggle Button Below Logo */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="w-8 h-7 rounded border border-[#c5c6ce] hover:border-[#005FB7] bg-white hover:bg-[#eceef1] text-[#45474c] hover:text-[#005FB7] flex items-center justify-center transition-colors shadow-2xs"
              title="Expand Sidebar"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded bg-[#05162e] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-2xs">
                VE
              </div>
              <div className="overflow-hidden">
                <h2 className="text-xs font-bold text-[#05162e] truncate leading-tight">
                  Velocis Engineering
                </h2>
                <p className="text-[11px] text-[#44474d] truncate">Enterprise Repository</p>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1 rounded-lg border border-[#c5c6ce] hover:bg-[#eceef1] text-[#45474c] hover:text-[#005FB7] transition-colors shrink-0"
              title="Collapse Sidebar"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
          </div>
        )}

        {/* New Project CTA */}
        {isCollapsed ? (
          <Link
            href="/projects?new=true"
            className="w-8 h-8 mx-auto bg-[#005FB7] text-white rounded flex items-center justify-center hover:bg-[#05162e] transition-colors shadow-2xs group relative shrink-0"
            title="Create New Project"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#05162e] text-white text-xs font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-60">
              New Project
            </div>
          </Link>
        ) : (
          <Link
            href="/projects?new=true"
            className="w-full bg-[#005FB7] text-white rounded py-1.5 px-3 flex items-center justify-center gap-2 hover:bg-[#05162e] transition-colors text-xs font-semibold shadow-2xs"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>New Project</span>
          </Link>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          if (isCollapsed) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative group flex items-center justify-center py-2.5 transition-colors border-l-2 ${
                  isActive
                    ? 'text-[#05162e] border-[#005FB7] bg-[#e6e8eb]'
                    : 'text-[#44474d] border-transparent hover:bg-[#eceef1] hover:text-[#05162e]'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    isActive ? 'icon-fill text-[#005FB7]' : ''
                  }`}
                >
                  {item.icon}
                </span>

                {item.underDev && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#ba1a1a]" />
                )}

                {/* Collapsed Tooltip */}
                <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#05162e] text-white text-xs font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-60 flex items-center gap-1.5">
                  <span>{item.label}</span>
                  {item.underDev && (
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#ffdad6] text-[#ba1a1a]">
                      Dev
                    </span>
                  )}
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-4 py-2.5 text-xs font-semibold transition-colors border-l-2 ${
                isActive
                  ? 'text-[#05162e] border-[#005FB7] bg-[#e6e8eb]'
                  : 'text-[#44474d] border-transparent hover:bg-[#eceef1] hover:text-[#05162e]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    isActive ? 'icon-fill text-[#005FB7]' : ''
                  }`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.underDev && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ffdad6] text-[#ba1a1a] border border-[#ffb4ab] shrink-0">
                  Under Dev
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Settings & User Sign Out */}
      <div className="mt-auto border-t border-[#c5c6ce] p-2 flex flex-col gap-1 bg-[#f7f9fc] overflow-x-hidden">
        {footerItems.map((item) => {
          if (isCollapsed) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className="relative group flex items-center justify-center p-2 text-[#44474d] hover:bg-[#eceef1] hover:text-[#05162e] transition-colors rounded"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {item.icon}
                </span>
                <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#05162e] text-white text-xs font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-60">
                  {item.label}
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-[#44474d] hover:bg-[#eceef1] hover:text-[#05162e] transition-colors rounded"
            >
              <span className="material-symbols-outlined text-[18px]">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* User Card & Logout Button */}
        {isCollapsed ? (
          <div className="mt-2 pt-2 border-t border-[#e6e8eb] flex flex-col items-center gap-2">
            <Link
              href="/profile"
              className="relative group w-8 h-8 rounded-full bg-[#1b2b44] text-white flex items-center justify-center text-xs font-bold hover:bg-[#005FB7] transition-colors shrink-0"
            >
              {initials}
              <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#05162e] text-white text-xs font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-60 font-mono">
                {userName} ({userEmail})
              </div>
            </Link>

            <button
              onClick={handleSignOut}
              className="text-[#ba1a1a] hover:bg-[#ffdad6] p-1.5 rounded transition-colors"
              title="Sign Out / Logout"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        ) : (
          <div className="mt-2 pt-2 border-t border-[#e6e8eb] flex items-center justify-between px-2">
            <Link
              href="/profile"
              className="flex items-center gap-2.5 overflow-hidden flex-1 hover:bg-[#eceef1] p-1 -ml-1 rounded transition-colors group"
              title="View & Edit Profile"
            >
              <div className="w-7 h-7 rounded-full bg-[#1b2b44] text-white flex items-center justify-center text-xs font-bold shrink-0 group-hover:bg-[#005FB7] transition-colors">
                {initials}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-[#191c1e] truncate group-hover:text-[#005FB7] transition-colors">
                  {userName}
                </p>
                <p className="text-[11px] text-[#44474d] truncate font-mono">
                  {userEmail}
                </p>
              </div>
            </Link>

            <button
              onClick={handleSignOut}
              className="text-[#ba1a1a] hover:bg-[#ffdad6] p-1.5 rounded transition-colors"
              title="Sign Out / Logout"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
