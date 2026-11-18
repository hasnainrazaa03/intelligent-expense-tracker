import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runNotificationJob } from '../notify/job';
import { sendError } from '../utils/http';

// Scheduled work, called by GitHub Actions (.github/workflows/notifications.yml)
// with the shared CRON_SECRET. Render's free plan sleeps, so an in-process
// timer wouldn't fire; this call also wakes it.

const router = Router();

const authorized = (req: Request): boolean => {
  const secret = process.env.CRON_SECRET || '';
  const given = req.get('x-cron-secret') || '';
  if (secret.length < 24 || given.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
};

// POST /api/jobs/notify
router.post('/notify', async (req: Request, res: Response) => {
  if (!process.env.CRON_SECRET) return sendError(res, 503, 'NOT_CONFIGURED', 'CRON_SECRET is not set.');
  if (!authorized(req)) return sendError(res, 401, 'UNAUTHORIZED', 'Bad or missing x-cron-secret.');
  try {
    const result = await runNotificationJob();
    console.log('[jobs] notify', JSON.stringify(result));
    return res.json(result);
  } catch (error) {
    console.error('[jobs] notify failed', error);
    return sendError(res, 500, 'JOB_FAILED', 'The notification job failed.');
  }
});

export default router;
