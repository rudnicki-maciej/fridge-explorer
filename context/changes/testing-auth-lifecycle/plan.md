# Auth Lifecycle & Quality Gates Implementation Plan

## Overview

Prove that expired/reused magic-link tokens and expired JWT sessions produce clear user-facing errors with a recovery path (Risk #7). Unit tests cover token verification logic; a lightweight Playwright e2e proves the user sees the error and can re-request a link.

## Current State Analysis

- `verifyMagicToken` (src/lib/auth.ts:32-39) uses `redis.getdel` for atomic single-use consumption. Returns `null` if token doesn't exist (expired or already consumed).
- `verifySession` (src/lib/auth.ts:57-68) verifies JWT via `jose.jwtVerify`. Returns `null` on any error (expired, malformed, wrong secret).
- `/api/auth/verify` (src/app/api/auth/verify/route.ts) redirects to `/login?error=expired` when token is missing or invalid.
- Login page (src/app/login/page.tsx:85-88) renders "Link expired, please request a new one" when `?error=expired` is present.
- No middleware exists — auth is checked per-route via `verifySession()`.
- Playwright is installed (`@playwright/test ^1.60.0`), config exists at `playwright.config.ts`, `tests/` directory has one seed spec.
- Vitest excludes `tests/**` (Playwright dir) — unit tests live under `src/`.

### Key Discoveries:

- `redis.getdel` makes token reuse impossible — second call always returns null (src/lib/auth.ts:34)
- Session JWT has 30-day expiry set via `setExpirationTime` (src/lib/auth.ts:47)
- The `/login?error=expired` flow is the single recovery path for both expired tokens and reused tokens — same UX
- Test accounts (`test1-10@fridge.dev`) bypass email entirely — instant session via `/api/auth/send`

## Desired End State

After this plan completes:
1. Unit tests prove `verifyMagicToken` returns null for nonexistent (expired) and already-consumed (reused) tokens.
2. Unit tests prove `verifySession` returns null for expired JWTs and malformed tokens.
3. A Playwright e2e test proves: hitting `/api/auth/verify?token=bogus` → lands on `/login?error=expired` → user sees error message → can re-request a link.
4. CI gate commands are documented for future pipeline setup.

Verification: `npm test` passes all unit tests; `npx playwright test tests/auth-expired.spec.ts` passes the e2e.

## What We're NOT Doing

- Not testing the happy path (valid login) — already covered implicitly by the seed spec.
- Not testing actual 15-minute TTL expiry (unit test with mock covers the logic; real TTL is Redis's job).
- Not testing session expiry in e2e (30-day TTL can't be naturally expired in a browser test).
- Not creating a CI pipeline file — commands are documented, pipeline wiring is a separate concern.
- Not adding middleware — auth gating per-route is the existing pattern.

## Implementation Approach

TDD for Phase 1 (unit tests). Phase 2 writes the Playwright e2e against the running app. Phase 3 documents CI gates in the test plan.

---

## Phase 1: Unit Tests — Token & Session Verification

### Overview

Prove that `verifyMagicToken` and `verifySession` return null for invalid inputs (expired, reused, malformed). Mock `@/lib/kv` (redis) and `jose` at module level — consistent with existing test patterns.

### Changes Required:

#### 1. Magic token verification tests

**File**: `src/lib/__tests__/auth.test.ts`

**Intent**: Test `verifyMagicToken` returns null when token doesn't exist (expired) and when called a second time (reused/consumed). Also test `verifySession` returns null for expired JWT and malformed token.

**Contract**:
- `vi.mock("@/lib/kv")` — mock `redis.getdel` and `redis.del`
- `vi.mock("jose")` — mock `jwtVerify` to simulate expired token errors
- Test cases for `verifyMagicToken`:
  - Token not in Redis (getdel returns null) → returns null
  - Token exists → returns email, then second call returns null (single-use)
- Test cases for `verifySession`:
  - No token in headers/cookies → returns null
  - `jwtVerify` throws (expired/malformed) → returns null
  - Valid JWT → returns email from payload

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test src/lib/__tests__/auth.test.ts`
- Full suite passes: `npm test`
- Type checking passes: `npm run build`

#### Manual Verification:

- None required — pure logic, fully automated.

**Implementation Note**: `verifySession` reads from `next/headers` — mock `headers()` and `cookies()` to control the token source in tests.

---

## Phase 2: E2E Test — Expired Link Recovery Path

### Overview

Prove that a user hitting an expired/invalid magic link sees a clear error and can re-request. Navigate to `/api/auth/verify?token=bogus-invalid-token` which redirects to `/login?error=expired`, then verify the UI shows the error and the re-request form.

### Changes Required:

#### 1. Playwright test file

**File**: `tests/auth-expired.spec.ts`

**Intent**: E2E test proving the expired-link recovery path is visible and functional from the user's perspective.

**Contract**:
- Navigate to `/api/auth/verify?token=nonexistent-bogus-token`
- Expect redirect to `/login` with `error=expired` param
- Assert "Link expired" message is visible
- Assert email input and "Send magic link" button are present (recovery path exists)

### Success Criteria:

#### Automated Verification:

- E2E test passes: `npx playwright test tests/auth-expired.spec.ts`
- Lint passes: `npm run lint`

#### Manual Verification:

- Manually visit `/api/auth/verify?token=bad` in browser and confirm redirect + error message.

**Implementation Note**: The dev server must be running (`npm run dev`) for Playwright. The test uses `page.goto` with the full verify URL — Playwright follows the redirect automatically.

---

## Phase 3: Document CI Gates

### Overview

Update `context/foundation/test-plan.md` §5 Quality Gates with the exact commands for auth tests and confirm the gate strategy. No pipeline file created — just documentation.

### Changes Required:

#### 1. Update test-plan.md

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 4 as complete in §3, update §5 Quality Gates with auth-specific commands, and note Playwright as a required CI dependency.

**Contract**: Update the Phase 4 row status to `complete`. Add an entry in §5 for the e2e auth gate: `npx playwright test tests/auth-expired.spec.ts`.

### Success Criteria:

#### Automated Verification:

- File exists and is valid markdown: `cat context/foundation/test-plan.md`

#### Manual Verification:

- Review updated test-plan.md sections for accuracy.

---

## Testing Strategy

### Unit Tests:

- `verifyMagicToken` — expired token (null from Redis), consumed token (second call null)
- `verifySession` — no token, expired JWT, malformed JWT, valid JWT

### E2E Tests:

- Expired magic link → redirect → error message → recovery form visible

### Manual Testing Steps:

1. Visit `/api/auth/verify?token=bad` in browser — should redirect to login with error
2. Verify "Link expired, please request a new one" message appears
3. Verify email input is functional for re-requesting

## Performance Considerations

None — tests only, no production code changes.

## References

- Test plan: `context/foundation/test-plan.md` (§3 Phase 4)
- Auth module: `src/lib/auth.ts`
- Verify route: `src/app/api/auth/verify/route.ts`
- Login page: `src/app/login/page.tsx`
- Existing Playwright config: `playwright.config.ts`
- Existing seed spec pattern: `tests/seed.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unit tests — token & session verification

#### Automated

- [x] 1.1 Tests pass: `npm test src/lib/__tests__/auth.test.ts` — 2ae52b3
- [x] 1.2 Full suite passes: `npm test` — 2ae52b3
- [x] 1.3 Type checking passes: `npm run build` — 2ae52b3

### Phase 2: E2E test — expired link recovery path

#### Automated

- [x] 2.1 E2E test passes: `npx playwright test tests/auth-expired.spec.ts` — 78b998e
- [x] 2.2 Lint passes: `npm run lint` — 78b998e

#### Manual

- [x] 2.3 Manually verify expired link redirect + error message in browser — 78b998e

### Phase 3: Document CI gates

#### Automated

- [x] 3.1 test-plan.md updated with Phase 4 status and CI gate commands — 93d5314

#### Manual

- [x] 3.2 Review updated test-plan.md for accuracy — 93d5314
