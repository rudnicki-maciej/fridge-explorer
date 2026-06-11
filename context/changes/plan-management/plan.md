# Plan Management (Re-pick & Regenerate) Implementation Plan

## Overview

Implement two capabilities on the daily meal plan page: (1) re-pick — switch to a different generated option with automatic supply undo/re-deduction, and (2) regenerate — request fresh LLM-generated options before picking. Together these fulfill Issue #6 / Roadmap S-04 (FR-014, FR-015).

## Current State Analysis

- Plan page displays 2–3 generated mealSets; user picks one which deducts supplies and clears options from state
- `DailyPlan` in localStorage stores only `{ date, chosenSetId, mealSet }` — no record of what was deducted
- Server stores all 3 options in `user.pregenerated` but the hash-based cache invalidates them after supply changes
- `deductIngredients(supplies, ingredients)` is a pure function in `src/lib/supply-math.ts`
- No inverse (restore) function exists
- No regenerate button exists; the "Generate Meal Plan" button only shows when no options are present
- `clearPlan` removes localStorage plan but does NOT restore supplies

### Key Discoveries:

- `deductIngredients` is pure and symmetric — writing `restoreIngredients` is trivial (add instead of subtract)
- Server already persists all 3 mealSets — re-pick just needs a way to fetch them without hash validation
- `POST /api/generate-meals` already generates fresh options without caching — can be reused directly for regenerate
- The confirm dialog pattern is established and required (lessons.md)

## Desired End State

After this plan completes:
1. User can pick a meal set, then tap "Change pick" to see all options again and select a different one — old deduction is undone, new deduction applied
2. User browsing options can tap "Try different options" to get fresh LLM-generated options
3. User can reset a picked plan — supplies are restored, original options are shown
4. All state transitions respect the confirm-before-destructive-action lesson

Verification: All unit tests pass, plan page supports the full state machine (Browse → Pick → Re-pick / Reset → Browse), no regressions in supply math.

## What We're NOT Doing

- Rate-limiting regeneration (decided: unlimited for now)
- Regeneration after picking (must reset first)
- Re-pick on yesterday's or older plans (today only)
- Server-side pick tracking or undo logic (client-side, matching existing pattern)
- Changing the cron pre-generation flow

## Implementation Approach

Bottom-up: add the supply restore utility first, then the API param for fetching options, then wire the UI flows. Each phase is independently testable.

---

## Phase 1: Supply Undo Infrastructure

### Overview

Add `restoreIngredients` to supply-math and extend the `DailyPlan` type to store what was deducted, enabling exact reversal.

### Changes Required:

#### 1. Restore function

**File**: `src/lib/supply-math.ts`

**Intent**: Add a `restoreIngredients` function that is the inverse of `deductIngredients` — adds ingredient amounts back to supplies.

**Contract**: `restoreIngredients(supplies: Supplies, ingredients: Ingredient[]): Supplies`. Same pure-function pattern as `deductIngredients`. For each ingredient, adds `amount` to the matching supply entry (creating it if absent).

#### 2. Extended DailyPlan type

**File**: `src/types.ts`

**Intent**: Add a `deductedIngredients` field to `DailyPlan` so the pick can be reversed exactly.

**Contract**: `DailyPlan.deductedIngredients: Ingredient[]` — stores the concatenated ingredient list that was deducted at pick time.

#### 3. Unit tests for restoreIngredients

**File**: `src/lib/__tests__/supply-math.test.ts`

**Intent**: Test that `restoreIngredients` correctly adds back amounts, including re-creating deleted entries.

**Contract**: Test cases: restore to existing supply (adds), restore a previously-deleted supply (re-creates), restore with empty ingredients (no-op).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test src/lib/__tests__/supply-math.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run build`

#### Manual Verification:

- None required — pure logic, fully automated.

---

## Phase 2: API — Options Retrieval Bypass

### Overview

Add an `options=true` query param to `GET /api/plan/today` that returns stored mealSets for today regardless of hash match, enabling re-pick to fetch the original options after supplies changed.

### Changes Required:

#### 1. Options param handling

**File**: `src/app/api/plan/today/route.ts`

**Intent**: When `?options=true` is passed, return the stored `pregenerated.mealSets` for today without checking the input hash — so re-pick can access original options even after supply deduction changed the hash.

**Contract**: If `options=true` AND `user.pregenerated.date === today`, return `{ mealSets, snacks, pregenerated: true }` regardless of hash match. If no pregenerated data for today exists, return 404.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Hit `GET /api/plan/today?options=true` after picking (supplies changed) — still returns original 3 options.

---

## Phase 3: Plan Page — Re-pick Flow

### Overview

Add a "Change pick" button to the active plan view. Tapping it fetches original options from server, shows them, and on new selection undoes old deduction and applies new.

### Changes Required:

#### 1. Plan page re-pick UI and logic

**File**: `src/app/plan/page.tsx`

**Intent**: When plan is active, show a "Change pick" link. On tap: fetch options from `/api/plan/today?options=true`, display them (excluding or highlighting current pick), and handle new selection with supply undo + re-deduction.

**Contract**:
- New state: `repicking: boolean` to toggle between plan view and options view
- On "Change pick": set `repicking=true`, fetch options, display them
- On new pick: confirm dialog → `restoreIngredients(supplies, plan.deductedIngredients)` → `deductIngredients(restored, newIngredients)` → `updateSupplies` → `savePlan` with new set + new deductedIngredients → exit repick mode
- If user cancels: just set `repicking=false`, return to plan view

#### 2. Update pick handler to store deductedIngredients

**File**: `src/app/plan/page.tsx`

**Intent**: Modify existing `pickSet` handler to include the concatenated ingredients in the saved plan for future undo.

**Contract**: `savePlan({ date, chosenSetId, mealSet, deductedIngredients: usedIngredients })` — pass the already-computed `usedIngredients` array.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Pick Set A → see plan → "Change pick" → see all 3 options → pick Set B → supplies reflect B's deduction (A's restored).
- Cancel re-pick → plan unchanged, supplies unchanged.

---

## Phase 4: Plan Page — Regenerate & Reset

### Overview

Add "Try different options" when browsing, and make "Reset today's plan" undo the supply deduction before returning to browsing state.

### Changes Required:

#### 1. Regenerate button

**File**: `src/app/plan/page.tsx`

**Intent**: Show a "Try different options" link below the meal set options list. On tap: confirm dialog, call `POST /api/generate-meals`, replace displayed options.

**Contract**: Only visible when `mealSets.length > 0` and no plan is active. Confirm: "Generate new options? This uses AI." On success, replace `mealSets` and `snacks` state with response.

#### 2. Reset with supply restoration

**File**: `src/app/plan/page.tsx`

**Intent**: Modify the "Reset today's plan" button to restore deducted supplies before clearing the plan, then show original options.

**Contract**: On reset: confirm dialog → `restoreIngredients(supplies, plan.deductedIngredients)` → `updateSupplies(restored)` → `clearPlan()` → fetch options via `/api/plan/today?options=true` → display them. If no `deductedIngredients` on plan (legacy plans), just clear without restore.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Lint passes: `npm run lint`
- Full test suite passes: `npm test`

#### Manual Verification:

- Browse options → "Try different options" → confirm → see new options (different from before).
- Pick a set → Reset → supplies restored → see original 3 options → can pick again or regenerate.
- Pick a set → Reset → "Try different options" → fresh options generated.

---

## Testing Strategy

### Unit Tests:

- `restoreIngredients` — restores amounts, re-creates deleted entries, handles empty input
- Round-trip: `deductIngredients` then `restoreIngredients` produces original supplies

### Manual Testing Steps:

1. Pick Set A, verify deduction. Change pick to Set B — verify A's ingredients restored and B's deducted.
2. Pick a set, reset plan — verify supplies fully restored to pre-pick values.
3. Browse options, regenerate — verify new options appear (different IDs).
4. Regenerate, then pick — verify normal flow still works.
5. Close browser after pick, reopen — verify plan loads, "Change pick" works.

## Performance Considerations

- `?options=true` reuses existing Redis read (no extra call — same `getUser` fetch)
- Regenerate calls the same `POST /api/generate-meals` endpoint (same cost as initial generation)
- Supply restore/deduct are O(n) on ingredient count — negligible

## References

- Research: `context/changes/plan-management/research.md`
- Supply math: `src/lib/supply-math.ts`
- Plan page: `src/app/plan/page.tsx`
- Storage hooks: `src/lib/storage.ts`
- Plan API: `src/app/api/plan/today/route.ts`
- Generate API: `src/app/api/generate-meals/route.ts`
- Types: `src/types.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Supply undo infrastructure

#### Automated

- [x] 1.1 Unit tests pass: `npm test src/lib/__tests__/supply-math.test.ts`
- [x] 1.2 Full suite passes: `npm test`
- [x] 1.3 Type checking passes: `npm run build`

### Phase 2: API — options retrieval bypass

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`

#### Manual

- [ ] 2.3 GET /api/plan/today?options=true returns options after supply change

### Phase 3: Plan page — re-pick flow

#### Automated

- [ ] 3.1 Type checking passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Pick Set A → Change pick → Pick Set B → supplies reflect B's deduction
- [ ] 3.4 Cancel re-pick → plan and supplies unchanged

### Phase 4: Plan page — regenerate & reset

#### Automated

- [ ] 4.1 Type checking passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`
- [ ] 4.3 Full test suite passes: `npm test`

#### Manual

- [ ] 4.4 Browse → Try different options → new options appear
- [ ] 4.5 Pick → Reset → supplies restored → original options shown
- [ ] 4.6 Pick → Reset → Regenerate → fresh options generated
