import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile, LinkedStudent } from '@qr-attendance/types';

export interface SignUpParentParams {
  fullName: string;
  email: string;
  password: string;
  studentLrn: string;
  relationship: string;
}

export interface ParentAuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  role: 'parent' | 'student' | null;
  linkedChildren: LinkedStudent[];
  activeChild: LinkedStudent | null;
  isOfflineAuth: boolean;
  setActiveChildId: (studentId: string) => void;
  isLoading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<{ error: Error | null }>;
  signUpWithStudentLrn: (
    params: SignUpParentParams
  ) => Promise<{ error: Error | null; emailConfirmationRequired?: boolean }>;
  linkStudentByLrn: (
    studentLrn: string,
    relationship?: string
  ) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

export const AuthContext = createContext<ParentAuthContextType | undefined>(undefined);
