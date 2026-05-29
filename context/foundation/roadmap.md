---
project: "# TODO: project — see Open Questions"
version: 1
status: draft
created: 2026-05-26
updated: 2026-05-29
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
---

# Roadmap: Fridge Explorer

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A hard-working professional needs a way to turn what's already in the fridge and pantry into a balanced daily meal plan hitting a calorie target — without requiring a store trip. Existing tools go "plan → shopping list → cook"; this app reverses the flow: "what I already have → coordinated daily meals that hit my target." The product's distinguishing trait — the one thing that, if removed, makes it indistinguishable from a generic meal planner — is that meal suggestions are constrained to ingredients already available at home.

## North star

**S-01: Full-day meal set generation from supplies** — the smallest end-to-end flow that proves the core product hypothesis (available ingredients → balanced daily plan hitting calorie target). Placed first because everything else — auth, observability, plan management — only matters if this works.

> "North star" here means: the single slice whose successful delivery would prove the product's core hypothesis. It's placed as early as its prerequisites allow because all other slices are refinements that only matter if this one works.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | email-magic-link-auth | (foundation) email magic-link auth replaces JWT scaffold; data tied to email identity | — | FR-012, FR-013, Access Control | done |
| F-02 | basic-observability | (foundation) product metrics in place: confirmed user count, per-user request volume | F-01 | NFR-04 | done |
| S-01 | daily-meal-set-generation | user can see 2–3 coordinated full-day meal sets from available supplies and pick one | — | US-01, FR-006, FR-007, FR-008, FR-010, FR-011 | done |
| S-02 | setup-and-preferences | user can set calorie target and dietary disallow-list | — | FR-001, FR-002, FR-003 | ready |
| S-03 | supply-management | user can add supplies via category checklists or natural language text and see them reduced when a meal is picked | — | FR-004, FR-005, FR-012 | done |
| S-04 | plan-management | user can re-pick from generated options without regeneration, or explicitly regenerate | S-01 | FR-014, FR-015 | proposed |
| S-05 | snack-lookup | user can view available snack options from current supplies at any time | S-03 | FR-009, FR-011 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Core meal planning | `S-02` / `S-03` → `S-01` → `S-04` | Main validation track — proves the product hypothesis. `S-02` and `S-03` are parallel prerequisites for `S-01`. |
| B | Auth & observability | `F-01` → `F-02` | Enables multi-device access and usage monitoring. Independent of Stream A until integration. |
| C | Snack lookup | `S-03` → `S-05` | Lightweight add-on once supplies exist. Joins Stream A at `S-03`. |

## Baseline

What's already in place in the codebase as of 2026-05-26 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next.js 16 + React 19 + Tailwind CSS 4; custom pages (plan, settings, supplies) with business logic
- **Backend / API:** present — 7 custom API route handlers (auth, settings, supplies, meal generation, cron)
- **Data:** present — @upstash/redis as sole data store; no schema files or migrations
- **Auth:** partial — custom JWT via jose (createSessionToken, verifySession in src/lib/auth.ts); no middleware.ts, no email provider
- **Deploy / infra:** partial — Vercel-linked (vercel.json with cron); no CI/CD pipeline, no IaC
- **Observability:** absent — no logging library, no error tracking, no metrics

## Foundations

### F-01: Email magic-link auth

- **Outcome:** (foundation) email magic-link authentication replaces the existing JWT scaffold; user data is tied to email identity and survives device resets.
- **Change ID:** email-magic-link-auth
- **PRD refs:** FR-012, FR-013, Access Control
- **Unlocks:** S-01 (multi-device access to generated plans), S-04 (persisted options tied to identity), F-02 (observability needs confirmed-email user count)
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Email delivery reliability on free-tier providers could cause friction during sign-in; sequenced as foundation because all data persistence depends on stable identity.
- **Status:** done

### F-02: Basic observability

- **Outcome:** (foundation) product metrics in place: number of users with confirmed emails, number of requests issued per user — visible to the developer for monitoring usage patterns and token costs.
- **Change ID:** basic-observability
- **PRD refs:** NFR-04
- **Unlocks:** S-01 (token cost monitoring during meal generation), S-04 (regeneration cost tracking)
- **Prerequisites:** F-01
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced after F-01 because "confirmed email count" requires email auth to exist; low implementation risk given Vercel's built-in analytics or lightweight custom counters in Redis.
- **Status:** done

## Slices

### S-01: Full-day meal set generation

- **Outcome:** user can see 2–3 coordinated full-day meal sets (breakfast + lunch + dinner) from available supplies, respecting calorie target and disallow-list, and pick one set to lock the day's plan.
- **Change ID:** daily-meal-set-generation
- **PRD refs:** US-01, FR-006, FR-007, FR-008, FR-010, FR-011
- **Prerequisites:** —
- **Parallel with:** S-02, S-03, F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — the riskiest slice because it exercises the AI generation logic end-to-end. Sequenced first because market-feedback goal demands validating the core hypothesis before investing in surrounding features. The existing `/api/generate-meals` route provides a starting point.
- **Status:** done

### S-02: Setup and preferences

- **Outcome:** user can set a daily calorie target and dietary disallow-list, and update them at any time (changes apply to next day's plan, not current).
- **Change ID:** setup-and-preferences
- **PRD refs:** FR-001, FR-002, FR-003
- **Prerequisites:** —
- **Parallel with:** S-01, S-03, F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — settings page already exists in the codebase. This slice formalizes the contract (calorie target + disallow-list shape) that S-01's generation logic consumes.
- **Status:** ready

### S-03: Supply management

- **Outcome:** user can add supplies via category-based checklists or natural language text input (minimal typing) and see supplies reduced when a meal is picked.
- **Change ID:** supply-management
- **PRD refs:** FR-004, FR-005, FR-012
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, F-01
- **Blockers:** —
- **Unknowns:**
  - How does approximate inventory tracking work without quantities? — Owner: user. Block: no (MVP accepts imprecision per PRD; design can be resolved during implementation).
- **Risk:** The "reduce supplies" mechanism at category level is under-specified (Open Question #4), but PRD explicitly accepts imprecision for MVP. Sequenced parallel with S-01 because generation needs supplies to exist.
- **Status:** done

### S-04: Plan management (re-pick and regenerate)

- **Outcome:** user can change their pick to a different option from the already-generated set without triggering regeneration, or explicitly request a fresh set of options.
- **Change ID:** plan-management
- **PRD refs:** FR-014, FR-015
- **Prerequisites:** S-01
- **Parallel with:** F-02, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires S-01 to persist all generated options (not just the picked one). Low technical risk but depends on S-01's data model for generated sets.
- **Status:** proposed

### S-05: Snack lookup

- **Outcome:** user can view available snack options from current supplies at any time, independent of the daily meal plan.
- **Change ID:** snack-lookup
- **PRD refs:** FR-009, FR-011
- **Prerequisites:** S-03
- **Parallel with:** S-04, F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — snacks are independent of main meal coordination. Depends on S-03 only because it reads from the supplies inventory.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | email-magic-link-auth | Implement email magic-link authentication | yes | Replaces existing JWT scaffold |
| F-02 | basic-observability | Add basic product observability (user count, request volume) | no | Depends on F-01 |
| S-01 | daily-meal-set-generation | Full-day meal set generation from supplies | yes | North star — plan first |
| S-02 | setup-and-preferences | Calorie target and disallow-list setup | yes | Parallel with S-01 |
| S-03 | supply-management | Category-based supply management with auto-reduction | yes | Parallel with S-01 |
| S-04 | plan-management | Re-pick from generated options / explicit regeneration | no | Depends on S-01 |
| S-05 | snack-lookup | Independent snack lookup from supplies | no | Depends on S-03 |

## Open Roadmap Questions

1. **Project name?** — Owner: user. Block: roadmap-wide (affects deployment, branding, but not planning).
2. **How does approximate inventory tracking work without quantities?** — Owner: user. Block: no (S-03 can proceed with imprecise model per PRD; refinement is post-MVP).
3. **Should supply input support barcode scanning or AI-powered photo recognition?** — Owner: user. Block: no (post-MVP; current MVP uses manual category checklists).

## Parked

- **Category-level shopping guidance** — Why parked: PRD §Non-Goals + Open Question #2; decide after MVP core loop is validated.
- **Resupply nudges based on quantity tracking** — Why parked: depends on resolving Open Question #4 (approximate tracking mechanism); nice-to-have, not must-have for MVP.
- **Barcode scanning / AI photo recognition for supply input** — Why parked: PRD Open Question #5; post-MVP exploration after manual checklists are validated.
- **Voice dictation for supply input** — Why parked: PRD Open Question #5; progressive enhancement over text-based natural language input (FR-012). Web Speech API has browser compat limits (Chrome/Edge only) and food-name transcription accuracy risks. Add as mic button feeding same LLM parsing pipeline once text input is validated.
- **Multi-user / family meal coordination** — Why parked: PRD §Non-Goals; MVP is single user only.
- **Custom recipe database** — Why parked: PRD §Non-Goals; recipes come from curated/external source.
- **Offline-first capability** — Why parked: PRD §Non-Goals; requires internet connection.
- **Precise macro/micronutrient tracking** — Why parked: PRD §Non-Goals; variety across food groups, not clinical analysis.

## Done

- **F-01: Email magic-link auth** — Archived 2026-05-29 → `context/archive/2026-05-26-email-magic-link-auth/`. Lesson: —.
- **F-02: Basic observability** — Archived 2026-05-29 → `context/archive/2026-05-27-basic-observability/`. Lesson: —.
- **S-01: Full-day meal set generation** — Archived 2026-05-28 → `context/archive/2026-05-27-daily-meal-set-generation/`. Lesson: —.
- **S-03: Supply management** — Archived 2026-05-29 → `context/archive/2026-05-28-supply-management/`. Lesson: serial-await in serverless, confirm destructive mutations.

