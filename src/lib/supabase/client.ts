import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-ref')) {
    console.warn('Supabase env vars missing or invalid. Operating in local mode.');
    return createFallbackClient();
  }

  try {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn('Error initializing Supabase client:', e);
    return createFallbackClient();
  }
}

function createFallbackClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => ({
      select: () => ({
        or: () => ({
          single: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
        order: async () => ({ data: [], error: null }),
        single: async () => ({ data: null, error: null }),
      }),
      insert: async () => ({ data: null, error: null }),
      delete: () => ({
        eq: async () => ({ error: null }),
        or: async () => ({ error: null }),
      }),
    }),
  } as any;
}
