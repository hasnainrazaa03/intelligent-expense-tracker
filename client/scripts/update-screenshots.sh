#!/usr/bin/env bash
# Update the screenshot tests' reference images (U7).
#
# They are made in Playwright's Linux image, the same one CI compares them in:
# fonts and anti-aliasing differ on macOS and Windows, so images made there
# would fail in CI. Needs Docker. Only images that changed are rewritten.
#
#   npm run test:visual:update                 # every screen
#   npm run test:visual:update -- -g home      # just matching tests
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('@playwright/test/package.json').version")

# The Linux node_modules live in a Docker volume, not over this machine's.
docker run --rm --ipc=host \
  -v "$PWD":/work -w /work \
  -v orbit-visual-node-modules:/work/node_modules \
  -e CI= \
  "mcr.microsoft.com/playwright:v${VERSION}-noble" \
  bash -c 'npm ci --no-audit --no-fund --loglevel=error && npx playwright test -c playwright.visual.config.ts --update-snapshots "$@"' -- "$@"
