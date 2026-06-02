---
date: 2026-06-02T20:42:00+02:00
researcher: kiro
git_commit: 89da3c14835a491d8ca5e8f184fd245e898093a1
branch: main
repository: fridge-explorer
topic: "Ground generation constraint enforcement for disallow-list and calorie target"
tags: [research, codebase, generation, constraints, testing]
status: complete
last_updated: 2026-06-02
last_updated_by: kiro
---

# Research: Generation Constraint Enforcement for Disallow-List and Calorie Target

**Date**: 2026-06-02T20:42:00+02:00
**Researcher**: kiro
**Git Commit**: 89da3c14835a491d8ca5e8f184fd245e898093a1
**Branch**: main
**Repository**: fridge-explorer

## Research Question

Ground the real failure paths for Risk #1 (disallow-list violation) and Risk #2 (calorie target exceeded). Verify whether post-generation validation exists, identify the cheapest test layer, and flag speculative risks.

## Summary

**Neither Risk #1 nor #2 is speculative. Both are confirmed gaps.**

The generation code (`src/lib/generate.ts`) includes prompt instructions telling the LLM to respect the disallow-list and calorie target, but performs **zero programmatic validation** of these constraints on the LLM output. The only post-parse validation is `validateIngredients` which checks structural correctness (name is string, amount > 0, unit is valid) — never constraint compliance.

The function is a pure async function with clear inputs/outputs, making it highly testable. However, testing the live LLM is non-deterministic and expensive. The cheapest layer is **unit tests on a post-generation validator function that does not yet exist** — which means Phase 1 must both create the validator and test it.

## Detailed Findings

### Generation Prompt Construction

`src/lib/generate.ts:120-144` — The `generateMealPlan` function builds the prompt:

- **Disallow-list**: Line 127 injects sanitized items: `NEVER include these foods: ${sanitizedDisallow.join(", ")}`
- **Calorie target**: Line 129 says `Each meal set must total approximately ${mainCalories} kcal` where `mainCalories = settings.dailyCalorieTarget - 400`
- The word "approximately" gives the LLM wiggle room — there is no hard tolerance defined

The prompt relies entirely on LLM compliance. Temperature is 0.8 (line 157), which adds randomness.

### Response Parsing and Validation

`src/lib/generate.ts:164-180` — After parsing JSON:

```typescript
for (const set of parsed.mealSets) {
  for (const key of ["breakfast", "lunch", "dinner"] as const) {
    const validated = validateIngredients(set[key].ingredients);
    if (!validated) return null;
    set[key].ingredients = validated;
  }
}
```

`validateIngredients` (lines 36-51) only checks:
- Array of objects
- Each has string `name`, numeric `amount > 0`, valid `unit`

**It does NOT check:**
- Whether any ingredient name matches a disallow-list item
- Whether `set.totalCalories` or individual `meal.calories` are within target
- Whether `meal.calories` values sum to `set.totalCalories`
- Whether ingredient names match actual supply names

### Disallow-List Flow (end-to-end)

1. User sets disallow-list in settings (stored in Redis as `user.settings.disallowList: string[]`)
2. `/api/generate-meals/route.ts:50` validates it's an array (no content validation)
3. `generateMealPlan` receives it via `settings.disallowList`
4. `src/lib/generate.ts:124-125` sanitizes: strips newlines, trims, caps at 50 chars
5. Injected into prompt as comma-separated string
6. LLM generates output — **no post-generation check**
7. Response returned to client as-is

**Failure mode**: If the LLM includes a disallowed ingredient (e.g., "onion" when "onion" is on the list), the system serves it without detection.

### Calorie Target Flow (end-to-end)

1. User sets `dailyCalorieTarget` (stored as number in Redis)
2. `/api/generate-meals/route.ts:46` validates it's a positive number
3. `generateMealPlan` computes `mainCalories = target - 400` (reserves 400 for snacks)
4. Prompt says "approximately" this many kcal
5. LLM returns `meal.calories` per meal and `set.totalCalories` per set
6. **No validation** that returned calorie values sum correctly or are within target
7. Response returned as-is

**Failure modes**:
- LLM returns meals whose individual `calories` fields don't sum to `totalCalories`
- `totalCalories` exceeds `mainCalories` (target minus snack reserve)
- Individual meal calorie values are fabricated (not calculated from ingredients)

### Two Invocation Paths

Both paths call the same `generateMealPlan` function — a single validator would cover both:

1. **User-initiated**: `POST /api/generate-meals` → `generateMealPlan(settings, supplies, email)` → direct response to client
2. **Cron pre-generation**: `POST /api/cron/generate` → iterates all users → `generateMealPlan(user.settings, user.supplies, userId)` → persists to `user.pregenerated`
3. **Plan serving**: `GET /api/plan/today` → serves `user.pregenerated` if hash matches, else calls `generateMealPlan` → persists and returns

### Existing Tests

Zero. No test runner, no test files, no test configuration anywhere in the project.

### `sanitizeName` Helper

`src/lib/generate.ts:15-17` — Only used for prompt injection prevention (strips newlines, trims, caps at 50). Not a constraint validator.

## Code References

- `src/lib/generate.ts:15-17` — `sanitizeName` (prompt injection sanitization only)
- `src/lib/generate.ts:36-51` — `validateIngredients` (structural validation only — does NOT check constraints)
- `src/lib/generate.ts:119-125` — Disallow-list sanitization and prompt injection
- `src/lib/generate.ts:127-129` — Calorie target prompt construction ("approximately" wording)
- `src/lib/generate.ts:155-157` — OpenAI call with temperature 0.8
- `src/lib/generate.ts:164-180` — Post-parse validation loop (structural only)
- `src/app/api/generate-meals/route.ts:46-54` — Request validation (type checks, no semantic validation)
- `src/app/api/cron/generate/route.ts:30-51` — Cron iteration, same generateMealPlan call
- `src/app/api/plan/today/route.ts:18-25` — Cache-hit path (serves pre-generated without re-validation)
- `src/types.ts:23-28` — `UserSettings` interface (dailyCalorieTarget + disallowList)

## Architecture Insights

1. **Pure function, clear boundary.** `generateMealPlan` is a pure async function: `(settings, supplies, email?) → { mealSets, snacks } | null`. It encapsulates both prompt construction and response parsing. A post-generation validator can be inserted between the JSON parse and the return statement without changing any caller.

2. **Single validation insertion point.** Lines 164-180 already iterate the parsed response for structural validation. A constraint validator (disallow-list + calorie check) can be added immediately after this loop, before the return at line 186. This covers both user-initiated and cron paths simultaneously.

3. **Prompt says "approximately"** for calories — any programmatic validator needs a tolerance. A reasonable tolerance (e.g., ±10% or ±100 kcal) should be a design decision surfaced during planning.

4. **Disallow-list matching complexity.** The disallow-list contains user-entered strings like "onion" or "seafood except fish." A substring match against ingredient names covers simple cases, but compound exclusions ("seafood except fish") may require more nuanced logic. The cheapest initial approach: case-insensitive substring check of each disallow item against each ingredient name.

5. **Cache serves unvalidated data.** `GET /api/plan/today` serves `user.pregenerated` directly if the hash matches. If validation is added only at generation time, cached plans generated before the validator was deployed would still be served without re-validation. This is acceptable for a single-user MVP — old cached plans expire naturally when settings/supplies change (hash invalidation).

## Historical Context (from prior changes)

- `context/archive/2026-05-27-daily-meal-set-generation/plan.md` — Established the server hydration pattern. Notes that `generateMealPlan` was already working at that point but no constraint validation was ever discussed.
- `context/archive/2026-05-28-supply-management/plan.md` — Added `validateIngredients` (structural), the `sanitizeName` pattern for prompt injection, and the quantity-based supply model. Explicitly scoped out rendering ingredients in the UI.
- `context/foundation/lessons.md` — "Always validate request bodies in API routes" lesson applies: the route validates request shape, but the response from the LLM is also untrusted data that deserves validation.

## Risk Assessment Corrections

### Risk #1 (disallow-list) — CONFIRMED, response guidance is accurate

The test plan's response guidance says: "prove no ingredient matches any disallow-list item." This is correct. The challenge ("the prompt says no X, so it won't happen") is validated — no programmatic check exists. The cheapest layer is a **unit test on a new validator function** that checks LLM output against the disallow-list, plus an integration test that calls the real generation with a known disallow-list and asserts compliance.

### Risk #2 (calorie target) — CONFIRMED, response guidance needs a refinement

The test plan says: "prove total calories sum to at most daily target." Refinement needed: the prompt uses `mainCalories = dailyCalorieTarget - 400`, not the raw target. The test must account for the 400 kcal snack reserve. Also, the prompt says "approximately" — a tolerance must be defined. Suggested: assert `totalCalories ≤ mainCalories * 1.10` (10% tolerance).

### Hot-spot evidence — CONFIRMED

`src/lib` at 28 commits/30d is the right area. The generation function lives there and has zero validation beyond structure. The hot-spot evidence accurately predicted where the gap would be.

## Recommended Test Approach

### Layer 1: Unit tests (cheapest, most signal)

Create a `validateMealPlanConstraints` function that takes:
- The parsed `{ mealSets, snacks }` result
- The `settings` (disallowList + dailyCalorieTarget)

Returns: `{ valid: boolean; violations: string[] }`

Unit-test this validator with:
- Meal set containing a disallowed ingredient → violation detected
- Meal set exceeding calorie target (+ tolerance) → violation detected
- Meal set within all constraints → valid
- Edge cases: partial name match ("onion" vs "spring onion"), case sensitivity, empty disallow-list

### Layer 2: Integration test (confirms real LLM behavior)

Call `generateMealPlan` with a real (or mocked) LLM response containing known constraint violations and verify the validator catches them. If using the real LLM, assert on the returned output (non-deterministic but should pass >95% of runs with a strong prompt).

### Decision needed for planning

1. **Should the validator reject (return null) or log-and-serve?** Rejecting means the user sees "generation failed" — they'd need to regenerate. Serving means the constraint violation reaches the user. Recommendation: reject and retry once, then serve with a warning if retry also fails.
2. **Calorie tolerance**: 10% seems reasonable. Should this be configurable via settings or hardcoded?
3. **Disallow-list matching strategy**: simple case-insensitive substring, or something smarter for compound exclusions like "seafood except fish"?

## Open Questions

1. What tolerance for calorie overshoot should the validator accept? (Suggested: 10% above `mainCalories`)
2. Should constraint violations trigger a retry or immediate rejection?
3. How to handle compound disallow-list entries ("seafood except fish") — simple substring match will incorrectly flag "fish"?
