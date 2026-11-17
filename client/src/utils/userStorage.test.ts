import { describe, it, expect, beforeEach } from 'vitest';
import { userStorage, setStorageUser } from './userStorage';
import { getEffectiveCategories, saveCategories } from './categories';

const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: () => null,
    length: 0,
  };
  setStorageUser(null);
});

describe('userStorage', () => {
  it("keeps one account's data away from the next account on the same device", () => {
    setStorageUser('alice@test.com');
    userStorage.setItem('savingsGoalsV2', '[{"name":"Laptop"}]');
    setStorageUser('bob@test.com');
    expect(userStorage.getItem('savingsGoalsV2')).toBeNull();
    setStorageUser('alice@test.com');
    expect(userStorage.getItem('savingsGoalsV2')).toBe('[{"name":"Laptop"}]');
  });

  it('reads nothing and writes nothing while signed out', () => {
    userStorage.setItem('savingsGoalsV2', 'x');
    expect(userStorage.getItem('savingsGoalsV2')).toBeNull();
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('gives pre-existing (unscoped) data to the first account only', () => {
    store['investmentAccounts'] = '[{"name":"Brokerage"}]';
    setStorageUser('owner@test.com');
    expect(userStorage.getItem('investmentAccounts')).toBe('[{"name":"Brokerage"}]');
    expect(store['investmentAccounts']).toBeUndefined();
    setStorageUser('guest@test.com');
    expect(userStorage.getItem('investmentAccounts')).toBeNull();
  });

  it('rebuilds category lookups when the account changes', () => {
    setStorageUser('alice@test.com');
    const base = getEffectiveCategories();
    saveCategories({ ...base, Food: [...base.Food, 'Boba'] });
    expect(getEffectiveCategories().Food).toContain('Boba');
    setStorageUser('bob@test.com');
    expect(getEffectiveCategories().Food).not.toContain('Boba');
  });
});
