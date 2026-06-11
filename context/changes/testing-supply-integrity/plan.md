# Supply Integrity Tests Implementation Plan

## Overview

Unit and integration tests proving supply state remains accurate after meal-set picks (Risk #3) and NL supply additions (Risk #5). Requires extracting inlined mutation logic into a testable pure-function module before writing tests.

## Current State Analysis

- **Deduction logic** is inlined in `pickSet` closure inside `src/app/plan/page.tsx:74-93`. It flattens all meal ingredients, subtracts amounts by exact name match, and deletes entries at ≤0.
- **Merge logic** is inlined in `addItems` callback inside `useSupplies` hook (`src/lib/storage.ts:107-116`). Exact name match → sum amounts; no match → add new entry.
- **NL parser** (`src/lib/supplies-parser.ts`) calls OpenAI, validates/normalizes response, lowercases names. Existing items are passed as "unit consistency" context but no explicit dedup instruction to the LLM.
- **Testing infra** is established: Vitest 4, `global.fetch` mocking for OpenAI, factory functions, `vi.mock` for side-effect modules. Two test files exist from Phase 1.

### Key Discoveries:

- `src/app/plan/page.tsx:80-91` — deduction algorithm (spread → loop → subtract → delete if ≤0)
- `src/lib/storage.ts:107-116` — merge algorithm (exact match → sum, else → insert)
- `src/lib/supplies-parser.ts:55-63` — post-LLM validation (lowercase, trim, filter invalid)
- `src/lib/__tests__/generate.integration.test.ts:26-33` — `makeOpenAIResponse` helper pattern

## Desired End State

A `src/lib/supply-math.ts` module exports `deductIngredients` and `mergeItems` as pure functions. Both the page component and hook delegate to them. A unit test file covers deduction edge cases and merge edge cases. An integration test file proves the full parse→merge pipeline works when the LLM cooperates, and documents the known limitation when it doesn't.

Verification: `npm test` passes with all new tests green; existing tests remain green; `npm run build` succeeds.

## What We're NOT Doing

- No fuzzy/Levenshtein matching for supply names — the known limitation is documented, not fixed
- No server-side dedup logic — merge stays client-side as designed
- No E2E tests — unit + integration is the cheapest layer per test-plan §1
- No refactoring of `pickSet` beyond extracting the deduction math (confirm dialog, plan saving, UI state clearing stay in the component)
- No tests for `syncToServer` or Redis persistence — that's a different risk (#4)

## Implementation Approach

Extract → test → wire. Phase 1 creates the pure module and rewires callers. Phase 2 writes unit tests against the extracted functions. Phase 3 writes integration tests for the NL dedup pipeline. Each phase is independently verifiable.

## Phase 1: Extract supply-math module

### Overview

Pull deduction and merge logic into a standalone pure-function module. Rewire the component and hook to call it. No behavior change — pure refactor.

### Changes Required:

#### 1. New module

**File**: `src/lib/supply-math.ts`

**Intent**: Create two pure functions — `deductIngredients(supplies, ingredients)` returns new Supplies with amounts subtracted (items at ≤0 removed, missing items skipped), and `mergeItems(supplies, items)` returns new Supplies with matching items summed and new items added. Neither mutates the input.

**Contract**:
```typescript
export function deductIngredients(supplies: Supplies, ingredients: Ingredient[]): Supplies
export function mergeItems(supplies: Supplies, items: { name: string; amount: number; unit: SupplyUnit }[]): Supplies
```

#### 2. Rewire pickSet

**File**: `src/app/plan/page.tsx`

**Intent**: Replace the inlined deduction loop with a call to `deductIngredients`. Import from `@/lib/supply-math`. The `pickSet` closure still orchestrates confirm → save → deduct → clear, but delegates the math.

**Contract**: `const next = deductIngredients(supplies, usedIngredients);` replaces lines 82-91.

#### 3. Rewire addItems hook

**File**: `src/lib/storage.ts`

**Intent**: Replace the inlined merge loop inside `addItems` callback with a call to `mergeItems`. Import from `@/lib/supply-math`.

**Contract**: `const next = mergeItems(prev, items);` replaces lines 108-114 inside the `setSupplies` updater.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Existing tests pass: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Pick a meal set on the plan page → supplies decrease correctly
- Add supplies via NL text → existing items merge, new items appear

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit tests for deduction and merge

### Overview

Write unit tests for `deductIngredients` and `mergeItems` covering all agreed edge cases plus immutability.

### Changes Required:

#### 1. Unit test file

**File**: `src/lib/__tests__/supply-math.test.ts`

**Intent**: Test `deductIngredients` with 5 edge cases + 1 immutability assertion, and `mergeItems` with 3 edge cases. Use inline factory functions following Phase 1 pattern.

**Contract**: Test cases for `deductIngredients`:
1. Normal deduction across multiple ingredients — amounts reduced correctly
2. Same ingredient in multiple meals — sequential subtraction (e.g., 200g used twice from 500g → 100g remaining)
3. Exact zero → item removed from result
4. Ingredient not in supplies → silently skipped, other deductions still apply
5. Over-deduction (ingredient.amount > supply.amount) → item removed
6. Immutability — original supplies object is not mutated

Test cases for `mergeItems`:
1. Existing item matched → amounts summed, original unit preserved
2. New item not in supplies → added as new entry
3. Batch with mix of matching and new items in one call

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`
- No type errors: `npm run build`

#### Manual Verification:

- None required — pure function tests are self-verifying.

**Implementation Note**: No manual pause needed. Proceed to Phase 3 after automated verification passes.

---

## Phase 3: Integration tests for NL dedup pipeline

### Overview

Write integration tests proving the full `parseSuppliesText` → `mergeItems` pipeline works, plus a negative-path test documenting the known limitation when the LLM returns a non-matching name.

### Changes Required:

#### 1. Integration test file

**File**: `src/lib/__tests__/supply-dedup.integration.test.ts`

**Intent**: Mock OpenAI via `global.fetch` (Phase 1 pattern). Test the full parse→merge pipeline: call `parseSuppliesText` with existing items context, feed result into `mergeItems`, assert final supplies state. Include one known-limitation test.

**Contract**: Test cases:
1. **Happy path merge** — Existing supply: `"chicken breast": {amount: 300, unit: "g"}`. Mock LLM returns `{items: [{name: "chicken breast", amount: 200, unit: "g"}]}`. After parse→merge, assert single entry with amount 500.
2. **New item via NL** — No matching existing item. Mock LLM returns new item. After parse→merge, assert new entry added alongside existing supplies.
3. **Known limitation: non-matching name creates duplicate** — Existing: `"chicken breast"`. Mock LLM returns `"chicken"` (near-synonym). After parse→merge, assert TWO separate entries exist. Test named descriptively: `` `creates duplicate entry when LLM returns non-matching name (known limitation)` ``.

Mock setup: `makeOpenAIResponse({items: [...]})` helper (reuse pattern from `generate.integration.test.ts`). Set `process.env.OPENAI_API_KEY = "test-key"` in `beforeEach`. Restore `global.fetch` in `afterEach`.

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`
- No type errors: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- None required — integration tests with mocked LLM are self-verifying.

**Implementation Note**: No manual pause needed. After all tests pass, the phase is complete.

---

## Testing Strategy

### Unit Tests:

- `deductIngredients`: 5 edge cases + 1 immutability assertion
- `mergeItems`: 3 edge cases (match, new, mixed batch)

### Integration Tests:

- NL parse→merge happy path (matching name → merge)
- NL parse→merge new item (no match → add)
- Known limitation negative path (non-matching name → duplicate documented)

### Manual Testing Steps:

1. Pick a meal set → verify supply amounts decrease in the UI
2. Add supplies via NL text that overlap with existing → verify merge (not duplicate)

## References

- Test plan: `context/foundation/test-plan.md` (§3 Phase 2, Risk Response #3 and #5)
- Phase 1 test patterns: `src/lib/__tests__/generate.integration.test.ts`
- Deduction source: `src/app/plan/page.tsx:74-93`
- Merge source: `src/lib/storage.ts:107-116`
- Parser source: `src/lib/supplies-parser.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract supply-math module

#### Automated

- [x] 1.1 Build passes: `npm run build` — 400ca94
- [x] 1.2 Existing tests pass: `npm test` — 400ca94
- [x] 1.3 Lint passes: `npm run lint` — 400ca94

#### Manual

- [x] 1.4 Pick a meal set → supplies decrease correctly — 400ca94
- [x] 1.5 Add supplies via NL text → existing items merge, new items appear — 400ca94

### Phase 2: Unit tests for deduction and merge

#### Automated

- [x] 2.1 All tests pass: `npm test` — b8bc1e2
- [x] 2.2 No type errors: `npm run build` — b8bc1e2

### Phase 3: Integration tests for NL dedup pipeline

#### Automated

- [x] 3.1 All tests pass: `npm test` — f4f5fea
- [x] 3.2 No type errors: `npm run build` — f4f5fea
- [x] 3.3 Lint passes: `npm run lint` — f4f5fea
