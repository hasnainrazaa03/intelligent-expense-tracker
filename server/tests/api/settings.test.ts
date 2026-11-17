import { it, expect } from 'vitest';
import { describeApi, signedInClient, newClient } from '../helpers';
import { prisma } from '../../src/db';

const goal = { id: 'g1', name: 'Laptop', target: 1200.5, saved: 100.1, deadline: '2027-05-01' };
const account = { id: 'a1', name: 'Student loan', type: 'loan', value: -4000.25, asOf: '2026-11-01' };

describeApi('account settings (5b)', () => {
  it('starts empty, saves what a PATCH names, and keeps money in cents', async () => {
    const { client, user } = await signedInClient();
    expect((await client.get('/api/settings')).body).toEqual({ settings: {} });

    const res = await client.patch('/api/settings', { savingsGoals: [goal], investmentAccounts: [account], displayCurrency: 'eur' });
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({ savingsGoals: [goal], investmentAccounts: [account], displayCurrency: 'EUR' });

    const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    expect(row?.savingsGoals).toEqual([{ ...goal, target: 120050, saved: 10010 }]);
    expect(row?.investmentAccounts).toEqual([{ ...account, value: -400025 }]);
  });

  it('two devices changing different settings keep both changes', async () => {
    const { client } = await signedInClient();
    await client.patch('/api/settings', { savingsGoals: [goal] });
    await client.patch('/api/settings', { hideTuition: true });
    const { settings } = (await client.get('/api/settings')).body;
    expect(settings).toEqual({ savingsGoals: [goal], hideTuition: true });
  });

  it('null clears a setting', async () => {
    const { client } = await signedInClient();
    await client.patch('/api/settings', { savingsGoals: [goal], displayCurrency: 'INR', hideTuition: true });
    const { settings } = (await client.patch('/api/settings', { savingsGoals: null, displayCurrency: null })).body;
    expect(settings).toEqual({ savingsGoals: [], hideTuition: true });
  });

  it('refuses bad values and unknown keys, and writes nothing', async () => {
    const { client, user } = await signedInClient();
    const bad = [
      { theme: 'dark' },
      { savingsGoals: [{ ...goal, target: 0 }] },
      { savingsGoals: [{ ...goal, deadline: 'soon' }] },
      { investmentAccounts: [{ ...account, type: 'house' }] },
      { investmentAccounts: [{ ...account, value: 50_000_000 }] },
      { displayCurrency: 'euros' },
      { hideTuition: 'yes' },
      { recurringSnoozeUntil: Date.now() + 5 * 365 * 86_400_000 },
      { customCategories: { Food: 'Boba' } },
      { savingsGoals: Array.from({ length: 101 }, (_, i) => ({ ...goal, id: `g${i}` })) },
      [goal],
    ];
    for (const body of bad) {
      const res = await client.patch('/api/settings', body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(await prisma.userSettings.count({ where: { userId: user.id } })).toBe(0);
  });

  it('strips markup from names, and keeps only the newest 500 merchant choices', async () => {
    const { client } = await signedInClient();
    const merchants = Object.fromEntries(Array.from({ length: 520 }, (_, i) => [`Shop ${i}`, 'Groceries']));
    const { settings } = (await client.patch('/api/settings', { savingsGoals: [{ ...goal, name: '<b>Laptop</b>' }], merchantMap: merchants })).body;
    expect(settings.savingsGoals[0].name).toBe('Laptop');
    expect(Object.keys(settings.merchantMap)).toHaveLength(500);
    expect(settings.merchantMap['shop 519']).toBe('Groceries');
    expect(settings.merchantMap['shop 0']).toBeUndefined();
  });

  it("is per account: nobody reads or changes another user's settings", async () => {
    const a = await signedInClient();
    const b = await signedInClient();
    await a.client.patch('/api/settings', { savingsGoals: [goal] });
    expect((await b.client.get('/api/settings')).body.settings).toEqual({});
    await b.client.patch('/api/settings', { savingsGoals: [] });
    expect((await a.client.get('/api/settings')).body.settings.savingsGoals).toEqual([goal]);
  });

  it('needs a session and the CSRF token', async () => {
    const anon = newClient();
    await anon.csrf();
    expect((await anon.get('/api/settings')).status).toBe(401);
    expect((await anon.patch('/api/settings', { hideTuition: true })).status).toBe(401);

    const { client } = await signedInClient();
    const noCsrf = await client.patch('/api/settings', { hideTuition: true }).set('x-csrf-token', '');
    expect(noCsrf.status).toBe(403);
  });

  it('comes with the rest of the data in /data/all', async () => {
    const { client } = await signedInClient();
    await client.patch('/api/settings', { savingsGoals: [goal] });
    expect((await client.get('/api/data/all')).body.settings).toEqual({ savingsGoals: [goal] });
  });

  it('a backup restore brings settings back; an older backup without them leaves them alone', async () => {
    const { client } = await signedInClient();
    await client.patch('/api/settings', { savingsGoals: [goal], hideTuition: true });
    const empty = { expenses: [], incomes: [], budgets: [], semesters: [] };

    const old = await client.post('/api/data/restore', empty);
    expect(old.status).toBe(200);
    expect(old.body.settings).toEqual({ savingsGoals: [goal], hideTuition: true });

    const restored = await client.post('/api/data/restore', { ...empty, settings: { savingsGoals: null, investmentAccounts: [account], hideTuition: false } });
    expect(restored.status).toBe(200);
    expect(restored.body.settings).toEqual({ savingsGoals: [], investmentAccounts: [account], hideTuition: false });

    const bad = await client.post('/api/data/restore', { ...empty, settings: { savingsGoals: 'lots' } });
    expect(bad.status).toBe(400);
    expect((await client.get('/api/settings')).body.settings.investmentAccounts).toEqual([account]);
  });

  it('"Delete all my data" removes goals, balances and paused charges, and keeps preferences', async () => {
    const { client } = await signedInClient();
    await client.patch('/api/settings', {
      savingsGoals: [goal],
      investmentAccounts: [account],
      pausedRecurring: { 'Rent|Housing|1500': true },
      recurringSnoozeUntil: Date.now() + 60_000,
      displayCurrency: 'EUR',
      customCategories: { Food: ['Boba'] },
    });
    const res = await client.post('/api/data/wipe', { confirm: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({
      savingsGoals: [],
      investmentAccounts: [],
      pausedRecurring: {},
      displayCurrency: 'EUR',
      customCategories: { Food: ['Boba'] },
    });
  });
});
