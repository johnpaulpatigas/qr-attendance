import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export type TypedSupabaseClient = SupabaseClient<Database>;

let globalClient: TypedSupabaseClient | null = null;

export interface SupabaseConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

function getSupabaseUrl(configUrl?: string): string {
  if (configUrl) return configUrl;
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) {
      return import.meta.env.VITE_SUPABASE_URL;
    }
  } catch {
    // Ignore environment error
  }
  try {
    const g = globalThis as any;
    if (g.process?.env?.VITE_SUPABASE_URL) {
      return g.process.env.VITE_SUPABASE_URL;
    }
  } catch {
    // Ignore process error
  }
  return '';
}

function getSupabaseAnonKey(configKey?: string): string {
  if (configKey) return configKey;
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) {
      return import.meta.env.VITE_SUPABASE_ANON_KEY;
    }
  } catch {
    // Ignore environment error
  }
  try {
    const g = globalThis as any;
    if (g.process?.env?.VITE_SUPABASE_ANON_KEY) {
      return g.process.env.VITE_SUPABASE_ANON_KEY;
    }
  } catch {
    // Ignore process error
  }
  return '';
}

export function createSupabaseClient(config?: SupabaseConfig): TypedSupabaseClient {
  const url = getSupabaseUrl(config?.supabaseUrl);
  const key = getSupabaseAnonKey(config?.supabaseAnonKey);

  if (!url || !key) {
    console.warn(
      'Supabase URL or Anon Key is missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.'
    );
  }

  const client = createClient<Database>(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}

export function getSupabaseClient(config?: SupabaseConfig): TypedSupabaseClient {
  if (!globalClient) {
    globalClient = createSupabaseClient(config);
  }
  return globalClient;
}
