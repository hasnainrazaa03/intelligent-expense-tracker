import { it, expect } from 'vitest';
import { describeApi, signedInClient } from '../helpers';
import { prisma } from '../../src/db';

// Bulk recategorise and delete on ticked entries (U4).
const base = { title: 'Groceries run', amount: 12.34, category: 'Groceries', date: '2026-11-10' };
const incomeBase = { title: 'Pay', amount: 500, category: 'Salary', date: '2026-11-01' };

describeApi('bulk actions on ticked entries (U4)', () => {
  it('deletes only your own expenses and says how many', async () => {
    const a = await signedInClient();
    const b = await signedInClient();
    const mine = [(await a.client.post('/api/expenses', base)).body.id, (await a.client.post('/api/expenses', { ...base, title: 'Second' })).body.id];
    const keep = (await a.client.post('/api/expenses', { ...base, title: 'Keep' })).body.id;
    const theirs = (await b.client.post('/api/expenses', base)).body.id;

    const res = await a.client.post('/api/expenses/bulk-delete', { ids: [...mine, theirs] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });
    expect(await prisma.expense.count({ where: { userId: a.user.id } })).toBe(1);
    expect(await prisma.expense.findUnique({ where: { id: keep } })).not.toBeNull();
    expect(await prisma.expense.findUnique({ where: { id: theirs } })).not.toBeNull();
  });

  it('a bulk delete of a tuition payment re-opens its installment, like a single delete', async () => {
    const { client } = await signedInClient();
    const sem = (await client.post('/api/semesters', [{ id: 'fall-2026', name: 'Fall 2026', totalTuition: 2000, installments: [{ id: 1, amount: 1000, status: 'unpaid' }, { id: 2, amount: 1000, status: 'unpaid' }] }])).body[0];
    const instId = sem.installments[0].id;
    const { expense } = (await client.post(`/api/semesters/fall-2026/installments/${instId}/pay`, { paidDate: '2026-11-10' })).body;
    expect((await client.post('/api/expenses/bulk-delete', { ids: [expense.id] })).body).toEqual({ deleted: 1 });
    expect(await prisma.tuitionInstallment.findUniqueOrThrow({ where: { id: instId } })).toMatchObject({ status: 'unpaid', expenseId: null, paidDate: null });
  });

  it('recategorises only your own expenses', async () => {
    const a = await signedInClient();
    const b = await signedInClient();
    const mine = (await a.client.post('/api/expenses', base)).body.id;
    const theirs = (await b.client.post('/api/expenses', base)).body.id;
    const res = await a.client.post('/api/expenses/bulk-update', { ids: [mine, theirs], category: 'Food' });
    expect(res.body).toEqual({ updated: 1 });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: mine } })).category).toBe('Food');
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: theirs } })).category).toBe('Groceries');
  });

  it('refuses an empty, malformed or oversized selection, and a missing category', async () => {
    const { client } = await signedInClient();
    const id = (await client.post('/api/expenses', base)).body.id;
    for (const ids of [[], 'nope', ['not-an-id'], [123], Array.from({ length: 501 }, (_, i) => i.toString(16).padStart(24, '0'))]) {
      expect((await client.post('/api/expenses/bulk-delete', { ids })).status, JSON.stringify(ids).slice(0, 40)).toBe(400);
    }
    expect((await client.post('/api/expenses/bulk-update', { ids: [id], category: '  ' })).status).toBe(400);
    expect(await prisma.expense.findUnique({ where: { id } })).not.toBeNull();
  });

  it('works for income too', async () => {
    const { client, user } = await signedInClient();
    const ids = [(await client.post('/api/incomes', incomeBase)).body.id, (await client.post('/api/incomes', { ...incomeBase, title: 'Gift' })).body.id];
    expect((await client.post('/api/incomes/bulk-update', { ids, category: 'Freelance' })).body).toEqual({ updated: 2 });
    expect(await prisma.income.count({ where: { userId: user.id, category: 'Freelance' } })).toBe(2);
    expect((await client.post('/api/incomes/bulk-delete', { ids })).body).toEqual({ deleted: 2 });
    expect(await prisma.income.count({ where: { userId: user.id } })).toBe(0);
  });
});
