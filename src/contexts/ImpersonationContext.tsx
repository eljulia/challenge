/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

type MemberRole = 'member' | 'admin' | 'super_admin' | null;

interface ImpersonatedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
  preferences: any;
}

interface ImpersonationContextType {
  role: MemberRole;
  isLoading: boolean;
  isSuperAdmin: boolean;
  impersonatedUser: ImpersonatedUser | null;
  setImpersonatedUser: (user: ImpersonatedUser | null) => void;
  /** The effective user ID: impersonated user's ID if active, else real user ID */
  effectiveUserId: string | null;
  /** Whether currently impersonating someone */
  isImpersonating: boolean;
  /** Actions blocked during impersonation */
  isActionBlocked: (action: 'publish' | 'reconnect' | 'revoke') => boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType>({
  role: null,
  isLoading: true,
  isSuperAdmin: false,
  impersonatedUser: null,
  setImpersonatedUser: () => {},
  effectiveUserId: null,
  isImpersonating: false,
  isActionBlocked: () => false,
});

export const ImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [role, setRole] = useState<MemberRole>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.email) {
        setRole(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('get_user_role', {
          user_email: user.email,
        });

        if (error) {
          console.error('Error fetching user role:', error);
          setRole(null);
        } else {
          setRole(data as MemberRole);
        }
      } catch (err) {
        console.error('Error fetching role:', err);
        setRole(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRole();
  }, [user?.email]);

  // Clear impersonation when user logs out
  useEffect(() => {
    if (!user) {
      setImpersonatedUser(null);
    }
  }, [user]);

  const isSuperAdmin = role === 'super_admin';
  const isImpersonating = isSuperAdmin && impersonatedUser !== null;
  const effectiveUserId = isImpersonating ? impersonatedUser!.id : (user?.id ?? null);

  const blockedActions = new Set(['publish', 'reconnect', 'revoke']);
  const isActionBlocked = (action: 'publish' | 'reconnect' | 'revoke') => {
    return isImpersonating && blockedActions.has(action);
  };

  return (
    <ImpersonationContext.Provider
      value={{
        role,
        isLoading,
        isSuperAdmin,
        impersonatedUser,
        setImpersonatedUser,
        effectiveUserId,
        isImpersonating,
        isActionBlocked,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
};

export const useImpersonation = () => useContext(ImpersonationContext);
