import { describe, it, expect } from 'vitest';
import { extractPdfText, MAX_PDF_TEXT_CHARS } from '../../src/utils/pdfText';
import { makePdf, statementPdf } from '../pdfFixture';

describe('statement PDF text, read in a worker thread (S13)', () => {
  it('reads the text layer', async () => {
    const text = await extractPdfText(makePdf([['Statement for October 2026', '2026-10-03 COFFEE (TO GO) 4.50'], ['Page two: 2026-10-09 RENT 1200.00']]));
    expect(text).toContain('COFFEE (TO GO) 4.50');
    expect(text).toContain('RENT 1200.00');
  });

  it('returns nothing, without throwing, for a file that is not a PDF', async () => {
    expect(await extractPdfText(Buffer.from('not a pdf at all'))).toBe('');
  });

  it('stops a parse that takes too long', async () => {
    const started = Date.now();
    expect(await extractPdfText(statementPdf(400), { timeoutMs: 20 })).toBe('');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('caps the text it copies back', async () => {
    const text = await extractPdfText(statementPdf(150));
    expect(text.length).toBe(MAX_PDF_TEXT_CHARS);
  });

  it('keeps the server responsive while a large statement is parsed', async () => {
    const pdf = statementPdf(600);
    const ticks: number[] = [];
    const timer = setInterval(() => ticks.push(Date.now()), 10);
    const started = Date.now();
    const text = await extractPdfText(pdf);
    const ended = Date.now();
    clearInterval(timer);
    expect(text.length).toBeGreaterThan(1000);
    // In the API process this parse held the event loop throughout; in a
    // worker the 10 ms timer keeps firing.
    const stamps = [started, ...ticks, ended];
    const longestGap = Math.max(...stamps.slice(1).map((t, i) => t - stamps[i]));
    expect(ticks.length).toBeGreaterThan(3);
    expect(longestGap).toBeLessThan(250);
  });

  it('handles several uploads at once (two parse while the rest wait)', async () => {
    const results = await Promise.all([1, 2, 3, 4].map((n) => extractPdfText(makePdf([[`Upload ${n}: 2026-10-01  GROCERIES  ${n}0.00`]]))));
    results.forEach((text, i) => expect(text).toContain(`Upload ${i + 1}`));
  });
});
