# Plan Persistence & Cost Control Tests (Phase 3) — Plan Brief

> Full plan: `context/changes/testing-plan-persistence/plan.md`

## What & Why

Add tests proving that pre-generated meal plans are served from Redis without redundant OpenAI calls (Risk #4) and that the cron pre-generation job writes an observable health signal on completion (Risk #6). These are Phase 3 of the project's test rollout — the first tests touching route handlers.

## Starting Point

- `/api/plan/today` already serves cached plans when `pregenerated.date === today && inputHash === currentHash`, but no test verifies this behavior.
- The cron handler (`/api/cron/generate`) writes `user.pregenerated` on success but writes NO cron-specific health key — failures are only visible in the HTTP response body that the scheduler receives.
- No Redis mocking pattern exists in the test suite. Existing tests mock `global.fetch` and `@/lib/metrics` only.

## Desired End State

- A unit test proves `computeInputHash` is deterministic and input-sensitive.
- An integration test proves `/api/plan/today` serves cached plans without calling OpenAI.
- The cron handler writes `cron:lastSuccess:{date}` with `{ timestamp, generated, skipped, failed }` after every run.
- A test proves `failed > 0` is observable in that key when generation fails.
- All verified via `npm test`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Mocking boundary for Risk #4 | Mock `@/lib/kv` + spy `global.fetch` NOT called | Tests the actual route handler decision; catches any path that leaks to OpenAI. | Plan |
| Cron health signal shape | `cron:lastSuccess:{date}` key with `{timestamp, generated, skipped, failed}` | Single key tells the full story — no separate failure key needed. | Plan |
| Test ordering | TDD — tests first, production code second | Defines the contract independently; matches project's `/10x-tdd` workflow. | Plan |
| Failure observability | `failed > 0` in the same success key | Avoids two-key reconciliation; "200 with failures" is explicitly visible. | Plan |
| computeInputHash test | Include as prerequisite | Hash correctness is load-bearing for Risk #4 cache decisions. | Plan |

## Scope

**In scope:**
- Unit test for `computeInputHash`
- Integration test for `/api/plan/today` (cache hit + cache miss paths)
- Integration test for `/api/cron/generate` (health signal write)
- ~3 lines production code: `redis.set` in cron handler

**Out of scope:**
- `/api/generate-meals` endpoint testing
- Cron auth mechanism testing
- Alerting/monitoring dashboards
- Refactoring existing tests or metrics module
- Redis key structure snapshot tests

## Architecture / Approach

```
Phase 1: computeInputHash unit test (pure function, no mocks)
    ↓
Phase 2: /api/plan/today integration test
         vi.mock(@/lib/kv) → seed pregenerated data
         vi.mock(@/lib/auth) → stub session
         global.fetch as spy → assert NOT called on cache hit
    ↓
Phase 3: /api/cron/generate TDD
         RED:  test expects cron:lastSuccess:{date} key → fails
         GREEN: add redis.set(...) to cron handler → passes
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|------------------|----------|
| 1. computeInputHash unit test | Proves hash determinism and sensitivity | Minimal — pure function, no dependencies |
| 2. Plan persistence integration test | Proves no LLM call on cache hit | First `@/lib/kv` mock in codebase — sets new precedent |
| 3. Cron health signal TDD | Observable cron success/failure key in Redis | Small production change — must not break existing cron behavior |

**Prerequisites:** Vitest installed and configured (already done in Phase 1/2 of test rollout). Existing tests pass.
**Estimated effort:** ~1 session, 3 phases.

## Open Risks & Assumptions

- Mocking `@/lib/kv` for the first time — if the mock interface drifts from the real module, tests pass but production breaks. Mitigated by importing types from `@/lib/kv` in tests.
- `computeInputHash` uses `JSON.stringify` with a custom replacer for sorted keys — if a new property type (e.g., `Map`) is added to settings/supplies, the hash won't serialize it. Acceptable for current types.
- The cron health signal adds one `redis.set` call — if Redis is temporarily down, the cron still generates plans (fire-and-forget concern). Acceptable: the signal is observability, not control flow.

## Success Criteria (Summary)

- `npm test` passes with all new test files included
- `npm run build` and `npm run lint` pass
- The cron handler writes verifiable health data after every run
