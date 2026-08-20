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

      // Fetch real linked children from student_parents table
      const { data: parentRecord } = await client
        .from('parents')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle();

      if (parentRecord) {
        const parentId = (parentRecord as any).id;
        const { data: relations } = await client
          .from('student_parents')
          .select(`
            relationship,
            is_primary,
            students (
              id,
              lrn,
              first_name,
              last_name,
              middle_name,
              suffix,
              grade_level,
              class_sections (
                section_name
              )
            )
          `)
          .eq('parent_id', parentId);

        if (relations && relations.length > 0) {
          const children: LinkedStudent[] = (relations as any[])
            .filter((rel: any) => rel.students)
            .map((rel: any) => ({
              student_id: rel.students.id,
              lrn: rel.students.lrn,
              first_name: rel.students.first_name,
              last_name: rel.students.last_name,
              middle_name: rel.students.middle_name,
              suffix: rel.students.suffix,
              grade_level: rel.students.grade_level,
              section_name: rel.students.class_sections?.section_name || 'Unassigned',
              relationship: rel.relationship || 'Guardian',
              is_primary: rel.is_primary || false,
            }));

          setLinkedChildren(children);
          if (children.length > 0) {
            setActiveChildId((prev) =>
              prev && children.some((c) => c.student_id === prev) ? prev : children[0].student_id
            );
          } else {
            setActiveChildId(null);
          }
        } else {
          setLinkedChildren([]);
          setActiveChildId(null);
        }
      } else {
        setLinkedChildren([]);
        setActiveChildId(null);
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
        setActiveChildId(null);
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
    setActiveChildId(null);
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
