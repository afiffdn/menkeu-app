import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, getStoredToken, setStoredToken } from '../services/api';
import type { Family, User } from '../types/finance';

interface AuthContextValue {
  user: User | null;
  families: Family[];
  loading: boolean;
  refreshProfile: () => Promise<void>;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    family_name?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshProfile = useCallback(async () => {
    const allowNoLoginProbe = import.meta.env.VITE_WORKSPACE_NO_LOGIN === 'true';
    if (!getStoredToken() && !allowNoLoginProbe) {
      setUser(null);
      setFamilies([]);
      setLoading(false);
      return;
    }

    try {
      const data = await authApi.me();
      setUser(data.user);
      setFamilies(data.families);
    } catch {
      if (!getStoredToken()) {
        setUser(null);
        setFamilies([]);
      } else {
        setStoredToken(null);
        setUser(null);
        setFamilies([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setFamilies([]);
    };
    window.addEventListener('ff:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('ff:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      const data = await authApi.login(payload);
      setStoredToken(data.token);
      await refreshProfile();
    },
    [refreshProfile]
  );

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; family_name?: string }) => {
      const data = await authApi.register(payload);
      setStoredToken(data.token);
      await refreshProfile();
    },
    [refreshProfile]
  );

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await authApi.logout();
      }
    } catch {
      // ignore network error on logout
    } finally {
      setStoredToken(null);
      setUser(null);
      setFamilies([]);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, families, loading, refreshProfile, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
