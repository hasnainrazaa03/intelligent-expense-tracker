import { it, expect } from 'vitest';
import { describeApi, signedInClient } from '../helpers';
import { prisma } from '../../src/db';

const base = { title: 'Groceries run', amount: 12.34, category: 'Groceries', date: '2026-11-10' };

describeApi('expenses', () => {
  it('stores integer cents, returns dollars, and keeps line breaks in notes', async () => {
    const { client } = await signedInClient();
    const res = await client.post('/api/expenses', { ...base, notes: 'Split with\r\nroommates' });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(12.34);

    const row = await prisma.expense.findUnique({ where: { id: res.body.id } });
    expect(row?.amount).toBe(1234);

    const all = await client.get('/api/data/all');
    const saved = all.body.expenses.find((e: { id: string }) => e.id === res.body.id);
    expect(saved).toMatchObject({ amount: 12.34, notes: 'Split with\nroommates' });
  });

  it("one user can't change or delete another user's expense", async () => {
    const a = await signedInClient();
    const b = await signedInClient();
    const created = (await a.client.post('/api/expenses', base)).body;

    expect((await b.client.put(`/api/expenses/${created.id}`, { ...base, title: 'Hijacked' })).status).toBe(404);
    expect((await b.client.delete(`/api/expenses/${created.id}`)).status).toBe(404);
    const bAll = await b.client.get('/api/data/all');
    expect(bAll.body.expenses).toHaveLength(0);

    const still = await prisma.expense.findUnique({ where: { id: created.id } });
    expect(still?.title).toBe('Groceries run');
  });

  it('rejects zero, negative, oversized and non-numeric amounts, and invalid dates', async () => {
    const { client } = await signedInClient();
    for (const amount of [0, -5, 10_000_001, 'abc']) {
      expect((await client.post('/api/expenses', { ...base, amount })).status, `amount ${amount}`).toBe(400);
    }
    expect((await client.post('/api/expenses', { ...base, date: 'not a date' })).status).toBe(400);
  });

  it('an offline replay with the same clientRequestId is created only once', async () => {
    const { client, user } = await signedInClient();
    const body = { ...base, clientRequestId: `offline-${Date.now()}` };
    const [first, second] = await Promise.all([client.post('/api/expenses', body), client.post('/api/expenses', body)]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect(await prisma.expense.count({ where: { userId: user.id } })).toBe(1);
  });

  it('bulk import saves every valid row, and names the row that is invalid', async () => {
    const { client, user } = await signedInClient();
    const ok = await client.post('/api/expenses/bulk', [base, { ...base, title: 'Second', amount: 3 }]);
    expect(ok.status).toBe(201);
    expect(await prisma.expense.count({ where: { userId: user.id } })).toBe(2);

    const bad = await client.post('/api/expenses/bulk', [base, { ...base, amount: -20 }]);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/row 2/i);
    expect(await prisma.expense.count({ where: { userId: user.id } })).toBe(2);
  });
});
