import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzySearch';

describe('fuzzyMatch', () => {
  it('returns true for direct substring matches', () => {
    expect(fuzzyMatch('rent', 'Monthly Rent Payment')).toBe(true);
  });

  it('returns true for small typo edits within threshold', () => {
    expect(fuzzyMatch('groceri', 'Groceries', 2)).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(fuzzyMatch('tuition', 'Ride Share')).toBe(false);
  });

  it('matches a multi-word query with a typo per token', () => {
    // Regression: previously the whole "coffe beans" was compared to single
    // words and never matched.
    expect(fuzzyMatch('coffe beans', 'Coffee Beans', 2)).toBe(true);
  });

  it('requires every query token to match', () => {
    expect(fuzzyMatch('coffee tuition', 'Coffee Beans', 2)).toBe(false);
  });

  it('still matches an exact multi-word phrase', () => {
    expect(fuzzyMatch('rent payment', 'Monthly Rent Payment')).toBe(true);
  });
});
