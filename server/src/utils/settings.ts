// Per-account settings (UserSettings): validation of client patches and the
// DB → client shape. Each key is replaced as a whole; `null` clears it.
//
// Money inside savingsGoals / investmentAccounts is stored as integer cents,
// like every other amount, and returned in dollars.
import { ValidationError } from './errors';
import { sanitizeText } from './sanitize';
import { parseAmount, MAX_AMOUNT } from './math';
import { toCents, toDollars } from './money';
import { normalizeCurrencyCode } from './normalize';

export const SETTINGS_LIMITS = {
  categoryMains: 50,
  subcategoriesPerMain: 100,
  categoryNameLength: 60,
  /** The merchant map grows with every categorised expense: keep the newest. */
  merchantEntries: 500,
  merchantKeyLength: 80,
  pausedEntries: 500,
  pausedKeyLength: 700, // "title|category|amount", and titles run to 500
  goals: 100,
  accounts: 100,
  nameLength: 100,
  idLength: 64,
  /** A snooze longer than this is a bug, not a choice. */
  maxSnoozeMs: 366 * 24 * 60 * 60 * 1000,
};

export const ACCOUNT_TYPES = ['cash', 'brokerage', 'crypto', 'retirement', 'loan', 'other'] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

export type CategoryMap = Record<string, string[]>;
// Type aliases, not interfaces: Prisma's JSON input type needs an index signature.
export type StoredGoal = { id: string; name: string; target: number; saved: number; deadline?: string };
export type StoredAccount = { id: string; name: string; type: AccountType; value: number; asOf: string };

/** What a patch writes (only the keys it names). */
export interface SettingsData {
  displayCurrency?: string | null;
  hideTuition?: boolean | null;
  onboardingDismissed?: boolean | null;
  recurringSnoozeUntil?: Date | null;
  notifyBudgets?: boolean | null;
  notifyBills?: boolean | null;
  notifyMonthlySummary?: boolean | null;
  notifyByEmail?: boolean | null;
  timeZone?: string | null;
  customCategories?: CategoryMap;
  deletedSubcategories?: CategoryMap;
  merchantMap?: Record<string, string>;
  pausedRecurring?: Record<string, true>;
  savingsGoals?: StoredGoal[];
  investmentAccounts?: StoredAccount[];
}

export const SETTINGS_KEYS = [
  'displayCurrency',
  'hideTuition',
  'onboardingDismissed',
  'recurringSnoozeUntil',
  'notifyBudgets',
  'notifyBills',
  'notifyMonthlySummary',
  'notifyByEmail',
  'timeZone',
  'customCategories',
  'deletedSubcategories',
  'merchantMap',
  'pausedRecurring',
  'savingsGoals',
  'investmentAccounts',
] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];

/** Financial data that "Delete all my data" removes; the rest are preferences. */
export const WIPED_SETTINGS: SettingsData = {
  savingsGoals: [],
  investmentAccounts: [],
  pausedRecurring: {},
  recurringSnoozeUntil: null,
};

// --- validators -------------------------------------------------------------

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const text = (v: unknown, max: number, where: string): string => {
  const s = sanitizeText(v);
  if (!s) throw new ValidationError(`${where} is missing`);
  if (s.length > max) throw new ValidationError(`${where} is too long (max ${max} characters)`);
  return s;
};

const mapKey = (raw: string, max: number, where: string): string => {
  const key = text(raw, max, where);
  if (FORBIDDEN_KEYS.has(key)) throw new ValidationError(`${where} is not allowed`);
  return key;
};

const calendarDate = (v: unknown, where: string): string => {
  if (typeof v !== 'string' || !YMD.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) {
    throw new ValidationError(`${where} must be a date (YYYY-MM-DD)`);
  }
  return v;
};

const money = (v: unknown, where: string, { min }: { min: number }): number => {
  const n = parseAmount(v, MAX_AMOUNT);
  if (n === null || n < min) throw new ValidationError(`${where} is not a valid amount`);
  return toCents(n);
};

const categoryMap = (v: unknown, where: string): CategoryMap => {
  if (!isPlainObject(v)) throw new ValidationError(`${where} must be an object`);
  const entries = Object.entries(v);
  if (entries.length > SETTINGS_LIMITS.categoryMains) throw new ValidationError(`${where} has too many categories`);
  const out: [string, string[]][] = [];
  for (const [rawMain, subs] of entries) {
    const main = mapKey(rawMain, SETTINGS_LIMITS.categoryNameLength, `${where} category name`);
    if (!Array.isArray(subs)) throw new ValidationError(`${where}.${main} must be a list`);
    if (subs.length > SETTINGS_LIMITS.subcategoriesPerMain) throw new ValidationError(`${where}.${main} has too many subcategories`);
    const names = Array.from(new Set(subs.map((s) => text(s, SETTINGS_LIMITS.categoryNameLength, `${where}.${main} subcategory`))));
    if (names.length) out.push([main, names]);
  }
  return Object.fromEntries(out);
};

const merchantMap = (v: unknown): Record<string, string> => {
  if (!isPlainObject(v)) throw new ValidationError('merchantMap must be an object');
  // Newest last (insertion order), so trimming keeps the most recent choices.
  const entries = Object.entries(v).slice(-SETTINGS_LIMITS.merchantEntries);
  return Object.fromEntries(
    entries.map(([k, category]) => [
      mapKey(k, SETTINGS_LIMITS.merchantKeyLength, 'merchantMap key').toLowerCase(),
      text(category, SETTINGS_LIMITS.categoryNameLength, 'merchantMap category'),
    ])
  );
};

const pausedRecurring = (v: unknown): Record<string, true> => {
  if (!isPlainObject(v)) throw new ValidationError('pausedRecurring must be an object');
  const entries = Object.entries(v).filter(([, paused]) => paused === true);
  if (entries.length > SETTINGS_LIMITS.pausedEntries) throw new ValidationError('pausedRecurring has too many entries');
  return Object.fromEntries(entries.map(([k]) => [mapKey(k, SETTINGS_LIMITS.pausedKeyLength, 'pausedRecurring key'), true as const]));
};

const list = <T>(v: unknown, max: number, where: string, item: (raw: Record<string, unknown>, at: string) => T & { id: string }): T[] => {
  if (!Array.isArray(v)) throw new ValidationError(`${where} must be a list`);
  if (v.length > max) throw new ValidationError(`${where} has too many entries (max ${max})`);
  const seen = new Set<string>();
  const out: T[] = [];
  v.forEach((raw, i) => {
    if (!isPlainObject(raw)) throw new ValidationError(`${where}[${i}] must be an object`);
    const parsed = item(raw, `${where}[${i}]`);
    if (seen.has(parsed.id)) return; // a duplicate id: keep the first
    seen.add(parsed.id);
    out.push(parsed);
  });
  return out;
};

const savingsGoals = (v: unknown): StoredGoal[] =>
  list(v, SETTINGS_LIMITS.goals, 'savingsGoals', (g, at) => ({
    id: text(g.id, SETTINGS_LIMITS.idLength, `${at}.id`),
    name: text(g.name, SETTINGS_LIMITS.nameLength, `${at}.name`),
    target: money(g.target, `${at}.target`, { min: 0.01 }),
    saved: money(g.saved ?? 0, `${at}.saved`, { min: 0 }),
    ...(g.deadline ? { deadline: calendarDate(g.deadline, `${at}.deadline`) } : {}),
  }));

const investmentAccounts = (v: unknown): StoredAccount[] =>
  list(v, SETTINGS_LIMITS.accounts, 'investmentAccounts', (a, at) => {
    if (!ACCOUNT_TYPES.includes(a.type as AccountType)) throw new ValidationError(`${at}.type is not a known account type`);
    return {
      id: text(a.id, SETTINGS_LIMITS.idLength, `${at}.id`),
      name: text(a.name, SETTINGS_LIMITS.nameLength, `${at}.name`),
      type: a.type as AccountType,
      value: money(a.value, `${at}.value`, { min: -MAX_AMOUNT }),
      asOf: calendarDate(a.asOf, `${at}.asOf`),
    };
  });

/** A time zone the runtime knows (IANA name). */
export const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const bool = (v: unknown, key: string): boolean => {
  if (typeof v !== 'boolean') throw new ValidationError(`${key} must be true or false`);
  return v;
};

/**
 * Validate a PATCH body. Only the keys present are returned (and written).
 * `null` clears a key: scalars become null, lists and maps become empty.
 * Throws ValidationError (→ 400) on unknown keys or bad values.
 */
export const parseSettingsPatch = (input: unknown, now = Date.now()): SettingsData => {
  if (!isPlainObject(input)) throw new ValidationError('Settings must be an object');
  const data: SettingsData = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(SETTINGS_KEYS as readonly string[]).includes(key)) throw new ValidationError(`Unknown setting: ${key.slice(0, 40)}`);
    const k = key as SettingsKey;
    const clear = value === null;
    switch (k) {
      case 'displayCurrency': {
        if (clear) { data.displayCurrency = null; break; }
        const code = normalizeCurrencyCode(value);
        if (!code) throw new ValidationError('displayCurrency must be a 3-letter currency code');
        data.displayCurrency = code;
        break;
      }
      case 'hideTuition':
      case 'onboardingDismissed':
      case 'notifyBudgets':
      case 'notifyBills':
      case 'notifyMonthlySummary':
      case 'notifyByEmail':
        data[k] = clear ? null : bool(value, k);
        break;
      case 'timeZone': {
        if (clear) { data.timeZone = null; break; }
        if (typeof value !== 'string' || value.length > 64 || !isTimeZone(value)) {
          throw new ValidationError('timeZone must be an IANA time zone, e.g. America/Los_Angeles');
        }
        data.timeZone = value;
        break;
      }
      case 'recurringSnoozeUntil': {
        if (clear) { data.recurringSnoozeUntil = null; break; }
        const ms = typeof value === 'number' ? value : Number.NaN;
        if (!Number.isFinite(ms) || ms < 0 || ms > now + SETTINGS_LIMITS.maxSnoozeMs) {
          throw new ValidationError('recurringSnoozeUntil must be a time within the next year');
        }
        data.recurringSnoozeUntil = new Date(ms);
        break;
      }
      case 'customCategories':
      case 'deletedSubcategories':
        data[k] = clear ? {} : categoryMap(value, k);
        break;
      case 'merchantMap':
        data.merchantMap = clear ? {} : merchantMap(value);
        break;
      case 'pausedRecurring':
        data.pausedRecurring = clear ? {} : pausedRecurring(value);
        break;
      case 'savingsGoals':
        data.savingsGoals = clear ? [] : savingsGoals(value);
        break;
      case 'investmentAccounts':
        data.investmentAccounts = clear ? [] : investmentAccounts(value);
        break;
    }
  }
  return data;
};

// --- DB → client ------------------------------------------------------------

export interface ClientSettings {
  displayCurrency?: string;
  hideTuition?: boolean;
  onboardingDismissed?: boolean;
  recurringSnoozeUntil?: number;
  notifyBudgets?: boolean;
  notifyBills?: boolean;
  notifyMonthlySummary?: boolean;
  notifyByEmail?: boolean;
  timeZone?: string;
  customCategories?: CategoryMap;
  deletedSubcategories?: CategoryMap;
  merchantMap?: Record<string, string>;
  pausedRecurring?: Record<string, true>;
  savingsGoals?: StoredGoal[];
  investmentAccounts?: StoredAccount[];
}

type SettingsRow = {
  displayCurrency?: string | null;
  hideTuition?: boolean | null;
  onboardingDismissed?: boolean | null;
  recurringSnoozeUntil?: Date | null;
  notifyBudgets?: boolean | null;
  notifyBills?: boolean | null;
  notifyMonthlySummary?: boolean | null;
  notifyByEmail?: boolean | null;
  timeZone?: string | null;
  customCategories?: unknown;
  deletedSubcategories?: unknown;
  merchantMap?: unknown;
  pausedRecurring?: unknown;
  savingsGoals?: unknown;
  investmentAccounts?: unknown;
} | null;

/** The stored settings in client form (dollars, epoch ms). Unset keys are left out. */
export const settingsToClient = (row: SettingsRow): ClientSettings => {
  if (!row) return {};
  const out: ClientSettings = {};
  if (typeof row.displayCurrency === 'string') out.displayCurrency = row.displayCurrency;
  if (typeof row.hideTuition === 'boolean') out.hideTuition = row.hideTuition;
  if (typeof row.onboardingDismissed === 'boolean') out.onboardingDismissed = row.onboardingDismissed;
  for (const k of ['notifyBudgets', 'notifyBills', 'notifyMonthlySummary', 'notifyByEmail'] as const) {
    if (typeof row[k] === 'boolean') out[k] = row[k] as boolean;
  }
  if (typeof row.timeZone === 'string') out.timeZone = row.timeZone;
  if (row.recurringSnoozeUntil instanceof Date) out.recurringSnoozeUntil = row.recurringSnoozeUntil.getTime();
  if (isPlainObject(row.customCategories)) out.customCategories = row.customCategories as CategoryMap;
  if (isPlainObject(row.deletedSubcategories)) out.deletedSubcategories = row.deletedSubcategories as CategoryMap;
  if (isPlainObject(row.merchantMap)) out.merchantMap = row.merchantMap as Record<string, string>;
  if (isPlainObject(row.pausedRecurring)) out.pausedRecurring = row.pausedRecurring as Record<string, true>;
  if (Array.isArray(row.savingsGoals)) {
    out.savingsGoals = (row.savingsGoals as StoredGoal[]).map((g) => ({ ...g, target: toDollars(g.target), saved: toDollars(g.saved) }));
  }
  if (Array.isArray(row.investmentAccounts)) {
    out.investmentAccounts = (row.investmentAccounts as StoredAccount[]).map((a) => ({ ...a, value: toDollars(a.value) }));
  }
  return out;
};
