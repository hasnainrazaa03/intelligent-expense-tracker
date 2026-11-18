import { describe, it, expect } from 'vitest';
import { msUntilNextDay } from './useToday';

describe('msUntilNextDay', () => {
  it('waits until just after the next local midnight', () => {
    const evening = new Date(2026, 10, 17, 23, 59, 0);
    expect(msUntilNextDay(evening)).toBe(61_000);
    const morning = new Date(2026, 10, 17, 9, 0, 0);
    expect(msUntilNextDay(morning)).toBe(15 * 60 * 60 * 1000 + 1000);
  });

  it('rolls over month and year ends', () => {
    expect(msUntilNextDay(new Date(2026, 11, 31, 23, 0, 0))).toBe(60 * 60 * 1000 + 1000);
  });
});
