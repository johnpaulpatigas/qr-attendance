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
import type { UserProfile, LinkedStudent } from '@qr-attendance/types';
import { AuthContext, type SignUpParentParams } from './AuthContext';
import { isNetworkOnline } from '../attendance/networkManager';

const PARENT_PROFILE_KEY = 'parent_auth_profile';
const PARENT_CHILDREN_KEY = 'parent_auth_children';
const STORAGE_PREFIX = 'parent';

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
    const cached = AppStorage.getJSON<UserProfile | null>(PARENT_PROFILE_KEY, null);
    return cached;
  });

  const [session, setSession] = useState<Session | null>(null);
  const [isOfflineAuth, setIsOfflineAuth] = useState(false);
  const [linkedChildren, setLinkedChildren] = useState<LinkedStudent[]>(() => {
    return AppStorage.getJSON<LinkedStudent[]>(PARENT_CHILDREN_KEY, []);
  });

  const [activeChildId, setActiveChildId] = useState<string | null>(() => {
    const cached = AppStorage.getJSON<LinkedStudent[]>(PARENT_CHILDREN_KEY, []);
    return cached[0]?.student_id || null;
  });

  const [isLoading, setIsLoading] = useState(true);
  const lastResolvedUserIdRef = useRef<string | null>(null);

  const client = getSupabaseClient();

  const loadProfileAndChildren = useCallback(
    async (userId: string, email?: string, force = false) => {
      if (!force && lastResolvedUserIdRef.current === userId) {
        return;
      }
      lastResolvedUserIdRef.current = userId;

      if (isNetworkOnline()) {
        try {
          const p = await withNetworkTimeout(getCurrentUserProfile(client, userId), 3500);
          if (p) {
            setProfile(p);
            AppStorage.setJSON(PARENT_PROFILE_KEY, p);
          } else {
            const fallbackProfile: UserProfile = {
              id: userId,
              role: 'parent',
              full_name: email?.split('@')[0] || 'Parent / Guardian',
              email: email,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            setProfile(fallbackProfile);
            AppStorage.setJSON(PARENT_PROFILE_KEY, fallbackProfile);
          }

          const { data: parentRecord } = await withNetworkTimeout(
            client
              .from('parents')
              .select('id')
              .eq('profile_id', userId)
              .maybeSingle(),
            3500
          );

          if (parentRecord) {
            const { data: relations } = await withNetworkTimeout(
              client
                .from('student_parents')
                .select(
                  `
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
              `
                )
                .eq('parent_id', parentRecord.id),
              3500
            );

            if (relations && relations.length > 0) {
              interface StudentParentJoinRow {
                relationship: string;
                is_primary: boolean;
                students: {
                  id: string;
                  lrn: string;
                  first_name: string;
                  last_name: string;
                  middle_name: string | null;
                  suffix: string | null;
                  grade_level: number;
                  class_sections?: {
                    section_name: string;
                  } | null;
                } | null;
              }

              const children: LinkedStudent[] = (relations as unknown as StudentParentJoinRow[])
                .filter(
                  (
                    rel
                  ): rel is StudentParentJoinRow & {
                    students: NonNullable<StudentParentJoinRow['students']>;
                  } => Boolean(rel.students)
                )
                .map((rel) => ({
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
              AppStorage.setJSON(PARENT_CHILDREN_KEY, children);
              if (children.length > 0) {
                setActiveChildId((prev) =>
                  prev && children.some((c) => c.student_id === prev) ? prev : children[0].student_id
                );
              } else {
                setActiveChildId(null);
              }
              return;
            }
          }
        } catch {
          // Network timeout or offline fallback
        }
      }

      // Offline fallback: load from AppStorage
      const cachedProfile = AppStorage.getJSON<UserProfile | null>(PARENT_PROFILE_KEY, null);
      if (cachedProfile) setProfile(cachedProfile);

      const cachedChildren = AppStorage.getJSON<LinkedStudent[]>(PARENT_CHILDREN_KEY, []);
      if (cachedChildren.length > 0) {
        setLinkedChildren(cachedChildren);
        setActiveChildId((prev) =>
          prev && cachedChildren.some((c) => c.student_id === prev) ? prev : cachedChildren[0].student_id
        );
      }
    },
    [client]
  );

  useEffect(() => {
    client.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          setIsOfflineAuth(false);
          loadProfileAndChildren(session.user.id, session.user.email).finally(() => {
            setIsLoading(false);
          });
        } else {
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

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        setIsOfflineAuth(false);
        await loadProfileAndChildren(session.user.id, session.user.email);
      } else if (!isOfflineAuth) {
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
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, isOfflineAuth, loadProfileAndChildren]);

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
        AppStorage.setJSON(PARENT_PROFILE_KEY, offlineRes.profile);
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
            AppStorage.setJSON(PARENT_PROFILE_KEY, offlineRes.profile);
            setIsOfflineAuth(true);
            return { error: null };
          }
        }
        return { error };
      }

      if (data.user) {
        const resolvedProfile: UserProfile = {
          id: data.user.id,
          role: 'parent',
          full_name: email.split('@')[0] || 'Parent / Guardian',
          email: email.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await saveOfflineAuthCredentials(
          STORAGE_PREFIX,
          email,
          pass,
          resolvedProfile,
          data.user.id
        );
        AppStorage.setJSON(PARENT_PROFILE_KEY, resolvedProfile);
        setIsOfflineAuth(false);
      }

      return { error: null };
    } catch (err: unknown) {
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
        AppStorage.setJSON(PARENT_PROFILE_KEY, offlineRes.profile);
        setIsOfflineAuth(true);
        return { error: null };
      }
      return {
        error: err instanceof Error ? err : new Error('An unexpected error occurred'),
      };
    }
  };

  const signUpWithStudentLrn = async (
    params: SignUpParentParams
  ): Promise<{ error: Error | null; emailConfirmationRequired?: boolean }> => {
    try {
      const trimmedLrn = params.studentLrn.trim();

      try {
        const { data: verifyRes, error: verifyErr } = await withNetworkTimeout(
          client.rpc('verify_student_lrn', {
            target_lrn: trimmedLrn,
          }),
          3500
        );
        if (!verifyErr && verifyRes && verifyRes.exists === false) {
          return {
            error: new Error(
              `No enrolled student found with LRN "${trimmedLrn}". Please verify the 12-digit number with the class adviser.`
            ),
          };
        }
      } catch {
        // Continue if verification RPC is unreachable
      }

      const { data: authData, error: signUpError } = await withNetworkTimeout(
        client.auth.signUp({
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
        }),
        5000
      );

      if (signUpError) return { error: signUpError };

      if (!authData.session) {
        const { data: signInData, error: signInErr } = await withNetworkTimeout(
          client.auth.signInWithPassword({
            email: params.email.trim(),
            password: params.password,
          }),
          4000
        );

        if (!signInErr && signInData.user) {
          await loadProfileAndChildren(signInData.user.id, params.email.trim());
          return { error: null, emailConfirmationRequired: false };
        } else if (signInErr) {
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
      return {
        success: false,
        message: 'You must be logged in to link a student.',
      };
    }

    try {
      const trimmedLrn = studentLrn.trim();

      const { data: rpcRes, error: rpcErr } = await withNetworkTimeout(
        client.rpc('link_student_to_parent', {
          target_lrn: trimmedLrn,
          relation_name: relationship,
        }),
        3500
      );

      if (!rpcErr && rpcRes && typeof rpcRes === 'object') {
        const res = rpcRes as { success: boolean; message: string };
        if (res.success) {
          await loadProfileAndChildren(user.id, user.email, true);
        }
        return res;
      }

      const { data: student, error: studentError } = await withNetworkTimeout(
        client
          .from('students')
          .select('id, first_name, last_name')
          .eq('lrn', trimmedLrn)
          .maybeSingle(),
        3500
      );

      if (studentError || !student) {
        return {
          success: false,
          message: `No enrolled student found with LRN ${trimmedLrn}.`,
        };
      }

      let parentId: string;
      const { data: existingParent } = await withNetworkTimeout(
        client
          .from('parents')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle(),
        3500
      );

      if (existingParent) {
        parentId = existingParent.id;
      } else {
        const { data: newParent, error: parentErr } = await withNetworkTimeout(
          client
            .from('parents')
            .insert({ profile_id: user.id })
            .select('id')
            .single(),
          3500
        );

        if (parentErr) throw new Error(parentErr.message);
        parentId = newParent.id;
      }

      const { error: linkErr } = await withNetworkTimeout(
        client.from('student_parents').upsert(
          {
            student_id: student.id,
            parent_id: parentId,
            relationship,
            is_primary: true,
          },
          { onConflict: 'student_id,parent_id' }
        ),
        3500
      );

      if (linkErr) throw new Error(linkErr.message);

      await loadProfileAndChildren(user.id, user.email, true);
      const studentName = `${student.first_name} ${student.last_name}`;
      return {
        success: true,
        message: `Student ${studentName} successfully linked to your account.`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to link student record.',
      };
    }
  };

  const signOut = async () => {
    lastResolvedUserIdRef.current = null;
    clearOfflineAuthSession(STORAGE_PREFIX);
    AppStorage.removeItem(PARENT_PROFILE_KEY);
    AppStorage.removeItem(PARENT_CHILDREN_KEY);
    try {
      await client.auth.signOut();
    } catch {
      // Ignore
    }
    setUser(null);
    setProfile(null);
    setSession(null);
    setLinkedChildren([]);
    setActiveChildId(null);
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

  const activeChild =
    linkedChildren.find((c) => c.student_id === activeChildId) || linkedChildren[0] || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        role: (profile?.role as 'parent' | 'student') || 'parent',
        linkedChildren,
        activeChild,
        isOfflineAuth,
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
