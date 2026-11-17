import request from 'supertest';
import bcrypt from 'bcryptjs';
import { describe } from 'vitest';
import app from '../src/app';
import { prisma } from '../src/db';

/** API tests need a database; without TEST_DATABASE_URL they're skipped. */
export const describeApi = describe.skipIf(!process.env.TEST_DATABASE_URL);

export const PASSWORD = 'Test1234!';
let seq = 0;
/** A unique address per call, so tests never collide in the shared database. */
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${++seq}@example.test`;

/**
 * A browser-like client: keeps cookies, sends the CSRF token, and has its own
 * client IP (X-Forwarded-For; TRUST_PROXY=1 in tests) so rate limits are per
 * client.
 */
export const newClient = () => {
  const agent = request.agent(app);
  const ip = `10.${(seq >> 16) & 255}.${(seq >> 8) & 255}.${++seq & 255}`;
  let csrf = '';
  const prep = (r: request.Test) => r.set('X-Forwarded-For', ip).set('x-csrf-token', csrf);
  const client = {
    ip,
    get: (url: string) => prep(agent.get(url)),
    post: (url: string, body?: unknown) => prep(agent.post(url)).send(body as object),
    put: (url: string, body?: unknown) => prep(agent.put(url)).send(body as object),
    patch: (url: string, body?: unknown) => prep(agent.patch(url)).send(body as object),
    delete: (url: string, body?: unknown) => prep(agent.delete(url)).send(body as object),
    /** Fetch a CSRF token (cookie + header), as the app does on load. */
    async csrf() {
      const res = await agent.get('/api/auth/csrf').set('X-Forwarded-For', ip);
      csrf = res.body.csrfToken;
      return csrf;
    },
    async login(email: string, password = PASSWORD) {
      const res = await prep(agent.post('/api/auth/login')).send({ email, password });
      await client.csrf();
      return res;
    },
  };
  return client;
};

/** A verified account (2FA off), created directly in the database. */
export const createUser = async (email = uniqueEmail(), password = PASSWORD) => {
  const user = await prisma.user.create({ data: { email, password: await bcrypt.hash(password, 4), isVerified: true } });
  return { ...user, password };
};

/** A signed-in client for a new verified account. */
export const signedInClient = async (email = uniqueEmail()) => {
  const user = await createUser(email);
  const client = newClient();
  const res = await client.login(email);
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, user };
};
