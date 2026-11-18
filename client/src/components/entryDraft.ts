/** What carries over when the add form switches between expense and income (U4). */
export interface EntryDraft { title: string; amount: string; date: string }

/** Save options from the add forms: "Save & add another" keeps the form open. */
export interface SaveOptions { keepOpen?: boolean }
