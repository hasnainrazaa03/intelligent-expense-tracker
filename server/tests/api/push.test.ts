import { it, expect, vi, beforeEach } from 'vitest';

// Push on, with fake keys: web-push is mocked below, so nothing is sent.
vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';
  process.env.CRON_SECRET = 'test-cron-secret-0123456789abcdef';
});
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

import { describeApi, signedInClient, newClient } from '../helpers';
import { prisma } from '../../src/db';
import { runNotificationJob } from '../../src/notify/job';

const subscription = (n: number) => ({
  endpoint: `https://push.example.test/send/${n}-${Date.now()}`,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
});
const payloads = () => sendNotification.mock.calls.map((c) => JSON.parse(c[1] as string) as { title: string; body: string });

beforeEach(() => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
});

describeApi('push notifications (5e-2)', () => {
  it('gives the public key, and stores a subscription for the signed-in user', async () => {
    const { client, user } = await signedInClient();
    expect((await client.get('/api/push/key')).body).toEqual({ publicKey: 'test-public-key' });
    const sub = subscription(1);
    expect((await client.post('/api/push/subscribe', sub)).status).toBe(201);
    expect(await prisma.pushSubscription.count({ where: { userId: user.id, endpoint: sub.endpoint } })).toBe(1);
  });

  it('refuses a subscription that is not https or has bad keys', async () => {
    const { client } = await signedInClient();
    expect((await client.post('/api/push/subscribe', { ...subscription(2), endpoint: 'http://push.example.test/x' })).status).toBe(400);
    expect((await client.post('/api/push/subscribe', { ...subscription(3), keys: { p256dh: 'not base64!', auth: 'x' } })).status).toBe(400);
    expect((await client.post('/api/push/subscribe', {})).status).toBe(400);
  });

  it('a browser belongs to whoever subscribed last; unsubscribing only removes your own', async () => {
    const a = await signedInClient();
    const b = await signedInClient();
    const sub = subscription(4);
    await a.client.post('/api/push/subscribe', sub);
    await b.client.post('/api/push/subscribe', sub); // b signs in on the same browser
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: sub.endpoint } })).userId).toBe(b.user.id);
    await a.client.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(1);
    await b.client.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(0);
  });

  it('sends a test notification, and forgets a browser the push service says is gone', async () => {
    const { client, user } = await signedInClient();
    const live = subscription(5);
    const gone = subscription(6);
    await client.post('/api/push/subscribe', live);
    await client.post('/api/push/subscribe', gone);
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint === gone.endpoint) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const res = await client.post('/api/push/test');
    expect(res.body).toEqual({ sent: 1, removed: 1 });
    expect(payloads()[0].title).toBe('Notifications are on');
    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('the job endpoint needs the shared secret', async () => {
    const anon = newClient();
    expect((await anon.post('/api/jobs/notify')).status).toBe(401);
    expect((await anon.post('/api/jobs/notify').set('x-cron-secret', 'wrong-secret-wrong-secret-wrong-secr')).status).toBe(401);
    const ok = await anon.post('/api/jobs/notify').set('x-cron-secret', process.env.CRON_SECRET!);
    expect(ok.status).toBe(200);
    expect(ok.body.configured).toBe(true);
  });

  it('the job sends a budget alert in the daytime, in the user time zone, once', async () => {
    const { client, user } = await signedInClient();
    await client.post('/api/push/subscribe', subscription(7));
    await client.patch('/api/settings', { notifyBudgets: true, timeZone: 'Asia/Kolkata' });
    await client.post('/api/budgets', [{ category: 'Food', amount: 100 }]);
    await client.post('/api/expenses', { title: 'Groceries run', amount: 90, category: 'Groceries', date: '2026-11-10' });

    // 03:00 in Kolkata: nothing.
    await runNotificationJob(new Date('2026-11-17T21:30:00Z'));
    expect(sendNotification).not.toHaveBeenCalled();

    // 10:00 in Kolkata: the alert.
    const at10 = new Date('2026-11-17T04:30:00Z');
    await runNotificationJob(at10);
    const mine = payloads().filter((p) => p.body.includes('90% of your Food budget'));
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('Budget check: Food');

    // The next run doesn't repeat it.
    sendNotification.mockClear();
    await runNotificationJob(new Date('2026-11-17T05:30:00Z'));
    expect(payloads().some((p) => p.body.includes('Food budget'))).toBe(false);
    expect(await prisma.notificationLog.count({ where: { userId: user.id, key: 'budget:2026-11:Food:80' } })).toBe(1);
  });

  it('the job sends nothing to someone who turned the notification off', async () => {
    const { client } = await signedInClient();
    await client.post('/api/push/subscribe', subscription(8));
    await client.patch('/api/settings', { notifyBudgets: false, notifyBills: false, notifyMonthlySummary: false, timeZone: 'UTC' });
    await client.post('/api/budgets', [{ category: 'Food', amount: 10 }]);
    await client.post('/api/expenses', { title: 'Feast', amount: 50, category: 'Groceries', date: '2026-11-10' });
    await runNotificationJob(new Date('2026-11-17T12:00:00Z'));
    expect(payloads().some((p) => p.body.includes('Feast') || p.body.includes('500%'))).toBe(false);
  });

  it('settings accept the notification switches and a real time zone only', async () => {
    const { client } = await signedInClient();
    expect((await client.patch('/api/settings', { notifyBills: true, timeZone: 'America/New_York' })).body.settings).toMatchObject({ notifyBills: true, timeZone: 'America/New_York' });
    expect((await client.patch('/api/settings', { timeZone: 'Mars/Olympus_Mons' })).status).toBe(400);
  });
});
