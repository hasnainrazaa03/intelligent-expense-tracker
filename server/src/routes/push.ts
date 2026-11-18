import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendError } from '../utils/http';
import { pushConfigured, vapidPublicKey, sendToUser } from '../notify/push';
import { pushTestLimiter } from '../middleware/rateLimiter';

// Web Push subscriptions (5e-2). The browser subscribes with the public key;
// the hourly job (notify/job.ts) sends budget alerts, bill reminders and the
// monthly summary to every browser a user turned notifications on in.

const router = Router();
router.use(authMiddleware);

const notConfigured = (res: Response) =>
  sendError(res, 503, 'PUSH_NOT_CONFIGURED', "Notifications aren't set up on the server yet.");

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// GET /api/push/key → { publicKey }
router.get('/key', (_req: Request, res: Response) => {
  const publicKey = vapidPublicKey();
  if (!publicKey) return notConfigured(res);
  return res.json({ publicKey });
});

// POST /api/push/subscribe  { endpoint, keys: { p256dh, auth } }  (a PushSubscription's JSON)
router.post('/subscribe', async (req: Request, res: Response) => {
  if (!pushConfigured()) return notConfigured(res);
  const { endpoint, keys } = req.body || {};
  let url: URL | null = null;
  try { url = typeof endpoint === 'string' && endpoint.length <= 2048 ? new URL(endpoint) : null; } catch { url = null; }
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (!url || url.protocol !== 'https:' || typeof p256dh !== 'string' || typeof auth !== 'string'
    || p256dh.length > 256 || auth.length > 64 || !BASE64URL.test(p256dh) || !BASE64URL.test(auth)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid push subscription.');
  }
  const userAgent = (req.get('user-agent') || '').slice(0, 200) || null;
  // One subscription per browser. If someone else was signed in on this
  // browser before, it's theirs no longer.
  await prisma.pushSubscription.upsert({
    where: { endpoint: url.toString() },
    create: { userId: req.user!.id, endpoint: url.toString(), p256dh, auth, userAgent },
    update: { userId: req.user!.id, p256dh, auth, userAgent },
  });
  return res.status(201).json({ subscribed: true });
});

// POST /api/push/unsubscribe  { endpoint }
router.post('/unsubscribe', async (req: Request, res: Response) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') return sendError(res, 400, 'VALIDATION_ERROR', 'endpoint is required');
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
  return res.json({ subscribed: false });
});

// POST /api/push/test → a notification to each of the user's browsers
router.post('/test', pushTestLimiter, async (req: Request, res: Response) => {
  if (!pushConfigured()) return notConfigured(res);
  const result = await sendToUser(req.user!.id, {
    title: 'Notifications are on',
    body: "You'll get budget alerts, bill reminders and a monthly summary here.",
    url: '/app',
    tag: 'test',
  });
  return res.json(result);
});

export default router;
