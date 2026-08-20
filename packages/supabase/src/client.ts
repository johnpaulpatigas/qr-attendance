import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

let globalClient: TypedSupabaseClient | null = null;

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function getEnvVar(key: string): string {
  const g = globalThis as Record<string, unknown>;
  if (g.process && typeof g.process === 'object' && 'env' in g.process) {
    const env = (g.process as { env: Record<string, string | undefined> }).env;
    if (env && env[key]) return env[key] as string;
  }
  const meta = import.meta as unknown as { env?: Record<string, string> };
  if (meta && meta.env && meta.env[key]) {
    return meta.env[key];
  }
  return '';
}

export function createSupabaseClient(config?: SupabaseConfig): TypedSupabaseClient {
  const url = config?.supabaseUrl || getEnvVar('VITE_SUPABASE_URL');
  const key = config?.supabaseAnonKey || getEnvVar('VITE_SUPABASE_ANON_KEY');

  if (!url || !key) {
    console.warn(
      'Supabase URL or Anon Key is missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
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
