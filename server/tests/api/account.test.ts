import { it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { describeApi, signedInClient, newClient, createUser, PASSWORD } from '../helpers';
import { prisma } from '../../src/db';

const expense = (title: string, extra: Record<string, unknown> = {}) => ({ title, amount: 10, category: 'Groceries', date: '2026-11-01', ...extra });

describeApi('account: delete and sign out everywhere (5b-2)', () => {
  it('deleting the account removes it and everything in it, and nobody else\'s data', async () => {
    const { client, user } = await signedInClient();
    const other = await signedInClient();
    await client.post('/api/expenses', expense('Mine'));
    await client.post('/api/incomes', { title: 'Pay', amount: 100, category: 'Salary', date: '2026-11-01' });
    await client.post('/api/budgets', [{ category: 'Groceries', amount: 200 }]);
    await client.patch('/api/settings', { savingsGoals: [{ id: 'g', name: 'Car', target: 100, saved: 0 }] });
    await prisma.receipt.create({ data: { expenseId: (await prisma.expense.findFirstOrThrow({ where: { userId: user.id } })).id, userId: user.id, image: 'data:,' } });
    await other.client.post('/api/expenses', expense('Theirs'));

    expect((await client.post('/api/auth/delete-account', { confirm: 'delete', password: PASSWORD })).status).toBe(400);
    const res = await client.post('/api/auth/delete-account', { confirm: 'DELETE', password: PASSWORD });
    expect(res.status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    for (const model of ['expense', 'income', 'budget', 'receipt', 'userSettings'] as const) {
      expect(await (prisma[model] as unknown as { count: (a: object) => Promise<number> }).count({ where: { userId: user.id } }), model).toBe(0);
    }
    // The session is dead, and the other account is untouched.
    expect((await client.get('/api/data/all')).status).toBe(401);
    expect(await prisma.expense.count({ where: { userId: other.user.id } })).toBe(1);
    // The email can't sign in any more.
    expect((await newClient().login(user.email)).status).not.toBe(200);
  });

  it('a wrong password deletes nothing; five wrong ones lock further attempts for a while', async () => {
    const { client, user } = await signedInClient();
    for (let i = 0; i < 5; i++) {
      expect((await client.post('/api/auth/delete-account', { confirm: 'DELETE', password: 'wrong-password' })).status).toBe(401);
    }
    expect((await client.post('/api/auth/delete-account', { confirm: 'DELETE', password: PASSWORD })).status).toBe(429);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('households: one you own is deleted for everyone (members keep their expenses, untagged); you leave the others', async () => {
    const owner = await signedInClient();
    const member = await signedInClient();
    const theirs = await signedInClient();

    const mine: string = (await owner.client.post('/api/households', { name: 'Flat' })).body.id;
    await owner.client.post(`/api/households/${mine}/invite`, { email: member.user.email });
    await member.client.post(`/api/households/${mine}/accept`);
    await member.client.post('/api/expenses', expense('Shared rent', { householdId: mine }));

    const other: string = (await theirs.client.post('/api/households', { name: 'Theirs' })).body.id;
    await theirs.client.post(`/api/households/${other}/invite`, { email: owner.user.email });
    await owner.client.post(`/api/households/${other}/accept`);

    expect((await owner.client.post('/api/auth/delete-account', { confirm: 'DELETE', password: PASSWORD })).status).toBe(200);

    expect(await prisma.household.findUnique({ where: { id: mine } })).toBeNull();
    expect(await prisma.householdMember.count({ where: { householdId: mine } })).toBe(0);
    const rent = await prisma.expense.findFirstOrThrow({ where: { userId: member.user.id, title: 'Shared rent' } });
    expect(rent.householdId).toBeNull();
    // Their household survives, without the deleted member.
    expect(await prisma.household.findUnique({ where: { id: other } })).not.toBeNull();
    expect(await prisma.householdMember.count({ where: { householdId: other, userId: owner.user.id } })).toBe(0);
  });

  it('without a password it needs a recent sign-in (Google-only accounts)', async () => {
    // Fresh session: allowed.
    const fresh = await signedInClient();
    expect((await fresh.client.post('/api/auth/delete-account', { confirm: 'DELETE' })).status).toBe(200);

    // A session signed in an hour ago: refused.
    const user = await createUser();
    const stale = jwt.sign(
      { id: user.id, email: user.email, tokenVersion: 0, jti: `stale-${user.id}`, iat: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256', expiresIn: '7d' }
    );
    const client = newClient();
    await client.csrf();
    const res = await client.post('/api/auth/delete-account', { confirm: 'DELETE' }).set('Authorization', `Bearer ${stale}`);
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('REAUTH_REQUIRED');
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('"sign out everywhere" ends every session of the account', async () => {
    const { client, user } = await signedInClient();
    const laptop = newClient();
    await laptop.login(user.email);
    expect((await laptop.get('/api/settings')).status).toBe(200);

    expect((await client.post('/api/auth/logout-all')).status).toBe(200);
    expect((await client.get('/api/settings')).status).toBe(401);
    expect((await laptop.get('/api/settings')).status).toBe(401);

    // Signing in again works.
    const again = newClient();
    expect((await again.login(user.email)).status).toBe(200);
    expect((await again.get('/api/settings')).status).toBe(200);
  });
});
