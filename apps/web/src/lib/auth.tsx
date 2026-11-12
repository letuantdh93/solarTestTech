import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission, RoleCode } from '@solar/shared';
import { api, authEvents, ApiError } from './api';

export interface Me {
  id: string;
  username: string;
  fullName: string;
  role: RoleCode;
  permissions: Permission[];
  mustChangePassword: boolean;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  can: (...anyOf: Permission[]) => boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    const h = () => qc.setQueryData(['me'], null);
    authEvents.addEventListener('unauthorized', h);
    return () => authEvents.removeEventListener('unauthorized', h);
  }, [qc]);

  const me = q.data ?? null;
  const value: AuthCtx = {
    me,
    loading: q.isLoading,
    can: (...anyOf) => !!me && (anyOf.length === 0 || anyOf.some((p) => me.permissions.includes(p))),
    refresh: () => q.refetch(),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
