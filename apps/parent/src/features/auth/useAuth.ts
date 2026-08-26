import { useContext } from 'react';
import { AuthContext } from './AuthContext';
import type { ParentAuthContextType } from './AuthContext';

export const useAuth = (): ParentAuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export type { ParentAuthContextType };
