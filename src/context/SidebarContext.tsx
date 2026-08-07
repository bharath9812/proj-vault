'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SidebarContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  toggleSidebar: () => {},
  setCollapsed: () => {},
});

const LOCAL_STORAGE_KEY = 'velocis_sidebar_collapsed';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // 1. Initial Load from LocalStorage (Instant, Zero FLash)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored !== null) {
        setIsCollapsedState(stored === 'true');
      }
      setIsHydrated(true);
    }
  }, []);

  // 2. Fetch User Preference from Supabase PostgreSQL (staff_members table)
  useEffect(() => {
    const supabase = createClient();

    const syncFromDatabase = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user?.id) {
          const { data, error } = await supabase
            .from('staff_members')
            .select('sidebar_collapsed')
            .eq('id', session.user.id)
            .single();

          if (!error && data && typeof data.sidebar_collapsed === 'boolean') {
            setIsCollapsedState(data.sidebar_collapsed);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.sidebar_collapsed));
          }
        }
      } catch (err) {
        console.warn('Sidebar preference sync notice:', err);
      }
    };

    syncFromDatabase();
  }, []);

  // 3. Update Function: Saves to LocalStorage + Persists to Supabase DB
  const updateCollapsed = async (newState: boolean) => {
    setIsCollapsedState(newState);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newState));
    }

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.id) {
        await supabase.from('staff_members').upsert(
          {
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
            sidebar_collapsed: newState,
          },
          { onConflict: 'id' }
        );
      }
    } catch (err) {
      console.warn('Failed to persist sidebar state to DB:', err);
    }
  };

  const toggleSidebar = () => {
    updateCollapsed(!isCollapsed);
  };

  const setCollapsed = (collapsed: boolean) => {
    updateCollapsed(collapsed);
  };

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggleSidebar, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
