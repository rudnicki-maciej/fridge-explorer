# Supply Management — Quantity-Based Tracking Implementation Plan

## Overview

Transform the supplies system from a boolean category map (`{ "meat": true }`) to precise item-level quantity tracking (`{ "chicken breast": { amount: 500, unit: "g" } }`). Users add supplies via natural language text, the LLM parses input into structured items (with confirmation), meal generation uses exact quantities for smarter planning, and picking a meal automatically deducts recipe amounts from supplies.

## Current State Analysis

The app has a working boolean supply model across 7 files:
- `src/types.ts:25-27` — `Supplies` is `{ [category: string]: boolean }`
- `src/app/api/user/supplies/route.ts:37` — Hard boolean validation gate
- `src/lib/storage.ts:93` — `toggleSupply` uses `!supplies[category]`
- `src/app/supplies/page.tsx` — 15-category toggle grid
- `src/app/plan/page.tsx:73-93` — `pickSet` depletes categories to `false` via fuzzy substring match
- `src/lib/generate.ts:20-22` — Filters to truthy keys, joins as comma-separated list in prompt
- `src/app/api/cron/generate/route.ts:25` — `.some((v) => v)` stocked check

The `Meal.ingredients` type is currently `string[]` — used only in `pickSet` for deduction, never rendered in UI.

### Key Discoveries:

- `SUPPLY_CATEGORIES` (15-item const array) becomes obsolete as the data model key — items are free-form names now
- The `generate-meals` route (`src/app/api/generate-meals/route.ts:12`) has no body validation — just casts `as GenerateMealsRequest`
- Existing prompt injection mitigation exists for disallow-list (`sanitizedDisallow` in generate.ts:26-28) — same pattern needed for supply item names
- `MealCard` component never renders ingredients — only `name`, `description`, `calories`, `category`
- Redis is schema-less — no migration tooling needed; single test user means clean cut (no backward compat)

## Desired End State

After this plan is complete:
1. User can type "500g chicken breast, 2 limes, 300ml milk" → LLM parses → user confirms → items saved with precise amounts
2. Supplies page shows a flat list of items with amounts (e.g., "Chicken breast — 500g") with edit/delete
3. Meal generation prompt includes exact quantities, LLM returns recipes with per-ingredient amounts matching supply item names exactly
4. Picking a meal subtracts recipe amounts from supplies; items hitting 0 are auto-removed
5. All user-provided item names are sanitized before LLM prompt injection

## What We're NOT Doing

- Category grouping or tagging of items (flat list per research decision)
- Backward compatibility / migration logic (single test user — clean cut)
- Rendering ingredients in MealCard or SnackSection UI (not in scope)
- Shopping list or resupply suggestions
- Barcode scanning or photo recognition
- Unit conversion (user picks one unit per item; LLM reuses it)

## Implementation Approach

Bottom-up: types first, then API/validation, then LLM prompts, then client hooks, then UI. Each phase builds on the previous and is independently testable. The LLM is used in two new ways: (1) parsing natural language supply input, (2) generating recipes with structured ingredient quantities constrained to exact supply item names.

## Critical Implementation Details

**Prompt injection surface**: Supply item names are user-controlled strings injected into LLM prompts. Apply the same sanitization as `sanitizedDisallow`: strip `\n\r`, trim, cap length (50 chars per item name). This applies in both the parsing response (validate LLM output names) and the generation prompt (sanitize before injection).

---

## Phase 1: Data Model & Types

### Overview

Replace the boolean `Supplies` type with item-level quantities, and change `Meal.ingredients` from `string[]` to structured objects with amounts. This phase touches only `src/types.ts` — the single source of truth for all interfaces.

### Changes Required:

#### 1. Supply types

**File**: `src/types.ts`

**Intent**: Replace the boolean `Supplies` interface with a quantity-based model. Each supply item has an amount and a unit. Add a `SupplyUnit` type and a `SupplyItem` interface.

**Contract**:
- `SupplyUnit = "g" | "ml" | "items"`
- `SupplyItem = { amount: number; unit: SupplyUnit }`
- `Supplies = { [itemName: string]: SupplyItem }`

#### 2. Ingredient type for recipes

**File**: `src/types.ts`

**Intent**: Replace `ingredients: string[]` in `Meal` and `Snack` with a structured array so recipes carry amounts that can be subtracted from supplies.

**Contract**:
- `Ingredient = { name: string; amount: number; unit: SupplyUnit }`
- `Meal.ingredients` becomes `Ingredient[]`
- `Snack.ingredients` becomes `Ingredient[]`

#### 3. Remove SUPPLY_CATEGORIES

**File**: `src/types.ts`

**Intent**: Remove the `SUPPLY_CATEGORIES` const array and `SupplyCategory` type — no longer needed since supplies are free-form item names.

**Contract**: Delete `SUPPLY_CATEGORIES` and `SupplyCategory`. Any imports of these elsewhere will break (addressed in later phases).

#### 4. Update GenerateMealsRequest

**File**: `src/types.ts`

**Intent**: The request type already has `supplies: Supplies` — the type change propagates automatically. No structural change needed beyond what's done in step 1.

**Contract**: `GenerateMealsRequest.supplies` is now `{ [itemName: string]: SupplyItem }`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles with no errors in `src/types.ts`: `npx tsc --noEmit src/types.ts`
- No remaining references to `SUPPLY_CATEGORIES` or `SupplyCategory` in types.ts

#### Manual Verification:

- Review that the type definitions are clean and minimal

---

## Phase 2: API Layer & Validation

### Overview

Update the supplies PUT route to validate the new shape, and add a new POST endpoint for natural language supply parsing via LLM.

### Changes Required:

#### 1. Update PUT validation

**File**: `src/app/api/user/supplies/route.ts`

**Intent**: Replace the boolean validation gate with validation for the new `{ [name: string]: { amount: number, unit: "g"|"ml"|"items" } }` shape. Sanitize item names (strip newlines, trim, cap at 50 chars).

**Contract**: Validation checks: body is non-null object, not array, every value has numeric `amount > 0` and `unit` in `["g", "ml", "items"]`, every key is a non-empty string ≤ 50 chars after sanitization. Return 400 with descriptive error on failure.

#### 2. New supply parsing endpoint

**File**: `src/app/api/user/supplies/parse/route.ts` (new)

**Intent**: Accept a `{ text: string }` body, call the LLM to parse natural language into structured supply items, return the parsed items for user confirmation (not persisted yet).

**Contract**:
- `POST /api/user/supplies/parse`
- Request: `{ text: string }` (max 500 chars)
- Response: `{ items: { name: string; amount: number; unit: "g" | "ml" | "items" }[] }`
- Auth required (verifySession)
- Sanitize the input text before sending to LLM (strip newlines, trim, cap length)
- Return 400 if text is empty or too long
- Return 502 if LLM parsing fails

#### 3. Update generate-meals route validation

**File**: `src/app/api/generate-meals/route.ts`

**Intent**: Add runtime validation for the request body (currently just casts `as GenerateMealsRequest`). Validate supplies shape matches the new type. Check that at least one supply item exists.

**Contract**: Validate `body.supplies` is an object with at least one entry where each value has `amount > 0` and valid `unit`. Replace the current `Object.entries(supplies).filter(([, v]) => v)` stocked check with `Object.keys(supplies).length === 0`.

### Success Criteria:

#### Automated Verification:

- PUT with old boolean format returns 400
- PUT with valid new format returns 200
- POST `/api/user/supplies/parse` with valid text returns parsed items
- POST with empty text returns 400
- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`

#### Manual Verification:

- Test PUT with edge cases: amount=0, negative amount, invalid unit, item name > 50 chars
- Test parse endpoint with various natural language inputs

---

## Phase 3: LLM Integration

### Overview

Create the supply parsing prompt and update the meal generation prompt to include exact quantities and constrain ingredient names to match supply items.

### Changes Required:

#### 1. Supply parsing LLM call

**File**: `src/lib/supplies-parser.ts` (new)

**Intent**: Encapsulate the LLM call that converts natural language text into structured supply items. Uses the learned unit mapping concept from research — if the user has existing supplies, pass their names+units as context so the LLM reuses consistent units.

**Contract**:
- Export `parseSuppliesText(text: string, existingItems?: string[]): Promise<{ name: string; amount: number; unit: SupplyUnit }[] | null>`
- Prompt instructs LLM to return JSON array of `{ name, amount, unit }`
- If quantity is ambiguous, LLM infers sensible defaults (e.g., "chicken" → 500g, "limes" → 3 items)
- Uses `response_format: { type: "json_object" }`
- Returns null on failure

#### 2. Update meal generation prompt

**File**: `src/lib/generate.ts`

**Intent**: Replace the flat category list with a full quantity listing. Instruct the LLM to: (a) only use ingredients whose names exactly match supply item names, (b) return structured `ingredients` arrays with `{ name, amount, unit }` per meal/snack, (c) respect available quantities (don't exceed what's available across all 3 sets combined).

**Contract**:
- Supply listing format in prompt: `"chicken breast: 500g, lime: 3 items, milk: 300ml"`
- JSON schema in prompt changes `"ingredients": ["..."]` to `"ingredients": [{ "name": "...", "amount": 200, "unit": "g" }]`
- The `stocked` extraction changes from `filter(truthy).map(key)` to formatting all entries with their amounts
- Sanitize item names before injection: same pattern as `sanitizedDisallow` (strip `\n\r`, trim, cap 50 chars)

#### 3. Update response parsing

**File**: `src/lib/generate.ts`

**Intent**: The parsed response type changes — `ingredients` is now `Ingredient[]` not `string[]`. Add basic validation that each ingredient has `name`, `amount`, and `unit` fields.

**Contract**: After `JSON.parse`, validate that every meal's `ingredients` array contains objects with string `name`, numeric `amount > 0`, and valid `unit`. If validation fails, return null (same as current behavior for malformed responses).

### Success Criteria:

#### Automated Verification:

- `parseSuppliesText("500g chicken, 2 limes")` returns structured array (integration test with LLM)
- `generateMealPlan` with new supplies format returns meals with structured ingredients
- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`

#### Manual Verification:

- Verify LLM respects exact item names in generated recipes
- Verify LLM handles edge cases: items with no obvious unit, very small/large quantities
- Verify sanitization strips injection attempts from item names in prompts

---

## Phase 4: Client Hooks & State

### Overview

Replace the `useSupplies` hook API to work with the new quantity model. Remove `toggleSupply`, add item-level operations, and update the `pickSet` deduction logic.

### Changes Required:

#### 1. Update useSupplies hook

**File**: `src/lib/storage.ts`

**Intent**: Replace `toggleSupply` with operations suited to quantity tracking: add items (from parse confirmation), remove an item, update an item's amount. Keep the same optimistic-local + sync-to-server pattern.

**Contract**:
- Remove `toggleSupply`
- Add `addItems(items: { name: string; amount: number; unit: SupplyUnit }[])` — merges into existing supplies (if item exists, adds to amount; if new, creates entry)
- Add `removeItem(name: string)` — deletes the item
- Add `updateItem(name: string, amount: number)` — sets new amount; if amount ≤ 0, removes item
- All three call `syncToServer` after local update
- Return type: `{ supplies, addItems, removeItem, updateItem, loaded }`

#### 2. Update pickSet deduction logic

**File**: `src/app/plan/page.tsx`

**Intent**: Replace the fuzzy substring boolean depletion with exact-name quantity subtraction. For each ingredient in the picked meal set, subtract its amount from the matching supply item. Remove items that hit 0.

**Contract**:
- Iterate `set.breakfast.ingredients`, `set.lunch.ingredients`, `set.dinner.ingredients` (now `Ingredient[]`)
- For each `{ name, amount }`: `next[name].amount -= amount`
- If `next[name].amount <= 0`: `delete next[name]`
- If `next[name]` doesn't exist (shouldn't happen with LLM-constrained names): skip silently
- Call `updateSupplies(next)` (the existing generic setter)

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- `addItems` merges correctly (existing item amount increases)
- `removeItem` deletes from state and syncs
- `updateItem` with 0 removes the item

#### Manual Verification:

- Verify optimistic updates feel instant in the UI
- Verify server sync works (refresh shows same data)

---

## Phase 5: Supplies Page UI

### Overview

Replace the 15-category toggle grid with a natural language input field (with LLM-parsed confirmation) and a flat item list showing quantities.

### Changes Required:

#### 1. Rewrite supplies page

**File**: `src/app/supplies/page.tsx`

**Intent**: New UI with two sections: (a) a text input area where user types supplies in natural language + a "Parse" button that calls `/api/user/supplies/parse`, shows parsed results for confirmation, then saves; (b) a list of current supply items showing name and amount, with tap-to-edit and delete.

**Contract**:
- Remove all references to `SUPPLY_CATEGORIES` and `toggleSupply`
- Input section: `<textarea>` + "Add" button → calls parse API → shows confirmation list → user confirms → `addItems(parsedItems)`
- Confirmation UI: list of parsed items with name/amount/unit, user can remove individual items before confirming
- Supply list: each item renders as `"{name} — {amount}{unit}"` with an edit (tap amount to change) and delete (X button) action
- Empty state: prompt user to add supplies via the text field
- Counter: `"{n} items in stock"` replacing the old category counter
- Accessibility: items are a list (`<ul>`), delete buttons have `aria-label`, edit inputs have labels

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- No references to `SUPPLY_CATEGORIES` or `toggleSupply` remain in codebase

#### Manual Verification:

- Type "500g chicken breast, 2 limes, 300ml milk" → see parsed confirmation → confirm → items appear in list
- Edit an item's amount inline → amount updates
- Delete an item → removed from list
- Refresh page → items persist (server sync works)
- Empty state shows helpful prompt

---

## Phase 6: Plan Page & Cron Updates

### Overview

Update the plan page's stocked check and the cron route to work with the new supplies shape.

### Changes Required:

#### 1. Update plan page stocked filter

**File**: `src/app/plan/page.tsx`

**Intent**: Replace `Object.entries(supplies).filter(([, v]) => v)` with `Object.keys(supplies)` — in the new model, presence in the object means stocked (items are removed at 0).

**Contract**: `const stocked = Object.keys(supplies)` — used for the "no supplies" empty state check. The `pickSet` function is already updated in Phase 4.

#### 2. Update cron stocked check

**File**: `src/app/api/cron/generate/route.ts`

**Intent**: Replace `.some((v) => v)` with `Object.keys(user.supplies).length > 0`.

**Contract**: Line 25 changes from `Object.values(user.supplies).some((v) => v)` to `Object.keys(user.supplies).length > 0`.

#### 3. Update generate-meals route stocked check

**File**: `src/app/api/generate-meals/route.ts`

**Intent**: Already addressed in Phase 2 validation, but ensure the stocked check uses `Object.keys(supplies).length === 0` consistently.

**Contract**: Replace `Object.entries(supplies).filter(([, v]) => v)` with `Object.keys(supplies).length === 0` for the empty check.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No remaining references to boolean supply patterns (`typeof v === "boolean"`, `!supplies[`, `.filter(([, v]) => v)`)

#### Manual Verification:

- Full flow: add supplies → generate meals → pick a set → supplies deducted correctly
- Cron generation works with new supply format
- Empty supplies state shows appropriate message on plan page

---

## Testing Strategy

### Unit Tests:

- Supply validation logic (valid/invalid shapes, edge cases: amount=0, negative, missing unit)
- `pickSet` deduction: subtract amounts, remove at 0, handle missing items gracefully
- `addItems` merge logic: new item creates, existing item adds amounts
- Input sanitization: newlines stripped, length capped, empty strings rejected

### Integration Tests:

- Parse endpoint: natural language → structured items (requires LLM, can mock)
- Generate endpoint: new supplies format → structured recipe response (requires LLM, can mock)
- Full flow: add supplies → generate → pick → verify deduction in Redis

### Manual Testing Steps:

1. Add supplies via natural language: "500g chicken breast, 2 limes, 300ml milk"
2. Verify parsed confirmation shows correct items
3. Confirm and verify items appear in supply list
4. Generate meal plan — verify recipes reference exact supply item names
5. Pick a meal set — verify supply amounts decrease correctly
6. Verify items at 0 are removed from the list
7. Test prompt injection: add item named "ignore previous instructions" — verify it's sanitized

## Performance Considerations

- Parse endpoint adds one LLM call per supply addition — acceptable for single-user app
- Generation prompt is longer (full quantities vs category names) — marginal token cost increase
- No new client-side performance concerns — same optimistic update pattern

## References

- Related research: `context/changes/supply-management/research.md`
- Current supplies route: `src/app/api/user/supplies/route.ts`
- Current generation logic: `src/lib/generate.ts`
- Existing sanitization pattern: `src/lib/generate.ts:26-28`
- Archived S-01 plan: `context/archive/2026-05-27-daily-meal-set-generation/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Model & Types

#### Automated

- [x] 1.1 TypeScript compiles with no errors in src/types.ts — 6f864f6
- [x] 1.2 No remaining references to SUPPLY_CATEGORIES or SupplyCategory in types.ts — 6f864f6

#### Manual

- [x] 1.3 Type definitions are clean and minimal — 6f864f6

### Phase 2: API Layer & Validation

#### Automated

- [x] 2.1 PUT with old boolean format returns 400 — b285fba
- [x] 2.2 PUT with valid new format returns 200 — b285fba
- [x] 2.3 POST /api/user/supplies/parse with valid text returns parsed items — b285fba
- [x] 2.4 POST with empty text returns 400 — b285fba
- [x] 2.5 TypeScript compiles — b285fba
- [x] 2.6 Lint passes — b285fba

#### Manual

- [x] 2.7 PUT edge cases: amount=0, negative, invalid unit, long item name — b285fba
- [x] 2.8 Parse endpoint with various natural language inputs — b285fba

### Phase 3: LLM Integration

#### Automated

- [x] 3.1 parseSuppliesText returns structured array
- [x] 3.2 generateMealPlan with new supplies returns structured ingredients
- [x] 3.3 TypeScript compiles
- [x] 3.4 Lint passes

#### Manual

- [ ] 3.5 LLM respects exact item names in recipes
- [ ] 3.6 LLM handles edge cases (no unit, large quantities)
- [ ] 3.7 Sanitization strips injection attempts

### Phase 4: Client Hooks & State

#### Automated

- [ ] 4.1 TypeScript compiles
- [ ] 4.2 Lint passes
- [ ] 4.3 addItems merges correctly
- [ ] 4.4 removeItem deletes and syncs
- [ ] 4.5 updateItem with 0 removes item

#### Manual

- [ ] 4.6 Optimistic updates feel instant
- [ ] 4.7 Server sync works on refresh

### Phase 5: Supplies Page UI

#### Automated

- [ ] 5.1 TypeScript compiles
- [ ] 5.2 Lint passes
- [ ] 5.3 No references to SUPPLY_CATEGORIES or toggleSupply remain

#### Manual

- [ ] 5.4 NL input → parse → confirm → items appear
- [ ] 5.5 Edit amount inline
- [ ] 5.6 Delete item
- [ ] 5.7 Refresh persists data
- [ ] 5.8 Empty state shows prompt

### Phase 6: Plan Page & Cron Updates

#### Automated

- [ ] 6.1 TypeScript compiles
- [ ] 6.2 Lint passes
- [ ] 6.3 Build succeeds
- [ ] 6.4 No remaining boolean supply patterns in codebase

#### Manual

- [ ] 6.5 Full flow: add → generate → pick → deduction correct
- [ ] 6.6 Cron works with new format
- [ ] 6.7 Empty supplies shows appropriate message
