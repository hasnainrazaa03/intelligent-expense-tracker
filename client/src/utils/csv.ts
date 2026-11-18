// RFC 4180 cell encoding: arrays become "a; b", objects become JSON, and any
// value containing a comma, quote, or newline is wrapped in double quotes with
// internal quotes doubled (not backslash-escaped as JSON.stringify did).
export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let str: string;
  if (Array.isArray(value)) str = value.join('; ');
  else if (typeof value === 'object') str = JSON.stringify(value);
  else str = String(value);

  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** A CSV document: a header row, then one row per item (missing values empty). */
export const toCsv = (headers: readonly string[], rows: Record<string, unknown>[]): string =>
  [headers.map(escapeCsvCell).join(','), ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(','))].join('\r\n');

/** Hand the browser a file to save. */
export const downloadText = (text: string, filename: string, type = 'text/csv') => {
  const url = window.URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};
