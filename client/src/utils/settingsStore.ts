// Per-account settings (savings goals, investment accounts, custom categories,
// the merchant map, paused recurring charges, a few preferences), stored on
// the server so they follow the account across devices and are part of
// backups. They used to live only in this browser's localStorage.
//
//   server   — the last copy the server confirmed (also cached in localStorage,
//              so the app shows it before /data/all arrives or when offline)
//   pending  — local changes the server hasn't confirmed yet (persisted, so a
//              change made offline survives a reload and is sent later)
//   snapshot — server with pending applied: what the app reads
//
// A change applies at once and is sent shortly after; if sending fails it is
// retried with backoff and when the browser comes back online. Each key is
// replaced as a whole on the server (PATCH semantics per key), so two devices
// changing different settings don't overwrite each other.
//
// The first time an account loads after this moved to the server, whatever the
// browser still holds under the old localStorage keys is merged with the
// server's copy and uploaded (see migrateLegacy).

import { patchSettings, ApiError } from '../services/api';
import type { UserSettings, SettingsPatch, SavingsGoal, InvestmentAccount, CategoryMap } from '../types';
import { userStorage, getStorageUser, onStorageUserChange } from './userStorage';
import { isSupportedCurrency } from './currencies';
import { notify } from './notifications';

type Key = keyof UserSettings;

const CACHE_KEY = 'settingsCache';
const PENDING_KEY = 'settingsPending';
const MIGRATED_KEY = 'settingsMigrated';

// --- normalising (mirrors server/src/utils/settings.ts, so the server never
//     has a reason to refuse what we send) -----------------------------------

export const SETTINGS_LIMITS = {
  name: 100,
  id: 64,
  category: 60,
  mains: 50,
  subs: 100,
  merchantEntries: 500,
  merchantKey: 80,
  pausedEntries: 500,
  pausedKey: 700,
  goals: 100,
  accounts: 100,
  maxAmount: 10_000_000,
};
const ACCOUNT_TYPES: InvestmentAccount['type'][] = ['cash', 'brokerage', 'crypto', 'retirement', 'loan', 'other'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// oxlint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** The server's sanitizeText, then capped: what the server would store. */
const clean = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v.replace(/[\t\r\n]+/g, ' ').replace(CONTROL_CHARS, '').replace(/<[^>]*>/g, '').trim().slice(0, max).trim()
    : '';

const amount = (v: unknown, min: number): number | null => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n) || n < min || Math.abs(n) > SETTINGS_LIMITS.maxAmount) return null;
  return Math.round(n * 100) / 100;
};

const byId = <T extends { id: string }>(items: T[], max: number): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))).slice(0, max);
};

export const normalizeGoals = (raw: unknown): SavingsGoal[] => {
  if (!Array.isArray(raw)) return [];
  const goals: SavingsGoal[] = [];
  for (const g of raw) {
    if (!isObject(g)) continue;
    const id = clean(String(g.id ?? ''), SETTINGS_LIMITS.id);
    const name = clean(g.name, SETTINGS_LIMITS.name);
    const target = amount(g.target, 0.01);
    if (!id || !name || target === null) continue;
    const goal: SavingsGoal = { id, name, target, saved: amount(g.saved ?? 0, 0) ?? 0 };
    if (typeof g.deadline === 'string' && YMD.test(g.deadline)) goal.deadline = g.deadline;
    goals.push(goal);
  }
  return byId(goals, SETTINGS_LIMITS.goals);
};

export const normalizeAccounts = (raw: unknown): InvestmentAccount[] => {
  if (!Array.isArray(raw)) return [];
  const accounts: InvestmentAccount[] = [];
  for (const a of raw) {
    if (!isObject(a)) continue;
    const id = clean(String(a.id ?? ''), SETTINGS_LIMITS.id);
    const name = clean(a.name, SETTINGS_LIMITS.name);
    const value = amount(a.value, -SETTINGS_LIMITS.maxAmount);
    if (!id || !name || value === null) continue;
    accounts.push({
      id,
      name,
      type: ACCOUNT_TYPES.includes(a.type as InvestmentAccount['type']) ? (a.type as InvestmentAccount['type']) : 'other',
      value,
      asOf: typeof a.asOf === 'string' && YMD.test(a.asOf) ? a.asOf : new Date().toISOString().slice(0, 10),
    });
  }
  return byId(accounts, SETTINGS_LIMITS.accounts);
};

const safeKey = (raw: string, max: number): string => {
  const key = clean(raw, max);
  return FORBIDDEN_KEYS.has(key) ? '' : key;
};

export const normalizeCategoryMap = (raw: unknown): CategoryMap => {
  if (!isObject(raw)) return {};
  const out: [string, string[]][] = [];
  for (const [rawMain, subs] of Object.entries(raw).slice(0, SETTINGS_LIMITS.mains)) {
    const main = safeKey(rawMain, SETTINGS_LIMITS.category);
    if (!main || !Array.isArray(subs)) continue;
    const names = Array.from(new Set(subs.map((s) => clean(s, SETTINGS_LIMITS.category)).filter(Boolean))).slice(0, SETTINGS_LIMITS.subs);
    if (names.length) out.push([main, names]);
  }
  return Object.fromEntries(out);
};

export const normalizeMerchantMap = (raw: unknown): Record<string, string> => {
  if (!isObject(raw)) return {};
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(raw)) {
    const key = safeKey(k, SETTINGS_LIMITS.merchantKey).toLowerCase();
    const category = clean(v, SETTINGS_LIMITS.category);
    if (key && category) out.push([key, category]);
  }
  // Newest last: keep the most recent choices.
  return Object.fromEntries(out.slice(-SETTINGS_LIMITS.merchantEntries));
};

export const normalizePaused = (raw: unknown): Record<string, boolean> => {
  if (!isObject(raw)) return {};
  const out: [string, boolean][] = [];
  for (const [k, v] of Object.entries(raw)) {
    const key = safeKey(k, SETTINGS_LIMITS.pausedKey);
    if (key && v === true) out.push([key, true]);
  }
  return Object.fromEntries(out.slice(-SETTINGS_LIMITS.pausedEntries));
};

/** Bring a patch within the server's rules. Values that can't be fixed are dropped. */
export const normalizePatch = (patch: SettingsPatch): SettingsPatch => {
  const out: SettingsPatch = {};
  for (const [k, v] of Object.entries(patch) as [Key, unknown][]) {
    if (v === null) { (out as Record<string, unknown>)[k] = null; continue; }
    if (v === undefined) continue;
    switch (k) {
      case 'displayCurrency':
        if (typeof v === 'string' && isSupportedCurrency(v.toUpperCase())) out.displayCurrency = v.toUpperCase();
        break;
      case 'hideTuition':
      case 'onboardingDismissed':
      case 'notifyBudgets':
      case 'notifyBills':
      case 'notifyMonthlySummary':
        if (typeof v === 'boolean') out[k] = v;
        break;
      case 'timeZone':
        if (typeof v === 'string' && v.length <= 64 && isTimeZone(v)) out.timeZone = v;
        break;
      case 'recurringSnoozeUntil':
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out.recurringSnoozeUntil = Math.min(v, Date.now() + 365 * 86_400_000);
        break;
      case 'customCategories':
      case 'deletedSubcategories':
        out[k] = normalizeCategoryMap(v);
        break;
      case 'merchantMap':
        out.merchantMap = normalizeMerchantMap(v);
        break;
      case 'pausedRecurring':
        out.pausedRecurring = normalizePaused(v);
        break;
      case 'savingsGoals':
        out.savingsGoals = normalizeGoals(v);
        break;
      case 'investmentAccounts':
        out.investmentAccounts = normalizeAccounts(v);
        break;
    }
  }
  return out;
};

// --- state ------------------------------------------------------------------

let owner: string | null = null;
let server: UserSettings = {};
let pending: SettingsPatch = {};
let snapshot: UserSettings = {};
let hydrated = false;
/** Legacy values folded into `pending` this session, by key (see migrateLegacy). */
let legacy: SettingsPatch = {};
let finishMigrationAfterFlush = false;

const listeners = new Set<() => void>();
const notifyAll = () => listeners.forEach((fn) => fn());

const readJson = (key: string): unknown => {
  try {
    const raw = userStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const persist = () => {
  userStorage.setItem(CACHE_KEY, JSON.stringify(server));
  if (Object.keys(pending).length) userStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  else userStorage.removeItem(PENDING_KEY);
};

const recompute = () => {
  const next: Record<string, unknown> = { ...server };
  for (const [k, v] of Object.entries(pending)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  snapshot = next as UserSettings;
};

/** Load the state of whoever is signed in now (storage is scoped per account). */
const ensureOwner = () => {
  const user = getStorageUser();
  if (user === owner) return;
  owner = user;
  hydrated = false;
  finishMigrationAfterFlush = false;
  clearRetry();
  server = user && isObject(readJson(CACHE_KEY)) ? (readJson(CACHE_KEY) as UserSettings) : {};
  const stored = user ? readJson(PENDING_KEY) : null;
  pending = isObject(stored) ? (stored as SettingsPatch) : {};
  legacy = user && userStorage.getItem(MIGRATED_KEY) !== '1' ? readLegacy() : {};
  // Show the old local values straight away; they're merged with the server's
  // copy once it loads. Changes already pending win.
  pending = { ...legacy, ...pending };
  recompute();
};

// --- legacy localStorage (before settings moved to the server) --------------

const LEGACY_KEYS = {
  savingsGoalsV2: 'savingsGoals',
  investmentAccounts: 'investmentAccounts',
  pausedRecurringTemplates: 'pausedRecurring',
  merchantCategoryMap: 'merchantMap',
  customCategories: 'customCategories',
  deletedSubcategories: 'deletedSubcategories',
  recurringReminderSnoozeUntil: 'recurringSnoozeUntil',
  onboardingDismissed: 'onboardingDismissed',
} as const satisfies Record<string, Key>;
// These two were per device rather than per account.
const LEGACY_DEVICE_HIDE_TUITION = 'hideTuition';
const LEGACY_DEVICE_CURRENCY = 'displayCurrency';

const parse = (raw: string | null): unknown => {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
};
const deviceItem = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const readLegacy = (): SettingsPatch => {
  const raw: Record<string, unknown> = {};
  for (const [oldKey, key] of Object.entries(LEGACY_KEYS)) {
    const value = parse(userStorage.getItem(oldKey));
    if (value === undefined) continue;
    if (key === 'recurringSnoozeUntil') {
      if (typeof value === 'number' && value > Date.now()) raw[key] = value;
    } else if (key === 'onboardingDismissed') {
      if (value === true) raw[key] = true;
    } else {
      raw[key] = value;
    }
  }
  const hide = deviceItem(LEGACY_DEVICE_HIDE_TUITION);
  if (hide === '1') raw.hideTuition = true;
  const currency = deviceItem(LEGACY_DEVICE_CURRENCY);
  if (currency) raw.displayCurrency = currency;
  const out = normalizePatch(raw as SettingsPatch);
  // Empty lists and maps carry nothing worth migrating.
  for (const [k, v] of Object.entries(out)) {
    if ((Array.isArray(v) && v.length === 0) || (isObject(v) && Object.keys(v).length === 0)) delete (out as Record<string, unknown>)[k];
  }
  return out;
};

/** Key-sorted JSON, to compare values whose key order may differ. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (isObject(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

/** Combine a value this browser had with the server's, losing neither. */
const mergeLegacyValue = (key: Key, fromServer: unknown, local: unknown): unknown => {
  switch (key) {
    case 'savingsGoals':
    case 'investmentAccounts': {
      const s = Array.isArray(fromServer) ? (fromServer as { id: string }[]) : [];
      const ids = new Set(s.map((i) => i.id));
      return [...s, ...(local as { id: string }[]).filter((i) => !ids.has(i.id))];
    }
    case 'merchantMap':
    case 'pausedRecurring':
      return { ...(local as object), ...(isObject(fromServer) ? fromServer : {}) };
    case 'customCategories':
    case 'deletedSubcategories': {
      const merged: CategoryMap = { ...(isObject(fromServer) ? (fromServer as CategoryMap) : {}) };
      for (const [main, subs] of Object.entries(local as CategoryMap)) {
        merged[main] = Array.from(new Set([...(merged[main] ?? []), ...subs]));
      }
      return merged;
    }
    case 'recurringSnoozeUntil':
      return Math.max(Number(fromServer) || 0, Number(local) || 0);
    case 'onboardingDismissed':
      return fromServer === true || local === true;
    default: // displayCurrency, hideTuition: the server's choice, if it has one
      return fromServer ?? local;
  }
};

const migrateLegacy = () => {
  const keys = Object.keys(legacy) as Key[];
  if (!keys.length) {
    if (owner && userStorage.getItem(MIGRATED_KEY) !== '1') finishMigration();
    return;
  }
  for (const key of keys) {
    // Changed since it was loaded: that change was made on top of the local
    // value, so it stands as it is.
    if (pending[key] !== legacy[key]) continue;
    const merged = mergeLegacyValue(key, server[key], legacy[key]);
    if (stable(merged) === stable(server[key])) delete pending[key];
    else (pending as Record<string, unknown>)[key] = merged;
  }
  legacy = {};
  if (Object.keys(pending).length) finishMigrationAfterFlush = true;
  else finishMigration();
};

const finishMigration = () => {
  finishMigrationAfterFlush = false;
  userStorage.setItem(MIGRATED_KEY, '1');
  for (const oldKey of Object.keys(LEGACY_KEYS)) userStorage.removeItem(oldKey);
  try { localStorage.removeItem(LEGACY_DEVICE_HIDE_TUITION); } catch { /* ignore */ }
};

// --- syncing ----------------------------------------------------------------

let inFlight: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 5_000;
const MAX_RETRY_DELAY = 5 * 60_000;

const clearRetry = () => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = 5_000;
};

const scheduleFlush = (delay = 400) => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSettings();
  }, delay);
};

/** Drop `keys` from pending where they still hold what was sent. */
const settle = (sent: SettingsPatch, keys: Key[]) => {
  const rest: SettingsPatch = { ...pending };
  for (const k of keys) if (rest[k] === sent[k]) delete rest[k];
  pending = rest;
};

const KEY_LABELS: Partial<Record<Key, string>> = {
  savingsGoals: 'savings goals',
  investmentAccounts: 'accounts',
  customCategories: 'categories',
  deletedSubcategories: 'categories',
  merchantMap: 'category suggestions',
  pausedRecurring: 'paused recurring charges',
  displayCurrency: 'display currency',
};

const send = async (forUser: string, sent: SettingsPatch): Promise<'ok' | 'rejected' | 'failed'> => {
  const keys = Object.keys(sent) as Key[];
  try {
    const { settings } = await patchSettings(sent);
    if (owner !== forUser) return 'ok';
    server = settings ?? {};
    settle(sent, keys);
    return 'ok';
  } catch (error) {
    if (owner !== forUser) return 'ok';
    if (error instanceof ApiError && error.status === 400) {
      // Several keys at once: find the one the server refused, keep the rest.
      if (keys.length > 1) {
        let result: 'ok' | 'rejected' | 'failed' = 'ok';
        for (const k of keys) {
          const one = await send(forUser, { [k]: sent[k] } as SettingsPatch);
          if (one === 'failed') return 'failed';
          if (one === 'rejected') result = 'rejected';
        }
        return result;
      }
      // Retrying a refused value would fail forever: go back to the server's.
      console.error('Settings change refused by the server:', keys, error.message);
      notify.error(`Couldn't save your ${KEY_LABELS[keys[0]] ?? 'settings'}: ${error.message}`);
      settle(sent, keys);
      return 'rejected';
    }
    return 'failed';
  }
};

/** Send pending changes now. Safe to call any time; concurrent calls coalesce. */
export const flushSettings = async (): Promise<void> => {
  ensureOwner();
  if (!owner || !hydrated) return;
  if (inFlight) {
    await inFlight;
    if (Object.keys(pending).length) scheduleFlush(0);
    return;
  }
  const sent = pending;
  if (!Object.keys(sent).length) return;
  const forUser = owner;
  inFlight = (async () => {
    const result = await send(forUser, sent);
    if (owner !== forUser) return;
    if (result === 'failed') {
      // Offline, or the server is down: keep everything and try again later.
      if (!retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; void flushSettings(); }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      }
    } else {
      clearRetry();
      if (finishMigrationAfterFlush) finishMigration();
    }
    persist();
    recompute();
    notifyAll();
  })().finally(() => { inFlight = null; });
  await inFlight;
};

// --- public API ---------------------------------------------------------------

export const subscribeSettings = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The signed-in account's settings, local changes included. */
export const getSettings = (): UserSettings => {
  ensureOwner();
  return snapshot;
};

export const getSetting = <K extends Key>(key: K): UserSettings[K] => getSettings()[key];

/** Change settings: applied at once, saved to the server shortly after. Dropped when signed out. */
export const updateSettings = (patch: SettingsPatch): void => {
  ensureOwner();
  if (!owner) return;
  pending = { ...pending, ...normalizePatch(patch) };
  persist();
  recompute();
  notifyAll();
  if (hydrated) scheduleFlush();
};

/**
 * The server's copy arrived (/data/all). Merges in anything this browser still
 * held from before, then sends what's pending.
 *
 * `authoritative` (a backup restore or "delete all my data"): the server's copy
 * replaces local changes that weren't sent yet, instead of being overridden by them.
 */
export const hydrateSettings = (fromServer: UserSettings | undefined, { authoritative = false } = {}): void => {
  ensureOwner();
  if (!owner || !fromServer) return; // an older server without settings: keep local
  server = fromServer;
  hydrated = true;
  if (authoritative) {
    pending = {};
    legacy = {};
    finishMigration();
  } else {
    migrateLegacy();
  }
  persist();
  recompute();
  notifyAll();
  if (Object.keys(pending).length) void flushSettings();
};

const SETTINGS_KEYS: Key[] = [
  'displayCurrency', 'hideTuition', 'onboardingDismissed', 'recurringSnoozeUntil', 'customCategories',
  'deletedSubcategories', 'merchantMap', 'pausedRecurring', 'savingsGoals', 'investmentAccounts',
  'notifyBudgets', 'notifyBills', 'notifyMonthlySummary', 'timeZone',
];

/**
 * The settings a backup file restores. Backups since settings moved to the
 * server carry all of them (a key the file lacks was unset, so it's cleared);
 * older ones only have the display currency and categories, as `preferences`
 * with JSON-string values, and everything else is left as it is.
 */
export const settingsFromBackup = (file: unknown): SettingsPatch | undefined => {
  if (!isObject(file)) return undefined;
  if (isObject(file.settings)) {
    const saved = file.settings;
    return normalizePatch(Object.fromEntries(SETTINGS_KEYS.map((k) => [k, saved[k] ?? null])) as SettingsPatch);
  }
  const prefs = file.preferences;
  if (!isObject(prefs)) return undefined;
  const out: Record<string, unknown> = {};
  if (typeof prefs.displayCurrency === 'string') out.displayCurrency = prefs.displayCurrency;
  for (const k of ['customCategories', 'deletedSubcategories'] as const) {
    const value = typeof prefs[k] === 'string' ? parse(prefs[k] as string) : undefined;
    if (value !== undefined) out[k] = value;
  }
  const patch = normalizePatch(out as SettingsPatch);
  return Object.keys(patch).length ? patch : undefined;
};

onStorageUserChange(() => {
  ensureOwner();
  notifyAll();
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushSettings(); });
  // Leaving the page (tab switched or closed): send now instead of after the
  // short delay, so the change reaches other devices without coming back here.
  const sendNow = () => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
    void flushSettings();
  };
  window.addEventListener('pagehide', sendNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sendNow(); });
}

/** Test hook: forget everything held in memory. */
export const __resetSettingsStoreForTests = () => {
  owner = null;
  server = {};
  pending = {};
  snapshot = {};
  hydrated = false;
  legacy = {};
  finishMigrationAfterFlush = false;
  inFlight = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  clearRetry();
};
