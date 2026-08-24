export const APP_CONFIG = {
  searchDebounceMs: 250,
  defaultItemsPerPage: 10,
  maxVirtualizedItemsThreshold: 75,
  virtualRowHeight: 132,
  virtualListHeight: 620,
  maxCsvImportRows: 2000,
  maxImportFileSizeBytes: 2 * 1024 * 1024,
  maxBackupFileSizeBytes: 5 * 1024 * 1024,
} as const;

// 'all' renders one continuous virtualized scroll instead of pages — the
// escape hatch for "just let me scroll through everything".
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 'all'] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
