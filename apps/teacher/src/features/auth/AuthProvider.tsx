import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import {
  getSupabaseClient,
  getCurrentUserProfile,
  saveOfflineAuthCredentials,
  verifyOfflineAuthCredentials,
  getStoredOfflineUser,
  clearOfflineAuthSession,
  AppStorage,
  withNetworkTimeout,
} from '@qr-attendance/supabase';
import type { UserProfile } from '@qr-attendance/types';
import { AuthContext } from './AuthContext';
import { isNetworkOnline } from '../attendance/networkManager';

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
    const cached = AppStorage.getJSON<UserProfile | null>(CACHE_PROFILE_KEY, null);
    return cached;
  });

  const [session, setSession] = useState<Session | null>(null);
  const [isOfflineAuth, setIsOfflineAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const lastResolvedUserIdRef = useRef<string | null>(null);

  const client = getSupabaseClient();

  const handleProfileResolution = useCallback(
    async (userId: string, email?: string) => {
      if (lastResolvedUserIdRef.current === userId) {
        return;
      }
      lastResolvedUserIdRef.current = userId;

      if (isNetworkOnline()) {
        try {
          const p = await withNetworkTimeout(getCurrentUserProfile(client, userId), 3500);
          if (p && (p.role === 'teacher' || p.role === 'admin')) {
            setProfile(p);
            AppStorage.setJSON(CACHE_PROFILE_KEY, p);
            return;
          } else if (p) {
            setProfile(null);
            AppStorage.removeItem(CACHE_PROFILE_KEY);
            await client.auth.signOut();
            return;
          }
        } catch {
          // Network timeout or error
        }
      }

      // Offline fallback: load from AppStorage
      const cached = AppStorage.getJSON<UserProfile | null>(CACHE_PROFILE_KEY, null);
      if (cached) {
        setProfile(cached);
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
        AppStorage.setJSON(CACHE_PROFILE_KEY, fallbackProfile);
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
        if (offlineUser) {
          // Keep offline session alive
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
    // 1. Direct offline verification if network is disconnected
    if (!isNetworkOnline()) {
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
        AppStorage.setJSON(CACHE_PROFILE_KEY, offlineRes.profile);
        setIsOfflineAuth(true);
        return { error: null };
      }
      return {
        error: new Error(offlineRes.error || 'Failed to authenticate offline.'),
      };
    }

    // 2. Online verification with Supabase Auth
    try {
      const { data, error } = await withNetworkTimeout(
        client.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        }),
        4000
      );

      if (error) {
        // If server network error or fetch failure, attempt offline fallback
        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('timed out')
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
            AppStorage.setJSON(CACHE_PROFILE_KEY, offlineRes.profile);
            setIsOfflineAuth(true);
            return { error: null };
          }
        }
        return { error };
      }

      if (data.user) {
        const p = await withNetworkTimeout(getCurrentUserProfile(client, data.user.id), 3500).catch(
          () => null
        );

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
        AppStorage.setJSON(CACHE_PROFILE_KEY, resolvedProfile);
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
        AppStorage.setJSON(CACHE_PROFILE_KEY, offlineRes.profile);
        setIsOfflineAuth(true);
        return { error: null };
      }
      return {
        error: err instanceof Error ? err : new Error('An unexpected error occurred'),
      };
    }
  };

  const signOut = async () => {
    lastResolvedUserIdRef.current = null;
    clearOfflineAuthSession(STORAGE_PREFIX);
    AppStorage.removeItem(CACHE_PROFILE_KEY);
    try {
      await client.auth.signOut();
    } catch {
      // Ignore
    }
    setUser(null);
    setProfile(null);
    setSession(null);
    setIsOfflineAuth(false);
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
    try {
      const { error } = await withNetworkTimeout(
        client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        4000
      );
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
