// Control characters are exactly what these strip, so no-control-regex is off for them.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;
// The same, keeping line feeds (\n), for multi-line notes.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_EXCEPT_LF_REGEX = /[\u0000-\u0009\u000B-\u001F\u007F]/g;
const TAG_REGEX = /<[^>]*>/g;

// Tabs and line breaks become a space: deleting them glued words together
// ("Coffee\tShop" → "CoffeeShop"). Other control characters are dropped.
const LINE_BREAKS_AND_TABS = /[\t\r\n]+/g;

export const sanitizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(LINE_BREAKS_AND_TABS, ' ')
    .replace(CONTROL_CHARS_REGEX, '')
    .replace(TAG_REGEX, '')
    .trim();
};

/** Like sanitizeText, but keeps line breaks (normalised to \n): notes are typed
 *  in a multi-line box, and their lines used to be glued together on save
 *  ("Split with⏎roommates" → "Split withroommates"). */
export const sanitizeNotes = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARS_EXCEPT_LF_REGEX, '')
    .replace(TAG_REGEX, '')
    .trim();
};

export const sanitizeOptionalNotes = (value: unknown): string | undefined => sanitizeNotes(value) || undefined;

export const sanitizeOptionalText = (value: unknown): string | undefined => {
  const sanitized = sanitizeText(value);
  return sanitized ? sanitized : undefined;
};

export const sanitizeEmail = (value: unknown): string => {
  return sanitizeText(value).toLowerCase();
};
