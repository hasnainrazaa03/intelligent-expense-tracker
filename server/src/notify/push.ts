// Web Push (VAPID). Configured by VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (make a
// pair with `npx web-push generate-vapid-keys`) and VAPID_SUBJECT, a contact
// the push services can reach. Without the keys, push is simply off.
import webpush from 'web-push';
import { prisma } from '../db';

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:hasnainrazaa03@gmail.com';

let configured = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error('[push] VAPID keys are invalid; push notifications are off.', error);
  }
}

export const pushConfigured = () => configured;
export const vapidPublicKey = () => (configured ? publicKey : null);

export interface PushPayload { title: string; body: string; url: string; tag: string }

/**
 * Send to every browser the user turned notifications on in. Subscriptions the
 * push service reports gone (404/410: unsubscribed, expired) are deleted.
 */
export const sendToUser = async (userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> => {
  if (!configured) return { sent: 0, removed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        removed++;
      } else {
        console.error('[push] send failed', status ?? error);
      }
    }
  }));
  return { sent, removed };
};
