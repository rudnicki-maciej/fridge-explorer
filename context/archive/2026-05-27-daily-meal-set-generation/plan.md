# Full-Day Meal Set Generation — Server Hydration & Verification

## Overview

Add server→client hydration for user settings and supplies so multi-device sync works end-to-end. The core generation feature already exists; this plan closes the gap between "data is in Redis" and "client loads it on mount" — making the PRD's primary success criterion (full daily loop across devices) actually work.

## Current State Analysis

The generation feature is fully built:
- `/api/generate-meals` produces 3 coordinated meal sets from supplies + calorie target + disallow-list
- `/plan` page displays sets, lets user pick one, reduces supplies on pick
- Cron pre-generates plans overnight via `src/lib/generate.ts`
- Settings page has calorie target + disallow-list
- Supplies page has 15-category checklist

The gap: `useSettings()` and `useSupplies()` hooks read from **localStorage only**. The `syncToServer` helper pushes changes to Redis, but there's no fetch-from-server on load. Result: log in on a new device → empty settings/supplies even though Redis has the data.

### Key Discoveries:

- `src/lib/storage.ts:44` — `useSettings` reads from localStorage in useEffect, never fetches from server
- `src/lib/storage.ts:64` — `useSupplies` same pattern — localStorage only
- `src/app/api/user/settings/route.ts` — only has PUT handler, no GET
- `src/app/api/user/supplies/route.ts` — only has PUT handler, no GET
- `src/lib/kv.ts:33` — `getUser(email)` returns full `UserData` including `.settings` and `.supplies`

## Desired End State

After this plan is complete:
- Opening the app on any authenticated device loads settings and supplies from Redis
- localStorage serves as a fast cache (instant render) that gets overwritten by server data when it arrives
- The full daily loop works across devices: set up on laptop → add supplies on phone → see plan on tablet
- All FRs 006–011 verified working with the hydrated data flow

### Verification:
- `npm run build` passes
- `npm run lint` passes
- Manual: log in on a fresh browser (empty localStorage), see settings and supplies from Redis

## What We're NOT Doing

- Not separating snack lookup into its own feature (deferred to S-05)
- Not removing localStorage (it stays as offline cache / instant render)
- Not adding server-side rendering for the plan page
- Not adding real-time sync (WebSocket) between devices
- Not addressing the NFR latency concern beyond what cron already handles

## Implementation Approach

Add GET handlers to the existing settings and supplies routes. Update the client hooks to fetch from server after the initial localStorage read, overwriting localStorage when server data arrives. This gives instant render from cache + eventual consistency from server.

## Phase 1: Server Hydration Endpoints

### Overview

Add GET handlers to the existing settings and supplies API routes so the client can fetch user data from Redis.

### Changes Required:

#### 1. Add GET handler to settings route

**File**: `src/app/api/user/settings/route.ts`

**Intent**: Return the authenticated user's settings from Redis. Follows the same auth pattern as the existing PUT handler.

**Contract**: `GET` handler. Calls `verifySession()` → `getUser(email)`. Returns `user.settings` as JSON. Returns 401 if unauthenticated, 404 if user not found.

#### 2. Add GET handler to supplies route

**File**: `src/app/api/user/supplies/route.ts`

**Intent**: Return the authenticated user's supplies from Redis. Same pattern as settings.

**Contract**: `GET` handler. Returns `user.supplies` as JSON.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `GET /api/user/settings` returns the user's calorie target and disallow-list
- `GET /api/user/supplies` returns the user's supply checklist state

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Client Hydration Hooks

### Overview

Update `useSettings` and `useSupplies` hooks to fetch from server on mount, overwriting localStorage with server data when it arrives.

### Changes Required:

#### 1. Update useSettings hook

**File**: `src/lib/storage.ts`

**Intent**: After reading from localStorage (instant render), fetch from `/api/user/settings`. If server returns data, update state and localStorage to match. This makes multi-device sync work — server is source of truth, localStorage is cache.

**Contract**: The hook's return type and API (`settings`, `updateSettings`, `loaded`) remain unchanged. Internally, add a fetch to `/api/user/settings` in the existing useEffect. On success, call `setSettings(serverData)` and `setItem(KEYS.settings, serverData)`. On failure (network error, 401), silently keep localStorage value. `loaded` flips to `true` after localStorage read (not after server fetch — keeps instant render).

#### 2. Update useSupplies hook

**File**: `src/lib/storage.ts`

**Intent**: Same pattern as useSettings — fetch from server on mount, overwrite localStorage with server data.

**Contract**: Same approach. Fetch `/api/user/supplies` in useEffect. On success, update state + localStorage. Return type unchanged.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Log in on a fresh browser (clear localStorage) → settings and supplies load from server
- Change supplies on device A → refresh device B → device B shows updated supplies
- With server down (network error), app still works from localStorage cache

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: End-to-End Verification

### Overview

Verify the full generation flow works correctly with hydrated data. No code changes expected — this is a testing phase confirming all PRD FRs are satisfied.

### Changes Required:

#### 1. Verify FR coverage

**File**: No code changes expected

**Intent**: Confirm each FR works end-to-end with the new hydration flow. If any FR fails, fix it in this phase.

**Contract**: Test each FR:
- FR-006: 2–3 meal sets generated from available supplies ✓
- FR-007: Full-day sets (breakfast + lunch + dinner) coordinated ✓
- FR-008: Picking a set locks all 3 meals together ✓
- FR-010: Variety across food groups in each set ✓
- FR-011: Snacks generated alongside (200 kcal each) ✓

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Full loop: set calorie target → add supplies → generate plan → pick a set → supplies reduced
- Disallow-list respected: add "onion" to disallow → generate → no meals contain onion
- Multi-device: change settings on one device → other device picks up changes on refresh
- Pre-generated plan loads instantly on morning open (cron ran overnight)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No test framework yet — not adding one for this change

### Manual Testing Steps:

1. Clear localStorage, refresh → settings/supplies load from Redis
2. Set calorie target to 1800, add disallow "shellfish" on device A
3. Open device B (or incognito) → same settings appear
4. Add supplies (meat, vegetables, grains, dairy) on device B
5. Open plan page → generate → 3 coordinated sets appear, no shellfish
6. Pick a set → supplies reduced, plan saved
7. Refresh → plan still shows (pre-generated path)
8. Change supplies → generate again → new sets reflect new supplies

## Performance Considerations

- Server fetch runs in parallel with localStorage read — no added latency for initial render
- `loaded` flag flips on localStorage read, not server fetch — UI renders instantly from cache
- Server data overwrites cache silently — no flash of stale content (settings rarely change)

## References

- Existing hooks: `src/lib/storage.ts`
- Redis data shape: `src/lib/kv.ts:9-18` (UserData interface)
- Generation route: `src/app/api/generate-meals/route.ts`
- Plan page: `src/app/plan/page.tsx`
- Roadmap item: S-01 in `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server Hydration Endpoints

#### Automated

- [x] 1.1 TypeScript compiles: `npm run build` — 9fbff89
- [x] 1.2 Lint passes: `npm run lint` — 9fbff89

#### Manual

- [x] 1.3 GET /api/user/settings returns user data — 9fbff89
- [x] 1.4 GET /api/user/supplies returns user data — 9fbff89

### Phase 2: Client Hydration Hooks

#### Automated

- [x] 2.1 TypeScript compiles: `npm run build` — ff47760
- [x] 2.2 Lint passes: `npm run lint` — ff47760

#### Manual

- [x] 2.3 Fresh browser loads settings/supplies from server — ff47760
- [x] 2.4 Cross-device sync works on refresh — ff47760
- [x] 2.5 App works from localStorage when server unreachable — ff47760

### Phase 3: End-to-End Verification

#### Automated

- [x] 3.1 TypeScript compiles: `npm run build` — 4216feb
- [x] 3.2 Lint passes: `npm run lint` — 4216feb

#### Manual

- [x] 3.3 Full loop: settings → supplies → generate → pick → supplies reduced — 4216feb
- [x] 3.4 Disallow-list respected in generation — 4216feb
- [x] 3.5 Multi-device sync confirmed — 4216feb
- [x] 3.6 Pre-generated plan loads instantly — 4216feb
