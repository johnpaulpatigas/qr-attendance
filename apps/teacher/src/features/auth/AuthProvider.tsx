import React, { useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  getCurrentUserProfile,
  saveOfflineAuthCredentials,
  verifyOfflineAuthCredentials,
  getStoredOfflineUser,
  clearOfflineAuthSession,
} from '@qr-attendance/supabase';
import type { UserProfile } from '@qr-attendance/types';
import { AuthContext } from './AuthContext';

const CACHE_PROFILE_KEY = 'teacher_auth_profile';
const STORAGE_PREFIX = 'teacher';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const offlineUser = getStoredOfflineUser(STORAGE_PREFIX);
    if (offlineUser) {
      return {
        id: offlineUser.userId,
        email: offlineUser.email,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User;
    }
    return null;
  });

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const offlineUser = getStoredOfflineUser(STORAGE_PREFIX);
    if (offlineUser) {
      return offlineUser.profile;
    }
    try {
      const cached = localStorage.getItem(CACHE_PROFILE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [session, setSession] = useState<Session | null>(null);
  const [isOfflineAuth, setIsOfflineAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const client = getSupabaseClient();

  const handleProfileResolution = useCallback(
    async (userId: string, email?: string) => {
      try {
        const p = await getCurrentUserProfile(client, userId);
        if (p && (p.role === 'teacher' || p.role === 'admin')) {
          setProfile(p);
          localStorage.setItem(CACHE_PROFILE_KEY, JSON.stringify(p));
        } else if (p) {
          setProfile(null);
          localStorage.removeItem(CACHE_PROFILE_KEY);
          await client.auth.signOut();
        } else {
          const cached = localStorage.getItem(CACHE_PROFILE_KEY);
          if (cached) {
            setProfile(JSON.parse(cached));
          } else {
            const fallbackProfile: UserProfile = {
              id: userId,
              role: 'teacher',
              full_name: email?.split('@')[0] || 'Teacher',
              email: email,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            setProfile(fallbackProfile);
            localStorage.setItem(CACHE_PROFILE_KEY, JSON.stringify(fallbackProfile));
          }
        }
      } catch {
        // Offline fallback: load from localStorage
        try {
          const cached = localStorage.getItem(CACHE_PROFILE_KEY);
          if (cached) {
            setProfile(JSON.parse(cached));
          } else {
            setProfile({
              id: userId,
              role: 'teacher',
              full_name: email?.split('@')[0] || 'Teacher',
              email: email,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        } catch {
          // Ignore
        }
      }
    },
    [client]
  );

  useEffect(() => {
    // Initial session lookup
    client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          setIsOfflineAuth(false);
          handleProfileResolution(session.user.id, session.user.email).finally(() => {
            setIsLoading(false);
          });
        } else {
          // Check offline active session fallback
          const offlineUser = getStoredOfflineUser(STORAGE_PREFIX);
          if (offlineUser) {
            setUser({
              id: offlineUser.userId,
              email: offlineUser.email,
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as User);
            setProfile(offlineUser.profile);
            setIsOfflineAuth(true);
          }
          setIsLoading(false);
        }
      })
      .catch(() => {
        const offlineUser = getStoredOfflineUser(STORAGE_PREFIX);
        if (offlineUser) {
          setUser({
            id: offlineUser.userId,
            email: offlineUser.email,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          } as User);
          setProfile(offlineUser.profile);
          setIsOfflineAuth(true);
        }
        setIsLoading(false);
      });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        setIsOfflineAuth(false);
        await handleProfileResolution(session.user.id, session.user.email);
      } else if (!isOfflineAuth) {
        const offlineUser = getStoredOfflineUser(STORAGE_PREFIX);
        if (offlineUser && typeof navigator !== 'undefined' && !navigator.onLine) {
          // Keep offline session alive during network disconnection
          setUser({
            id: offlineUser.userId,
            email: offlineUser.email,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          } as User);
          setProfile(offlineUser.profile);
          setIsOfflineAuth(true);
        } else {
          setProfile(null);
          localStorage.removeItem(CACHE_PROFILE_KEY);
        }
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, isOfflineAuth, handleProfileResolution]);

  const signInWithEmail = async (
    email: string,
    pass: string
  ): Promise<{ error: Error | null }> => {
    const isDeviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // 1. Direct offline verification if network is disconnected
    if (isDeviceOffline) {
      const offlineRes = await verifyOfflineAuthCredentials(STORAGE_PREFIX, email, pass);
      if (offlineRes.success && offlineRes.profile && offlineRes.userId) {
        const syntheticUser = {
          id: offlineRes.userId,
          email: email.trim().toLowerCase(),
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as User;

        setUser(syntheticUser);
        setProfile(offlineRes.profile);
        setIsOfflineAuth(true);
        return { error: null };
      }
      return {
        error: new Error(offlineRes.error || 'Failed to authenticate offline.'),
      };
    }

    // 2. Online verification with Supabase Auth
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        // If server network error or fetch failure, attempt offline fallback
        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('Failed to fetch')
        ) {
          const offlineRes = await verifyOfflineAuthCredentials(STORAGE_PREFIX, email, pass);
          if (offlineRes.success && offlineRes.profile && offlineRes.userId) {
            setUser({
              id: offlineRes.userId,
              email: email.trim().toLowerCase(),
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as User);
            setProfile(offlineRes.profile);
            setIsOfflineAuth(true);
            return { error: null };
          }
        }
        return { error };
      }

      if (data.user) {
        const p = await getCurrentUserProfile(client, data.user.id);
        if (p && p.role !== 'teacher' && p.role !== 'admin') {
          await client.auth.signOut();
          return {
            error: new Error(
              'Access denied: Only teachers and administrators can sign in to the Teacher Portal.'
            ),
          };
        }

        const resolvedProfile: UserProfile = p || {
          id: data.user.id,
          role: 'teacher',
          full_name: email.split('@')[0] || 'Teacher',
          email: email.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Cache offline credentials for future offline access
        await saveOfflineAuthCredentials(
          STORAGE_PREFIX,
          email,
          pass,
          resolvedProfile,
          data.user.id
        );

        setProfile(resolvedProfile);
        setIsOfflineAuth(false);
      }

      return { error: null };
    } catch (err: unknown) {
      // Network catch fallback
      const offlineRes = await verifyOfflineAuthCredentials(STORAGE_PREFIX, email, pass);
      if (offlineRes.success && offlineRes.profile && offlineRes.userId) {
        setUser({
          id: offlineRes.userId,
          email: email.trim().toLowerCase(),
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as User);
        setProfile(offlineRes.profile);
        setIsOfflineAuth(true);
        return { error: null };
      }
      return {
        error: err instanceof Error ? err : new Error('An unexpected error occurred'),
      };
    }
  };

  const signOut = async () => {
    clearOfflineAuthSession(STORAGE_PREFIX);
    await client.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setIsOfflineAuth(false);
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err : new Error('Failed to send reset email'),
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isOfflineAuth,
        isLoading,
        signInWithEmail,
        signOut,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
