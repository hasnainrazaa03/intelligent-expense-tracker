const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;
const TAG_REGEX = /<[^>]*>/g;

export const sanitizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(CONTROL_CHARS_REGEX, '')
    .replace(TAG_REGEX, '')
    .trim();
};

export const sanitizeOptionalText = (value: unknown): string | undefined => {
  const sanitized = sanitizeText(value);
  return sanitized ? sanitized : undefined;
};

export const sanitizeEmail = (value: unknown): string => {
  return sanitizeText(value).toLowerCase();
};
