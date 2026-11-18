# Orbit web app (client)

React 19 + Vite 8 + Tailwind 4, with TanStack Query for data. Setup, the API and
deployment are in the [main README](../README.md).

```bash
npm ci
npm run dev          # http://localhost:5173, talks to the API on :3001
```

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | oxlint, including the React hooks rules |
| `npm run typecheck` | TypeScript, app and tests |
| `npm test` | unit tests (vitest) |
| `npm run build` | production build into `dist/` |
| `node scripts/check-bundle-size.mjs` | after a build: what a first visit downloads and what each screen adds, gzipped, against `bundle-budget.json` (CI fails past +10%) |
| `npm run test:e2e` | Playwright end-to-end flows against a real API and database (CI creates its test accounts with `server/scripts/ensure-test-user.ts` and `seed-demo.ts`: see the `e2e` job in `.github/workflows/ci.yml`) |
| `npm run test:visual` | screenshot and accessibility tests (below) |

## Screenshot and accessibility tests

`tests/visual/` runs on a production build with the API answered from fixtures
(`tests/visual/fixtures/`, the seeded demo account with anonymised ids) and the clock
frozen at 18 Nov 2026, so nothing changes between runs and no server is needed.
Four projects: laptop (1440×900) and phone (390×844), each in dark and light.

- `screens.spec.ts` compares every main screen, quick add and the landing page with
  the reference images in `tests/visual/__screenshots__/`.
- `a11y.spec.ts` runs axe (WCAG 2.1 A/AA, including 4.5:1 text contrast) on every
  screen and every dialog, menu and sheet, checks that Escape closes them and focus
  goes back, and walks the page with Tab: skip link first, header, navigation, then
  the page, with a visible focus style at every stop.

CI runs them in Playwright's Linux image (the `ui` job). Fonts and anti-aliasing
differ between operating systems, so the reference images are made in that same
image, with Docker:

```bash
npm run test:visual:update                # rewrites only the images that changed
npm run test:visual:update -- -g home     # just the matching tests
```

Commit the new images with the change that caused them, and look at them first:
a reference image is what the next PR is compared with. When `@playwright/test` is
updated, change the `ui` job's image tag in `.github/workflows/ci.yml` to match (the
job checks), then run the update.

## Bundle size

`bundle-budget.json` holds the gzipped size of the first load and of each lazily
loaded chunk. If a change makes one grow on purpose, rebuild and record it:

```bash
npm run build && node scripts/check-bundle-size.mjs --write
```

Chunking rules are in `vite.config.ts`: React, the router and Vite's chunk loader
are claimed first, so the chart, PDF and OCR libraries only load on the screens that
use them.
