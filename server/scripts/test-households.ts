// Integration test for the households lifecycle against the running server.
//   npx ts-node scripts/test-households.ts
import * as dotenv from 'dotenv'; dotenv.config();
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';
const PW = 'TestPass123!';
const A = 'hh-test-a@example.com';
const B = 'hh-test-b@example.com';

const assert = (cond: boolean, msg: string) => { if (!cond) { throw new Error('FAIL: ' + msg); } console.log('  ok:', msg); };

async function ensureUser(email: string) {
  const hash = await bcrypt.hash(PW, 10);
  await prisma.user.upsert({
    where: { email },
    update: { password: hash, isVerified: true, twoFactorEnabled: false, loginAttempts: 0, lockUntil: null },
    create: { email, password: hash, isVerified: true, twoFactorEnabled: false },
  });
}

async function login(email: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }),
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status} ${await res.text()}`);
  const cookies = (res.headers as any).getSetCookie?.() ?? [];
  const get = (name: string) => { const c = cookies.find((x: string) => x.startsWith(name + '=')); return c ? c.split('=')[1].split(';')[0] : ''; };
  return { session: get('usc_session'), csrf: get('usc_csrf') };
}

function api(auth: { session: string; csrf: string }) {
  return (path: string, method = 'GET', body?: any) => fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(auth.csrf), Cookie: `usc_session=${auth.session}; usc_csrf=${auth.csrf}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  await ensureUser(A); await ensureUser(B);
  const a = api(await login(A));
  const b = api(await login(B));

  // A creates a household
  let r = await a('/households', 'POST', { name: 'Test Home' });
  assert(r.status === 201, 'A creates household');
  const hh = await r.json();
  assert(hh.members.length === 1 && hh.members[0].role === 'owner' && hh.members[0].status === 'active', 'owner member is active');
  const id = hh.id;

  // A invites B
  r = await a(`/households/${id}/invite`, 'POST', { email: B });
  assert(r.status === 201, 'A invites B by email');

  // duplicate invite blocked
  r = await a(`/households/${id}/invite`, 'POST', { email: B });
  assert(r.status === 409, 'duplicate invite blocked');

  // B sees the pending invite
  r = await b('/households');
  let bView = await r.json();
  assert(bView.invites.some((i: any) => i.id === id), 'B sees the pending invite');
  assert(!bView.households.some((h: any) => h.id === id), 'B is not yet an active member');

  // B accepts
  r = await b(`/households/${id}/accept`, 'POST');
  assert(r.status === 200, 'B accepts the invite');

  // A now sees 2 active members
  r = await a('/households');
  let aView = await r.json();
  const home = aView.households.find((h: any) => h.id === id);
  assert(home && home.members.filter((m: any) => m.status === 'active').length === 2, 'household has 2 active members');

  // --- Pooling + settle-up ---
  const mkExpense = (title: string, amount: number, householdId?: string) => ({
    title, amount, category: 'Food', date: new Date().toISOString().split('T')[0], householdId,
  });
  // A pays $100 to the household, B pays $50
  r = await a('/expenses', 'POST', mkExpense('Groceries', 100, id));
  assert(r.status === 201, 'A logs a $100 household expense');
  r = await b('/expenses', 'POST', mkExpense('Dinner', 50, id));
  assert(r.status === 201, 'B logs a $50 household expense');

  // Tagging an expense to a household you are not in is rejected
  r = await a('/expenses', 'POST', mkExpense('Nope', 10, '000000000000000000000000'));
  assert(r.status === 403, 'cannot tag an expense to a household you are not in');

  // Pooled view (as B): both expenses + equal-split settle-up
  r = await b(`/households/${id}/expenses`);
  assert(r.status === 200, 'member can read pooled expenses');
  const pool = await r.json();
  assert(pool.expenses.length === 2 && pool.total === 150, 'pool shows 2 expenses totalling $150');
  const balByEmail = Object.fromEntries(pool.settleUp.map((s: any) => [s.email, s.balance]));
  assert(Math.abs(balByEmail[A] - 25) < 0.001, 'A is +$25 (paid 100, fair share 75)');
  assert(Math.abs(balByEmail[B] + 25) < 0.001, 'B is -$25 (paid 50, fair share 75)');

  // B (non-owner) cannot delete the household
  r = await b(`/households/${id}`, 'DELETE');
  assert(r.status === 403, 'non-owner cannot delete household');

  // owner cannot leave
  r = await a(`/households/${id}/leave`, 'DELETE');
  assert(r.status === 400, 'owner cannot leave (must delete)');

  // B leaves
  r = await b(`/households/${id}/leave`, 'DELETE');
  assert(r.status === 200, 'B leaves the household');

  // A deletes it
  r = await a(`/households/${id}`, 'DELETE');
  assert(r.status === 200, 'owner deletes household');

  console.log('\nALL HOUSEHOLD LIFECYCLE CHECKS PASSED');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    // cleanup test users + any stray memberships
    await prisma.householdMember.deleteMany({ where: { invitedEmail: { in: [A, B] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [A, B] } } }).catch(() => {});
    await prisma.$disconnect();
  });
