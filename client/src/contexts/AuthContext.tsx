import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSession, logoutUser, toggleTwoFactor as apiToggleTwoFactor } from '../services/api';
import { queryKeys } from '../lib/queryClient';
import { notify } from '../utils/notifications';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_WARNING_MS = 2 * 60 * 1000;

interface AuthContextValue {
  isAuthenticated: boolean;
  twoFactorEnabled: boolean;
  /** Mark authenticated after a successful login and hydrate 2FA state. */
  loginSuccess: () => Promise<void>;
  logout: () => void;
  /** Toggle 2FA; prompts for the password when disabling (server-enforced). */
  toggleTwoFactor: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => localStorage.getItem('hasSession') === 'true'
  );
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const logout = () => {
    logoutUser().catch(() => undefined);
    localStorage.removeItem('hasSession');
    setIsAuthenticated(false);
    setTwoFactorEnabled(false);
    // Drop the cached dataset so the next user can't read the previous user's
    // data from cache (the data query is disabled while logged out).
    queryClient.removeQueries({ queryKey: queryKeys.allData });
  };

  const loginSuccess = async () => {
    setIsAuthenticated(true);
    localStorage.setItem('hasSession', 'true');
    try {
      const session = await getSession();
      setTwoFactorEnabled(Boolean(session.twoFactorEnabled));
    } catch {
      setTwoFactorEnabled(false);
    }
  };

  const toggleTwoFactor = async () => {
    const disabling = twoFactorEnabled;
    let password: string | undefined;
    if (disabling) {
      password = window.prompt('Enter your password to disable two-factor authentication:') ?? undefined;
      if (!password) return; // cancelled or left blank
    }
    try {
      const result = await apiToggleTwoFactor(!twoFactorEnabled, password);
      setTwoFactorEnabled(result.twoFactorEnabled);
      notify.success(result.message);
    } catch (error) {
      notify.error(
        disabling
          ? 'Could not disable 2FA. Check your password and try again.'
          : 'Could not update 2FA setting.'
      );
    }
  };

  // Google OAuth redirect (?auth=1) marks the session authenticated.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === '1') {
      setIsAuthenticated(true);
      localStorage.setItem('hasSession', 'true');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Reconcile the session on every mount so twoFactorEnabled reflects server
  // truth even when optimistically authenticated from the hasSession flag (APP-H6).
  useEffect(() => {
    getSession()
      .then((session) => {
        if (session.authenticated) {
          setIsAuthenticated(true);
          setTwoFactorEnabled(Boolean(session.twoFactorEnabled));
          localStorage.setItem('hasSession', 'true');
        }
      })
      .catch(() => undefined);
  }, []);

  // Idle session timeout with a warning then automatic logout.
  useEffect(() => {
    if (!isAuthenticated) return;

    let warningTimer: ReturnType<typeof setTimeout> | null = null;
    let logoutTimer: ReturnType<typeof setTimeout> | null = null;

    const resetTimers = () => {
      if (warningTimer) clearTimeout(warningTimer);
      if (logoutTimer) clearTimeout(logoutTimer);
      warningTimer = setTimeout(() => {
        notify.warning('Session expires soon due to inactivity.');
      }, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);
      logoutTimer = setTimeout(() => {
        notify.info('Session expired. Please log in again.');
        logout();
      }, SESSION_TIMEOUT_MS);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimers, { passive: true }));
    resetTimers();

    return () => {
      if (warningTimer) clearTimeout(warningTimer);
      if (logoutTimer) clearTimeout(logoutTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimers));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, twoFactorEnabled, loginSuccess, logout, toggleTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
