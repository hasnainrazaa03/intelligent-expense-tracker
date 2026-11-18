// "Already on file" detection for imports, shared by the statement importer
// and the CSV importer: same day, same amount, and the same leading letters of
// the description.

export const dupeKey = (date: string, amount: number, description: string) =>
  `${date}|${Math.round(amount * 100)}|${description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)}`;

/** Count occurrences of each key, so matching is a MULTISET: if you genuinely
 *  have two identical same-day charges on file, a file holding three flags two
 *  — not every one (B7). */
export const countKeys = (items: Array<{ date: string; amount: number; title?: string }>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = dupeKey(it.date, Number(it.amount), it.title || '');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
};

/** Split `rows` into those not on file yet and how many already were. */
export const withoutExisting = <T extends { date: string; amount: number; title: string }>(rows: T[], existing: Array<{ date: string; amount: number; title?: string }>) => {
  const remaining = countKeys(existing);
  const fresh: T[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = dupeKey(row.date, row.amount, row.title);
    const left = remaining.get(key) || 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      duplicates++;
    } else {
      fresh.push(row);
    }
  }
  return { fresh, duplicates };
};
