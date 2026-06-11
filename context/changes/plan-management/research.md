---
date: 2026-06-11T17:38:00+02:00
researcher: kiro
git_commit: e00759890fcffd74bf3b8180a716769b6002a856
branch: main
repository: fridge-explorer
topic: "Re-pick from generated options / explicit regeneration (Issue #6, S-04)"
tags: [research, codebase, plan-management, meal-generation, re-pick]
status: complete
last_updated: 2026-06-11
last_updated_by: kiro
---

# Research: Re-pick from generated options / explicit regeneration

**Date**: 2026-06-11T17:38:00+02:00
**Researcher**: kiro
**Git Commit**: e00759890fcffd74bf3b8180a716769b6002a856
**Branch**: main
**Repository**: fridge-explorer

## Research Question

What's the current state of issue #6 (S-04: Plan management)? Can users re-pick from generated options without regeneration? Can they explicitly trigger a fresh set? What's missing vs. what's already in place?

## Summary

**Neither capability exists today.** The data model stores all 3 generated mealSets server-side, but the UI flow destroys the user's ability to re-pick after a selection:

1. **Re-pick without regeneration**: NOT possible. Picking clears all options from React state, deducts supplies (invalidating the server cache hash), and stores only the chosen set in localStorage. There's no path back to the other options.

2. **Explicit regeneration**: NOT possible from UI. No "regenerate" button exists. The only way to get fresh options is to reset the plan — but since supplies were already deducted, the hash changes and forces a new LLM call automatically (which is regeneration, but using fewer supplies than before).

## Detailed Findings

### Plan Page UI Flow

**Displaying options** (`src/app/plan/page.tsx:105-133`):
- All mealSets are rendered simultaneously with a "Pick this set" button each
- The "Generate Meal Plan" button only appears when no options exist AND server check is done

**Picking a set** (`src/app/plan/page.tsx:54-66`):
1. `window.confirm()` dialog (lessons.md: confirm destructive mutations)
2. `savePlan({ date, chosenSetId, mealSet })` → localStorage (only the chosen set)
3. `deductIngredients()` → `updateSupplies()` → syncs to server
4. `setMealSets([])` → **wipes all options from component state**

**Reset** (`src/app/plan/page.tsx:80`, `src/lib/storage.ts:154-157`):
- Removes `fridge-explorer:daily-plan` from localStorage
- Does NOT interact with server pregenerated cache
- On re-render, `useEffect` calls `GET /api/plan/today`
- Hash mismatch (supplies changed) → forces fresh LLM generation

**No regenerate button exists anywhere in the UI.**

### Data Persistence Model

**Server-side** (`src/lib/kv.ts:12-17`):
```
pregenerated: {
  date: string,
  inputHash: string,
  mealSets: MealSet[],  // ALL 3 sets preserved
  snacks: Snack[]
} | null
```

**Key insight**: The server stores all 3 options. They survive until the next day's cron run or until the hash changes. The pick flow does NOT null out `pregenerated` — but it changes supplies which invalidates the hash.

**Client-side** (`src/lib/storage.ts`):
- Only stores the chosen set: `{ date, chosenSetId, mealSet }`
- The other 2 options are never persisted client-side

### API Endpoints

| Endpoint | Generates? | Caches? | Returns all options? |
|----------|-----------|---------|---------------------|
| `GET /api/plan/today` | On cache miss | Yes (to pregenerated) | Yes |
| `POST /api/generate-meals` | Always | No | Yes |
| `PUT /api/user/supplies` | No | No | N/A |

No `POST /api/plan/regenerate` or `force=true` parameter exists.

### The Hash Invalidation Problem

The `inputHash = computeInputHash(settings, supplies)` mechanism is the root cause:
1. User picks a set → supplies are deducted
2. Supplies change → hash changes
3. Next call to `/api/plan/today` sees hash mismatch → regenerates

This means the pregenerated data (with all 3 options) becomes unreachable after a pick, even though it still exists in Redis. The hash-based cache check treats it as stale.

## Code References

- `src/app/plan/page.tsx:54-66` — Pick handler (deducts + clears state)
- `src/app/plan/page.tsx:80` — clearPlan call
- `src/app/plan/page.tsx:99` — Generate button (only shown when no options)
- `src/lib/storage.ts:141-157` — useDailyPlan hook (stores only chosen set)
- `src/lib/kv.ts:12-17` — UserData.pregenerated shape
- `src/app/api/plan/today/route.ts:17-27` — Hash-based cache validation
- `src/app/api/cron/generate/route.ts:47` — Cron stores full result
- `src/lib/generate.ts` — computeInputHash

## Architecture Insights

### What's already in place (can be leveraged)
- Server stores all 3 options — no data model change needed for re-pick
- `chosenSetId` is already tracked in the client-side plan — can be used to highlight/exclude the already-picked option
- The confirm dialog pattern (lessons.md) is already applied to picks

### What needs to change for re-pick (FR-014)
1. **Don't deduct supplies on pick** — or defer deduction until end-of-day / next generation
2. **OR** Preserve pre-deduction options separately so they're accessible after pick
3. **OR** Store the pregenerated snapshot with a separate key that's not hash-invalidated
4. Client needs to show "Change pick" affordance on the picked-plan view
5. Client needs to persist or re-fetch all 3 options (not just the chosen one)

### What needs to change for explicit regeneration (FR-015)
1. A "Regenerate" button in the UI
2. Either call `POST /api/generate-meals` (already exists, stateless) and display results
3. Or add a `force=true` param to `GET /api/plan/today` to bypass cache
4. Consider: should regeneration also undo the current pick's supply deduction?

### Design tension
The current model couples picking with supply deduction. Issue #6 requires decoupling them — either by deferring deduction, allowing "undo" of deduction on re-pick, or maintaining a pre-deduction supply snapshot.

## Historical Context

- `context/foundation/roadmap.md` — S-04 status: proposed; depends on S-01 (done)
- Roadmap S-04 risk note: "Requires S-01 to persist all generated options (not just the picked one)" — this is already satisfied (server stores all 3)
- Lesson "Always confirm destructive client-side state mutations" was learned FROM the pick flow — directly relevant to re-pick design

## Open Questions — Resolved

1. **Should re-pick undo the supply deduction?** → **Yes.** Undo the previous pick's deduction, then apply the new pick's deduction. Store deducted ingredients alongside the plan so the inverse can be computed exactly.
2. **Should "regenerate" cost a new LLM call?** → **Yes, unlimited for now.** No rate-limit or cap. Add cost controls later if needed.
3. **Can the user regenerate after picking?** → **No. Regenerate only before picking.** Once a set is picked (supplies deducted), user can re-pick from existing options or reset (which undoes deduction and returns to pre-pick state where regeneration is available).
4. ~~What happens if user re-picks after partially consuming a meal?~~ → Out of scope for MVP. Re-pick is a same-session affordance.

### Resulting state machine

```
[No options] → Generate/Regenerate → [Browsing options] → Pick → [Plan active]
                     ↑                                              ↓
                     └──────────── Reset (undo deduction) ←─────────┘
                                                          ↓
                                               [Browsing options] ← Re-pick (undo + deduct new)
                                                          ↑              ↓
                                                          └──────────────┘
```
