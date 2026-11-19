import { describe, expect, it } from 'vitest';
import { parseAppPath, pathFor, PATHS, type AppRoute } from './routes';

describe('parseAppPath', () => {
  it('reads every screen', () => {
    expect(parseAppPath('/app')).toEqual({ place: 'home' });
    expect(parseAppPath('/app/transactions')).toEqual({ place: 'transactions', type: 'expenses' });
    expect(parseAppPath('/app/transactions/income')).toEqual({ place: 'transactions', type: 'income' });
    expect(parseAppPath('/app/budgets')).toEqual({ place: 'budgets' });
    expect(parseAppPath('/app/insights/breakdown')).toEqual({ place: 'insights', section: 'breakdown' });
    expect(parseAppPath('/app/insights/ask')).toEqual({ place: 'insights', section: 'ask' });
    expect(parseAppPath('/app/tuition')).toEqual({ place: 'tuition' });
    expect(parseAppPath('/app/settings')).toEqual({ place: 'settings' });
  });

  it('opens Reports for /app/insights and ignores a trailing slash', () => {
    expect(parseAppPath('/app/insights')).toEqual({ place: 'insights', section: 'reports' });
    expect(parseAppPath('/app/budgets/')).toEqual({ place: 'budgets' });
    expect(parseAppPath('/app/')).toEqual({ place: 'home' });
  });

  it('refuses addresses the app does not have', () => {
    for (const p of ['/', '/login', '/app/pivot', '/app/insights/pivot', '/app/budgets/2026', '/app/transactions/refunds', '/app/insights/reports/x']) {
      expect(parseAppPath(p), p).toBeNull();
    }
  });

  it('round-trips with pathFor', () => {
    const routes: AppRoute[] = [
      { place: 'home' }, { place: 'transactions', type: 'expenses' }, { place: 'transactions', type: 'income' },
      { place: 'budgets' }, { place: 'insights', section: 'reports' }, { place: 'insights', section: 'income' },
      { place: 'tuition' }, { place: 'settings' },
    ];
    for (const r of routes) expect(parseAppPath(pathFor(r))).toEqual(r);
    expect(PATHS.insights()).toBe('/app/insights/reports');
  });
});
