import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getSession,
  logoutUser,
  resetCsrfToken,
  toggleTwoFactor as apiToggleTwoFactor,
  logoutEverywhere as apiLogoutEverywhere,
  deleteAccount as apiDeleteAccount,
} from '../services/api';
import { notify } from '../utils/notifications';
import { setStorageUser, clearUserStorage } from '../utils/userStorage';
import { clearPendingExpenses } from '../utils/offlineQueue';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_WARNING_MS = 2 * 60 * 1000;
const IDLE_CHECK_MS = 15 * 1000;
// Last confirmed session email. Kept so the offline queue can tag (and later
// replay) expenses for the right person even when the app starts offline and
// the session check can't reach the server.
const SESSION_EMAIL_KEY = 'sessionEmail';
const HAS_SESSION_KEY = 'hasSession';
// Last user activity in ANY tab. The idle timeout reads this shared value, so
// working in one tab keeps the others signed in too.
const LAST_ACTIVITY_KEY = 'lastActivityAt';
// Set when a logout couldn't reach the server (offline). The session cookie is
// then still valid, and the mount-time session check used to sign the user
// straight back in; instead the logout is retried before the session is trusted.
const PENDING_LOGOUT_KEY = 'pendingServerLogout';

const store = {
  get: (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } },
};
const normalizeEmail = (email: unknown): string | null =>
  typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

interface AuthContextValue {
  isAuthenticated: boolean;
  /** Signed-in user's email (lowercased), or null when signed out/unknown. */
  userEmail: string | null;
  twoFactorEnabled: boolean;
  /** Mark authenticated after a successful login and hydrate 2FA state. Pass
   *  the email that signed in so per-account storage is ready immediately. */
  loginSuccess: (email?: string) => Promise<void>;
  logout: () => void;
  /** Turn two-factor sign-in on or off. Turning it off needs the password
   *  (server-enforced). Throws ApiError, for the caller to show. */
  setTwoFactor: (enabled: boolean, password?: string) => Promise<void>;
  /** End every session of this account, this device's included. Throws when the server can't be reached. */
  logoutEverywhere: () => Promise<void>;
  /** Delete the account for good, then forget what this browser kept for it. Throws ApiError. */
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => store.get(HAS_SESSION_KEY) === 'true' && !store.get(PENDING_LOGOUT_KEY)
  );
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [userEmail, setUserEmailState] = useState<string | null>(() => {
    const email = store.get(HAS_SESSION_KEY) === 'true' ? normalizeEmail(store.get(SESSION_EMAIL_KEY)) : null;
    setStorageUser(email);
    return email;
  });
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  const setUserEmail = useCallback((email: string | null) => {
    setStorageUser(email);
    setUserEmailState(email);
    if (email) store.set(SESSION_EMAIL_KEY, email);
    else store.remove(SESSION_EMAIL_KEY);
  }, []);

  // Everything this tab holds for the signed-in user: auth state, every cached
  // query (not just the main dataset), the in-memory CSRF token, and the
  // per-account storage scope. Per-account localStorage is NOT deleted — it's
  // namespaced by email, so the next person can't see it, and the owner gets it
  // back on their next sign-in.
  const clearLocalSession = useCallback(() => {
    setIsAuthenticated(false);
    setTwoFactorEnabled(false);
    setUserEmail(null);
    queryClient.clear();
    resetCsrfToken();
  }, [queryClient, setUserEmail]);

  const tryServerLogout = useCallback(() => {
    store.set(PENDING_LOGOUT_KEY, '1');
    return logoutUser()
      .then(() => store.remove(PENDING_LOGOUT_KEY))
      .catch(() => undefined); // offline: retried on reconnect / next start
  }, []);

  const logout = useCallback(() => {
    // Removing hasSession is also the cross-tab signal (see the storage listener).
    store.remove(HAS_SESSION_KEY);
    clearLocalSession();
    void tryServerLogout();
  }, [clearLocalSession, tryServerLogout]);

  const loginSuccess = useCallback(async (email?: string) => {
    // A fresh session: a leftover "pending logout" must not end it.
    store.remove(PENDING_LOGOUT_KEY);
    const known = normalizeEmail(email);
    if (known) setUserEmail(known);
    setIsAuthenticated(true);
    store.set(HAS_SESSION_KEY, 'true');
    store.set(LAST_ACTIVITY_KEY, String(Date.now()));
    try {
      const session = await getSession();
      setTwoFactorEnabled(Boolean(session.twoFactorEnabled));
      setUserEmail(normalizeEmail(session.email) ?? known);
    } catch {
      setTwoFactorEnabled(false);
    }
  }, [setUserEmail]);

  const setTwoFactor = useCallback(async (enabled: boolean, password?: string) => {
    const result = await apiToggleTwoFactor(enabled, password);
    setTwoFactorEnabled(result.twoFactorEnabled);
  }, []);

  const logoutEverywhere = useCallback(async () => {
    await apiLogoutEverywhere();
    store.remove(HAS_SESSION_KEY);
    clearLocalSession();
  }, [clearLocalSession]);

  const deleteAccount = useCallback(async (password: string) => {
    const email = userEmail;
    await apiDeleteAccount(password);
    // The account is gone: drop its cached settings, unsent changes and
    // queued offline expenses, so nothing replays into a future account.
    if (email) {
      clearUserStorage(email);
      await clearPendingExpenses(email).catch(() => undefined);
    }
    store.remove(HAS_SESSION_KEY);
    clearLocalSession();
  }, [userEmail, clearLocalSession]);

  // On start: finish a logout that never reached the server, else reconcile the
  // session (twoFactorEnabled / email from server truth, APP-H6). Also handles
  // the Google OAuth redirect (?auth=1): the session check below confirms it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (store.get(PENDING_LOGOUT_KEY)) {
      void tryServerLogout();
      return;
    }
    getSession()
      .then((session) => {
        if (session.authenticated) {
          setUserEmail(normalizeEmail(session.email));
          setTwoFactorEnabled(Boolean(session.twoFactorEnabled));
          setIsAuthenticated(true);
          store.set(HAS_SESSION_KEY, 'true');
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry a pending server logout when the connection comes back.
  useEffect(() => {
    const onOnline = () => { if (store.get(PENDING_LOGOUT_KEY)) void tryServerLogout(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tryServerLogout]);

  // Cross-tab: logging out in one tab logs out the others (they used to stay
  // signed in until their next request failed).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === HAS_SESSION_KEY && e.newValue === null && isAuthenticatedRef.current) {
        clearLocalSession(); // the other tab already told the server
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clearLocalSession]);

  // Idle timeout, shared across tabs: activity in any tab updates one timestamp,
  // and every tab checks it. Per-tab timers used to let an idle background tab
  // log out (server-side, for everyone) the tab the user was working in.
  useEffect(() => {
    if (!isAuthenticated) return;
    let lastWrite = 0;
    let warned = false;

    const markActive = () => {
      const now = Date.now();
      warned = false;
      if (now - lastWrite < 5000) return; // throttle storage writes
      lastWrite = now;
      store.set(LAST_ACTIVITY_KEY, String(now));
    };
    const check = () => {
      const last = Math.max(lastWrite, Number(store.get(LAST_ACTIVITY_KEY)) || 0);
      const idle = Date.now() - last;
      if (idle >= SESSION_TIMEOUT_MS) {
        notify.info('Session expired. Please log in again.');
        logout();
      } else if (idle >= SESSION_TIMEOUT_MS - SESSION_WARNING_MS && !warned) {
        warned = true;
        notify.warning('Session expires soon due to inactivity.');
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    markActive();
    const interval = setInterval(check, IDLE_CHECK_MS);

    return () => {
      clearInterval(interval);
      events.forEach((eventName) => window.removeEventListener(eventName, markActive));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, twoFactorEnabled, loginSuccess, logout, setTwoFactor, logoutEverywhere, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
