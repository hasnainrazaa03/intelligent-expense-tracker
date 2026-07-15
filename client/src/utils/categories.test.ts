import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEffectiveCategories,
  getEffectiveSubToMain,
  saveCategories,
  invalidateCategoriesCache,
} from './categories';
import { getMainCategory } from './colorUtils';

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
  invalidateCategoriesCache();
});

describe('categories store', () => {
  it('returns built-in defaults when there is no custom data', () => {
    expect(getEffectiveCategories()['Food']).toContain('Groceries');
  });

  it('merges a custom subcategory and maps it to its main category', () => {
    const cats = getEffectiveCategories();
    saveCategories({ ...cats, Personal: [...cats['Personal'], 'Streaming'] });

    expect(getEffectiveCategories()['Personal']).toContain('Streaming');
    expect(getEffectiveSubToMain()['Streaming']).toBe('Personal');
    // The color/grouping path resolves the custom sub to its real main, not
    // "Miscellaneous" (the CMP-M24 bug).
    expect(getMainCategory('Streaming')).toBe('Personal');
  });

  it('persists a deletion of a default subcategory', () => {
    const cats = getEffectiveCategories();
    saveCategories({ ...cats, Food: cats['Food'].filter((s) => s !== 'Groceries') });
    expect(getEffectiveCategories()['Food']).not.toContain('Groceries');
  });
});
