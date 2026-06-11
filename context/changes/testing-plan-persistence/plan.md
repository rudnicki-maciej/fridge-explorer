# Plan Persistence & Cost Control Tests (Phase 3) Implementation Plan

## Overview

Prove that pre-generated meal plans are served without redundant LLM calls (Risk #4) and that cron pre-generation failures are observable (Risk #6). Uses TDD: tests first defining the contract, then minimal production code to satisfy them.

## Current State Analysis

- `/api/plan/today` checks `user.pregenerated.date === today && inputHash === currentHash` — returns cached plan without calling `generateMealPlan` when both match.
- `/api/cron/generate` iterates users in batches of 5, writes `user.pregenerated` on success, but writes **no cron-specific health signal** to Redis. Failures only increment a local counter returned in the HTTP response.
- `recordGeneration` in `metrics.ts` fires on successful generation but doesn't distinguish cron from user-triggered calls.
- No route handler tests exist anywhere in the codebase. This plan introduces the first ones.
- Mocking `@/lib/kv` is a new pattern — existing tests only mock `global.fetch` and `@/lib/metrics`.

### Key Discoveries:

- `computeInputHash` (src/lib/generate.ts:6-18) — pure function, deterministic char-code hash of sorted JSON. Load-bearing for cache decisions.
- `/api/plan/today` (src/app/api/plan/today/route.ts:21-28) — two conditions must both be true for cache hit: date match AND hash match.
- `/api/cron/generate` (src/app/api/cron/generate/route.ts:55) — returns `{ generated, skipped, failed, total }` in response body but persists nothing about run health.
- `verifySession` (src/lib/auth.ts:60-72) — reads from headers/cookies, returns email or null. Must be mocked for route handler tests.

## Desired End State

After this plan completes:
1. A unit test proves `computeInputHash` is deterministic and sensitive to input changes.
2. An integration test proves that hitting `/api/plan/today` when a valid cached plan exists does NOT trigger `global.fetch` (no OpenAI call).
3. An integration test proves that after cron runs, a `cron:lastSuccess:{date}` Redis key contains `{ timestamp, generated, skipped, failed }`.
4. A test proves that when generation fails for a user, the cron health key records `failed > 0`.

Verification: `npm test` passes all new tests.

## What We're NOT Doing

- Not testing the `/api/generate-meals` POST endpoint (separate concern, not in Risk #4/#6).
- Not testing the cron authentication mechanism (already implicitly tested by auth tests in Phase 4).
- Not snapshot-testing Redis key structure — tests assert behavior, not format.
- Not adding alerting or monitoring dashboards — just the persistence signal that monitoring can read.
- Not refactoring existing generation tests or metrics module.

## Implementation Approach

TDD across all phases. Each phase writes failing tests that define the contract, then adds the minimal production code to make them pass. Phase 1 is pure unit (no mocks). Phase 2 mocks `@/lib/kv` and `@/lib/auth` while spying on `global.fetch`. Phase 3 mocks `@/lib/kv` (including `redis.set`) and `@/lib/generate` to control success/failure, then asserts the cron handler writes the health key.

## Critical Implementation Details

**Timing & lifecycle**: In Phase 2, the test must freeze "today" to match the seeded `pregenerated.date`. Use `vi.useFakeTimers()` with a fixed date, or compute the expected date at test runtime — either works, but the date in the seeded user data must match `new Date().toISOString().split("T")[0]` as evaluated inside the route handler.

---

## Phase 1: Unit Test — `computeInputHash` Determinism

### Overview

Prove that `computeInputHash` produces identical hashes for identical inputs and different hashes when settings or supplies change. This closes the assumption "read path prefers cached" — if the hash function is broken, cache invalidation breaks.

### Changes Required:

#### 1. Test file

**File**: `src/lib/__tests__/compute-input-hash.test.ts`

**Intent**: Test `computeInputHash` as a pure function — same inputs produce same hash, any change to settings or supplies produces a different hash.

**Contract**: Import `computeInputHash` from `@/lib/generate`. No mocks needed. Test cases:
- Same settings + same supplies → same hash (referential stability)
- Different object references but same values → same hash (no object-identity leakage)
- Changed `dailyCalorieTarget` → different hash
- Changed `disallowList` → different hash
- Added supply item → different hash
- Changed supply amount → different hash

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test src/lib/__tests__/compute-input-hash.test.ts`
- Type checking passes: `npm run build`

#### Manual Verification:

- None required — pure function, fully automated.

**Implementation Note**: After completing this phase and all automated verification passes, proceed directly to Phase 2.

---

## Phase 2: Integration Test — Plan Persistence Prevents LLM Call (Risk #4)

### Overview

Prove that when a user has a valid pre-generated plan in Redis (date matches today, inputHash matches current settings+supplies), the `/api/plan/today` endpoint returns the cached plan without calling OpenAI.

### Changes Required:

#### 1. Test file

**File**: `src/app/api/plan/today/__tests__/route.test.ts`

**Intent**: Integration test for the GET handler. Mock `@/lib/kv` and `@/lib/auth` to isolate route logic. Spy on `global.fetch` to prove no external call is made when cache is valid.

**Contract**: 
- `vi.mock("@/lib/kv")` — control `getUser` return value (seeded with valid `pregenerated`)
- `vi.mock("@/lib/auth")` — control `verifySession` to return a test email
- `global.fetch` left as a `vi.fn()` spy — assert it is NOT called
- Import `{ GET }` from the route module and call it directly (no HTTP server needed — Next.js route handlers are plain async functions accepting `Request`)
- `computeInputHash` must produce the same hash used in seeded data — compute it in the test from the same settings+supplies

Test cases:
- Cache hit: `pregenerated.date === today && pregenerated.inputHash === currentHash` → response is `{ mealSets, snacks, pregenerated: true }`, `global.fetch` not called
- Cache miss (stale date): `pregenerated.date === yesterday` → `global.fetch` IS called (on-demand generation)
- Cache miss (hash mismatch): same date but different inputHash → `global.fetch` IS called

#### 2. Mock `@/lib/metrics` to prevent Redis calls from recordGeneration

**File**: `src/app/api/plan/today/__tests__/route.test.ts` (same file)

**Intent**: Mock `@/lib/metrics` so that on-demand generation tests don't hit real Redis for metrics.

**Contract**: `vi.mock("@/lib/metrics", () => ({ recordGeneration: vi.fn().mockResolvedValue(undefined) }))`

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test src/app/api/plan/today/__tests__/route.test.ts`
- Type checking passes: `npm run build`

#### Manual Verification:

- None required — route handler test, fully automated.

**Implementation Note**: After completing this phase and all automated verification passes, proceed directly to Phase 3.

---

## Phase 3: TDD — Cron Health Signal (Risk #6)

### Overview

TDD cycle: write tests expecting a `cron:lastSuccess:{date}` key after cron runs → tests fail (key not written yet) → add production code to cron handler → tests pass. Proves both the happy path (signal written with counts) and failure path (failed > 0 is observable).

### Changes Required:

#### 1. Test file (RED phase — written first)

**File**: `src/app/api/cron/generate/__tests__/route.test.ts`

**Intent**: Integration test for the POST cron handler. Mock `@/lib/kv` to control user data and capture writes. Mock `@/lib/generate` to control success/failure. Assert the handler writes `cron:lastSuccess:{date}` with the expected payload.

**Contract**:
- `vi.mock("@/lib/kv")` — mock `getAllUserIds`, `getUser`, `setUser`, and additionally expose the underlying `redis` mock to assert `redis.set` is called with the health key
- `vi.mock("@/lib/generate")` — mock `generateMealPlan` and `computeInputHash`
- Import `{ POST }` from the route module, call with a Request containing the `Authorization: Bearer {CRON_SECRET}` header
- Set `process.env.CRON_SECRET` in beforeEach

Test cases:
- Successful generation for 1 user → `cron:lastSuccess:{targetDate}` written with `{ timestamp: expect.any(String), generated: 1, skipped: 0, failed: 0 }`
- Failed generation (generateMealPlan returns null) → key written with `{ ..., generated: 0, failed: 1 }`
- Mixed batch (1 success, 1 skip, 1 fail) → key has accurate counts for all three

#### 2. Production code change (GREEN phase)

**File**: `src/app/api/cron/generate/route.ts`

**Intent**: After the batch loop completes, write a Redis key `cron:lastSuccess:{targetDate}` containing `{ timestamp, generated, skipped, failed }`. This makes cron health observable without opening the app.

**Contract**: After the existing for-loop and before the `return NextResponse.json(...)` line, call `await redis.set(...)` with:
- Key: `` `cron:lastSuccess:${targetDate}` ``
- Value: `{ timestamp: new Date().toISOString(), generated, skipped, failed }`
- Import `redis` from `@/lib/kv`

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test src/app/api/cron/generate/__tests__/route.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- None required — the signal is a Redis key; automated tests verify its contents.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `computeInputHash` determinism (Phase 1)

### Integration Tests:

- `/api/plan/today` cache-hit behavior — no OpenAI call when pregenerated plan is valid (Phase 2)
- `/api/plan/today` cache-miss behavior — OpenAI call triggered on stale date or hash mismatch (Phase 2)
- `/api/cron/generate` health signal written on success (Phase 3)
- `/api/cron/generate` health signal records failures (Phase 3)

### Manual Testing Steps:

1. After Phase 3, optionally trigger cron locally and verify the key appears in Upstash dashboard

## Performance Considerations

- No performance impact — Phase 1-2 are test-only; Phase 3 adds a single `redis.set` at the end of cron execution (negligible cost vs. the batch of LLM calls).

## References

- Test plan: `context/foundation/test-plan.md` (§3 Phase 3)
- Route handler: `src/app/api/plan/today/route.ts`
- Cron handler: `src/app/api/cron/generate/route.ts`
- Hash function: `src/lib/generate.ts:6-18`
- KV abstraction: `src/lib/kv.ts`
- Existing integration test pattern: `src/lib/__tests__/generate.integration.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unit test — computeInputHash determinism

#### Automated

- [x] 1.1 Tests pass: `npm test src/lib/__tests__/compute-input-hash.test.ts`
- [x] 1.2 Type checking passes: `npm run build`

### Phase 2: Integration test — plan persistence prevents LLM call

#### Automated

- [ ] 2.1 Tests pass: `npm test src/app/api/plan/today/__tests__/route.test.ts`
- [ ] 2.2 Type checking passes: `npm run build`

### Phase 3: TDD — cron health signal

#### Automated

- [ ] 3.1 Tests pass: `npm test src/app/api/cron/generate/__tests__/route.test.ts`
- [ ] 3.2 Full suite passes: `npm test`
- [ ] 3.3 Type checking passes: `npm run build`
- [ ] 3.4 Lint passes: `npm run lint`
