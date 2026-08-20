import { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from './client';
import type { UserProfile } from '@qr-attendance/types';

export async function getCurrentUserProfile(
  client: TypedSupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user profile:', error.message);
    return null;
  }

  if (!data) return null;
  return data as unknown as UserProfile;
}

export function subscribeToAuthChanges(
  client: TypedSupabaseClient,
  callback: (event: AuthChangeEvent, session: Session | null, user: User | null) => void
) {
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session, session?.user || null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}
