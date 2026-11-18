// Item-level edits to a cached list, for optimistic updates and their rollback.
// Rolling back ONE item (not the whole cache snapshot) keeps any other change
// that landed meanwhile — another save, a refetch — instead of undoing it too.

type WithId = { id: string };

/** Replace the item with the same id. A missing item (deleted meanwhile) stays missing. */
export const replaceById = <T extends WithId>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : list;

/** Remove by id, reporting what was removed and where (for putting it back). */
export const removeById = <T extends WithId>(list: T[], id: string): { list: T[]; removed?: T; index: number } => {
  const index = list.findIndex((x) => x.id === id);
  if (index < 0) return { list, index };
  return { list: [...list.slice(0, index), ...list.slice(index + 1)], removed: list[index], index };
};

/** Put an item back at its old position (or the end), unless it's already there. */
export const restoreAt = <T extends WithId>(list: T[], item: T, index: number): T[] => {
  if (list.some((x) => x.id === item.id)) return list;
  const i = index < 0 ? list.length : Math.min(index, list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
};
