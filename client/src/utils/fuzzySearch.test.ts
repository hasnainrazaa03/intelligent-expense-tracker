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
});
