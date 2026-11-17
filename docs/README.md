# Project Documentation

Engineering docs for Orbit (formerly USC Ledger). Start here.

| Doc | What it is |
|-----|------------|
| [03-post-launch-plan.md](./03-post-launch-plan.md) | Current tracker: remaining fixes, hardening and the feature backlog after the Phase 0–7 roadmap. |
| [04-deploy-runbook.md](./04-deploy-runbook.md) | Step-by-step production deploy: Render (API), Vercel (frontend), MongoDB Atlas. |
| [design-direction.md](./design-direction.md) | The cosmic-glass "Orbit" design: tokens, palette, both themes. |
| [01-codebase-review.md](./01-codebase-review.md) | Findings catalog from the 2026-07-05 review, each issue with a stable ID and severity. |
| [02-roadmap.md](./02-roadmap.md) | The Phase 0–7 execution plan that took the app from that review to launch. Essentially complete; kept for history. |
| [../CHANGELOG.md](../CHANGELOG.md) | What has shipped, per phase. |
| [../FEATURE_TRACKER.md](../FEATURE_TRACKER.md) | Historical feature roadmap (the 74 improvements). |
| [../UI_REFACTOR_MASTER_PLAN.md](../UI_REFACTOR_MASTER_PLAN.md) | Original UI-migration plan, superseded by the roadmap's Phases 5–6. |

## How to use these

1. **Fixing bugs?** Find the ID in the post-launch plan (or the 2026-07-05 catalog for older IDs).
2. **Shipping something?** Tick it in the post-launch plan and add a line to the CHANGELOG.
3. **Deploying?** Follow the runbook top to bottom; the database steps are order-sensitive.

Live site: https://orbit-expense-tracker.vercel.app
