# Critical-Path Generation Constraints — Plan Brief

> Full plan: `context/changes/testing-critical-path-constraints/plan.md`
> Research: `context/changes/testing-critical-path-constraints/research.md`

## What & Why

The LLM-powered meal generation has zero programmatic validation of constraint compliance. The prompt says "never include these foods" and "approximately X kcal" but nothing checks the output. This plan creates a post-generation validator and proves it works via unit + integration tests — the cheapest tests that give real signal for these risks.

## Starting Point

`generateMealPlan` in `src/lib/generate.ts` is a pure async function that parses LLM JSON and validates structure (ingredients have names, amounts, valid units). It has no constraint checking and no test infrastructure exists in the project at all.

## Desired End State

`npm test` runs Vitest and passes. A `validateMealPlanConstraints` function catches disallow-list violations and calorie overshoots before they reach the user. The generation pipeline returns null (with a logged warning) on any constraint breach. Cookbook patterns in test-plan.md document how to add future tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Violation behavior | Return null + console.warn | Matches existing fail-closed convention; adds observability without new UI states | Plan |
| Calorie tolerance | 10% over mainCalories | Accommodates LLM rounding from "approximately" without allowing major overshoot | Plan |
| Disallow-list matching | Case-insensitive substring | Catches variants like "Red Onion" when "onion" is blocked; simplest approach with acceptable false-positive tradeoff | Plan |
| Calorie validation scope | Sum consistency (±20 kcal) AND target cap | Catches both fabricated totals and genuine overshoots — two distinct failure modes | Plan |
| Snack validation | Excluded this phase | Snack calorie rules are softer; keeps scope tight on the two named risks | Plan |
| CI wiring | Deferred to Phase 4 | Test plan §5 assigns CI gates to rollout Phase 4 | Research |

## Scope

**In scope:**
- Vitest installation and configuration with `@/` path alias
- `validateMealPlanConstraints` function (disallow-list + calorie checks on meal sets)
- Unit tests covering all constraint scenarios
- Integration test with mocked fetch proving the full pipeline rejects violations
- test-plan.md §6 cookbook update

**Out of scope:**
- CI pipeline configuration
- Snack validation
- Retry logic on violation
- User-facing error messages beyond "Failed to generate"
- Compound disallow-list parsing ("seafood except fish")

## Architecture / Approach

New module `src/lib/validate-constraints.ts` exports a pure synchronous function. It's called inside `generateMealPlan` after structural validation, before the return. Single insertion point covers both user-initiated and cron invocation paths. Tests live in `src/lib/__tests__/` and mock `global.fetch` for integration scenarios.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Bootstrap Test Infrastructure | Vitest installed, configured, running with path aliases | Config mismatch with Next.js build |
| 2. Create Constraint Validator | Pure function enforcing disallow-list + calorie rules | Over/under-matching on substring check |
| 3. Unit Tests for Validator | Exhaustive test coverage of all constraint scenarios | Missing edge cases |
| 4. Wire Validator + Integration Test | Validator integrated into pipeline; full-path test with mocked LLM | Mock shape drift from real OpenAI response |
| 5. Update §6 Cookbook | Documented patterns for future test authors | — |

**Prerequisites:** None — project has all needed source code and types in place.
**Estimated effort:** ~2 sessions across 5 phases.

## Open Risks & Assumptions

- Substring matching will over-match in rare cases ("ice" blocks "rice") — accepted per design decision; users can be more specific
- 10% calorie tolerance may need tuning once real violation frequency is observed
- `console.warn` is the only logging available — adequate for single-user MVP

## Success Criteria (Summary)

- `npm test` passes with unit + integration tests covering both risks
- A meal set with a disallowed ingredient is programmatically rejected before reaching the user
- A meal set exceeding calorie target by >10% is programmatically rejected
