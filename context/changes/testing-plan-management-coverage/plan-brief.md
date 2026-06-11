# Plan-Management Test Coverage (Phase 5) — Plan Brief

> Full plan: `context/changes/testing-plan-management-coverage/plan.md`

## What & Why

Add automated test coverage for the three remaining plan-management risks from the test plan's Phase 5: stale options from timezone date bug (#8), double-deduction on re-pick (#9), and reset failing to show options/error (#10). These are the last uncovered high/medium-impact risks before the test floor is complete.

## Starting Point

- Route tests for `/api/plan/today` exist but never exercise the `?options=true` branch.
- `supply-math.test.ts` covers deduct/restore individually and a symmetric round-trip, but not the asymmetric repick sequence (deduct A → restore A → deduct B).
- No component tests exist for `page.tsx` — React Testing Library is not yet installed.
- Vitest is configured but only for node environment (no jsdom).

## Desired End State

`npm test` runs new tests that prove: (1) `?options=true` returns correct results at UTC date boundaries, (2) repick yields `original − newSet` only (not double-deducted), (3) reset restores supplies and surfaces options or an error message.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Timezone simulation | `vi.setSystemTime()` at UTC boundaries | Proves the route's actual behavior at date edges without production code changes. | Plan |
| Risk #9 test shape | Component integration test (RTL) | Tests the real orchestration of hooks + supply-math composition, not just isolated functions. | Plan |
| Risk #10 test shape | Full component test with mocked fetch | Proves the async fetch-after-reset path and error display in one test. | Plan |
| Guard path for empty deductedIngredients | Include as extra test case | Cheap to add; covers a real code path that could mask double-deduction. | Plan |

## Scope

**In scope:**
- React Testing Library + jsdom setup in Vitest
- Route tests for `?options=true` with date boundary mocking
- Component tests for `repickSet` and `resetPlan` flows
- Guard-path test for empty `deductedIngredients`

**Out of scope:**
- Fixing the timezone bug itself
- Refactoring page.tsx to extract logic
- E2E/Playwright tests
- UI visual/layout testing

## Architecture / Approach

Three layers: (1) install RTL + configure jsdom environment in Vitest, (2) extend existing route test file with `?options=true` cases using `vi.setSystemTime()`, (3) new component test file mocking storage hooks and fetch to verify supply-state mutations and DOM feedback.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. RTL Setup | Working component test infrastructure | Vitest jsdom env config may conflict with existing node-env tests |
| 2. Route Tests (#8) | `?options=true` boundary coverage | `vi.useFakeTimers` interactions with async route handler |
| 3. Component Tests (#9, #10) | Repick + reset integration coverage | Mocking storage hooks correctly while preserving state flow |

**Prerequisites:** None — all work is additive test infrastructure + test files.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Assumes `@testing-library/react` v16 works with React 19 — likely yes given React 19 has been stable for months.
- Component tests mock the storage hooks rather than localStorage directly — if hook internals change, tests need updating.

## Success Criteria (Summary)

- `npm test` passes with all new tests green
- Risk #8: UTC boundary cases prove 200 vs 404 behavior
- Risks #9/#10: Component tests prove correct supply mutations and UI feedback after repick/reset
