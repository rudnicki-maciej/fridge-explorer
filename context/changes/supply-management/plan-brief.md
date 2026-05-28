# Supply Management — Plan Brief

> Full plan: `context/changes/supply-management/plan.md`
> Research: `context/changes/supply-management/research.md`

## What & Why

Transform the supplies system from boolean category toggles to precise item-level quantity tracking (name + amount + unit). The current model depletes entire categories on meal pick ("you have no meat left after one chicken dinner"), making the reduce-on-pick feature feel broken. Precise quantities enable meaningful deduction and smarter LLM meal planning.

## Starting Point

A working boolean supply model exists: 15 predefined categories toggled on/off, stored in Redis, synced via optimistic local updates. Meal generation receives category names as a flat list. Picking a meal sets all fuzzy-matched categories to `false`. The model touches 7 files across types, API, hooks, UI, and generation.

## Desired End State

User types "500g chicken breast, 2 limes, 300ml milk" → LLM parses into structured items → user confirms → items saved. Meal generation produces recipes referencing exact supply item names with amounts. Picking a meal subtracts recipe quantities from supplies; items at 0 disappear. The supply list shows precise quantities at a glance.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Quantity model | Precise amounts (g/ml/items) | User prefers precision over approximate levels — enables meaningful deduction. |
| Input method | Natural language only (LLM-parsed) | Lowest friction; matches FR-012; no dropdowns needed. |
| Parse UX | Show confirmation before saving | Catches LLM parsing errors without blocking the happy path. |
| Recipe ingredient format | `{ name, amount, unit }` matching supply names exactly | Enables direct subtraction with zero ambiguity. |
| Ingredient-supply matching | LLM-constrained at generation time | No fuzzy matching needed — names align by construction. |
| Shortfall handling | Deplete to 0 and remove | Non-blocking; user already decided to cook this meal. |
| Prompt content | Full quantities in prompt | Enables smart planning — prioritize abundant, conserve scarce. |
| Supply list UX | Simple list with inline edit + delete | Minimal UI; fast scanning; the list IS the interface. |
| Backward compat | Clean cut (no migration) | Single test user; reset supplies on deploy. |
| Category grouping | Flat list, no categories | MVP simplicity per research decision. |

## Scope

**In scope:**
- New `Supplies` type with `{ amount, unit }` per item
- New `Ingredient` type for structured recipe ingredients
- NL parsing endpoint (`POST /api/user/supplies/parse`)
- Updated PUT validation for new shape
- Updated LLM generation prompt with quantities + exact-name constraint
- New supplies page UI (text input + item list)
- Quantity-based deduction in `pickSet`
- Prompt injection sanitization for item names

**Out of scope:**
- Category grouping/tagging
- Rendering ingredients in meal cards
- Shopping list / resupply suggestions
- Barcode scanning / photo recognition
- Unit conversion between different units

## Architecture / Approach

Bottom-up implementation: types → API validation → LLM prompts → client hooks → UI → integration. The LLM serves dual roles: (1) parsing natural language supply input into structured data, (2) generating recipes constrained to exact supply item names with amounts. All user-provided item names are sanitized before prompt injection (same pattern as existing disallow-list sanitization).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data Model & Types | New `Supplies`, `Ingredient`, `SupplyUnit` types | Cascading type errors across 7 files (expected, fixed in later phases) |
| 2. API Layer & Validation | Updated PUT + new parse endpoint | Parse endpoint depends on LLM reliability |
| 3. LLM Integration | Supply parser + updated generation prompt | LLM may not consistently respect exact item names |
| 4. Client Hooks & State | New hook API + deduction logic | Merge logic for addItems (existing + new amounts) |
| 5. Supplies Page UI | NL input with confirmation + item list | UX for confirmation step must feel lightweight |
| 6. Plan Page & Cron | Stocked checks + full integration | End-to-end flow depends on all prior phases |

**Prerequisites:** None — S-03 is parallel with other slices.
**Estimated effort:** ~3-4 sessions across 6 phases.

## Open Risks & Assumptions

- LLM may not consistently reuse exact supply item names in recipes — prompt engineering quality is critical
- Parse endpoint adds latency on supply addition (one LLM call per add) — acceptable for single user
- No unit conversion: if user stores "rice: 500g" but LLM returns "rice: 2 cups", deduction fails silently — mitigated by constraining LLM to reuse stored units

## Success Criteria (Summary)

- User can add supplies via natural language and see them with precise quantities
- Picking a meal visibly reduces supply amounts (not binary depletion)
- Generated meals only reference ingredients the user actually has, with realistic portions
