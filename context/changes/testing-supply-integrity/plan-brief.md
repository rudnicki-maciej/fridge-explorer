# Supply Integrity Tests — Plan Brief

> Full plan: `context/changes/testing-supply-integrity/plan.md`

## What & Why

Unit and integration tests proving that supply state remains accurate after picking meal sets (deduction math) and adding items via natural language (dedup merge). These cover test-plan risks #3 and #5 — the two supply-mutation paths where incorrect behavior corrupts inventory state or creates confusing duplicates.

## Starting Point

Deduction logic is inlined in a React component (`pickSet` in `src/app/plan/page.tsx`). Merge logic is inlined in a hook callback (`addItems` in `src/lib/storage.ts`). Neither is directly unit-testable. The NL parser (`src/lib/supplies-parser.ts`) is standalone but untested. Phase 1's test infrastructure (Vitest, `global.fetch` mocking, factory patterns) is established and working.

## Desired End State

A `src/lib/supply-math.ts` module exports pure `deductIngredients` and `mergeItems` functions. Both callers delegate to them. A unit test suite covers 9 edge cases across both functions. An integration test suite proves the parse→merge pipeline works end-to-end with a mocked LLM, and explicitly documents the known limitation when the LLM returns non-matching names.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|----------|--------|-------------------|
| Extraction scope | Both deduction + merge into shared `supply-math.ts` | Groups all supply-mutation logic in one testable module. |
| Deduction edge cases | 5 cases + immutability | Covers every branch in the algorithm; immutability prevents common JS mutation bugs. |
| NL dedup test strategy | Full parse→merge pipeline (not just merge function) | Tests actual behavior, not just the math — proves the pipeline works when LLM cooperates. |
| Merge edge cases | Match + new + mixed batch | Covers all branches including multi-item loop behavior. |
| LLM mock approach | `global.fetch` mock (Phase 1 pattern) | Consistent with existing project convention; no new dependencies. |
| Non-determinism handling | One negative-path test documenting known limitation | Acts as regression anchor for future fuzzy matching without over-testing current behavior. |

## Scope

**In scope:**
- Extract `deductIngredients` and `mergeItems` as pure functions
- Rewire component and hook to use them (no behavior change)
- Unit tests for deduction (5 cases + immutability) and merge (3 cases)
- Integration tests for NL parse→merge pipeline (2 happy + 1 known limitation)

**Out of scope:**
- Fuzzy/Levenshtein name matching
- Server-side dedup logic
- E2E browser tests
- Redis persistence tests (Risk #4)
- Refactoring `pickSet` beyond math extraction

## Architecture / Approach

Pure extraction refactor followed by test-writing. `supply-math.ts` becomes the single source of truth for supply mutations. The component and hook become thin orchestrators (confirm → delegate math → persist). Tests target the pure functions directly (unit) and the parser→function pipeline (integration with mocked OpenAI).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Extract supply-math module | Testable pure functions; callers rewired | Regression in pick or add-items flow if wiring is wrong |
| 2. Unit tests for deduction and merge | 9 test cases covering all branches | None — straightforward once extraction lands |
| 3. Integration tests for NL dedup | 3 pipeline tests including known-limitation doc | Mock shape coupling to OpenAI response format |

**Prerequisites:** Phase 1 testing infra (Vitest, existing test patterns) already in place.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Dedup relies on LLM returning exact matching names — this is a known, accepted limitation documented by a negative-path test
- Extraction assumes the inlined logic has no hidden dependencies on React state beyond the supplies dictionary (verified: it doesn't)

## Success Criteria (Summary)

- `npm test` passes with all new tests green alongside existing Phase 1 tests
- `npm run build` succeeds (no type errors from rewiring)
- The known-limitation test explicitly documents where the system stops protecting the user
