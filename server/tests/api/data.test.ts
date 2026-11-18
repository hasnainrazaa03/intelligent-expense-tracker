import { it, expect } from 'vitest';
import { describeApi, signedInClient } from '../helpers';
import { prisma } from '../../src/db';

const backup = (n: number) => ({
  expenses: Array.from({ length: n }, (_, i) => ({
    id: `x${i}`, title: `Backup row ${i} with a realistic merchant name`, amount: 12.34 + (i % 50), category: 'Groceries',
    date: '2026-11-10', paymentMethod: 'Debit Card', notes: 'weekly shop, split with roommates, receipt kept '.repeat(3), tags: ['food'],
  })),
  incomes: [{ id: 'i1', title: 'Paycheck', amount: 2100, category: 'Salary', date: '2026-11-01', account: 'USCCU' }],
  budgets: [{ category: 'Groceries', amount: 300 }],
  semesters: [],
});

describeApi('backup, restore and wipe', () => {
  it('restore replaces everything with the backup', async () => {
    const { client, user } = await signedInClient();
    await client.post('/api/expenses', { title: 'Old', amount: 1, category: 'Groceries', date: '2026-11-01' });

    const res = await client.post('/api/data/restore', backup(3));
    expect(res.status).toBe(200);
    const all = (await client.get('/api/data/all')).body;
    expect(all.expenses.map((e: { title: string }) => e.title).sort()).toEqual(['Backup row 0 with a realistic merchant name', 'Backup row 1 with a realistic merchant name', 'Backup row 2 with a realistic merchant name']);
    expect(all.incomes).toEqual([expect.objectContaining({ title: 'Paycheck', account: 'USCCU' })]);
    expect(all.budgets).toEqual([expect.objectContaining({ category: 'Groceries', amount: 300 })]);
    expect(await prisma.expense.count({ where: { userId: user.id, title: 'Old' } })).toBe(0);
  });

  it('restores a backup over 1 MB (S3)', async () => {
    const { client } = await signedInClient();
    const big = backup(4000);
    expect(JSON.stringify(big).length).toBeGreaterThan(1_000_000);
    const res = await client.post('/api/data/restore', big);
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(4000);
  });

  it('rejects a malformed backup and leaves the data alone', async () => {
    const { client, user } = await signedInClient();
    await client.post('/api/expenses', { title: 'Keep me', amount: 1, category: 'Groceries', date: '2026-11-01' });
    expect((await client.post('/api/data/restore', { expenses: 'nope' })).status).toBe(400);
    expect(await prisma.expense.count({ where: { userId: user.id } })).toBe(1);
  });

  it('wipe needs the exact confirmation and only touches your own data', async () => {
    const a = await signedInClient();
    const b = await signedInClient();
    await a.client.post('/api/expenses', { title: 'A1', amount: 1, category: 'Groceries', date: '2026-11-01' });
    await b.client.post('/api/expenses', { title: 'B1', amount: 1, category: 'Groceries', date: '2026-11-01' });

    expect((await a.client.post('/api/data/wipe', { confirm: 'delete' })).status).toBe(400);
    expect((await a.client.post('/api/data/wipe', { confirm: 'DELETE' })).status).toBe(200);
    expect(await prisma.expense.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { userId: b.user.id } })).toBe(1);
  });
});
