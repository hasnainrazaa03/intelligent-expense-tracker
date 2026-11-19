export const APP_CONFIG = {
  searchDebounceMs: 250,
  defaultItemsPerPage: 10,
  maxVirtualizedItemsThreshold: 75,
  virtualListHeight: 620,
  maxCsvImportRows: 2000,
  maxImportFileSizeBytes: 2 * 1024 * 1024,
  // The server accepts restore bodies up to 12mb (compact JSON); the exported
  // file is pretty-printed, so allow the same on disk.
  maxBackupFileSizeBytes: 12 * 1024 * 1024,
} as const;

// 'all' renders one continuous virtualized scroll instead of pages — the
// escape hatch for "just let me scroll through everything".
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 'all'] as const;

export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/** Who runs Orbit and how to reach them: shown in the Privacy Policy and Terms. */
export const LEGAL = {
  operator: 'Hasnain Raza',
  contactEmail: 'hasnainrazaa03@gmail.com',
  /** Change whenever either document changes. */
  lastUpdated: 'November 17, 2026',
} as const;
