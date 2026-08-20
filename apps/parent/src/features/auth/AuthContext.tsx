import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, getCurrentUserProfile } from '@qr-attendance/supabase';
import type { UserProfile, LinkedStudent } from '@qr-attendance/types';

export interface SignUpParentParams {
  fullName: string;
  email: string;
  password: string;
  studentLrn: string;
  relationship: string;
}

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
  signUpWithStudentLrn: (params: SignUpParentParams) => Promise<{ error: Error | null; emailConfirmationRequired?: boolean }>;
  linkStudentByLrn: (studentLrn: string, relationship?: string) => Promise<{ success: boolean; message: string }>;
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

  const signUpWithStudentLrn = async (
    params: SignUpParentParams
  ): Promise<{ error: Error | null; emailConfirmationRequired?: boolean }> => {
    try {
      const trimmedLrn = params.studentLrn.trim();

      // 1. Check student via public RPC
      try {
        const { data: verifyRes, error: verifyErr } = await (client as any).rpc(
          'verify_student_lrn',
          { target_lrn: trimmedLrn }
        );
        if (!verifyErr && verifyRes && verifyRes.exists === false) {
          return {
            error: new Error(
              `No enrolled student found with LRN "${trimmedLrn}". Please verify the 12-digit number with the class adviser.`
            ),
          };
        }
      } catch {
        // Fall back gracefully
      }

      // 2. Register user in Supabase Auth with student_lrn metadata for atomic trigger execution
      const { data: authData, error: signUpError } = await client.auth.signUp({
        email: params.email.trim(),
        password: params.password,
        options: {
          data: {
            full_name: params.fullName.trim(),
            role: 'parent',
            student_lrn: trimmedLrn,
            relationship: params.relationship || 'Parent',
          },
        },
      });

      if (signUpError) return { error: signUpError };

      // 3. If session is not automatically created (e.g. Supabase requires sign-in), attempt sign-in
      if (!authData.session) {
        const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
          email: params.email.trim(),
          password: params.password,
        });

        if (!signInErr && signInData.user) {
          await loadProfileAndChildren(signInData.user.id, params.email.trim());
          return { error: null, emailConfirmationRequired: false };
        } else if (signInErr) {
          // If email confirmation is required by Supabase project settings
          return { error: null, emailConfirmationRequired: true };
        }
      }

      if (authData.user) {
        await loadProfileAndChildren(authData.user.id, params.email.trim());
      }

      return { error: null, emailConfirmationRequired: false };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err : new Error('Failed to create parent account.'),
      };
    }
  };

  const linkStudentByLrn = async (
    studentLrn: string,
    relationship: string = 'Parent'
  ): Promise<{ success: boolean; message: string }> => {
    if (!user) {
      return { success: false, message: 'You must be logged in to link a student.' };
    }

    try {
      const trimmedLrn = studentLrn.trim();

      // Attempt RPC
      const { data: rpcRes, error: rpcErr } = await (client as any).rpc('link_student_to_parent', {
        target_lrn: trimmedLrn,
        relation_name: relationship,
      });

      if (!rpcErr && rpcRes && typeof rpcRes === 'object') {
        const res = rpcRes as { success: boolean; message: string };
        if (res.success) {
          await loadProfileAndChildren(user.id, user.email);
          return res;
        }
        return res;
      }

      // Direct fallback
      const { data: student, error: studentError } = await client
        .from('students')
        .select('id, first_name, last_name')
        .eq('lrn', trimmedLrn)
        .maybeSingle();

      if (studentError || !student) {
        return {
          success: false,
          message: `No enrolled student found with LRN ${trimmedLrn}.`,
        };
      }

      let parentId: string;
      const { data: existingParent } = await client
        .from('parents')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();

      if (existingParent) {
        parentId = (existingParent as any).id;
      } else {
        const { data: newParent, error: parentErr } = await (client.from('parents') as any)
          .insert({ profile_id: user.id })
          .select('id')
          .single();

        if (parentErr) throw new Error(parentErr.message);
        parentId = newParent.id;
      }

      await (client.from('student_parents') as any).upsert(
        {
          student_id: (student as any).id,
          parent_id: parentId,
          relationship,
          is_primary: true,
        },
        { onConflict: 'student_id,parent_id' }
      );

      await loadProfileAndChildren(user.id, user.email);
      const studentName = `${(student as any).first_name} ${(student as any).last_name}`;
      return {
        success: true,
        message: `Student ${studentName} successfully linked to your account.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Failed to link student record.',
      };
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
        signUpWithStudentLrn,
        linkStudentByLrn,
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
