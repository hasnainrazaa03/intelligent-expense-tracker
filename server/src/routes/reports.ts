import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendGenericEmail } from '../utils/mailer';
import { writeAuditLog } from '../utils/audit';
import { sendError } from '../utils/http';
import { toDollars } from '../utils/money';

const router = Router();
router.use(authMiddleware);

const money = (n: number) => `$${n.toFixed(2)}`;
// Output-encode user text at render time (defense-in-depth over input sanitizing).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Email the signed-in user a summary of their current-month finances. */
router.post('/email-summary', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.user!.email;

  try {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const [rawExpenses, rawIncomes] = await Promise.all([
      prisma.expense.findMany({ where: { userId }, select: { amount: true, category: true, date: true } }),
      prisma.income.findMany({ where: { userId }, select: { amount: true, date: true } }),
    ]);
    // DB stores integer cents; convert to dollars for the summary math.
    const expenses = rawExpenses.map((e) => ({ ...e, amount: toDollars(e.amount) }));
    const incomes = rawIncomes.map((i) => ({ ...i, amount: toDollars(i.amount) }));

    const inMonth = (d: Date) => d.toISOString().slice(0, 7) === monthPrefix;
    const monthExpenses = expenses.filter((e) => inMonth(e.date));
    const monthIncomes = incomes.filter((i) => inMonth(i.date));

    const totalExpense = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const totalIncome = monthIncomes.reduce((s, i) => s + i.amount, 0);
    const net = totalIncome - totalExpense;

    const byCategory: Record<string, number> = {};
    monthExpenses.forEach((e) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

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
