import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, getCurrentUserProfile } from '@qr-attendance/supabase';
import type { UserProfile } from '@qr-attendance/types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_PROFILE_KEY = 'teacher_auth_profile';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_PROFILE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const client = getSupabaseClient();

  const handleProfileResolution = async (userId: string, email?: string) => {
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
  };

  useEffect(() => {
    // Initial session lookup
    client.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        handleProfileResolution(session.user.id, session.user.email).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    }).catch(() => {
      setIsLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await handleProfileResolution(session.user.id, session.user.email);
      } else {
        setProfile(null);
        localStorage.removeItem(CACHE_PROFILE_KEY);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client]);

  const signInWithEmail = async (email: string, pass: string): Promise<{ error: Error | null }> => {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) return { error };

      if (data.user) {
        const p = await getCurrentUserProfile(client, data.user.id);
        if (p && p.role !== 'teacher' && p.role !== 'admin') {
          await client.auth.signOut();
          return {
            error: new Error('Access denied: Only teachers and administrators can sign in to the Teacher Portal.'),
          };
        }
      }

      return { error: null };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error('An unexpected error occurred') };
    }
  };

  const signOut = async () => {
    await client.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error: error ? new Error(error.message) : null };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error('Failed to send reset email') };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
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

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
