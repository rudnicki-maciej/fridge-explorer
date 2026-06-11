# Plan Management (Re-pick & Regenerate) — Plan Brief

> Full plan: `context/changes/plan-management/plan.md`
> Research: `context/changes/plan-management/research.md`

## What & Why

Users can currently pick a meal set from generated options, but the pick is irreversible — options disappear and supplies are immediately deducted. This implements two capabilities: re-picking a different option (with supply undo) and explicitly requesting fresh generated options.

## Starting Point

The plan page generates 2–3 meal set options and the user picks one. Picking deducts supplies and stores only the chosen set. The server already persists all 3 options but they become unreachable after the pick changes the input hash. No regenerate button exists.

## Desired End State

User can browse options → pick one → change their mind (supplies auto-corrected) → or request fresh options. The "Reset" action restores supplies and returns to browsing. Clear state machine with confirm dialogs on destructive actions.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Supply undo on re-pick | Yes — restore old, deduct new | Keeps pick-deducts-immediately model while enabling mind-changing | Research |
| Regeneration limits | Unlimited, no cap | Simple; add cost controls later if needed | Plan |
| Regenerate after picking | No — must reset first | Keeps states clean; avoids complex "undo + regenerate" interactions | Research |
| Undo logic location | Client-side | Matches existing pick pattern; no new API for mutations | Plan |
| Options retrieval | Server fetch via `?options=true` | Server already has all 3 sets; single source of truth | Plan |
| Re-pick scope | Today only | Matches "daily plan" mental model; no cross-day accounting | Plan |
| Regenerate UX | Subtle "Try different options" link + confirm | Discoverable but doesn't encourage costly regeneration | Plan |
| Reset behavior | Undo deduction + show same options | Separates "change mind" from "want new options" | Plan |

## Scope

**In scope:**
- `restoreIngredients` utility (inverse of deductIngredients)
- Extended `DailyPlan` type with `deductedIngredients` field
- `?options=true` API param to bypass hash check
- "Change pick" button on active plan view
- "Try different options" link when browsing
- Reset undoes supply deduction

**Out of scope:**
- Rate-limiting regeneration
- Regeneration after picking (must reset first)
- Re-pick on past days
- Server-side pick tracking
- Changes to cron pre-generation

## Architecture / Approach

Pure client-side state machine with one small API enhancement. Supply restore is a new pure function mirroring deductIngredients. The `DailyPlan` type gains a `deductedIngredients` field so undo is exact. The API gets a `?options=true` bypass for re-fetching original options post-deduction. All UI flows live in the plan page component.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Supply undo infrastructure | `restoreIngredients` + extended DailyPlan type + tests | Low — pure function, symmetric to existing code |
| 2. API options retrieval | `?options=true` param bypasses hash check | Low — small addition to existing endpoint |
| 3. Re-pick flow | "Change pick" → fetch options → undo + re-deduct | Medium — state management with multiple transitions |
| 4. Regenerate & reset | "Try different options" + reset-with-undo | Medium — integrates with all prior phases |

**Prerequisites:** S-01 (daily meal generation) ✅ done
**Estimated effort:** ~2 sessions across 4 phases

## Open Risks & Assumptions

- Legacy plans (without `deductedIngredients`) will skip restore on reset — graceful degradation
- If user closes browser mid-re-pick, supplies may be temporarily inconsistent (same risk as current pick)
- Regeneration cost is uncapped — monitor token usage post-ship

## Success Criteria (Summary)

- User can change their picked meal set and see supplies correctly adjusted
- User can request fresh options before picking
- Reset fully restores supplies to pre-pick state
