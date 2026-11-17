import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

describe('Content-Security-Policy', () => {
  // vercel.json allows the inline theme script in index.html by its sha256 hash.
  // Editing that script without updating the hash would silently break it in
  // production (CSP blocks it), so pin them together here.
  it('allows the inline theme script by its current hash', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline).toHaveLength(1);
    const hash = createHash('sha256').update(inline[0]).digest('base64');
    const vercel = readFileSync(resolve(root, 'vercel.json'), 'utf8');
    expect(vercel).toContain(`'sha256-${hash}'`);
  });
});

// sanitizeAiHtml needs a DOM (DOMPurify); it's exercised in the browser checks.
