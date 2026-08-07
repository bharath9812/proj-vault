'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  // Public auth pages that should NOT have the sidebar layout
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';

  if (isAuthPage) {
    return <div className="h-full w-full flex flex-col overflow-y-auto">{children}</div>;
  }

  return (
    <>
      <Sidebar />
      <div
        className={`flex-1 transition-all duration-300 ease-in-out flex flex-col min-w-0 h-screen overflow-hidden ${
          isCollapsed ? 'ml-[64px]' : 'ml-[260px]'
        }`}
      >
        {children}
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  );
}
