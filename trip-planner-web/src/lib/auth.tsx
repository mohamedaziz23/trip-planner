'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NetworkError, api, onSessionChange, refreshSession, setAccessToken } from './api';
import { clearLocalData } from './db';
import type { User } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** true when we trust the cached user because the API is unreachable */
  offlineSession: boolean;
  login(email: string, password: string): Promise<User>;
  register(input: { name: string; email: string; password: string; baseCurrency?: string; homeCountry?: string }): Promise<User>;
  logout(): Promise<void>;
  setUser(user: User): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = 'tp:user';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function cacheUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // storage unavailable (private mode)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [offlineSession, setOfflineSession] = useState(false);

  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    cacheUser(next);
    setStatus(next ? 'authenticated' : 'anonymous');
  }, []);

  useEffect(() => {
    const off = onSessionChange((session) => {
      if (session) {
        setUser(session.user);
        setOfflineSession(false);
      } else {
        setUser(null);
      }
    });
    const cached = readCachedUser();
    refreshSession()
      .then((token) => {
        if (!token) {
          setUser(null);
          if (cached) void clearLocalData();
        }
      })
      .catch((err) => {
        // API unreachable: keep working offline with the last known user
        if (err instanceof NetworkError && cached) {
          setUserState(cached);
          setStatus('authenticated');
          setOfflineSession(true);
        } else {
          setUser(null);
        }
      });
    return () => {
      off();
    };
  }, [setUser]);

  const startSession = useCallback(
    async (session: { user: User; accessToken: string }) => {
      const previous = readCachedUser();
      if (previous && previous._id !== session.user._id) await clearLocalData();
      setAccessToken(session.accessToken);
      setUser(session.user);
      setOfflineSession(false);
      return session.user;
    },
    [setUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      offlineSession,
      setUser,
      async login(email, password) {
        const session = await api<{ user: User; accessToken: string }>('/auth/login', {
          method: 'POST',
          body: { email, password },
          auth: false,
        });
        return startSession(session);
      },
      async register(input) {
        const session = await api<{ user: User; accessToken: string }>('/auth/register', {
          method: 'POST',
          body: input,
          auth: false,
        });
        return startSession(session);
      },
      async logout() {
        try {
          await api('/auth/logout', { method: 'POST', auth: false });
        } catch {
          // offline: the cookie expires on its own
        }
        setAccessToken(null);
        await clearLocalData();
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_USER_CACHES' });
        setUser(null);
      },
    }),
    [user, status, offlineSession, setUser, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
