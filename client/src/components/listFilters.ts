/** Why a transaction list may be empty although the account has entries. */
export interface ListFilters {
  /** The account has entries of this kind (so an empty list means "filtered out"). */
  hasAny: boolean;
  search: string;
  onClearSearch: () => void;
  /** null when the list already covers all time. */
  periodLabel: string | null;
  onShowAllTime: () => void;
}

/** The empty state for a list whose filters hide everything. */
export const filteredEmptyCopy = (filters: ListFilters, noun: string) => {
  const inPeriod = filters.periodLabel ? ` in ${filters.periodLabel.toLowerCase()}` : '';
  return {
    title: 'Nothing matches',
    subtitle: filters.search ? `No ${noun} match “${filters.search}”${inPeriod}.` : `No ${noun}${inPeriod}.`,
    actions: [
      ...(filters.search ? [{ label: 'Clear search', onClick: filters.onClearSearch }] : []),
      ...(filters.periodLabel ? [{ label: 'Show all time', onClick: filters.onShowAllTime }] : []),
    ],
  };
};
