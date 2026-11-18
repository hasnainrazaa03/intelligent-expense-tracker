// Notifications by email (6f): the same notices as push, for users who turn on
// "By email". Sent by Resend from EMAIL_FROM. Until that is an address on
// Orbit's own verified domain, Resend's test sender only delivers to the Resend
// account's owner (runbook, "Push notifications").
import { sendGenericEmail } from '../utils/mailer';
import { unsubscribeToken } from './unsubscribe';
import type { Notice } from './compose';

export const emailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The site's address, for links (FRONTEND_URL may list several origins). The
 *  API is on the same site under /api (Vercel's rewrite). */
const siteUrl = (): string => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');

export const unsubscribeUrl = (userId: string, base: string = siteUrl()): string =>
  base ? `${base}/api/email-alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId))}` : '';

/**
 * A notice as an email. Titles and bodies hold the user's own category and
 * bill names, so they're escaped for the HTML part. `unsubscribe` is the
 * one-click link that turns these emails off.
 */
export const noticeEmail = (notice: Notice, { base = siteUrl(), unsubscribe = '' }: { base?: string; unsubscribe?: string } = {}) => {
  const link = base ? `${base}${notice.url}` : '';
  const text = [
    notice.body,
    link ? `Open Orbit: ${link}` : '',
    unsubscribe
      ? `You get these because email alerts are on. Turn them off: ${unsubscribe}`
      : 'You get these because email alerts are on. Turn them off in Settings → Notifications.',
  ].filter(Boolean).join('\n\n');
  const footer = unsubscribe
    ? `You get these because email alerts are on. <a href="${escapeHtml(unsubscribe)}" style="color: #666">Turn them off</a>, or change which ones in Settings → Notifications.`
    : 'You get these because email alerts are on. Turn them off in Settings → Notifications.';
  const html = `<div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #111">
<h2 style="font-size: 18px; margin: 0 0 12px">${escapeHtml(notice.title)}</h2>
<p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px">${escapeHtml(notice.body)}</p>
${link ? `<p style="margin: 0 0 24px"><a href="${escapeHtml(link)}" style="background: #6d5cf0; color: #fff; padding: 10px 16px; border-radius: 8px; text-decoration: none">Open Orbit</a></p>` : ''}
<p style="font-size: 12px; color: #666; margin: 0">${footer}</p>
</div>`;
  // RFC 8058 one-click unsubscribe: mail apps show their own button for it.
  const headers: Record<string, string> = unsubscribe
    ? { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};
  return { subject: `Orbit: ${notice.title}`, html, text, headers };
};

// Resend allows 2 requests a second by default: space the job's sends out.
const SEND_INTERVAL_MS = Number(process.env.EMAIL_SEND_INTERVAL_MS) >= 0 && process.env.EMAIL_SEND_INTERVAL_MS !== undefined
  ? Number(process.env.EMAIL_SEND_INTERVAL_MS)
  : 600;
let nextSendAt = 0;
const waitForTurn = async () => {
  const now = Date.now();
  const at = Math.max(now, nextSendAt);
  nextSendAt = at + SEND_INTERVAL_MS;
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
};

/** Sends one notice; resolves whether it went out (failures are logged by the mailer). */
export const emailNotice = async (to: string, userId: string, notice: Notice): Promise<boolean> => {
  const { subject, html, text, headers } = noticeEmail(notice, { unsubscribe: unsubscribeUrl(userId) });
  await waitForTurn();
  return (await sendGenericEmail(to, subject, html, text, Object.keys(headers).length ? headers : undefined)).success;
};
