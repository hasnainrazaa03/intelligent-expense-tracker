// Notifications by email (6f): the same notices as push, for users who turn on
// "Also by email". Sent by Resend from EMAIL_FROM. Until that is an address on
// Orbit's own verified domain, Resend's test sender only delivers to the Resend
// account's owner (runbook, "Push notifications").
import { sendGenericEmail } from '../utils/mailer';
import type { Notice } from './compose';

export const emailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The site's address, for the link back (FRONTEND_URL may list several origins). */
const siteUrl = (): string => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');

/**
 * A notice as an email. Titles and bodies hold the user's own category and
 * bill names, so they're escaped for the HTML part.
 */
export const noticeEmail = (notice: Notice, base: string = siteUrl()): { subject: string; html: string; text: string } => {
  const link = base ? `${base}${notice.url}` : '';
  const settings = base ? `${base}/app` : '';
  const text = [
    notice.body,
    link ? `Open Orbit: ${link}` : '',
    `You get these because email alerts are on. Turn them off in Settings → Notifications${settings ? ` (${settings})` : ''}.`,
  ].filter(Boolean).join('\n\n');
  const html = `<div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #111">
<h2 style="font-size: 18px; margin: 0 0 12px">${escapeHtml(notice.title)}</h2>
<p style="font-size: 15px; line-height: 1.5; margin: 0 0 20px">${escapeHtml(notice.body)}</p>
${link ? `<p style="margin: 0 0 24px"><a href="${escapeHtml(link)}" style="background: #6d5cf0; color: #fff; padding: 10px 16px; border-radius: 8px; text-decoration: none">Open Orbit</a></p>` : ''}
<p style="font-size: 12px; color: #666; margin: 0">You get these because email alerts are on. Turn them off in Settings → Notifications.</p>
</div>`;
  return { subject: `Orbit: ${notice.title}`, html, text };
};

/** Sends one notice; resolves whether it went out (failures are logged by the mailer). */
export const emailNotice = async (to: string, notice: Notice): Promise<boolean> => {
  const { subject, html, text } = noticeEmail(notice);
  return (await sendGenericEmail(to, subject, html, text)).success;
};
