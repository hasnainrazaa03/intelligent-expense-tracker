/** Bulk actions on entries the user ticked (U4): at most this many at a time. */
export const MAX_BULK_SELECTION = 500;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * The ids of a bulk action: 1 to 500 distinct entry ids, or the reason they
 * can't be used. Ownership is checked by the caller's queries, which only ever
 * match the signed-in user's rows.
 */
export const parseSelection = (raw: unknown): { ids: string[] } | { error: string } => {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'Choose at least one entry' };
  if (!raw.every((id) => typeof id === 'string' && OBJECT_ID.test(id))) return { error: 'Invalid entry id' };
  const ids = [...new Set(raw as string[])];
  if (ids.length > MAX_BULK_SELECTION) return { error: `At most ${MAX_BULK_SELECTION} entries at a time` };
  return { ids };
};
