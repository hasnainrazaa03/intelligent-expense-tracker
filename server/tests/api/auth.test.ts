import { it, expect } from 'vitest';
import { describeApi, newClient, uniqueEmail, signedInClient, createUser } from '../helpers';
import { lastCode } from '../mailbox';

describeApi('auth', () => {
  it('register → emailed code → verify → sign in → session → sign out', async () => {
    const email = uniqueEmail('register');
    const password = 'Str0ng!Pass';
    const c = newClient();
    await c.csrf();

    expect((await c.post('/api/auth/register', { email, password })).status).toBe(201);
    const code = lastCode(email, 'verification');
    expect(code).toMatch(/^\d{6}$/);

    expect((await c.post('/api/auth/login', { email, password })).status).not.toBe(200); // not verified yet
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await c.post('/api/auth/verify-otp', { email, otp: wrong, password })).status).toBe(400);
    // The right code alone isn't enough: it must come with the registration's
    // password, so nobody can register your address with their own password.
    expect((await c.post('/api/auth/verify-otp', { email, otp: code, password: 'Other!Pass9' })).status).toBe(400);
    expect((await c.post('/api/auth/verify-otp', { email, otp: code, password })).status).toBe(200);

    expect((await c.login(email, password)).status).toBe(200);
    expect((await c.get('/api/auth/session')).body).toMatchObject({ authenticated: true, email });

    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/auth/session')).status).toBe(401);
  });

  it('rejects weak passwords and a second sign-up for a verified address', async () => {
    const c = newClient();
    await c.csrf();
    expect((await c.post('/api/auth/register', { email: uniqueEmail('weak'), password: 'password' })).status).toBe(400);
    const { email } = await createUser();
    const again = await c.post('/api/auth/register', { email, password: 'Str0ng!Pass' });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it('data routes need a session, and changes need the CSRF token', async () => {
    const anon = newClient();
    expect((await anon.get('/api/data/all')).status).toBe(401);

    const { client } = await signedInClient();
    const expense = { title: 'CSRF check', amount: 5, category: 'Groceries', date: '2026-11-10' };
    expect((await client.post('/api/expenses', expense).set('x-csrf-token', 'wrong')).status).toBe(403);
    expect((await client.post('/api/expenses', expense)).status).toBe(201);
  });

  it('5 wrong passwords lock that IP out of the account, but not the owner on another IP', async () => {
    const { email, password } = await createUser();
    const attacker = newClient();
    for (let i = 0; i < 4; i++) {
      expect((await attacker.post('/api/auth/login', { email, password: 'Wrong-pass-1' })).status).toBe(400);
    }
    // The 5th failure locks that (account, IP) and says so...
    expect((await attacker.post('/api/auth/login', { email, password: 'Wrong-pass-1' })).status).toBe(429);
    // ...so even the right password from that IP is refused for now...
    expect((await attacker.post('/api/auth/login', { email, password })).status).toBe(429);
    expect((await newClient().login(email, password)).status).toBe(200);
  });
});
