import { describe, it, expect } from 'vitest';
import { parseSettingsPatch, settingsToClient } from '../../src/utils/settings';
import { ValidationError } from '../../src/utils/errors';

describe('parseSettingsPatch', () => {
  it('converts goal and account money to cents and back', () => {
    const data = parseSettingsPatch({
      savingsGoals: [{ id: 'g', name: 'Car', target: 0.1 + 0.2, saved: 19.99 }],
      investmentAccounts: [{ id: 'a', name: 'Loan', type: 'loan', value: -1234.56, asOf: '2026-11-01' }],
    });
    expect(data.savingsGoals).toEqual([{ id: 'g', name: 'Car', target: 30, saved: 1999 }]);
    expect(data.investmentAccounts?.[0].value).toBe(-123456);
    expect(settingsToClient(data as never)).toMatchObject({ savingsGoals: [{ target: 0.3, saved: 19.99 }], investmentAccounts: [{ value: -1234.56 }] });
  });

  it('null clears: scalars to null, lists and maps to empty', () => {
    expect(parseSettingsPatch({ displayCurrency: null, savingsGoals: null, merchantMap: null, recurringSnoozeUntil: null })).toEqual({
      displayCurrency: null,
      savingsGoals: [],
      merchantMap: {},
      recurringSnoozeUntil: null,
    });
  });

  it('keeps the first of two goals with the same id', () => {
    const data = parseSettingsPatch({ savingsGoals: [{ id: 'g', name: 'First', target: 1 }, { id: 'g', name: 'Second', target: 2 }] });
    expect(data.savingsGoals?.map((g) => g.name)).toEqual(['First']);
  });

  it('drops paused entries that are not true, and dedupes subcategories', () => {
    const data = parseSettingsPatch({ pausedRecurring: { a: true, b: false }, customCategories: { Food: ['Boba', 'Boba', 'Ramen'] } });
    expect(data.pausedRecurring).toEqual({ a: true });
    expect(data.customCategories).toEqual({ Food: ['Boba', 'Ramen'] });
  });

  it.each([
    [{ __proto__: null, theme: 'dark' }],
    [{ merchantMap: JSON.parse('{"__proto__": "Food"}') }],
    [{ customCategories: { constructor: ['x'] } }],
    [{ savingsGoals: [{ id: 'g', name: '<i></i>', target: 5 }] }],
    [{ recurringSnoozeUntil: '2027-01-01' }],
    [null],
  ])('refuses %j', (input) => {
    expect(() => parseSettingsPatch(input)).toThrow(ValidationError);
  });
});
