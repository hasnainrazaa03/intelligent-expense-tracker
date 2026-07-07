# Design Direction — Cosmic Dark Redesign

The redesign moves the app from the neo-brutalist USC look to a **dark, cosmic
"glassmorphism" dashboard** — floating translucent panels over an animated
starfield — inspired by the reference screenshots the user provided. It also
**de-brands from USC** into a general-purpose product (see Naming + Rebrand).

## Naming (proposal)

Cosmic, general-purpose, brandable. Recommendation first:

| Name | Why |
|------|-----|
| **Orbit** *(recommended)* | Recurring bills/budgets "come back around"; clean, on-theme, easy to say. Tagline: *Track. Save. Explore.* |
| **Nova** | A star that suddenly brightens — positive, short, memorable. |
| **Astra** | Latin "stars" — premium, minimal. |
| **Vega** | A bright real star — distinctive, less crowded. |
| **Lumen** | Light / clarity for your finances. |

**Decided:** the product is renamed **Orbit** (features unchanged). Theme mode: **dark + light toggle** (dark is the signature cosmic theme; light is a clean neutral with no starfield). **USC-specific features/copy stay** (Bursar 4-installment tuition, Fryft, USC Village, meal plans) — this is a re-skin + rename, not a de-USC of functionality.

## Tokens

### Color (dark-first — the starfield commits the identity to a single dark world)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#08060f` → `#0f0b24` (radial, nebula tint) | app background, behind the starfield |
| `--surface` | `rgba(255,255,255,0.045)` (solid fallback `#15132b`) | glass panels |
| `--surface-2` | `rgba(255,255,255,0.07)` | cards on panels, hovers |
| `--border` | `rgba(255,255,255,0.09)` | hairline panel borders |
| `--text` | `#f3f1fb` | primary text |
| `--muted` | `#9d9abb` | secondary / labels |
| `--primary` | `#7c6cff` (gradient `135deg, #8b7ff6 → #6d5cf0`) | active nav, CTAs, focus |
| `--primary-glow` | `0 8px 24px rgba(124,108,255,0.35)` | CTA / active glow |
| `--success` | `#34d399` | income, positive delta |
| `--danger` | `#fb7185` | expense, negative delta |
| `--warning` | `#fbbf24` | near-budget |

**Category / chart palette** (validated on dark surface with `dataviz` — all checks pass; fixed order, never cycled):
`#6d5cf0` indigo · `#d97706` amber · `#0284c7` sky · `#ec4899` rose · `#16a34a` green · `#9333ea` violet · `#0d9488` teal → 8th+ folds into "Other".

Semantic (good/warn/danger) are **separate** from the categorical hues and always ship with an icon/label, not color alone.

### Type

- **Display / brand / headings:** **Sora** (geometric, subtly techy — cosmic without the Space-Grotesk cliché), weights 600/700, tight tracking `-0.02em`, **normal case** (retire the ALL-UPPERCASE + Archivo Black).
- **Body / UI:** **Inter** (400/500/600).
- **Numbers:** Inter with `font-variant-numeric: tabular-nums` so money columns align.
- Self-host both (woff2) to fix the current unloaded-font bug (THM-3). *(The Artifact preview uses a system-sans stack since its CSP blocks font CDNs; production uses the real faces.)*

### Shape, elevation, motion

- **Radius:** `--r-sm 10 · --r-md 14 · --r-lg 18 · --r-xl 24 · pill 9999`. Everything softly rounded; no more square hard-border cards.
- **Elevation:** soft shadow `0 10px 34px rgba(0,0,0,0.45)` + inset hairline `inset 0 1px 0 rgba(255,255,255,0.06)` + backdrop-blur on glass. No hard offset shadows.
- **Motion:** subtle fade/slide on mount; ambient starfield drift + occasional shooting star; all gated behind `prefers-reduced-motion` (static stars, no drift).

### Starfield background (replaces `.noise-overlay`)

Pure CSS, no image assets: 2–3 fixed full-viewport layers of `radial-gradient` dots at varied sizes/opacity, a very slow vertical drift + twinkle, plus one periodic shooting-star keyframe. Reduced-motion → static. This is the same effect as the reference's `.stars`/`.stars-lg`/`.shooting-star`, rebuilt without their SVG assets.

## Rebrand / de-USC mapping (keep the tuition tracker feature)

| USC-specific today | Becomes |
|---|---|
| "USC Ledger" / "TROJAN_LEDGER" / "Trojan" | **Orbit** (chosen name) |
| USC cardinal `#990000` / gold `#FFCC00` dominant | Indigo primary + cosmic palette (cardinal kept only as one category tone) |
| Trojan logo / "Fight On" / "✌️ Fight On!" | Orbit planet/orbit mark; neutral tagline |
| "Trojan Playbook" AI, USC Fryft, USC Village, meal-plan copy | Generic AI analyst + generic categories |
| "USC 4-installment Bursar" tuition tracker | **Keep the feature**; rename to a generic **Tuition Tracker** (installment plans exist at any school) — no USC copy |
| README ("USC Ledger v4.0", Bursar prose, Fight On) | Rewrite around Orbit / general audience |
| robots/sitemap/manifest/meta, `title` "USC_FIN_v4.0" | Update to Orbit |

## Migration plan (Phase 6, slice by slice — verify each against the running app)

0. **Foundation:** token layer (`@theme` + CSS vars, dark-first), fix `darkMode`/dark variant, load Sora+Inter, starfield background, primitives (Button, Card/Panel, StatTile, Badge, Input, Modal, Tabs), chart theme module.
1. Auth + onboarding · 2. Nav + layout shell · 3. Lists + entry modals · 4. Dashboard + charts · 5. Reports + export · 6. AI tab · 7. Tuition tracker · 8. Planning.
Rebrand copy/assets land alongside the relevant slice; README + meta updated at the end.

**Status:** direction + tokens defined; live preview built for sign-off (`Orbit — cosmic dashboard preview` artifact). Awaiting approval on **name** + **direction** before Phase-6 implementation begins.
