'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
      <div className="flex-1 ml-[260px] flex flex-col min-w-0 h-screen overflow-hidden">
        {children}
      </div>
    </>
  );
}
