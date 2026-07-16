// Money-as-integer-cents boundary. Amounts are stored in the DB as integer
// cents (exact — no float drift), and converted to/from dollars at the API
// boundary so the client keeps working in dollars. toCents rounds; toDollars
// divides. Null/undefined pass through for optional fields.

export const toCents = (dollars: number): number => Math.round((dollars + Number.EPSILON) * 100);
export const toDollars = (cents: number): number => cents / 100;

export const centsOrNull = (dollars: number | null | undefined): number | null =>
  dollars === null || dollars === undefined ? null : toCents(dollars);
export const dollarsOrNull = (cents: number | null | undefined): number | null =>
  cents === null || cents === undefined ? null : toDollars(cents);

// --- DB (cents) -> client (dollars) serializers ---

export const expenseToClient = <T extends { amount: number; originalAmount?: number | null; splitShares?: number[] }>(e: T): T => ({
  ...e,
  amount: toDollars(e.amount),
  originalAmount: dollarsOrNull(e.originalAmount),
  splitShares: Array.isArray(e.splitShares) ? e.splitShares.map(toDollars) : e.splitShares,
});

export const incomeToClient = <T extends { amount: number; originalAmount?: number | null }>(i: T): T => ({
  ...i,
  amount: toDollars(i.amount),
  originalAmount: dollarsOrNull(i.originalAmount),
});

export const budgetToClient = <T extends { amount: number }>(b: T): T => ({ ...b, amount: toDollars(b.amount) });

export const installmentToClient = <T extends { amount: number }>(inst: T): T => ({ ...inst, amount: toDollars(inst.amount) });

export const semesterToClient = <T extends { totalTuition: number; installments?: Array<{ amount: number }> }>(s: T): T => ({
  ...s,
  totalTuition: toDollars(s.totalTuition),
  installments: Array.isArray(s.installments) ? s.installments.map(installmentToClient) : s.installments,
});
