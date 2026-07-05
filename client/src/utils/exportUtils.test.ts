import { describe, expect, it } from 'vitest';
import { escapeCsvCell } from './exportUtils';

describe('escapeCsvCell (RFC 4180)', () => {
  it('leaves simple values unquoted', () => {
    expect(escapeCsvCell('Coffee')).toBe('Coffee');
    expect(escapeCsvCell(12.5)).toBe('12.5');
  });

  it('quotes and doubles internal quotes (not backslash-escaped)', () => {
    expect(escapeCsvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it('quotes values containing commas or newlines', () => {
    expect(escapeCsvCell('Rent, July')).toBe('"Rent, July"');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('joins arrays instead of dumping JSON', () => {
    expect(escapeCsvCell(['a', 'b'])).toBe('a; b');
  });

  it('renders empty for null/undefined', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});
