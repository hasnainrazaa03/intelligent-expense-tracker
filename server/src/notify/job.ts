import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { toDollars } from '../utils/money';
import { isTimeZone } from '../utils/settings';
import { localParts, addDays, previousMonth } from './calendar';
import { subToMainFor } from '../utils/categories';
import { budgetNotice, billNotice, summaryNotice, type Notice } from './compose';
import { sendToUser, pushConfigured } from './push';
import { emailConfigured, emailNotice } from './email';

/** For users who never sent theirs (most of Orbit's users are at USC). */
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';
/** Notifications go out in the user's daytime only. */
const FIRST_HOUR = 9;
const LAST_HOUR = 21;
/** The summary of last month goes out in the first days of the month. */
const SUMMARY_DAYS = 3;

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Log the keys first: a notice goes out at most once, even if two runs overlap.
 * Returns the keys this call logged (none: it was all sent before).
 */
const claim = async (userId: string, keys: string[]): Promise<string[]> => {
  const claimed: string[] = [];
  for (const key of keys) {
    try {
      await prisma.notificationLog.create({ data: { userId, key } });
      claimed.push(key);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  return claimed;
};
/** Nothing reached the user (every channel failed): let the next run try again. */
const unclaim = (userId: string, keys: string[]) => prisma.notificationLog.deleteMany({ where: { userId, key: { in: keys } } });

// The workflow retries a request that takes too long, so a slow run could be
// joined by another: one at a time (per instance).
let running = false;

/**
 * One pass over every user with notifications on, by push or email: work out
 * what's due for them now (in their time zone) and send what hasn't been sent,
 * each notice once, by every channel they use. Run hourly (the GitHub Actions
 * "Notifications" workflow calls POST /api/jobs/notify).
 */
export const runNotificationJob = async (now = new Date()) => {
  const summary = { users: 0, notices: 0, sent: 0, emailed: 0, removed: 0, retryLater: 0 };
  const push = pushConfigured();
  const email = emailConfigured();
  if (!push && !email) return { ...summary, configured: false, push, email };
  if (running) return { ...summary, configured: true, push, email, skipped: 'already running' };
  running = true;
  try {
    return await runPass(now, summary, push, email);
  } finally {
    running = false;
  }
};

const runPass = async (now: Date, summary: { users: number; notices: number; sent: number; emailed: number; removed: number; retryLater: number }, push: boolean, email: boolean) => {
  const pushUsers = new Set(push ? (await prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ['userId'] })).map((s) => s.userId) : []);
  const emailUsers = email ? (await prisma.userSettings.findMany({ where: { notifyByEmail: true }, select: { userId: true } })).map((s) => s.userId) : [];
  const userIds = [...new Set([...pushUsers, ...emailUsers])];
  for (const userId of userIds) {
    // Settings and the address in one query.
    const settings = await prisma.userSettings.findUnique({ where: { userId }, include: { user: { select: { email: true } } } });
    if (!settings || !(settings.notifyBudgets || settings.notifyBills || settings.notifyMonthlySummary)) continue;
    const byPush = pushUsers.has(userId);
    const address = email && settings.notifyByEmail === true ? settings.user?.email : undefined;
    if (!byPush && !address) continue;
    const tz = settings.timeZone && isTimeZone(settings.timeZone) ? settings.timeZone : DEFAULT_TIME_ZONE;
    const { date: today, hour } = localParts(now, tz);
    if (hour < FIRST_HOUR || hour >= LAST_HOUR) continue;
    summary.users++;

    const month = today.slice(0, 7);
    const lastMonth = previousMonth(month);
    // A year and a bit back covers yearly bills and last month's summary.
    const rows = await prisma.expense.findMany({
      where: { userId, date: { gte: new Date(`${addDays(today, -400)}T00:00:00Z`) } },
      select: { title: true, category: true, amount: true, date: true, isRecurring: true, metadata: true },
    });
    const expenses = rows.map((r) => ({ ...r, amount: toDollars(r.amount), date: day(r.date) }));
    const budgets = (await prisma.budget.findMany({ where: { userId }, select: { category: true, amount: true } }))
      .map((b) => ({ category: b.category, amount: toDollars(b.amount) }));
    const subToMain = subToMainFor(settings.customCategories, settings.deletedSubcategories);
    // Already told: this month's budget levels, and recent bill reminders.
    const sentKeys = new Set(
      (await prisma.notificationLog.findMany({
        where: { userId, OR: [{ key: { startsWith: `budget:${month}:` } }, { key: { startsWith: 'bill:' }, createdAt: { gte: new Date(now.getTime() - 10 * 86_400_000) } }] },
        select: { key: true },
      })).map((l) => l.key)
    );

    const notices: Notice[] = [];
    if (settings.notifyBudgets) {
      const n = budgetNotice({ budgets, expenses: expenses.filter((e) => e.date.startsWith(month)), month, subToMain, sent: sentKeys });
      if (n) notices.push(n);
    }
    if (settings.notifyBills) {
      const paused = settings.pausedRecurring && typeof settings.pausedRecurring === 'object' ? (settings.pausedRecurring as Record<string, unknown>) : {};
      const n = billNotice({ expenses, today, paused, sent: sentKeys });
      if (n) notices.push(n);
    }
    if (settings.notifyMonthlySummary && Number(today.slice(8, 10)) <= SUMMARY_DAYS) {
      const n = summaryNotice({ lastMonth, expenses: expenses.filter((e) => e.date.startsWith(lastMonth)), budgets, subToMain });
      if (n) notices.push(n);
    }

    for (const notice of notices) {
      const claimed = await claim(userId, notice.keys);
      if (claimed.length === 0) continue; // all sent before
      summary.notices++;
      let delivered = false;
      if (byPush) {
        const { sent, removed } = await sendToUser(userId, { title: notice.title, body: notice.body, url: notice.url, tag: notice.tag });
        summary.sent += sent;
        summary.removed += removed;
        delivered ||= sent > 0;
      }
      if (address && (await emailNotice(address, userId, notice))) {
        summary.emailed++;
        delivered = true;
      }
      // Nothing got through (the email service failed, say): try again next run.
      // Once any channel delivered, the notice counts as sent.
      if (!delivered) {
        await unclaim(userId, claimed);
        summary.retryLater++;
      }
    }
  }
  return { ...summary, configured: true, push, email };
};
