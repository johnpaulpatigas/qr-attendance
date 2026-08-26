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

function getEnvVar(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env[key];
    if (typeof val === 'string' && val) return val;
  }
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[key];
    if (typeof val === 'string' && val) return val;
  }
  return '';
}

function getSupabaseUrl(configUrl?: string): string {
  if (configUrl) return configUrl;
  return getEnvVar('VITE_SUPABASE_URL');
}

function getSupabaseAnonKey(configKey?: string): string {
  if (configKey) return configKey;
  return getEnvVar('VITE_SUPABASE_ANON_KEY');
}

export function createSupabaseClient(config?: SupabaseConfig): TypedSupabaseClient {
  const url = getSupabaseUrl(config?.supabaseUrl);
  const key = getSupabaseAnonKey(config?.supabaseAnonKey);

  if (!url || !key) {
    console.warn(
      'Supabase URL or Anon Key is missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.'
    );
  }

  const client = createClient<Database>(
    url || 'https://placeholder.supabase.co',
    key || 'placeholder-key',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  return client;
}

export function getSupabaseClient(config?: SupabaseConfig): TypedSupabaseClient {
  if (!globalClient) {
    globalClient = createSupabaseClient(config);
  }
  return globalClient;
}
