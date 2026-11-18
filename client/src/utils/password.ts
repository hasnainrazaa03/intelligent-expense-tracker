// The password rules the server enforces (server/src/routes/auth.ts and
// SERVER_CONFIG.limits): 8 to 128 characters with a lowercase and an uppercase
// letter, a number and a symbol.
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_RULES_TEXT = '8 to 128 characters, with an uppercase letter, a lowercase letter, a number and a symbol.';

export const scorePassword = (value: string): number => {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
};

export const isStrongPassword = (value: string): boolean => scorePassword(value) >= 5 && value.length <= MAX_PASSWORD_LENGTH;
