// Integration test for the receipt-image routes against the running server.
//   npx ts-node scripts/test-receipts.ts
import * as dotenv from 'dotenv'; dotenv.config();
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';
const PW = 'TestPass123!';
const A = 'receipt-test-a@example.com';
const IMG = 'data:image/jpeg;base64,TESTRECEIPTDATA';

const assert = (c: boolean, m: string) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok:', m); };

async function main() {
  const hash = await bcrypt.hash(PW, 10);
  const user = await prisma.user.upsert({ where: { email: A }, update: { password: hash, isVerified: true, twoFactorEnabled: false, loginAttempts: 0, lockUntil: null }, create: { email: A, password: hash, isVerified: true, twoFactorEnabled: false } });

  const login = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: A, password: PW }) });
  const cookies = (login.headers as any).getSetCookie?.() ?? [];
  const get = (n: string) => { const c = cookies.find((x: string) => x.startsWith(n + '=')); return c ? c.split('=')[1].split(';')[0] : ''; };
  const auth = { session: get('usc_session'), csrf: get('usc_csrf') };
  const api = (path: string, method = 'GET', body?: any) => fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(auth.csrf), Cookie: `usc_session=${auth.session}; usc_csrf=${auth.csrf}` }, body: body ? JSON.stringify(body) : undefined });

  const today = new Date().toISOString().split('T')[0];

  // Idempotency (offline replay): the same clientRequestId must not duplicate.
  let ri = await api('/expenses', 'POST', { title: 'Idem', amount: 5, category: 'Food', date: today, clientRequestId: 'idem-key-1' });
  assert(ri.status === 201, 'first create with clientRequestId');
  const e1 = await ri.json();
  ri = await api('/expenses', 'POST', { title: 'Idem', amount: 5, category: 'Food', date: today, clientRequestId: 'idem-key-1' });
  assert(ri.status === 200, 'replay returns 200 (existing), not a new 201');
  const e2 = await ri.json();
  assert(e1.id === e2.id, 'replay returns the SAME expense id (no duplicate)');

  // Reject an SVG data URL (script-carrying) receipt payload.
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg></svg>').toString('base64');
  ri = await api(`/expenses/${e1.id}/receipt`, 'PUT', { image: svg });
  assert(ri.status === 400, 'SVG receipt rejected (raster-only allowlist)');

  // create an expense
  let r = await api('/expenses', 'POST', { title: 'Receipt Expense', amount: 42.5, category: 'Food', date: today });
  assert(r.status === 201, 'expense created');
  const exp = await r.json();

  // no receipt yet
  r = await api(`/expenses/${exp.id}/receipt`);
  assert(r.status === 404, 'no receipt initially');

  // upload receipt
  r = await api(`/expenses/${exp.id}/receipt`, 'PUT', { image: IMG });
  assert(r.status === 200, 'receipt uploaded');

  // fetch it back
  r = await api(`/expenses/${exp.id}/receipt`);
  assert(r.status === 200, 'receipt fetched');
  const got = await r.json();
  assert(got.image === IMG, 'receipt image round-trips exactly');

  // reject a non-image payload
  r = await api(`/expenses/${exp.id}/receipt`, 'PUT', { image: 'not-an-image' });
  assert(r.status === 400, 'non-image payload rejected');

  // deleting the expense cascades the receipt
  r = await api(`/expenses/${exp.id}`, 'DELETE');
  assert(r.status === 200, 'expense deleted');
  r = await api(`/expenses/${exp.id}/receipt`);
  assert(r.status === 404, 'receipt removed when expense is deleted');

  console.log('\nALL RECEIPT CHECKS PASSED');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    const u = await prisma.user.findUnique({ where: { email: A } });
    if (u) { await prisma.expense.deleteMany({ where: { userId: u.id } }); await prisma.receipt.deleteMany({ where: { userId: u.id } }); }
    await prisma.user.deleteMany({ where: { email: A } });
    await prisma.$disconnect();
  });
