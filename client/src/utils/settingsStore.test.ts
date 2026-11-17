import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SettingsPatch, UserSettings } from '../types';

// The server, as far as the store can tell: patchSettings is the only call it makes.
const patchSettings = vi.fn<(patch: SettingsPatch) => Promise<{ settings: UserSettings }>>();
vi.mock('../services/api', async (importActual) => ({
  ...(await importActual<typeof import('../services/api')>()),
  patchSettings: (patch: SettingsPatch) => patchSettings(patch),
}));
vi.mock('./notifications', () => ({ notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const { ApiError } = await import('../services/api');
const { setStorageUser } = await import('./userStorage');
const store = await import('./settingsStore');

const ls: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => ls[k] ?? null,
  setItem: (k: string, v: string) => { ls[k] = v; },
  removeItem: (k: string) => { delete ls[k]; },
  clear: () => { for (const k of Object.keys(ls)) delete ls[k]; },
  key: () => null,
  length: 0,
};

/** A server that applies patches like the real one (each key replaced, null clears). */
let serverState: UserSettings = {};
const acceptingServer = () =>
  patchSettings.mockImplementation(async (patch) => {
    const next: Record<string, unknown> = { ...serverState };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    serverState = next as UserSettings;
    return { settings: serverState };
  });

const signIn = (email: string) => {
  setStorageUser(null);
  setStorageUser(email);
};
/** Simulate a page reload: memory is gone, localStorage stays. */
const reload = (email: string) => {
  store.__resetSettingsStoreForTests();
  setStorageUser(null);
  setStorageUser(email);
};

beforeEach(() => {
  for (const k of Object.keys(ls)) delete ls[k];
  serverState = {};
  patchSettings.mockReset();
  acceptingServer();
  store.__resetSettingsStoreForTests();
  setStorageUser(null);
});

describe('settings store', () => {
  it('applies a change at once and sends it once the server copy has loaded', async () => {
    signIn('a@test.com');
    store.hydrateSettings({});
    store.updateSettings({ hideTuition: true });
    expect(store.getSetting('hideTuition')).toBe(true);
    await store.flushSettings();
    expect(patchSettings).toHaveBeenCalledWith({ hideTuition: true });
    expect(serverState.hideTuition).toBe(true);
    // Nothing left to send.
    expect(ls['settingsPending::a@test.com']).toBeUndefined();
  });

  it('keeps a change made before the server copy loads, and sends it after', async () => {
    signIn('a@test.com');
    store.updateSettings({ displayCurrency: 'eur' });
    await store.flushSettings();
    expect(patchSettings).not.toHaveBeenCalled(); // not loaded yet: nothing would be overwritten blindly
    serverState = { hideTuition: true };
    store.hydrateSettings(serverState);
    await store.flushSettings();
    expect(patchSettings).toHaveBeenCalledWith({ displayCurrency: 'EUR' });
    expect(store.getSettings()).toEqual({ hideTuition: true, displayCurrency: 'EUR' });
  });

  it('keeps an offline change across a reload and sends it when the server is back', async () => {
    signIn('a@test.com');
    store.hydrateSettings({});
    patchSettings.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    store.updateSettings({ savingsGoals: [{ id: 'g1', name: 'Laptop', target: 1200, saved: 0 }] });
    await store.flushSettings();
    expect(serverState.savingsGoals).toBeUndefined();

    reload('a@test.com');
    expect(store.getSetting('savingsGoals')?.[0].name).toBe('Laptop'); // still shown
    store.hydrateSettings({});
    await store.flushSettings();
    expect(serverState.savingsGoals?.[0]).toMatchObject({ id: 'g1', name: 'Laptop', target: 1200 });
  });

  it('when the server refuses one setting, saves the others and drops only that one', async () => {
    signIn('a@test.com');
    store.hydrateSettings({ hideTuition: false });
    patchSettings.mockImplementation(async (patch) => {
      if ('displayCurrency' in patch) throw new ApiError('displayCurrency must be a 3-letter currency code', 400);
      serverState = { ...serverState, ...(patch as UserSettings) };
      return { settings: serverState };
    });
    store.updateSettings({ hideTuition: true, displayCurrency: 'USD' });
    await store.flushSettings();
    // One refused call with both keys, then one call per key.
    expect(patchSettings.mock.calls.map(([p]) => Object.keys(p).sort().join())).toEqual(['displayCurrency,hideTuition', 'hideTuition', 'displayCurrency']);
    expect(serverState.hideTuition).toBe(true);
    expect(store.getSetting('displayCurrency')).toBeUndefined();
    expect(ls['settingsPending::a@test.com']).toBeUndefined(); // not retried forever
  });

  it("doesn't show one account's settings to another on the same browser", async () => {
    signIn('a@test.com');
    store.hydrateSettings({});
    store.updateSettings({ savingsGoals: [{ id: 'g1', name: 'Private', target: 10, saved: 0 }] });
    signIn('b@test.com');
    expect(store.getSetting('savingsGoals')).toBeUndefined();
    store.updateSettings({ hideTuition: true });
    signIn('a@test.com');
    expect(store.getSetting('savingsGoals')?.[0].name).toBe('Private');
    expect(store.getSetting('hideTuition')).toBeUndefined();
  });

  it('drops changes when signed out', () => {
    store.updateSettings({ hideTuition: true });
    expect(store.getSettings()).toEqual({});
  });

  it('a restore replaces changes that were not sent yet', async () => {
    signIn('a@test.com');
    store.hydrateSettings({});
    patchSettings.mockRejectedValueOnce(new TypeError('offline'));
    store.updateSettings({ hideTuition: true });
    await store.flushSettings();
    store.hydrateSettings({ hideTuition: false, savingsGoals: [] }, { authoritative: true });
    expect(store.getSetting('hideTuition')).toBe(false);
    await store.flushSettings();
    expect(patchSettings).toHaveBeenCalledTimes(1); // the failed one only
  });
});

describe('moving the old localStorage data to the server', () => {
  const legacy = (email: string, values: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(values)) ls[`${k}::${email}`] = JSON.stringify(v);
  };

  it('shows the old values at once, merges them with the server copy, uploads, then removes them', async () => {
    legacy('a@test.com', {
      savingsGoalsV2: [{ id: 'local', name: 'Trip', target: 800, saved: 50 }, { id: 'both', name: 'Old name', target: 1, saved: 0 }],
      merchantCategoryMap: { 'trader joes': 'Groceries', 'shell': 'Fuel' },
      customCategories: { Food: ['Boba'] },
      onboardingDismissed: true,
      investmentAccounts: [],
    });
    ls.hideTuition = '1'; // was per device
    signIn('a@test.com');
    expect(store.getSetting('savingsGoals')?.map((g) => g.id)).toEqual(['local', 'both']);

    store.hydrateSettings({
      savingsGoals: [{ id: 'both', name: 'Server name', target: 5, saved: 0 }],
      merchantMap: { shell: 'Transportation' },
      customCategories: { Food: ['Ramen'] },
    });
    await store.flushSettings();

    // Nothing lost; where both had a value, the server's wins.
    expect(serverState.savingsGoals?.map((g) => [g.id, g.name])).toEqual([['both', 'Server name'], ['local', 'Trip']]);
    expect(serverState.merchantMap).toEqual({ 'trader joes': 'Groceries', shell: 'Transportation' });
    expect(serverState.customCategories).toEqual({ Food: ['Ramen', 'Boba'] });
    expect(serverState.onboardingDismissed).toBe(true);
    expect(serverState.hideTuition).toBe(true);
    expect(serverState.investmentAccounts).toBeUndefined(); // empty: nothing to move

    expect(ls['savingsGoalsV2::a@test.com']).toBeUndefined();
    expect(ls.hideTuition).toBeUndefined();
    expect(ls['settingsMigrated::a@test.com']).toBe('1');
  });

  it('keeps the old values until the upload succeeds', async () => {
    legacy('a@test.com', { savingsGoalsV2: [{ id: 'g', name: 'Car', target: 9000, saved: 0 }] });
    signIn('a@test.com');
    patchSettings.mockRejectedValueOnce(new TypeError('offline'));
    store.hydrateSettings({});
    await store.flushSettings();
    expect(ls['savingsGoalsV2::a@test.com']).toBeDefined();
    expect(ls['settingsMigrated::a@test.com']).toBeUndefined();

    reload('a@test.com');
    store.hydrateSettings({});
    await store.flushSettings();
    expect(serverState.savingsGoals?.[0].name).toBe('Car');
    expect(ls['savingsGoalsV2::a@test.com']).toBeUndefined();
  });

  it('sends nothing when the server already has the same values', async () => {
    legacy('a@test.com', { merchantCategoryMap: { shell: 'Fuel' } });
    signIn('a@test.com');
    store.hydrateSettings({ merchantMap: { shell: 'Fuel' } });
    await store.flushSettings();
    expect(patchSettings).not.toHaveBeenCalled();
    expect(ls['settingsMigrated::a@test.com']).toBe('1');
  });

  it('cleans up values the server would refuse instead of losing the whole upload', async () => {
    legacy('a@test.com', {
      savingsGoalsV2: [
        { id: 'ok', name: 'x'.repeat(300), target: 10, saved: 0 },
        { id: 'bad', name: 'No target' },
        { id: 'zero', name: 'Zero', target: 0, saved: 0 },
      ],
    });
    signIn('a@test.com');
    store.hydrateSettings({});
    await store.flushSettings();
    expect(serverState.savingsGoals).toHaveLength(1);
    expect(serverState.savingsGoals?.[0].name).toHaveLength(100);
  });
});

describe('backups', () => {
  it('a current backup restores every setting, clearing the ones it lacks', () => {
    const patch = store.settingsFromBackup({ settings: { hideTuition: true, savingsGoals: [{ id: 'g', name: 'Car', target: 5, saved: 1 }] } });
    expect(patch).toMatchObject({ hideTuition: true, displayCurrency: null, investmentAccounts: null });
    expect(patch?.savingsGoals).toHaveLength(1);
  });

  it('an older backup restores its currency and categories and leaves the rest', () => {
    const patch = store.settingsFromBackup({
      preferences: { displayCurrency: 'INR', customCategories: JSON.stringify({ Food: ['Boba'] }), deletedSubcategories: null },
    });
    expect(patch).toEqual({ displayCurrency: 'INR', customCategories: { Food: ['Boba'] } });
  });

  it('a file without settings changes none', () => {
    expect(store.settingsFromBackup({ data: {} })).toBeUndefined();
  });
});

describe('normalizePatch', () => {
  it('keeps the merchant map to the newest entries and lower-cases keys', () => {
    const big = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`Shop ${i}`, 'Food']));
    const out = store.normalizePatch({ merchantMap: big }).merchantMap!;
    expect(Object.keys(out)).toHaveLength(500);
    expect(out['shop 599']).toBe('Food');
    expect(out['shop 0']).toBeUndefined();
  });

  it('refuses keys that would pollute object prototypes', () => {
    const out = store.normalizePatch({ pausedRecurring: JSON.parse('{"__proto__": true, "Rent|Housing|1500": true}') });
    expect(Object.keys(out.pausedRecurring!)).toEqual(['Rent|Housing|1500']);
  });
});
