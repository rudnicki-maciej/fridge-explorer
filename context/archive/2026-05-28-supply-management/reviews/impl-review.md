<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Supply Management — Quantity-Based Tracking

- **Plan**: context/changes/supply-management/plan.md
- **Scope**: Phases 1–6 of 6
- **Date**: 2026-05-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical · 3 warnings · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Serial await loop in cron route blocks on every user

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/cron/generate/route.ts:21
- **Detail**: The cron handler iterates all users with `for (const userId of userIds)` and awaits each `generateMealPlan()` call sequentially. Each LLM call takes 2–10s. With N users, total execution time is O(N × LLM_latency). Vercel serverless functions have a 60s timeout — this will start failing at ~6–30 users.
- **Fix**: Replace the serial loop with batched `Promise.all` (chunks of 5) to parallelize LLM calls within the timeout budget. Wrap each user's work in try/catch so one failure doesn't block the batch.
  - Strength: Reduces wall-clock time from O(N) to O(N/5), stays within serverless timeout much longer.
  - Tradeoff: Slightly higher concurrent OpenAI API load per invocation.
  - Confidence: HIGH — standard pattern for parallel async work.
  - Blind spot: OpenAI rate limit thresholds not checked.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Never use serial await loops over unbounded collections in serverless handlers

### F2 — No timeout on OpenAI fetch calls

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/generate.ts:87, src/lib/supplies-parser.ts:33
- **Detail**: Both `fetch("https://api.openai.com/...")` calls have no AbortController or timeout. If OpenAI hangs, the serverless function blocks until the platform kills it.
- **Fix**: Add `AbortSignal.timeout(30_000)` to both fetch calls via the `signal` option.
  - Strength: Native API (Node 18+), zero dependencies, one line per call site.
  - Tradeoff: None significant.
  - Confidence: HIGH — AbortSignal.timeout is stable in Node 18+.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — syncToServer failures silently swallowed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/storage.ts:44
- **Detail**: `syncToServer` uses `.catch(() => {})` — if the PUT fails, the user sees optimistic local state but the server never persists it. On next page load, stale server data overwrites local changes. Especially risky for supply deduction after picking a meal set.
- **Fix A ⭐ Recommended**: Add a retry queue with user-visible toast on persistent failure ("Changes not saved — retrying…").
  - Strength: Prevents silent data loss; user knows when sync is broken.
  - Tradeoff: Adds UI complexity (toast component, retry state).
  - Confidence: MEDIUM — design decision on toast placement needed.
  - Blind spot: How many retries before giving up.
- **Fix B**: Return the fetch promise and let callers handle errors
  - Strength: Simpler change; pushes error handling to each call site.
  - Tradeoff: Every caller must handle errors individually.
  - Confidence: MEDIUM — more code churn, less centralized.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F4 — existingItems injected into LLM prompt without sanitization

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supplies-parser.ts:12
- **Detail**: The plan requires sanitizing item names before prompt injection. In `generate.ts` this is done via `sanitizeName()`. But in `supplies-parser.ts:12`, `existingItems` are joined directly into the prompt without sanitization.
- **Fix**: Apply the same sanitize pattern: `existingItems.map(s => s.replace(/[\n\r]/g, " ").trim().slice(0, 50)).join(", ")`.
  - Strength: Matches the sanitization pattern already used in generate.ts.
  - Tradeoff: None — trivial one-liner.
  - Confidence: HIGH — identical pattern exists in sibling file.
  - Blind spot: None significant.
- **Decision**: FIXED

### F5 — No upper bound on supply entry count

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/user/supplies/route.ts
- **Detail**: PUT validation checks each entry's shape but doesn't limit total entry count. Could inflate LLM prompt beyond token limits.
- **Fix**: Add `Object.keys(body).length > 200` check returning 400.
- **Decision**: FIXED

### F6 — pickSet deduction has no confirmation or rollback

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/plan/page.tsx:73
- **Detail**: Clicking "Pick this set" immediately deducts ingredients with no confirmation dialog. Combined with F3 (silent sync failure), a misclick could lose supply data. Plan didn't require confirmation — noting for awareness.
- **Fix**: Consider adding a lightweight confirm step.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Always confirm destructive client-side state mutations before executing
