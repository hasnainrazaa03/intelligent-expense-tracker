import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { userFromUnsubscribeToken } from '../notify/unsubscribe';

// One-click unsubscribe from the email alerts (6f), from the link in each
// email or the mail app's own button (List-Unsubscribe-Post, RFC 8058). The
// signed token is the authorisation, so there's no session or CSRF check.
// GET only shows a page with a button: mail scanners open links, and opening
// one must not change anything. POST turns the emails off.

const router = Router();

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Orbit</title></head>
<body style="font-family: system-ui, sans-serif; background: #08060f; color: #f4f2ff; display: grid; place-items: center; min-height: 100vh; margin: 0">
<main style="max-width: 420px; padding: 24px; text-align: center">${body}</main></body></html>`;

// GET /api/email-alerts/unsubscribe?token=…
router.get('/unsubscribe', (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!userFromUnsubscribeToken(token)) {
    return res.status(400).type('html').send(page('Link not valid', '<h1 style="font-size: 20px">This link isn\'t valid</h1><p>Turn email alerts off in Orbit: Settings → Notifications.</p>'));
  }
  return res.type('html').send(page('Email alerts', `<h1 style="font-size: 20px">Turn off Orbit's email alerts?</h1>
<p style="color: #b9b3d9">Budget alerts, bill reminders and the monthly summary will stop coming by email. Notifications on your devices aren't affected.</p>
<form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit" style="background: #6d5cf0; color: #fff; border: 0; border-radius: 10px; padding: 12px 20px; font-size: 15px; cursor: pointer">Turn off email alerts</button></form>`));
});

// POST /api/email-alerts/unsubscribe?token=…  (body List-Unsubscribe=One-Click from mail apps)
router.post('/unsubscribe', async (req: Request, res: Response) => {
  const userId = userFromUnsubscribeToken(req.query.token);
  if (!userId) return res.status(400).type('text').send('This unsubscribe link is not valid.');
  try {
    // The account may be gone; there's nothing to turn off then.
    await prisma.userSettings.updateMany({ where: { userId }, data: { notifyByEmail: false } });
  } catch (error) {
    console.error('[email-alerts] unsubscribe failed', error);
    return res.status(500).type('text').send("Couldn't turn email alerts off. Try again, or use Settings → Notifications.");
  }
  if (req.accepts(['html', 'text']) === 'html') {
    return res.type('html').send(page('Email alerts off', '<h1 style="font-size: 20px">Email alerts are off</h1><p style="color: #b9b3d9">Turn them back on any time in Orbit: Settings → Notifications.</p>'));
  }
  return res.type('text').send('Email alerts are off.');
});

export default router;
