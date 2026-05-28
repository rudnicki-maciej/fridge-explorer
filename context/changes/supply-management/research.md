---
date: "2026-05-28T18:29:00+02:00"
researcher: kiro
git_commit: 0fc31cd
branch: main
repository: fridge-explorer
topic: "Adding quantities to the supplies data model (S-03: supply-management)"
tags: [research, codebase, supplies, data-model, quantities, s-03]
status: complete
last_updated: "2026-05-28"
last_updated_by: kiro
last_updated_note: "User chose precise amounts (g/ml/items) over approximate levels"
---

# Research: Adding Quantities to the Supplies Data Model

**Date**: 2026-05-28T18:29:00+02:00
**Researcher**: kiro
**Git Commit**: 0fc31cd
**Branch**: main
**Repository**: fridge-explorer

## Research Question

What is the full impact of changing the `Supplies` type from `{ [category: string]: boolean }` to a quantity-based model? What are the breaking points, migration concerns, and design options?

## Summary

The current supplies model is a flat boolean map — each category is either "stocked" (true) or "not stocked" (false). Changing to quantities touches **7 files** across 4 layers (types, API validation, client hooks, UI). The hardest breaks are in the API route validation (explicitly rejects non-boolean values) and the `toggleSupply` hook (uses `!` negation). The PRD explicitly defers quantity tracking for MVP but acknowledges it as a "real gap." The least-friction option that respects the PRD's "accept imprecision" philosophy is **approximate levels** (`none | low | medium | high`) — it adds minimal user input burden while giving the LLM enough signal to prioritize abundant ingredients and avoid over-suggesting depleted ones.

## Detailed Findings

### Data Model Layer (`src/types.ts`)

- **Line 26-28**: `export interface Supplies { [category: string]: boolean; }` — the root type definition
- **Line 60**: `supplies: Supplies;` in `GenerateMealsRequest` — propagates to API contract
- Changing the value type from `boolean` to `number` or a string enum cascades to all consumers

**Design options for the new type:**

| Option | Type | PRD Fit | Complexity |
|--------|------|---------|------------|
| A. Boolean (current) | `boolean` | ✅ Aligned | Lowest |
| B. Approximate levels | `"none" \| "low" \| "medium" \| "high"` | ⚠️ Extends PRD | Low-medium |
| C. Integer servings | `number` (0-N) | ⚠️ Extends PRD | Medium |
| D. Exact weight | `number` (grams) | ❌ Rejected by PRD | High |

**Recommendation: Option B** — approximate levels. Rationale:
- Preserves the "imprecision accepted" spirit of the PRD
- No counting or weighing required from users
- Gives the LLM a meaningful prioritization signal
- Natural decrement path: high → medium → low → none
- Default on add: "high" (user just bought it)

### API Validation (`src/app/api/user/supplies/route.ts`)

- **Line 37**: `!Object.values(body).every((v) => typeof v === "boolean")` — **hard validation gate**. Rejects any non-boolean value with 400 "Invalid supplies".
- **Line 42**: `const validated = body as Supplies;` — type cast after validation

**Breaking change**: This is the primary server-side blocker. Must change to validate the new type shape. For Option B: `typeof v === "string" && ["none", "low", "medium", "high"].includes(v)`.

### Redis Persistence (`src/lib/kv.ts`)

- **Line 11**: `supplies: Supplies;` in `UserData` interface
- **Line 23**: `supplies: {}` in `DEFAULT_USER_DATA` — compatible with any value type

**Migration concern**: Existing Redis keys contain `{"supplies": {"meat": true, "fish": false, ...}}`. After the type change:
- Option 1: Runtime coercion in `getUser()` — normalize `true → "high"`, `false → "none"`, remove false entries
- Option 2: Batch migration script against all `user:*` keys
- **Recommendation**: Runtime coercion (simpler, no downtime, handles edge cases of users who haven't logged in)

### Client Hooks (`src/lib/storage.ts`)

- **Line 93**: `toggleSupply` uses `!supplies[category]` — boolean negation. **Breaks completely** with quantities.
- **Line 84**: `updateSupplies` is generic (just sets the whole object) — no change needed
- Hook return (line 99) exposes `toggleSupply` — must be replaced

**Required new hook API:**
```typescript
// Replace toggleSupply with:
incrementSupply(category: string)   // none→low→medium→high (or +1 for integer)
decrementSupply(category: string)   // high→medium→low→none (or -1 for integer)
setSupplyLevel(category: string, level: SupplyLevel)  // direct set
```

### Supplies UI (`src/app/supplies/page.tsx`)

- **Line 22**: `onClick={() => toggleSupply(category)}` — single-click toggle
- **Line 24**: `supplies[category]` as truthy/falsy for CSS class
- **Line 27**: `aria-pressed={!!supplies[category]}` — boolean accessibility attribute
- **Line 33**: `Object.values(supplies).filter(Boolean).length` — counts stocked categories

**Interaction model change**: From single-button toggle to quantity stepper:
- Each category tile needs: current level display + increment/decrement controls
- Visual state: `none` = grey, `low` = light green, `medium` = green, `high` = dark green
- Accessibility: Replace `aria-pressed` with `role="spinbutton"` + `aria-valuenow`
- Quick-add: Tap the tile to cycle through levels (none → high → none), or use +/− for fine control

### Plan Page — Supply Reduction (`src/app/plan/page.tsx`)

- **Line 72**: `Object.entries(supplies).filter(([, v]) => v)` — truthiness filter
- **Line 88**: `next[key] = false` — **sets supply to depleted on meal pick**

**Current behavior**: When user picks a meal set, ALL matching categories are fully depleted (set to `false`). This is overly aggressive — using chicken in one meal shouldn't mean you have no chicken left.

**With quantities**: `next[key] = decrementLevel(next[key])` — drops one level per ingredient match. E.g., `high → medium` after one meal. This is the primary UX improvement quantities enable.

### Generation Logic (`src/lib/generate.ts`)

- **Line 19-21**: `.filter(([, v]) => v).map(([k]) => k)` — extracts category names, discards all quantity info
- **Line 33**: `Available food categories: ${stocked.join(", ")}` — flat list in LLM prompt

**With quantities, the prompt improves:**
```
Available food categories (with stock levels):
- vegetables (high) — prioritize
- dairy (low) — use sparingly
- grains (medium)
```

This enables the LLM to:
1. Build meals around abundant ingredients (reduce waste)
2. Conserve scarce supplies across the 3 meal sets
3. Provide more realistic portion suggestions

### Cron Pre-generation (`src/app/api/cron/generate/route.ts`)

- **Line 23**: `.some((v) => v)` — checks if user has any stocked supply
- With quantities: `.some((v) => v !== "none")` or `.some((v) => v > 0)` depending on type choice

## Code References

- `src/types.ts:26-28` — Supplies interface definition (boolean map)
- `src/lib/kv.ts:11` — UserData.supplies field in Redis schema
- `src/app/api/user/supplies/route.ts:37` — Hard boolean validation gate
- `src/lib/storage.ts:93` — toggleSupply with boolean negation
- `src/app/supplies/page.tsx:22` — Toggle click handler
- `src/app/plan/page.tsx:88` — Supply depletion on meal pick (`= false`)
- `src/lib/generate.ts:19-21` — Supply filtering for LLM prompt
- `src/app/api/cron/generate/route.ts:23` — Cron stocked check

## Architecture Insights

1. **The boolean model was a deliberate MVP simplification**, not an oversight. The PRD explicitly acknowledges the quantity gap and accepts imprecision.

2. **The "reduce supplies on pick" behavior (FR-005) is the primary motivator for quantities.** Currently, picking one meal depletes entire categories — making the feature feel broken after the first day.

3. **The LLM generation already handles imprecision gracefully** — it doesn't need exact grams. Approximate levels (low/medium/high) give it enough signal to prioritize without requiring precision.

4. **No database migration tooling exists** — Redis is schema-less. Runtime coercion in `getUser()` is the pragmatic migration path.

5. **The `syncToServer` pattern** (optimistic local update → async PUT to Redis) works unchanged regardless of value type — only the validation layer needs updating.

## Historical Context

- `context/archive/2026-05-27-daily-meal-set-generation/plan.md` — The S-01 implementation added the `pickSet` function with boolean depletion logic. It was designed knowing quantities were deferred.
- `context/foundation/prd.md` (Open Question #4, Resolved) — Explicitly states "supplies are tracked at item level (not quantity)" and "Imprecision accepted for MVP."
- `context/foundation/roadmap.md` (S-03 Unknowns) — Lists "How does approximate inventory tracking work without quantities?" as non-blocking.

## Design Decision (user-directed)

**Quantity model: precise amounts with unit types.**

Three unit types cover all supply items:
- `g` — weight in grams (meat, cheese, grains, vegetables, etc.)
- `ml` — volume in milliliters (milk, oil, sauces, etc.)
- `items` — countable whole items (lime, eggs, whole chicken, avocado, etc.)

Each supply entry becomes: `{ amount: number, unit: "g" | "ml" | "items" }`.

This replaces the approximate levels recommendation from the initial analysis. The user prefers precision over minimal friction — the app should know "500g chicken breast" not just "chicken: high".

### Implications of this decision

1. **Data model shifts from category-level to item-level.** Current model: `{ "meat": true, "dairy": true }`. New model: `{ "chicken breast": { amount: 500, unit: "g" }, "lime": { amount: 3, unit: "items" } }`. This is a fundamental shift — supplies are no longer keyed by the 15 predefined categories but by specific item names.

2. **The `SUPPLY_CATEGORIES` constant may become a grouping/display concern** rather than the data model's primary key. Items could be tagged with a category for UI grouping, but stored individually.

3. **FR-012 (natural language input) becomes the primary input path.** Typing "500g chicken breast, 2 limes, 300ml milk" is natural. Category checklists (FR-004) become less relevant or serve as a quick-add with default quantities.

4. **Supply reduction on meal pick (FR-005) becomes meaningful.** The LLM can specify "uses 200g chicken breast" and the app subtracts from the stored 500g → 300g remaining.

5. **The LLM prompt gets richer context.** Instead of "Available: meat, dairy" it becomes "Available: 500g chicken breast, 300ml milk, 3 limes" — enabling portion-accurate meal suggestions.

6. **Validation complexity increases.** API must validate: amount > 0, unit is one of the three allowed values, item name is a non-empty string.

## Open Questions

1. ~~Should the LLM generation response include quantities used per ingredient?~~ **Yes (resolved).** Meal recipes include quantities per ingredient (e.g., `{ name: "chicken breast", amount: 200, unit: "g" }`). This changes the `Meal.ingredients` type from `string[]` to a structured array, and also means the generated recipe itself shows quantities to the user.

2. ~~How to handle unit ambiguity in natural language input?~~ **Resolved: persist learned unit mappings.** When the LLM first parses "rice" and decides it's measured in `g`, store that decision (e.g., `{ "rice": "g", "milk": "ml", "lime": "items" }`) so subsequent inputs for the same item reuse the same unit without re-inferring. This avoids inconsistency and reduces LLM calls. The mapping grows organically as the user adds new items.

3. ~~Should items auto-remove at 0?~~ **Yes, remove from list at 0.** No "out of stock" ghost entries — clean list of what's actually available.

4. ~~Backward compatibility~~: **Irrelevant (resolved).** Single test user — clean cut, reset supplies on deploy. No migration logic needed.
5. ~~Category tagging~~: **Flat list (resolved).** No category grouping for MVP — items displayed as a simple list.
