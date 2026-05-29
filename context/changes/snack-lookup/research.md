---
date: 2026-05-29T22:10:31+02:00
researcher: Kiro
git_commit: 72df2d9
branch: main
repository: fridge-explorer
topic: "Independent snack lookup — what exists, what's needed"
tags: [research, codebase, snacks, generation, decoupling]
status: complete
last_updated: 2026-05-29
last_updated_by: Kiro
---

# Research: Independent Snack Lookup (S-05)

**Date**: 2026-05-29T22:10:31+02:00
**Researcher**: Kiro
**Git Commit**: 72df2d9
**Branch**: main
**Repository**: fridge-explorer

## Research Question

What's the current snack implementation, how are snacks generated/stored/displayed, and what's needed to make snack access independent of the daily meal plan?

## Summary

Snacks are currently **fully coupled** to meal generation — generated in the same LLM call, returned in the same response, and stored only ephemerally in component state. There is no `/snacks` page, no snack-specific API endpoint, and no persistent snack storage. Decoupling is trivial: snack generation needs only `supplies` + `disallowList` (no dependency on meal sets). The `Snack` type, `validateIngredients()`, and `formatSupplies()` helpers already exist and can be reused directly.

## Detailed Findings

### Current Snack Generation

- Snacks are generated as part of `generateMealPlan()` in a single OpenAI call (`src/lib/generate.ts:53`)
- The prompt appends: "Also suggest 4 snack options (each ~200 kcal) from available supplies" (`generate.ts:72`)
- 4 snacks per request, each ~200 kcal (fixed, not derived from calorie target)
- Snack ingredients are validated with the same `validateIngredients()` function as meals (`generate.ts:103-106`)
- The function returns `{ mealSets: MealSet[]; snacks: Snack[] }` — bundled together

### Snack Type Definition

```typescript
// src/types.ts:42-47
export interface Snack {
  name: string;
  description: string;
  calories: number;
  ingredients: Ingredient[];
}
```

Same as `Meal` but without `category` field.

### Storage Model — Ephemeral

- **Client-side**: `useState<Snack[]>([])` in `PlanPage` (`plan/page.tsx:11`). Never written to localStorage.
- **Server-side**: Nested inside `UserData.pregenerated.snacks` in Redis (`kv.ts:10-15`). No top-level `snacks` field on `UserData`.
- **DailyPlan** (`types.ts:30-34`): Contains only `{ date, chosenSetId, mealSet }` — no snacks.
- **Result**: After picking a meal set and refreshing, snacks disappear from the UI.

### Display — SnackSection Component

- Defined inline at `src/app/plan/page.tsx:148-162`
- Renders heading "Snack Options (~200 kcal each)" + grid of name/description cards
- Displayed in two contexts:
  1. After a plan is chosen (below chosen meals) — `page.tsx:88`
  2. While browsing generated sets (below set cards) — `page.tsx:127`

### What Does NOT Exist

- No `/snacks` page or route
- No `/api/generate-snacks` endpoint
- No snack-specific storage (localStorage key or Redis field)
- No way to generate snacks without also generating 3 full meal sets

## Architecture Insights

### Decoupling Is Trivial

Snack generation has **zero dependency on meal sets**. The only shared inputs are:
- `supplies` (formatted via `formatSupplies()` at `generate.ts:19-22`)
- `disallowList` (sanitized via `sanitizeName()` at `generate.ts:17`)

The calorie target for snacks is fixed at 200 kcal per PRD FR-011 — not derived from `dailyCalorieTarget`.

### Minimal Implementation Surface

| Component | What's Needed | Reusable From |
|-----------|---------------|---------------|
| `generateSnacks()` function | Standalone LLM call for snacks only | `formatSupplies()`, `validateIngredients()`, `sanitizeName()` from `generate.ts` |
| `POST /api/generate-snacks` | Auth + validation + call generateSnacks | Pattern from `generate-meals/route.ts` |
| `/snacks` page | UI with generate button + snack list | `SnackSection` component pattern from `plan/page.tsx` |
| Snack persistence (optional) | Store last-generated snacks | `useSupplies` pattern from `storage.ts` |

### Input Requirements for Standalone Snack Generation

| Input | Required? | Source |
|-------|-----------|--------|
| `supplies` | Yes | `useSupplies()` / `/api/user/supplies` |
| `disallowList` | Yes | `useSettings()` / `/api/user/settings` |
| `dailyCalorieTarget` | No | Snacks are always 200 kcal (FR-011) |
| `mealSets` | No | Zero dependency |

## Code References

- `src/types.ts:42-47` — Snack interface definition
- `src/types.ts:30-34` — DailyPlan (no snacks field)
- `src/types.ts:49-52` — GenerateMealsResponse (bundles mealSets + snacks)
- `src/lib/generate.ts:53` — `generateMealPlan()` signature
- `src/lib/generate.ts:68` — Calorie budget: `mainCalories = dailyCalorieTarget - 400`
- `src/lib/generate.ts:72` — Snack prompt line
- `src/lib/generate.ts:103-106` — Snack ingredient validation
- `src/lib/generate.ts:17` — `sanitizeName()` helper
- `src/lib/generate.ts:19-22` — `formatSupplies()` helper
- `src/app/plan/page.tsx:11` — Snack state (ephemeral)
- `src/app/plan/page.tsx:148-162` — SnackSection component
- `src/app/api/generate-meals/route.ts` — Current generation endpoint (meals + snacks)
- `src/lib/kv.ts:8-16` — UserData interface (pregenerated.snacks)
- `src/lib/storage.ts:30-34` — localStorage keys (no snacks key)

## Historical Context

- `context/archive/2026-05-27-daily-meal-set-generation/plan.md` — Explicitly deferred snack separation: "Not separating snack lookup into its own feature (deferred to S-05)"
- `context/foundation/prd.md:81` — FR-009: "User can view available snack options from current supplies at any time, independent of the daily meal plan"
- `context/foundation/prd.md:87` — FR-011: "The 2 snacks (morning + evening) are small (200 kcal each) and universal — not impacted by main meal choices"

## Open Questions

1. **Should snacks persist after generation?** Currently ephemeral. Options: (a) store in localStorage like DailyPlan, (b) store server-side in Redis as top-level field, (c) keep ephemeral (regenerate on each visit).
2. **Should the cron job pre-generate snacks separately?** Currently snacks come bundled with meal pre-generation. A standalone snack pre-gen would let the /snacks page load instantly.
3. **Should SnackSection be extracted to a shared component?** It's currently inline in plan/page.tsx. The /snacks page will need the same rendering logic.
4. **Should snack generation deduct from supplies?** Meals deduct on pick. Snacks are "view available options" — likely no deduction, but worth confirming.
