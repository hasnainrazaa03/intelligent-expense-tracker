import { it, expect } from 'vitest';
import { describeApi, signedInClient } from '../helpers';
import { prisma } from '../../src/db';

type Inst = { id: string; amount: number; status: string; expenseId: string | null; paidDate: string | null };
type Sem = { id: string; name: string; totalTuition: number; version: number; installments: Inst[] };

const fall = (installments = [1000, 1000, 1000]) => ({
  id: 'fall-2026',
  name: 'Fall 2026',
  totalTuition: installments.reduce((a, b) => a + b, 0),
  installments: installments.map((amount, i) => ({ id: i + 1, amount, status: 'unpaid' })),
});

const setup = async () => {
  const { client, user } = await signedInClient();
  const res = await client.post('/api/semesters', [fall()]);
  expect(res.status).toBe(200);
  const semester = (res.body as Sem[])[0];
  return { client, user, semester };
};

const pay = (client: Awaited<ReturnType<typeof signedInClient>>['client'], instId: string, paidDate = '2026-11-10') =>
  client.post(`/api/semesters/fall-2026/installments/${instId}/pay`, { paidDate });

describeApi('tuition on the server (5d-1)', () => {
  it('paying creates the expense and marks the installment paid in one request', async () => {
    const { client, user, semester } = await setup();
    const second = semester.installments[1];
    const res = await pay(client, second.id);
    expect(res.status).toBe(200);
    expect(res.body.expense).toMatchObject({ title: 'USC Tuition - Fall 2026 (Inst #2)', amount: 1000, category: 'Tuition', date: '2026-11-10' });
    const inst = (res.body.semester as Sem).installments[1];
    expect(inst).toMatchObject({ status: 'paid', expenseId: res.body.expense.id, paidDate: '2026-11-10' });
    expect(await prisma.expense.count({ where: { userId: user.id, category: 'Tuition' } })).toBe(1);
  });

  it('a double-click (two requests at once) creates one expense (F6)', async () => {
    const { client, user, semester } = await setup();
    const [a, b] = await Promise.all([pay(client, semester.installments[0].id), pay(client, semester.installments[0].id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.expense.id).toBe(b.body.expense.id);
    expect(await prisma.expense.count({ where: { userId: user.id, category: 'Tuition' } })).toBe(1);
  });

  it('re-links an existing tuition expense for that installment instead of duplicating', async () => {
    const { client, user, semester } = await setup();
    const made = await client.post('/api/expenses', { title: 'USC Tuition - Fall 2026 (Inst #1)', amount: 1000, category: 'Tuition', date: '2026-09-01' });
    const res = await pay(client, semester.installments[0].id);
    expect(res.body.expense.id).toBe(made.body.id);
    expect(await prisma.expense.count({ where: { userId: user.id, category: 'Tuition' } })).toBe(1);
  });

  it("a structure save can't undo a payment or change a paid amount (S2, C3)", async () => {
    const { client, semester } = await setup();
    const paid = (await pay(client, semester.installments[0].id)).body.semester as Sem;
    // A stale copy: the first installment still unpaid, with new amounts everywhere.
    const stale = { ...paid, totalTuition: 3600, installments: paid.installments.map((i) => ({ ...i, status: 'unpaid', expenseId: null, paidDate: null, amount: 1200 })) };
    const res = await client.post('/api/semesters', [stale]);
    expect(res.status).toBe(200);
    const [first, second] = (res.body as Sem[])[0].installments;
    expect(first).toMatchObject({ status: 'paid', amount: 1000, expenseId: paid.installments[0].expenseId });
    expect(second).toMatchObject({ status: 'unpaid', amount: 1200 });
  });

  it('a save from a tab with an older copy is refused, and nothing is written (S12)', async () => {
    const { client, user, semester } = await setup();
    const tabA = semester;
    const saved = await client.post('/api/semesters', [{ ...tabA, totalTuition: 4500, installments: tabA.installments.map((i) => ({ ...i, amount: 1500 })) }]);
    expect((saved.body as Sem[])[0].version).toBe(tabA.version + 1);

    // Tab B still has version 0.
    const res = await client.post('/api/semesters', [{ ...tabA, totalTuition: 999 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEMESTERS_CHANGED');
    expect((res.body.semesters as Sem[])[0].totalTuition).toBe(4500);
    const stored = await prisma.semester.findFirstOrThrow({ where: { id: 'fall-2026', userId: user.id } });
    expect(stored.totalTuition).toBe(450000);
  });

  it('unsaved defaults (version -1) from a second tab are refused once another tab saved them', async () => {
    const { client } = await signedInClient();
    expect((await client.post('/api/semesters', [{ ...fall(), version: -1 }])).status).toBe(200); // first save creates
    const res = await client.post('/api/semesters', [{ ...fall([5, 5, 5]), version: -1 }]);
    expect(res.status).toBe(409);
    expect((res.body.semesters as Sem[])[0].totalTuition).toBe(3000);
  });

  it("a save that leaves a semester out doesn't delete it (S12)", async () => {
    const { client } = await setup();
    const spring = { id: 'spring-2027', name: 'Spring 2027', totalTuition: 100, installments: [{ id: 1, amount: 100, status: 'unpaid' }] };
    const res = await client.post('/api/semesters', [spring]);
    expect((res.body as Sem[]).map((s) => s.id).sort()).toEqual(['fall-2026', 'spring-2027']);
  });

  it('deleting the tuition expense re-opens the installment; editing it updates the installment', async () => {
    const { client, semester } = await setup();
    const { expense } = (await pay(client, semester.installments[0].id)).body;

    const edited = await client.put(`/api/expenses/${expense.id}`, { ...expense, amount: 950, date: '2026-11-12' });
    expect(edited.status).toBe(200);
    let inst = (await prisma.tuitionInstallment.findUniqueOrThrow({ where: { id: semester.installments[0].id } }));
    expect(inst.amount).toBe(95000);
    expect(inst.paidDate?.toISOString().slice(0, 10)).toBe('2026-11-12');

    expect((await client.delete(`/api/expenses/${expense.id}`)).status).toBe(200);
    inst = await prisma.tuitionInstallment.findUniqueOrThrow({ where: { id: semester.installments[0].id } });
    expect(inst).toMatchObject({ status: 'unpaid', expenseId: null, paidDate: null });
  });

  it('a link saved by an older app version is accepted only if it points at a real, unused Tuition expense', async () => {
    const { client, semester } = await setup();
    const real = await client.post('/api/expenses', { title: 'Tuition payment', amount: 1000, category: 'Tuition', date: '2026-09-01' });
    const groceries = await client.post('/api/expenses', { title: 'Food', amount: 5, category: 'Groceries', date: '2026-09-01' });
    const res = await client.post('/api/semesters', [{
      ...semester,
      installments: semester.installments.map((i, n) => (
        n === 0 ? { ...i, status: 'paid', expenseId: real.body.id, paidDate: '2026-09-01' }
        : n === 1 ? { ...i, status: 'paid', expenseId: groceries.body.id, paidDate: '2026-09-01' }
        : { ...i, status: 'paid', expenseId: 'ffffffffffffffffffffffff', paidDate: '2026-09-01' }
      )),
    }]);
    const [a, b, c] = (res.body as Sem[])[0].installments;
    expect(a).toMatchObject({ status: 'paid', expenseId: real.body.id });
    expect(b.status).toBe('unpaid');
    expect(c.status).toBe('unpaid');
  });

  it("refuses a bad date, an unknown installment, and another user's semester", async () => {
    const { client, semester } = await setup();
    const other = await signedInClient();
    expect((await pay(client, semester.installments[0].id, '11/10/2026')).status).toBe(400);
    expect((await pay(client, 'aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
    expect((await pay(other.client, semester.installments[0].id)).status).toBe(404);
  });
});
