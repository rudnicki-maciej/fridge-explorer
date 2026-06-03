# Critical-Path Generation Constraints — Implementation Plan

## Overview

Bootstrap test infrastructure (Vitest) and implement post-generation constraint validation for meal sets, proving programmatically that disallow-list violations and calorie overshoots are caught before reaching the user. This is Phase 1 of the test-plan.md rollout, covering Risks #1 and #2.

## Current State Analysis

- `generateMealPlan` in `src/lib/generate.ts` relies entirely on prompt instructions for constraint compliance. Temperature 0.8 adds randomness.
- `validateIngredients` (lines 36-51) checks structural correctness only — never constraint compliance.
- Both invocation paths (user-initiated POST and cron pre-generation) call the same function — a single validator insertion covers all.
- Zero test infrastructure: no vitest, no test files, no config.
- The `@/*` path alias maps to `./src/*` via tsconfig paths.
- No logging utility — only `console.warn` available.

### Key Discoveries:

- `src/lib/generate.ts:164-180` — structural validation loop is the insertion point for constraint checks
- `src/types.ts` — `MealSet`, `Snack`, `Ingredient`, `UserSettings` are well-typed interfaces
- `eslint.config.mjs` — eslint-config-next won't conflict with test files
- OpenAI call uses native `fetch` — integration tests will mock `global.fetch`

## Desired End State

After this plan is complete:
- `npm test` runs vitest and passes
- A `validateMealPlanConstraints` function exists that rejects meal sets containing disallowed ingredients or exceeding calorie limits
- `generateMealPlan` returns `null` (with a logged warning) when the LLM output violates constraints
- Unit tests cover all constraint enforcement scenarios
- An integration test proves the full pipeline rejects violating LLM responses

Verification: `npm test` passes with all constraint scenarios covered.

## What We're NOT Doing

- CI pipeline wiring (deferred to rollout Phase 4)
- Snack validation (scoped to meal sets only)
- Retry logic on violation (future enhancement once violation frequency is known)
- User-facing violation messages (user sees generic "Failed to generate")
- Compound disallow-list parsing ("seafood except fish") — simple substring match only

## Implementation Approach

Create a pure validator function in a separate module, unit-test it exhaustively, then wire it into the existing generation pipeline. The validator returns the validated result on success or `null` on failure (matching the existing null-on-failure convention). Violations are logged via `console.warn` for developer observability.

## Phase 1: Bootstrap Test Infrastructure

### Overview

Install Vitest and create the minimal configuration needed to run tests with the project's `@/` path alias.

### Changes Required:

#### 1. Install Vitest

**Intent**: Add vitest as a dev dependency so tests can run locally.

**Contract**: `npm install -D vitest` — adds `vitest` to `devDependencies` in `package.json`.

#### 2. Create vitest config

**File**: `vitest.config.ts`

**Intent**: Configure vitest to resolve the `@/` path alias matching tsconfig paths.

**Contract**: Export a `defineConfig` from `vitest/config` with `resolve.alias` mapping `@/` to `new URL('./src/', import.meta.url).pathname`.

#### 3. Add test script

**File**: `package.json`

**Intent**: Add a `test` script so `npm test` runs vitest.

**Contract**: Add `"test": "vitest run"` to the `scripts` object.

#### 4. Verify with smoke test

**File**: `src/lib/__tests__/smoke.test.ts`

**Intent**: Confirm vitest runs, path aliases resolve, and the test script works.

**Contract**: A single `expect(true).toBe(true)` test that imports from `@/types` to verify alias resolution. Delete after Phase 3 adds real tests.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with the smoke test passing
- `npm run lint` still passes (no ESLint conflicts with test files)
- `npm run build` still passes (vitest config doesn't interfere with Next.js build)

---

## Phase 2: Create Constraint Validator

### Overview

Implement the `validateMealPlanConstraints` function as a pure, synchronous function with no external dependencies — making it trivially unit-testable.

### Changes Required:

#### 1. Validator module

**File**: `src/lib/validate-constraints.ts`

**Intent**: Export a function that checks meal sets against disallow-list and calorie constraints. On violation, log the details and return `null`. On success, return the input unchanged.

**Contract**:

```typescript
export function validateMealPlanConstraints(
  result: { mealSets: MealSet[]; snacks: Snack[] },
  settings: UserSettings,
): { mealSets: MealSet[]; snacks: Snack[] } | null
```

Validation rules (checked per meal set):
- **Disallow-list**: For each disallow-list item and each ingredient in breakfast/lunch/dinner, case-insensitive substring match. Any hit → violation.
- **Sum consistency**: `breakfast.calories + lunch.calories + dinner.calories` must equal `set.totalCalories` within ±20 kcal.
- **Calorie cap**: `set.totalCalories` must be ≤ `mainCalories × 1.10` where `mainCalories = settings.dailyCalorieTarget - 400`.

On first violation found: `console.warn` with the violation type, the offending value, and the constraint that was breached. Return `null`.

On all checks passing: return the original `result` object unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes (module compiles, types are correct)
- `npm run lint` passes

---

## Phase 3: Unit Tests for Validator

### Overview

Exhaustively test `validateMealPlanConstraints` against all constraint scenarios — happy path, violations, and edge cases.

### Changes Required:

#### 1. Unit test file

**File**: `src/lib/__tests__/validate-constraints.test.ts`

**Intent**: Cover all constraint enforcement scenarios with focused unit tests. Each test constructs a minimal `MealSet[]` fixture and asserts the validator's return value.

**Contract**: Test cases covering:

**Disallow-list enforcement:**
- Meal set with no disallowed ingredients → returns result
- Ingredient name contains disallowed item as substring (e.g., "Red Onion" with "onion" blocked) → returns null
- Case mismatch (e.g., "PEANUT" blocked, ingredient "Peanut Butter") → returns null
- Empty disallow-list → returns result (no check needed)
- Disallow item that is a substring of a safe ingredient (e.g., "ice" blocked — "rice" would be caught — this is accepted behavior per design decision)

**Calorie sum consistency:**
- Meal calories sum equals totalCalories → returns result
- Meal calories sum differs from totalCalories by > 20 kcal → returns null
- Meal calories sum differs by exactly 20 kcal → returns result (boundary)

**Calorie target cap:**
- totalCalories exactly at mainCalories × 1.10 → returns result (boundary)
- totalCalories 1 kcal above mainCalories × 1.10 → returns null
- totalCalories below mainCalories → returns result

**Multiple meal sets:**
- First set valid, second set violates → returns null (any single violation rejects the whole result)

### Success Criteria:

#### Automated Verification:

- `npm test` passes with all test cases green
- No skipped or pending tests

---

## Phase 4: Wire Validator + Integration Test

### Overview

Insert the validator into the generation pipeline and prove the full path rejects violating LLM responses via a mocked fetch integration test.

### Changes Required:

#### 1. Wire validator into generateMealPlan

**File**: `src/lib/generate.ts`

**Intent**: Call `validateMealPlanConstraints` after the structural validation loop and before the return statement. If it returns null, the function returns null (existing callers already handle this).

**Contract**: Import `validateMealPlanConstraints` from `@/lib/validate-constraints`. Insert call between the snack validation loop (line ~180) and the `recordGeneration` call. Pass `parsed` and `settings` as arguments. If validator returns null, return null from `generateMealPlan`.

#### 2. Integration test with mocked fetch

**File**: `src/lib/__tests__/generate.integration.test.ts`

**Intent**: Prove that `generateMealPlan` returns null when the LLM response contains constraint violations, without making real API calls.

**Contract**: Mock `global.fetch` to return a shaped OpenAI-format response with known violations. Test cases:

- LLM response with a disallowed ingredient → `generateMealPlan` returns null
- LLM response with totalCalories exceeding target × 1.10 → returns null
- LLM response within all constraints → returns the parsed result
- Structural validation failure (malformed ingredients) still returns null (existing behavior preserved)

Set `process.env.OPENAI_API_KEY` in test setup to bypass the early null return.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with all integration tests green
- `npm run build` passes (generate.ts still compiles with the new import)
- `npm run lint` passes

#### Manual Verification:

- Run `npm run dev`, trigger a generation, confirm it still works with real LLM responses (LLM usually complies, so expect success)

---

## Phase 5: Update test-plan.md §6 Cookbook

### Overview

Fill in the cookbook patterns so future test authors know how to add tests in this project.

### Changes Required:

#### 1. Update §6.1 — Adding a unit test

**File**: `context/foundation/test-plan.md`

**Intent**: Document the unit test pattern shipped in Phase 3 — file location, naming convention, fixture construction, and run command.

**Contract**: Replace the TBD placeholder in §6.1 with: test file location convention (`src/lib/__tests__/<module>.test.ts`), how to construct `MealSet` fixtures inline, assertion pattern (returns result vs returns null), and run command (`npm test`).

#### 2. Update §6.2 — Adding an integration test

**File**: `context/foundation/test-plan.md`

**Intent**: Document the integration test pattern shipped in Phase 4 — how to mock `global.fetch` for OpenAI responses, file naming, and environment variable setup.

**Contract**: Replace the TBD placeholder in §6.2 with: integration test file naming (`*.integration.test.ts`), `global.fetch` mocking pattern with `vi.fn()`, OpenAI response shape, env var setup in `beforeEach`, and run command.

### Success Criteria:

#### Automated Verification:

- `npm run build` passes (no accidental edits to source)
- §6.1 and §6.2 in test-plan.md are no longer TBD

---

## Testing Strategy

### Unit Tests:

- Validator function in isolation — all constraint scenarios
- Edge cases: empty arrays, boundary values, case sensitivity

### Integration Tests:

- Full `generateMealPlan` pipeline with mocked OpenAI responses
- Proves validator is correctly wired (not just tested in isolation)
- Confirms existing structural validation still works

### Manual Testing Steps:

1. Run `npm run dev` and trigger a meal plan generation
2. Confirm it still returns valid plans (LLM usually complies with prompt)
3. Check browser console/server logs — no warnings should appear on compliant responses

## References

- Research: `context/changes/testing-critical-path-constraints/research.md`
- Generation function: `src/lib/generate.ts:119-186`
- Types: `src/types.ts:23-28` (UserSettings), `src/types.ts:30-36` (MealSet)
- Test plan: `context/foundation/test-plan.md` §2 Risks #1, #2

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Test Infrastructure

#### Automated

- [x] 1.1 `npm test` exits 0 with smoke test passing — f7ff150
- [x] 1.2 `npm run lint` passes — f7ff150
- [x] 1.3 `npm run build` passes — f7ff150

### Phase 2: Create Constraint Validator

#### Automated

- [x] 2.1 `npm run build` passes (module compiles)
- [x] 2.2 `npm run lint` passes

### Phase 3: Unit Tests for Validator

#### Automated

- [ ] 3.1 `npm test` passes with all constraint test cases green

### Phase 4: Wire Validator + Integration Test

#### Automated

- [ ] 4.1 `npm test` passes with all integration tests green
- [ ] 4.2 `npm run build` passes
- [ ] 4.3 `npm run lint` passes

#### Manual

- [ ] 4.4 Generation still works with real LLM via `npm run dev`

### Phase 5: Update test-plan.md §6 Cookbook

#### Automated

- [ ] 5.1 `npm run build` passes
- [ ] 5.2 §6.1 and §6.2 are no longer TBD
