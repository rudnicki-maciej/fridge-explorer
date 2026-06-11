# Auth Lifecycle & Quality Gates — Plan Brief

> Full plan: `context/changes/testing-auth-lifecycle/plan.md`

## What & Why

Prove that expired or reused magic-link tokens produce a clear error with a visible recovery path, closing Risk #7 from the test plan. Without these tests, a broken auth flow (expired link, reused token) could leave users locked out with no indication of how to get back in.

## Starting Point

Auth is implemented via magic links (15-min TTL, single-use `getdel`) and 30-day JWT sessions. The verify endpoint already redirects to `/login?error=expired` on invalid tokens, and the login page renders the error banner. No tests exist for this flow.

## Desired End State

Unit tests prove token/session verification rejects invalid inputs. A Playwright e2e proves a user hitting an expired link sees the error and can re-request. CI gate commands are documented for future pipeline wiring.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|----------|--------|-------------------|
| Mock strategy | Mock `@/lib/kv` + `jose` at module level | Consistent with established Phase 2/3 patterns; isolates auth logic without testing jose crypto. |
| E2E expired token approach | Hit verify with bogus token directly | Any nonexistent token produces the same "expired" redirect — no need for real TTL expiry. |
| CI wiring | Document commands only, no pipeline file | Project is pre-CI; adding infra config is a separate concern. |
| E2e scope | Expired link → error → re-request visible | Proves the recovery path exists — the core Risk #7 concern — without needing 30-day session manipulation. |

## Scope

**In scope:**
- Unit tests for `verifyMagicToken` (expired, reused) and `verifySession` (expired JWT, no token, valid)
- Playwright e2e: expired link redirect → error message → recovery form visible
- Update test-plan.md with Phase 4 status + CI gate documentation

**Out of scope:**
- Happy-path login testing (covered by seed spec)
- Actual TTL expiry testing (Redis's responsibility)
- Session expiry in browser (30-day, not testable in e2e)
- CI pipeline file creation

## Architecture / Approach

Two test layers: Vitest unit tests mock Redis and jose to verify auth functions reject invalid inputs. A single Playwright spec hits the real verify endpoint with a bogus token and asserts the user-visible recovery path. No production code changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Unit tests | `verifyMagicToken` + `verifySession` rejection tests | Mocking `next/headers` for `verifySession` may need careful setup |
| 2. E2E test | Playwright test proving expired-link recovery UX | Dev server must be running; redirect-follow behavior |
| 3. Document CI gates | Updated test-plan.md with commands + status | None — documentation only |

**Prerequisites:** Dev server running for Phase 2; Playwright browsers installed (`npx playwright install`)
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- `verifySession` reads `next/headers` — mocking Next.js server-only modules in Vitest may require specific handling
- Playwright test assumes dev server on localhost:3000

## Success Criteria (Summary)

- `npm test` passes including new auth unit tests
- `npx playwright test tests/auth-expired.spec.ts` passes
- test-plan.md reflects Phase 4 as complete with documented CI gates
