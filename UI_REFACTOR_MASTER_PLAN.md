# UI Refactor Master Plan

## 1. Objective
Completely refactor the frontend UI while preserving existing business logic, data accuracy, auth/session behavior, and performance baselines.

## 2. Success Criteria
- Visual system is fully tokenized (color, type, spacing, radius, shadow, motion).
- All major surfaces migrated: auth, dashboard, lists, modals, reports, AI, settings.
- No regression in core flows: login, CRUD, budgets, imports/exports, reports, AI chat.
- Accessibility baseline maintained or improved (keyboard, focus, contrast, ARIA).
- Production metrics are stable or improved (bundle size, TTI/LCP, API latency perception).

## 3. Non-Negotiables
- Do not change financial calculations, API contracts, or persisted data schemas during visual migration.
- Keep current feature parity through all phases.
- Avoid full rewrite; use phased migration with measurable checkpoints.

## 4. Migration Strategy
### Phase 0: Discovery and Baseline (2-3 days)
- Audit all UI surfaces and components.
- Capture baseline screenshots and interaction recordings.
- Collect baseline metrics (bundle chunks, render hotspots, accessibility score).

Deliverables:
- UI inventory matrix
- Baseline visual snapshots
- Baseline performance/accessibility report

### Phase 1: Design System Foundation (3-4 days)
- Create design tokens in a central source.
- Define typography scale, spacing scale, elevation, radius, and motion rules.
- Add theme primitives and utility mappings without changing feature code.

Deliverables:
- Token spec
- Theme map
- Updated global stylesheet primitives

### Phase 2: Core Primitives Refactor (4-5 days)
- Refactor shared primitives: Button, Input, Card, Modal, Tabs, Table shell, Empty state, Toast.
- Add consistent states: hover, focus-visible, disabled, loading, error.

Deliverables:
- Reusable primitive library
- Component usage guidance
- Snapshot tests for primitives

### Phase 3: Feature Surface Migration (7-10 days)
- Migrate by slices to reduce risk:
  1) Auth + onboarding
  2) Navigation + layout shell
  3) Expense/Income lists and forms
  4) Dashboard and charts
  5) Reports and export flows
  6) AI tab/chat experience
  7) USC tuition module

Deliverables:
- Slice-by-slice UI merges
- Before/after screenshots per slice
- QA checklist pass per slice

### Phase 4: UX Polish and Micro-Interactions (2-3 days)
- Add intentional motion for transitions, skeleton loading, and state changes.
- Improve content hierarchy and readability for dense financial views.
- Tighten AI response presentation readability.

Deliverables:
- Motion spec implementation
- Interaction polish checklist

### Phase 5: Hardening, QA, and Launch (2-3 days)
- Run full functional regression and accessibility pass.
- Validate responsive behavior for key breakpoints.
- Final docs update + release notes.

Deliverables:
- Final QA report
- Accessibility report
- Release checklist

## 5. Workstreams and Owners
- Design system and tokens: Frontend lead
- Component migration: Frontend team
- Regression and integration validation: Full-stack engineer
- Accessibility and content quality: QA + UX
- Release coordination: Project owner

## 6. Risk Register and Mitigation
- Risk: Visual regressions in high-density screens.
  Mitigation: Slice-based migration + screenshot diffs.
- Risk: Performance regressions from new visual layers.
  Mitigation: Track bundle and render metrics each phase.
- Risk: Inconsistent states across old/new components.
  Mitigation: Migrate shared primitives first and enforce usage.
- Risk: Scope creep during redesign.
  Mitigation: Freeze functional scope until UI migration completes.

## 7. Testing Plan
- Unit: Core UI primitives and formatting helpers.
- Integration: Key pages with loading/error/empty states.
- E2E smoke: Auth, add/edit/delete flows, report export, AI chat.
- Accessibility: keyboard-only nav, focus order, live region checks, contrast verification.
- Visual regression: screenshot diffs for every migrated slice.

## 8. Documentation Plan
- Keep README release notes updated after each phase.
- Maintain migration log in FEATURE_TRACKER notes.
- Add component guidelines for new primitives.
- Publish final migration summary with known follow-ups.

## 9. Rollout Plan
- Use incremental merges per phase/slice.
- Ship behind short-lived feature branches with frequent reviews.
- Validate production telemetry after each merged slice.
- Hold a final stabilization window before declaring redesign complete.

## 10. Immediate Next Actions
1. Finalize target visual direction board and token naming.
2. Build UI inventory with complexity scores.
3. Start Phase 1 token foundation in a dedicated PR.
4. Migrate navigation shell and AI tab first as pilot slice.
