# Full-Day Meal Set Generation — Plan Brief

> Full plan: `context/changes/daily-meal-set-generation/plan.md`

## What & Why

The core meal generation feature is already built and working, but user data (settings, supplies) only loads from localStorage — meaning multi-device sync doesn't actually work. This plan adds server→client hydration so the PRD's primary success criterion (full daily loop across devices) is met.

## Starting Point

Generation, plan selection, supply reduction, cron pre-generation, settings, and supplies pages all exist and work. The gap: `useSettings()` and `useSupplies()` hooks read from localStorage only. Redis has the data (via `syncToServer` on writes) but the client never fetches it on load.

## Desired End State

Opening the app on any authenticated device loads settings and supplies from Redis. localStorage serves as instant-render cache. The full daily loop works across devices: set up on laptop → add supplies on phone → see plan on tablet.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Hydration strategy | Server fetch + localStorage cache | Multi-device works; instant render preserved; minimal refactor. |
| Snack separation | Defer to S-05 | Roadmap already has a dedicated slice; keeps this focused. |
| Generation latency | Accept on-demand with loading state | Cron covers happy path; on-demand fallback is acceptable UX. |
| Deliverable scope | Hydration + verification pass | Feature is mostly built; the real gap is multi-device data flow. |

## Scope

**In scope:**
- GET endpoints for settings and supplies
- Client hooks fetch from server on mount
- localStorage as fallback/cache
- End-to-end verification of FRs 006–011

**Out of scope:**
- Snack lookup separation (S-05)
- Real-time sync between devices
- Server-side rendering
- Removing localStorage

## Architecture / Approach

Add GET handlers to existing `/api/user/settings` and `/api/user/supplies` routes. Update `useSettings` and `useSupplies` hooks: read localStorage first (instant render), then fetch from server and overwrite. Server is source of truth; localStorage is cache.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Server Hydration Endpoints | GET routes for settings + supplies | None — trivial addition to existing routes |
| 2. Client Hydration Hooks | Hooks fetch from server on mount | Must not break instant render or cause flash |
| 3. End-to-End Verification | Confirm all FRs work with hydrated flow | May surface edge cases in supply reduction logic |

**Prerequisites:** Auth working (F-01 done), user data in Redis
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- Assumes server data is always more recent than localStorage (true given write-through pattern)
- If user has stale localStorage and server is unreachable, they see stale data until reconnection

## Success Criteria (Summary)

- Log in on a fresh device → settings and supplies appear from server
- Change supplies on device A → device B shows changes on refresh
- Full generation loop works end-to-end with hydrated data
