# Basic Observability Implementation Plan

## Overview

Add lightweight Redis-based product observability to track confirmed user count, per-user generation request volume (daily buckets with 30-day TTL), generation latency, and OpenAI token usage. Metrics are exposed via a protected `/api/admin/metrics` endpoint returning a JSON snapshot.

## Current State Analysis

The codebase has zero observability infrastructure:
- No logging library, no analytics, no metrics counters
- Single `console.error` in `src/app/api/auth/send/route.ts:25` is the only diagnostic
- Redis (Upstash) is the sole data store — already used for user data and auth tokens
- Two generation paths exist: direct API (`/api/generate-meals`) and cron (`src/lib/generate.ts`)
- The `users` Redis set already tracks all registered emails — user count is `SCARD users`
- OpenAI response includes `usage.prompt_tokens` and `usage.completion_tokens` but neither path reads them today

## Desired End State

After this plan is complete:
- Every generation call (both user-initiated and cron) records: request count, latency (ms), and token usage (prompt + completion) in Redis
- Metrics are stored in daily buckets with 30-day TTL for trend visibility
- A protected GET endpoint at `/api/admin/metrics` returns a JSON snapshot including: total user count, per-user daily generation counts, latency stats, and token totals
- Developer can `curl` the endpoint with a bearer token to check usage and costs

### Verification:
- `npm run build` passes
- `npm run lint` passes
- Manual: generate a meal plan, then hit `/api/admin/metrics` and see the request counted with latency and tokens

## What We're NOT Doing

- No external monitoring service (Datadog, Sentry, etc.)
- No frontend analytics or page view tracking
- No alerting or thresholds
- No historical aggregation beyond 30-day rolling window
- No UI dashboard — JSON endpoint only
- No per-route tracking for non-generation endpoints

## Implementation Approach

Redis-native counters with daily key bucketing. Each generation call increments a daily counter and appends latency/token data. The admin endpoint aggregates across the rolling window. All metrics use a `metrics:` key prefix to stay cleanly separated from application data.

## Phase 1: Metrics Module

### Overview

Create a metrics helper module that encapsulates all Redis counter operations for recording and reading generation metrics.

### Changes Required:

#### 1. Create metrics module

**File**: `src/lib/metrics.ts` (new)

**Intent**: Centralize all metrics recording and reading logic. Provides functions to record a generation event (with latency and tokens) and to read aggregated metrics for the admin endpoint.

**Contract**:
- `recordGeneration(email: string, latencyMs: number, tokens: { prompt: number; completion: number }): Promise<void>` — increments daily counter at `metrics:gen:{email}:{YYYY-MM-DD}` (TTL 30 days), appends latency to `metrics:latency:{YYYY-MM-DD}` list (TTL 30 days), increments token totals at `metrics:tokens:{YYYY-MM-DD}` hash with fields `prompt` and `completion` (TTL 30 days).
- `getMetrics(): Promise<MetricsSnapshot>` — returns `{ userCount, generations: { today, last30Days }, latency: { todayAvgMs, todayP95Ms }, tokens: { todayPrompt, todayCompletion, last30DaysPrompt, last30DaysCompletion } }`. User count via `SCARD users`. Daily generation counts summed from `metrics:gen:*:{date}` keys. Latency from today's list. Token totals from hash sums.

#### 2. Add admin token env var

**File**: `.env.example` (create if missing, or update)

**Intent**: Document the `ADMIN_API_TOKEN` env var used to protect the metrics endpoint.

**Contract**: Add `ADMIN_API_TOKEN=` with a comment noting it protects `/api/admin/metrics`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- N/A for this phase (no routes to call yet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Instrument Generation Paths

### Overview

Add metrics recording to both generation paths: the user-facing `/api/generate-meals` route and the cron-invoked `generateMealPlan` function in `src/lib/generate.ts`.

### Changes Required:

#### 1. Instrument the direct API route

**File**: `src/app/api/generate-meals/route.ts`

**Intent**: Record generation metrics (latency, token usage) after a successful OpenAI call. Requires adding auth check to identify the user email, timing the OpenAI fetch, and parsing `usage` from the response.

**Contract**: Add `verifySession()` call to get email. Wrap the OpenAI fetch with `Date.now()` timing. After successful parse, call `recordGeneration(email, latencyMs, { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens })`. Metrics recording is fire-and-forget (don't block the response on it).

#### 2. Instrument the cron generation function

**File**: `src/lib/generate.ts`

**Intent**: Record generation metrics for cron-initiated calls. The function needs to accept an email parameter (already passed by the cron caller context) and record metrics after a successful generation.

**Contract**: Change signature to `generateMealPlan(settings, supplies, email?: string)`. When `email` is provided and generation succeeds, call `recordGeneration(email, latencyMs, tokens)`. Timing wraps the OpenAI fetch. Parse `data.usage` from the response. The `email` parameter is optional so existing callers (plan/today route) don't break.

#### 3. Pass email from cron caller

**File**: `src/app/api/cron/generate/route.ts`

**Intent**: Pass the user's email to `generateMealPlan` so cron-generated plans are attributed in metrics.

**Contract**: Change `generateMealPlan(user.settings, user.supplies)` to `generateMealPlan(user.settings, user.supplies, userId)` where `userId` is the email from the iteration loop.

#### 4. Pass email from plan/today route

**File**: `src/app/api/plan/today/route.ts`

**Intent**: Pass the authenticated user's email to `generateMealPlan` for the on-demand fallback generation path.

**Contract**: Change `generateMealPlan(user.settings, user.supplies)` to `generateMealPlan(user.settings, user.supplies, userId)` where `userId` comes from `verifySession()`.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Generate a meal plan via the UI, then check Redis for `metrics:gen:{email}:{today}` key existing with value ≥ 1
- Check `metrics:tokens:{today}` hash has `prompt` and `completion` fields > 0

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Admin Metrics Endpoint

### Overview

Create a protected API route that reads and returns the metrics snapshot as JSON.

### Changes Required:

#### 1. Create admin metrics route

**File**: `src/app/api/admin/metrics/route.ts` (new)

**Intent**: Expose a GET endpoint that returns the metrics snapshot. Protected by bearer token from `ADMIN_API_TOKEN` env var.

**Contract**: `GET` handler. Checks `Authorization: Bearer <token>` header against `process.env.ADMIN_API_TOKEN`. Returns 401 if missing/invalid. On success, calls `getMetrics()` and returns the snapshot as JSON. The middleware auth guard should NOT apply to this route (it uses its own token auth, not session cookies).

#### 2. Exclude admin route from session middleware

**File**: `src/middleware.ts`

**Intent**: Allow `/api/admin` routes through without session cookie check — they use their own bearer token auth.

**Contract**: Update the matcher regex to also exclude `/api/admin` paths.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/admin/metrics` returns JSON with user count and generation stats
- Request without token returns 401
- After generating a meal plan, metrics endpoint shows updated counts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No test framework exists yet — not adding one for this change

### Manual Testing Steps:

1. Set `ADMIN_API_TOKEN` in `.env.local`
2. Generate a meal plan via the UI
3. `curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/metrics`
4. Verify response includes: userCount > 0, today's generation count ≥ 1, latency > 0, tokens > 0
5. Generate again → counts increment
6. Request without token → 401

## Performance Considerations

- Metrics recording is fire-and-forget — doesn't add latency to the user response
- Redis INCR/LPUSH operations are O(1) — negligible overhead
- Daily key TTL (30 days) prevents unbounded storage growth
- `getMetrics()` scans up to 30 daily keys — acceptable for an admin endpoint called rarely

## References

- OpenAI usage response: `data.usage.prompt_tokens`, `data.usage.completion_tokens`
- Existing Redis patterns: `src/lib/kv.ts`
- Generation paths: `src/app/api/generate-meals/route.ts`, `src/lib/generate.ts`
- Roadmap item: F-02 in `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Metrics Module

#### Automated

- [x] 1.1 TypeScript compiles: `npm run build` — 1dce411
- [x] 1.2 Lint passes: `npm run lint` — 1dce411

### Phase 2: Instrument Generation Paths

#### Automated

- [x] 2.1 TypeScript compiles: `npm run build` — aa6bf28
- [x] 2.2 Lint passes: `npm run lint` — aa6bf28

#### Manual

- [x] 2.3 Generation creates metrics:gen key in Redis — aa6bf28
- [x] 2.4 Token usage recorded in metrics:tokens hash — aa6bf28

### Phase 3: Admin Metrics Endpoint

#### Automated

- [x] 3.1 TypeScript compiles: `npm run build` — 93586fd
- [x] 3.2 Lint passes: `npm run lint` — 93586fd

#### Manual

- [x] 3.3 Curl with token returns JSON metrics snapshot — 93586fd
- [x] 3.4 Request without token returns 401 — 93586fd
- [x] 3.5 Metrics update after generating a meal plan — 93586fd
