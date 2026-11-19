import { describe, it, expect } from 'vitest';
import { localParts, addDays, addMonthsSameDay, previousMonth } from '../../src/notify/calendar';
import { subToMainFor, expenseCategoriesFor } from '../../src/utils/categories';
import { noticeEmail } from '../../src/notify/email';
import { unsubscribeToken, userFromUnsubscribeToken } from '../../src/notify/unsubscribe';
import jwt from 'jsonwebtoken';
import { upcomingBills } from '../../src/notify/recurrence';
import { budgetNotice, billNotice, summaryNotice } from '../../src/notify/compose';

const map = subToMainFor({ Food: ['Boba'] }, { Food: ['Meal Plan'] });

describe('calendar', () => {
  it("uses the user's own day and hour", () => {
    const now = new Date('2026-11-01T06:30:00Z'); // 1 Nov in UTC
    expect(localParts(now, 'America/Los_Angeles')).toEqual({ date: '2026-10-31', hour: 23 });
    expect(localParts(now, 'Asia/Kolkata')).toEqual({ date: '2026-11-01', hour: 12 });
  });

  it('steps days and months on the calendar, clamping month ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonthsSameDay('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsSameDay('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('categories', () => {
  it('rolls custom subcategories up to their main category, and drops removed ones', () => {
    expect(map.Boba).toBe('Food');
    expect(map.Groceries).toBe('Food');
    expect(map['Meal Plan']).toBeUndefined();
  });
  it("lists what a user's expenses can be filed under: theirs in, removed ones out, Other always last", () => {
    const list = expenseCategoriesFor({ Food: ['Boba'] }, { Food: ['Meal Plan'], Miscellaneous: ['Other'] });
    expect(list).toContain('Boba');
    expect(list).toContain('Groceries');
    expect(list).not.toContain('Meal Plan');
    expect(list[list.length - 1]).toBe('Other');
    expect(list.filter((c) => c === 'Other')).toHaveLength(1);
    expect(expenseCategoriesFor(null, undefined)).toContain('Tuition');
  });
});

describe('bills', () => {
  const netflix = { title: 'Netflix', category: 'Subscriptions', amount: 15.49, date: '2026-10-22', isRecurring: true };
  it('finds a recurring charge due within two days, once it is not entered yet', () => {
    expect(upcomingBills([netflix], '2026-11-20', 2)).toEqual([{ identity: 'netflix|subscriptions', title: 'Netflix', amount: 15.49, due: '2026-11-22' }]);
    expect(upcomingBills([netflix], '2026-11-19', 2)).toEqual([]); // three days out
    expect(upcomingBills([netflix, { ...netflix, date: '2026-11-22' }], '2026-11-20', 2)).toEqual([]); // already entered
    expect(upcomingBills([netflix], '2026-11-20', 2, { 'Netflix|Subscriptions|15.49': true })).toEqual([]); // paused
  });

  it('follows weekly series and month-end anchors', () => {
    const gym = { title: 'Gym', category: 'Fitness', amount: 10, date: '2026-11-15', isRecurring: true, metadata: { recurrence: 'weekly' } };
    expect(upcomingBills([gym], '2026-11-21', 2).map((b) => b.due)).toEqual(['2026-11-22']);
    const rent = [{ title: 'Rent', category: 'Rent', amount: 1500, date: '2026-01-31', isRecurring: true }, { title: 'Rent', category: 'Rent', amount: 1500, date: '2026-02-28', isRecurring: true }];
    expect(upcomingBills(rent, '2026-03-30', 2).map((b) => b.due)).toEqual(['2026-03-31']);
  });

  it('words one bill or several', () => {
    const n = billNotice({ expenses: [netflix], today: '2026-11-21' })!;
    expect(n.title).toBe('Netflix is due tomorrow');
    expect(n.body).toBe('Netflix $15.49 tomorrow');
    expect(n.keys).toEqual(['bill:netflix|subscriptions:2026-11-22']);
    expect(n.url).toBe('/app'); // Home, where charges due are listed
    expect(billNotice({ expenses: [netflix], today: '2026-11-21', sent: new Set(n.keys) })).toBeNull();
  });
});

describe('budget alerts', () => {
  const budgets = [{ category: 'Food', amount: 100 }, { category: 'Rent', amount: 1000 }];
  const spend = (category: string, amount: number) => ({ category, amount, date: '2026-11-10' });

  it('alerts at 80% and again at 100%, counting custom subcategories toward their main budget', () => {
    const at85 = budgetNotice({ budgets, expenses: [spend('Groceries', 60), spend('Boba', 25)], month: '2026-11', subToMain: map, sent: new Set() })!;
    expect(at85.keys).toEqual(['budget:2026-11:Food:80']);
    expect(at85.title).toBe('Budget check: Food');
    expect(at85.url).toBe('/app/budgets');
    expect(at85.body).toBe("You've used 85% of your Food budget ($100.00) this month.");

    const sent = new Set(at85.keys);
    expect(budgetNotice({ budgets, expenses: [spend('Groceries', 85)], month: '2026-11', subToMain: map, sent })).toBeNull();
    const over = budgetNotice({ budgets, expenses: [spend('Groceries', 120), spend('Rent', 900)], month: '2026-11', subToMain: map, sent })!;
    expect(over.keys).toEqual(['budget:2026-11:Food:100', 'budget:2026-11:Rent:80']);
    expect(over.title).toBe('Over budget: Food');
    expect(over.body).toBe('This month so far: Food 120% · Rent 90%.');
  });

  it('stays quiet under 80%', () => {
    expect(budgetNotice({ budgets, expenses: [spend('Groceries', 79)], month: '2026-11', subToMain: map, sent: new Set() })).toBeNull();
  });
});

describe('monthly summary', () => {
  it('gives the total, budget use and the top category', () => {
    const n = summaryNotice({
      lastMonth: '2026-10',
      expenses: [{ category: 'Groceries', amount: 300, date: '2026-10-03' }, { category: 'Rent', amount: 900, date: '2026-10-01' }],
      budgets: [{ category: 'Food', amount: 400 }, { category: 'Rent', amount: 1000 }],
      subToMain: map,
    })!;
    expect(n.title).toBe('Your October summary');
    expect(n.body).toBe('You spent $1,200.00, 86% of your budgets. Top category: Housing ($900.00).');
    expect(n.keys).toEqual(['summary:2026-10']);
    expect(n.url).toBe('/app/insights/reports');
  });

  it('says nothing for a month with no spending', () => {
    expect(summaryNotice({ lastMonth: '2026-10', expenses: [], budgets: [], subToMain: map })).toBeNull();
  });
});

describe('notification emails', () => {
  it("escape the user's own names and link back to the app", () => {
    const mail = noticeEmail({ keys: ['k'], title: 'Over budget: <b>Boba</b>', body: 'You\'ve used 120% of your "Boba & Co" budget.', url: '/app', tag: 't' }, { base: 'https://orbit.example' });
    expect(mail.subject).toBe('Orbit: Over budget: <b>Boba</b>');
    expect(mail.html).toContain('Over budget: &lt;b&gt;Boba&lt;/b&gt;');
    expect(mail.html).toContain('&quot;Boba &amp; Co&quot;');
    expect(mail.html).not.toContain('<b>Boba</b>');
    expect(mail.html).toContain('href="https://orbit.example/app"');
    expect(mail.text).toContain('Open Orbit: https://orbit.example/app');
    expect(mail.headers).toEqual({});
  });

  it('carry a one-click unsubscribe link, in the footer and in the List-Unsubscribe headers', () => {
    const url = 'https://orbit.example/api/email-alerts/unsubscribe?token=abc';
    const mail = noticeEmail({ keys: ['k'], title: 'T', body: 'B', url: '/app', tag: 't' }, { base: 'https://orbit.example', unsubscribe: url });
    expect(mail.headers).toEqual({ 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.text).toContain(`Turn them off: ${url}`);
  });
});

describe('unsubscribe tokens', () => {
  it('name their user, and only unsubscribe tokens count (not session tokens)', () => {
    expect(userFromUnsubscribeToken(unsubscribeToken('user-1'))).toBe('user-1');
    const session = jwt.sign({ id: 'user-1', email: 'a@b.c', tokenVersion: 0 }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
    expect(userFromUnsubscribeToken(session)).toBeNull();
    expect(userFromUnsubscribeToken('garbage')).toBeNull();
    expect(userFromUnsubscribeToken(undefined)).toBeNull();
  });
});
