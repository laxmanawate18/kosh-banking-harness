import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthContext as AuthContextType, User, PublicAuthConfig } from '../types/auth';
import * as authService from '../services/auth';

interface AuthContextValue {
  auth: AuthContextType | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  publicConfig: PublicAuthConfig | null;
  requiresConsent: boolean;
  submitConsent: (accepted?: boolean) => Promise<void>;
  setConsent: (accepted: boolean) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<AuthContextType | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicAuthConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [requiresConsent, setRequiresConsent] = useState<boolean>(false);

  const checkHasConsent = (session: AuthContextType | null) => {
    if (!session || !session.user || session.user.role !== 'CUSTOMER') return true;
    if (!session.consent) return false;
    return !!(session.consent.id || session.consent.granted_at || session.consent.accepted);
  };

  const refreshSession = async () => {
    try {
      const session = await authService.checkSession();
      setAuth(session);
      setRequiresConsent(!checkHasConsent(session));
    } catch (err: any) {
      if (err?.status === 401) {
        setAuth(null);
        setRequiresConsent(false);
      } else {
        console.warn('Session refresh encountered a transient error; preserving existing session:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    authService
      .fetchPublicConfig()
      .then((cfg) => setPublicConfig(cfg))
      .catch((e) => console.warn('Could not fetch public auth config', e));
    refreshSession();

    // Periodic heartbeat: keeps session alive and touches last_seen_at while tab is active
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshSession().catch(() => {});
      }
    }, 2.5 * 60 * 1000);

    const onFocus = () => {
      refreshSession().catch(() => {});
    };
    window.addEventListener('focus', onFocus);

    const onExpired = () => {
      refreshSession().catch(() => {});
    };
    window.addEventListener('kosh:session-expired', onExpired);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('kosh:session-expired', onExpired);
    };
  }, []);

  const submitConsent = async (accepted: boolean = true) => {
    await authService.submitConsent(accepted);
    setRequiresConsent(false);
    await refreshSession();
  };

  const logout = useCallback(async () => {
    let idpSignOutUrl: string | null | undefined = null;
    try {
      const res = await authService.logout();
      idpSignOutUrl = res?.idp_sign_out_url;
    } catch {}
    setAuth(null);
    setRequiresConsent(false);
    if (idpSignOutUrl) {
      window.location.href = idpSignOutUrl;
    }
  }, []);

  const setConsent = (accepted: boolean) => {
    setAuth((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        consent: accepted
          ? {
              id: 'c-local',
              accepted: true,
              granted_at: new Date().toISOString(),
              scopes: ['all'],
            }
          : null,
      };
    });
    setRequiresConsent(!accepted);
  };

  return (
    <AuthContext.Provider
      value={{
        auth,
        user: auth?.user || null,
        isAuthenticated: !!(auth && auth.authenticated),
        isLoading,
        publicConfig,
        requiresConsent,
        submitConsent,
        setConsent,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
