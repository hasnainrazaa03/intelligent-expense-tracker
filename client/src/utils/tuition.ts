// Tuition and the loan taken to pay it are one-off, structural money movements
// (tracked in the dedicated Tuition ledger). They dwarf everyday spending, so the
// user can hide them from the Financial hub / Income summary to see normal cash
// flow. "Tuition-related" = the Tuition expense category, the Loan income
// category, or anything titled "…tuition…" (e.g. an income named "tuition loan").
export const isTuitionRelated = (item: { category?: string; title?: string }): boolean =>
  item.category === 'Tuition' || item.category === 'Loan' || /tuition/i.test(item.title || '');

/** Return `items` with tuition-related entries removed when `hide` is true. */
export const stripTuition = <T extends { category?: string; title?: string }>(
  items: T[],
  hide: boolean
): T[] => (hide ? items.filter((i) => !isTuitionRelated(i)) : items);
