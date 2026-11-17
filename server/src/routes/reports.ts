import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendGenericEmail } from '../utils/mailer';
import { writeAuditLog } from '../utils/audit';
import { sendError } from '../utils/http';
import { toDollars } from '../utils/money';
import { emailSummaryLimiter } from '../middleware/rateLimiter';

const router = Router();
router.use(authMiddleware);

const money = (n: number) => `$${n.toFixed(2)}`;
// Output-encode user text at render time (defense-in-depth over input sanitizing).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Email the signed-in user a summary of their current-month finances. */
router.post('/email-summary', emailSummaryLimiter, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.user!.email;

  try {
    // The month the USER is in, sent by the client. The server's clock is UTC,
    // so a Pacific user asking on the evening of the 31st used to get next
    // month's (empty) summary. Falls back to the server's month.
    const now = new Date();
    const requested = typeof req.body?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.body.month) ? req.body.month : null;
    const monthPrefix = requested ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [labelYear, labelMonth] = monthPrefix.split('-').map(Number);
    const monthLabel = new Date(Date.UTC(labelYear, labelMonth - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const [rawExpenses, rawIncomes] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, select: { amount: true, category: true, date: true } }),
      prisma.income.findMany({ where: { userId }, select: { amount: true, date: true } }),
    ]);
    // Dates are stored as calendar days (UTC midnight), so the UTC slice is the
    // day the user picked. Sums stay in integer cents and convert once (adding
    // float dollars drifted by fractions of a cent).
    const inMonth = (d: Date) => d.toISOString().slice(0, 7) === monthPrefix;
    const monthExpenses = rawExpenses.filter((e) => inMonth(e.date));
    const monthIncomes = rawIncomes.filter((i) => inMonth(i.date));

    const totalExpense = toDollars(monthExpenses.reduce((s, e) => s + e.amount, 0));
    const totalIncome = toDollars(monthIncomes.reduce((s, i) => s + i.amount, 0));
    const net = totalIncome - totalExpense;

    const byCategoryCents: Record<string, number> = {};
    monthExpenses.forEach((e) => { byCategoryCents[e.category] = (byCategoryCents[e.category] || 0) + e.amount; });
    const top = Object.entries(byCategoryCents).map(([c, cents]) => [c, toDollars(cents)] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const rows = top.map(([cat, amt]) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(cat)}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${money(amt)}</td></tr>`).join('');

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="color:#6d5cf0;margin-bottom:4px">Your Orbit summary</h2>
        <p style="color:#666;margin-top:0">${monthLabel}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 12px">Income</td><td style="padding:6px 12px;text-align:right;color:#16a34a">${money(totalIncome)}</td></tr>
          <tr><td style="padding:6px 12px">Expenses</td><td style="padding:6px 12px;text-align:right">${money(totalExpense)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Net flow</td><td style="padding:6px 12px;text-align:right;font-weight:bold;color:${net < 0 ? '#dc2626' : '#16a34a'}">${net < 0 ? '-' : ''}${money(Math.abs(net))}</td></tr>
        </table>
        ${top.length ? `<h3 style="margin-bottom:8px">Top categories</h3><table style="width:100%;border-collapse:collapse">${rows}</table>` : ''}
        <p style="color:#999;font-size:12px;margin-top:24px">Amounts are in USD. Sent from Orbit at your request.</p>
      </div>`;
    const text = `Orbit summary — ${monthLabel}\nIncome: ${money(totalIncome)}\nExpenses: ${money(totalExpense)}\nNet: ${money(net)}`;

    const result = await sendGenericEmail(email, `Your Orbit summary — ${monthLabel}`, html, text);

    if (!result.success) {
      if (result.error === 'EMAIL_NOT_CONFIGURED') {
        return sendError(res, 503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured on the server.');
      }
      return sendError(res, 502, 'EMAIL_SEND_FAILED', 'Could not send the summary email.');
    }

    await writeAuditLog({ action: 'report.email_summary', userId, success: true, route: '/api/reports/email-summary' });
    return res.status(200).json({ message: 'Summary emailed.' });
  } catch {
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Could not build the summary.');
  }
});

export default router;
