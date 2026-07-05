# Project Documentation

Engineering docs for USC Ledger. Start here.

| Doc | What it is |
|-----|------------|
| [01-codebase-review.md](./01-codebase-review.md) | Full findings catalog from the 2026-07-05 review — every bug/security/quality/theme issue with a stable ID and severity. |
| [02-roadmap.md](./02-roadmap.md) | Phased execution plan with checklists (Phase 0 safety → Phase 7 launch), covering bug fixes, hardening, and the neo-brutalist → modern redesign. |
| [../CHANGELOG.md](../CHANGELOG.md) | What has shipped and what's queued, per phase. |
| [../FEATURE_TRACKER.md](../FEATURE_TRACKER.md) | Historical feature roadmap (the 74 improvements). |
| [../UI_REFACTOR_MASTER_PLAN.md](../UI_REFACTOR_MASTER_PLAN.md) | Original UI-migration plan. Superseded in specifics by roadmap Phases 5–6, kept for the workstream/risk framing. |

## How to use these

1. **Fixing bugs?** Find the ID in [01-codebase-review.md](./01-codebase-review.md), then locate its checklist item in the matching phase of [02-roadmap.md](./02-roadmap.md).
2. **Shipping something?** Check the box in the roadmap and add a line to the CHANGELOG.
3. **Doing the redesign?** Phases 1–4 (data integrity) come before Phases 5–6 (visual). Don't restyle on top of broken math.

## Design direction (redesign)

The target modern visual direction will be captured in `design-direction.md` (to be added once samples/tokens are chosen). Until then, roadmap Phase 6 documents the working default: clean fintech, neutral surfaces, one confident accent, soft elevation, generous radius, WCAG-AA contrast.
