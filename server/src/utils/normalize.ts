import { sanitizeText } from './sanitize';
import { parseFiniteFloat, toFinPrecision } from './math';

// Shared input normalizers for expense/income/restore payloads. Previously these
// four helpers were copy-pasted verbatim across three route files (SRV-L17).

export const normalizeTags = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((tag) => sanitizeText(tag))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 20);
};

export const normalizeMetadata = (input: unknown): Record<string, string> | undefined => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const pairs = Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => [sanitizeText(k), sanitizeText(v)] as const)
    .filter(([k, v]) => Boolean(k) && Boolean(v))
    .slice(0, 20);
  if (pairs.length === 0) return undefined;
  return Object.fromEntries(pairs);
};

export const normalizeStringArray = (input: unknown, limit = 20): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => sanitizeText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
};

export const normalizeNumberArray = (input: unknown, limit = 20): number[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => parseFiniteFloat(item))
    .filter((item): item is number => item !== null && item > 0)
    .map((item) => toFinPrecision(item))
    .slice(0, limit);
};
