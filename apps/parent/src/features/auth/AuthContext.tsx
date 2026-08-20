import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, getCurrentUserProfile } from '@qr-attendance/supabase';
import type { UserProfile, LinkedStudent } from '@qr-attendance/types';

interface ParentAuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  role: 'parent' | 'student' | null;
  linkedChildren: LinkedStudent[];
  activeChild: LinkedStudent | null;
  setActiveChildId: (studentId: string) => void;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<ParentAuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [linkedChildren, setLinkedChildren] = useState<LinkedStudent[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const client = getSupabaseClient();

  const loadProfileAndChildren = async (userId: string, email?: string) => {
    try {
      const p = await getCurrentUserProfile(client, userId);
      if (p) {
        setProfile(p);
      } else {
        setProfile({
          id: userId,
          role: 'parent',
          full_name: email?.split('@')[0] || 'Parent / Guardian',
          email: email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // Default mock children structure for initial development until database tables are seeded
      const defaultChildren: LinkedStudent[] = [
        {
          student_id: 'std-1',
          lrn: '108234981234',
          first_name: 'Juan',
          last_name: 'Dela Cruz',
          middle_name: 'M.',
          suffix: null,
          grade_level: 12,
          section_name: 'STEM A',
          relationship: 'Father',
          is_primary: true,
        },
        {
          student_id: 'std-2',
          lrn: '108234981235',
          first_name: 'Maria',
          last_name: 'Dela Cruz',
          middle_name: 'M.',
          suffix: null,
          grade_level: 9,
          section_name: 'Rizal',
          relationship: 'Father',
          is_primary: false,
        },
      ];

      setLinkedChildren(defaultChildren);
      if (!activeChildId && defaultChildren.length > 0) {
        setActiveChildId(defaultChildren[0].student_id);
      }
    } catch (err) {
      console.error('Error loading parent data:', err);
    }
  };

  useEffect(() => {
    client.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfileAndChildren(session.user.id, session.user.email).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfileAndChildren(session.user.id, session.user.email);
      } else {
        setProfile(null);
        setLinkedChildren([]);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client]);

  const signInWithEmail = async (email: string, pass: string): Promise<{ error: Error | null }> => {
    try {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) return { error };
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
    setLinkedChildren([]);
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

  const activeChild = linkedChildren.find((c) => c.student_id === activeChildId) || linkedChildren[0] || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        role: (profile?.role as 'parent' | 'student') || 'parent',
        linkedChildren,
        activeChild,
        setActiveChildId,
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

export const useAuth = (): ParentAuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
