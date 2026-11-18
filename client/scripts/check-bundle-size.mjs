#!/usr/bin/env node
// Bundle-size check (U7). Run after `vite build`:
//
//   node scripts/check-bundle-size.mjs            # compare with bundle-budget.json
//   node scripts/check-bundle-size.mjs --write    # record the current sizes as the budget
//   node scripts/check-bundle-size.mjs --dist=other-dist
//
// Two kinds of number, gzipped (what a browser downloads):
// - "first load": the entry script, everything it imports, and the stylesheet:
//   what any first visit downloads before the page can show;
// - each lazily loaded chunk (a screen, a dialog, a library such as OCR): what
//   opening it adds on top of the first load.
// It fails when one of them is more than 10% over its budget. A new chunk
// with no budget is listed but doesn't fail; record it with --write.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ALLOWED_GROWTH = 0.1;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distArg = process.argv.find((a) => a.startsWith('--dist='));
const dist = path.resolve(root, distArg ? distArg.slice('--dist='.length) : 'dist');
const budgetFile = path.join(root, 'bundle-budget.json');
const write = process.argv.includes('--write');

const assets = path.join(dist, 'assets');
if (!fs.existsSync(assets)) {
  console.error(`No build at ${dist}. Run \`npm run build\` first.`);
  process.exit(1);
}

const gzipSize = (file) => zlib.gzipSync(fs.readFileSync(path.join(assets, file)), { level: 9 }).length;
// "HomeOverview-BccK4JZz.js" → "HomeOverview" (rolldown's hashes are 8 characters).
const chunkName = (file) => file.replace(/-[A-Za-z0-9_-]{8}\.(?:js|css)$/, '');
const source = new Map();
const read = (file) => {
  if (!source.has(file)) source.set(file, fs.readFileSync(path.join(assets, file), 'utf8'));
  return source.get(file);
};
// Static imports only (`import{…}from"./x.js"`, `import"./x.js"`); dynamic
// ones are written import(`./x.js`) and start a chunk of their own.
const staticImports = (file) => [...read(file).matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]);
const dynamicImports = (file) => [...read(file).matchAll(/import\(\s*[`"']\.\/([^`"']+\.js)[`"']\s*\)/g)].map((m) => m[1]);
const closure = (file, seen = new Set()) => {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const dep of staticImports(file)) closure(dep, seen);
  return seen;
};
const total = (files) => [...files].reduce((sum, f) => sum + gzipSize(f), 0);

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)?.[1];
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+\.css)"/g)].map((m) => m[1]);
if (!entry) {
  console.error('No entry script in index.html.');
  process.exit(1);
}
const firstLoadFiles = closure(entry);
const measured = { 'first load': total(firstLoadFiles) + total(css) };

// Every chunk something loads lazily, and what it adds to the first load.
const lazy = new Set();
for (const file of fs.readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  for (const dep of dynamicImports(file)) lazy.add(dep);
}
for (const file of lazy) {
  const extra = [...closure(file)].filter((f) => !firstLoadFiles.has(f));
  measured[chunkName(file)] = total(extra);
}

if (write) {
  const sorted = Object.fromEntries(Object.entries(measured).sort(([a], [b]) => (a === 'first load' ? -1 : b === 'first load' ? 1 : a.localeCompare(b))));
  fs.writeFileSync(budgetFile, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(sorted).length} budgets to bundle-budget.json.`);
  process.exit(0);
}

const budget = fs.existsSync(budgetFile) ? JSON.parse(fs.readFileSync(budgetFile, 'utf8')) : {};
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const rows = [];
let failed = 0;
for (const [name, size] of Object.entries(measured).sort(([, a], [, b]) => b - a)) {
  const limit = budget[name];
  let status = 'new: no budget yet';
  if (limit !== undefined) {
    const change = (size - limit) / limit;
    const over = change > ALLOWED_GROWTH;
    if (over) failed++;
    status = `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%${over ? ' ✗ over the 10% allowance' : ''}`;
  }
  rows.push(`| ${name} | ${kb(size)} | ${limit === undefined ? '–' : kb(limit)} | ${status} |`);
}
const report = [
  '### Bundle size (gzipped)',
  '',
  '| Chunk | Now | Budget | Change |',
  '|---|---:|---:|---|',
  ...rows,
  '',
  failed
    ? `${failed} over budget. If the growth is intended, run \`node scripts/check-bundle-size.mjs --write\` after a build and commit bundle-budget.json.`
    : 'Everything is within 10% of its budget.',
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
process.exit(failed ? 1 : 0);
