'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      ?.getSession()
      ?.then((res: any) => {
        setUser(res?.data?.session?.user ?? null);
      })
      ?.catch(() => {});

    const authListener = supabase.auth?.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener?.data?.subscription?.unsubscribe();
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
    { label: 'Engineering Library', href: '/library', icon: 'menu_book', underDev: true },
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
    : 'JS';

  return (
    <aside className="fixed h-full w-[260px] left-0 top-0 bg-[#f7f9fc] border-r border-[#c5c6ce] flex flex-col z-50 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#c5c6ce] flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#05162e] flex items-center justify-center text-white font-bold text-xs shrink-0">
            NE
          </div>
          <div className="overflow-hidden">
            <h1 className="text-base font-bold text-[#05162e] truncate leading-tight">
              Nexus Engineering
            </h1>
            <p className="text-xs text-[#44474d] truncate">Enterprise Repository</p>
          </div>
        </div>

        <Link
          href="/projects?new=true"
          className="mt-2 w-full bg-[#005FB7] text-white rounded py-2 px-4 flex items-center justify-center gap-2 hover:bg-[#05162e] transition-colors text-xs font-semibold shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Project
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

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
      <div className="mt-auto border-t border-[#c5c6ce] p-3 flex flex-col gap-1 bg-[#f7f9fc]">
        {footerItems.map((item) => (
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
        ))}

        {/* User Card & Logout Button */}
        <div className="mt-2 pt-2 border-t border-[#e6e8eb] flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-[#1b2b44] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-[#191c1e] truncate">
                {user?.user_metadata?.full_name || 'Enterprise User'}
              </p>
              <p className="text-[11px] text-[#44474d] truncate">
                {user?.email || 'authenticated'}
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="text-[#ba1a1a] hover:bg-[#ffdad6] p-1.5 rounded transition-colors"
            title="Sign Out / Logout"
          >
            <span className="material-symbols-outlined text-[18px]">
              logout
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
