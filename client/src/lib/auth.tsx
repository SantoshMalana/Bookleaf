import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setUnauthorizedHandler } from './api';
import { queryClient } from './query-client';
import type { User } from './types';

interface AuthValue {
  user: User | null;
  /** True until the first /auth/me check finishes. */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    api
      .get<{ data: { user: User | null } }>('/auth/session') // 200 + null when signed out: no red 401 on first load
      .then((r) => setUser(r.data.user))
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ data: { user: User } }>('/auth/login', { email, password });
    queryClient.clear();
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    queryClient.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
