// Calendar days as YYYY-MM-DD strings, in the user's own time zone. The server
// runs in UTC; "today", "this month" and "9 am" must be the user's.

const pad = (n: number) => String(n).padStart(2, '0');

/** The user's local calendar day and hour at `now`. */
export const localParts = (now: Date, timeZone: string): { date: string; hour: number } => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
};

// Arithmetic on calendar days via UTC noon, so no time zone or DST can shift the day.
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const addDays = (day: string, n: number) => {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
};

export const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();

/** Same day `months` later, clamped to the target month (Jan 31 + 1 → Feb 28/29). */
export const addMonthsSameDay = (day: string, months: number, anchorDay?: number) => {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return `${ty}-${pad(tm)}-${pad(Math.min(anchorDay ?? d, daysInMonth(ty, tm)))}`;
};

/** "2026-11" → "2026-10" */
export const previousMonth = (month: string) => addMonthsSameDay(`${month}-01`, -1).slice(0, 7);

/** "2026-10" → "October" */
export const monthName = (month: string) => toDate(`${month}-01`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

/** "2026-11-22" → "Nov 22" */
export const shortDay = (day: string) => toDate(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
