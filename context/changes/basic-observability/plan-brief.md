# Basic Observability — Plan Brief

> Full plan: `context/changes/basic-observability/plan.md`

## What & Why

Add lightweight product observability to track how many users exist, how often meal plans are generated (per user, per day), how long generation takes, and how many OpenAI tokens are consumed. This answers "how much is this costing me?" and "is generation fast enough?" — the two questions that matter before scaling.

## Starting Point

Zero observability exists today. Redis is the sole data store. Two generation paths (user-initiated API route and daily cron) both call OpenAI but discard the `usage` field from responses. The `users` set already gives user count for free.

## Desired End State

Developer can `curl` a protected endpoint and see: total users, today's generation count per user, average/p95 latency, and token usage (prompt + completion) — with 30-day rolling history via daily Redis buckets that auto-expire.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| What to track | User count + per-user gen requests + latency + tokens | Covers stated goals (usage patterns, cost monitoring) plus the NFR (< 2s generation). |
| Viewing surface | Protected admin API endpoint (`/api/admin/metrics`) | Zero dependencies, works anywhere, trivial to implement for a single-developer app. |
| Time granularity | Daily buckets, 30-day rolling TTL | See trends without unbounded storage; Redis TTL handles cleanup. |
| Token tracking | Yes — parse OpenAI usage response | Directly answers cost question without guessing. |

## Scope

**In scope:**
- Redis-based metrics counters (daily buckets, 30-day TTL)
- Instrument both generation paths (API route + cron)
- Protected admin JSON endpoint
- Generation latency and OpenAI token tracking

**Out of scope:**
- External monitoring services (Datadog, Sentry)
- Frontend analytics / page views
- Alerting or thresholds
- UI dashboard
- Per-route tracking for non-generation endpoints

## Architecture / Approach

`src/lib/metrics.ts` provides `recordGeneration()` and `getMetrics()`. Both generation paths call `recordGeneration` fire-and-forget after a successful OpenAI response. `/api/admin/metrics` calls `getMetrics()` and returns JSON. All data lives in Redis under `metrics:*` keys with 30-day TTL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Metrics Module | `src/lib/metrics.ts` with record/read helpers | None — pure library code |
| 2. Instrument Generation | Both gen paths record metrics | Must not add latency to user response |
| 3. Admin Endpoint | Protected `/api/admin/metrics` route | Token auth must not conflict with session middleware |

**Prerequisites:** `ADMIN_API_TOKEN` env var set in deployment
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- Assumes Upstash Redis free tier has sufficient command budget for extra INCR/LPUSH per generation
- `getMetrics()` scans up to 30 daily keys — acceptable at current scale but won't scale to thousands of users without redesign

## Success Criteria (Summary)

- After generating a meal plan, `/api/admin/metrics` shows the request counted with latency and token usage
- Metrics auto-expire after 30 days (verified by TTL on keys)
- Endpoint returns 401 without valid bearer token
