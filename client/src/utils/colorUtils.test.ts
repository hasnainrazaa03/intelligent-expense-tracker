import { describe, it, expect } from 'vitest';
import { getMainCategory, getCategoryColor } from './colorUtils';
import { CATEGORY_COLORS } from '../constants';

describe('getMainCategory', () => {
  it('passes a MAIN category straight through (regression: everything used to collapse to Miscellaneous)', () => {
    // Expenses are often stored as a main category ("Housing", "Food"), not a
    // subcategory — the old `SUBCATEGORY_TO_CATEGORY_MAP[x] || 'Miscellaneous'`
    // missed these and bucketed them all under Miscellaneous.
    expect(getMainCategory('Housing')).toBe('Housing');
    expect(getMainCategory('Food')).toBe('Food');
    expect(getMainCategory('Education')).toBe('Education');
    expect(getMainCategory('Miscellaneous')).toBe('Miscellaneous');
  });

  it('maps a subcategory to its parent main category', () => {
    expect(getMainCategory('Rent')).toBe('Housing');
    expect(getMainCategory('Groceries')).toBe('Food');
    expect(getMainCategory('Tuition')).toBe('Education');
    expect(getMainCategory('Rideshare')).toBe('Transportation');
  });

  it('falls back to Miscellaneous for unknown/empty values', () => {
    expect(getMainCategory('Totally Unknown Category')).toBe('Miscellaneous');
    expect(getMainCategory('')).toBe('Miscellaneous');
  });
});

describe('getCategoryColor', () => {
  it('returns the main category color directly', () => {
    expect(getCategoryColor('Housing')).toBe(CATEGORY_COLORS['Housing']);
    expect(getCategoryColor('Food')).toBe(CATEGORY_COLORS['Food']);
  });

  it('returns the parent main color for a subcategory', () => {
    expect(getCategoryColor('Groceries')).toBe(CATEGORY_COLORS['Food']);
    expect(getCategoryColor('Rent')).toBe(CATEGORY_COLORS['Housing']);
  });

  it('falls back to the Miscellaneous color for unknown values', () => {
    expect(getCategoryColor('Totally Unknown Category')).toBe(CATEGORY_COLORS['Miscellaneous']);
  });
});
