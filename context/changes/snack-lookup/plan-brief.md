# Snack Lookup — Plan Brief

> Full plan: `context/changes/snack-lookup/plan.md`
> Research: `context/changes/snack-lookup/research.md`

## What & Why

Users need to browse snack suggestions from their current supplies at any time, independent of the daily meal plan. Currently snacks are only generated as a side-effect of meal generation and disappear on page refresh. This feature gives snacks their own dedicated page and generation flow (PRD FR-009, FR-011).

## Starting Point

Snacks are generated coupled to meals in a single LLM call (`generateMealPlan()`). The `Snack` type, `validateIngredients()`, and `formatSupplies()` helpers all exist. There's no `/snacks` page, no snack API endpoint, and no persistent snack storage.

## Desired End State

A `/snacks` page where users see cached snack suggestions instantly on load, can generate fresh suggestions with one click, and browse 4 snack options (~200 kcal each) built from their current supplies. View-only — no supply deduction.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Persistence | localStorage + refresh button | Instant revisits without redundant LLM calls; matches existing storage pattern | Plan |
| Supply deduction | No — view-only | PRD says "view available options"; snacks are suggestions, not commitments | Plan |
| Snack count | 4 per request | Consistent with existing meal generation output | Plan |
| Coupling to plan page | Independent | PRD FR-009 explicitly says "independent of the daily meal plan" | Research |

## Scope

**In scope:**
- Standalone `generateSnacks()` function
- `POST /api/generate-snacks` endpoint
- `/snacks` page with generate, refresh, and cached display
- Nav link addition

**Out of scope:**
- Supply deduction / "I ate this" tracking
- Server-side Redis persistence for snacks
- Cron pre-generation
- Coupling to plan page snack state

## Architecture / Approach

Extract snack generation from the existing meal prompt into a standalone function. Expose via a new POST endpoint following the same auth + validation pattern. Build a simple client page that reads supplies/settings from existing hooks, calls the API, and persists results in localStorage.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Generation & API | `generateSnacks()` + POST endpoint | LLM prompt quality for standalone snacks |
| 2. Snacks page | Full UI with localStorage persistence | None significant |
| 3. Navigation | Nav link + polish | None |

**Prerequisites:** S-03 (supply management) — already done.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- LLM may return snacks using ingredients not exactly matching supply names (mitigated by same prompt constraints as meals)
- localStorage has no expiry — stale snacks shown if user doesn't click Refresh after changing supplies

## Success Criteria (Summary)

- User can generate 4 snack suggestions from current supplies via /snacks
- Snacks persist across page refreshes (localStorage)
- Feature is fully independent of the daily meal plan flow
