<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Full-Day Meal Set Generation

- **Plan**: context/changes/daily-meal-set-generation/plan.md
- **Scope**: All Phases (1–3)
- **Date**: 2026-05-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical · 3 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — PUT routes lack input validation and error handling

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/user/settings/route.ts:22, src/app/api/user/supplies/route.ts:22
- **Detail**: Both PUT handlers called `await request.json()` without try/catch and cast the result directly to the expected type with no validation. Malformed JSON → 500 with stack trace. Arbitrary JSON persisted to Redis.
- **Fix**: Wrap request.json() in try/catch (return 400 on parse failure) and validate shape before persisting.
  - Strength: Matches auth/send pattern; prevents data corruption and info leakage.
  - Tradeoff: ~10 lines per route; no runtime cost.
  - Confidence: HIGH — identical pattern in auth/send/route.ts.
  - Blind spot: None significant.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Always validate request bodies in API routes

### F2 — `loaded` flag gated on server fetch, not localStorage read

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/storage.ts:73
- **Detail**: Plan states `loaded` flips after localStorage read. Actual: `loaded = mounted && hydrated`, gated on server fetch completing. Defeated instant render from cache.
- **Fix A ⭐ Recommended**: Decouple loaded from hydrated — set `loaded = mounted`.
  - Strength: Restores plan intent; instant render from localStorage.
  - Tradeoff: Brief flash of stale data if server has newer values.
  - Confidence: HIGH — plan explicitly designed for this.
  - Blind spot: If any consumer relies on loaded meaning "server data is ready".
- **Fix B**: Keep current behavior, update plan.
  - Strength: No stale-data flash.
  - Tradeoff: Contradicts plan; adds perceived latency.
  - Confidence: MEDIUM.
  - Blind spot: Real-world latency impact unmeasured.
- **Decision**: DISMISSED — plan wording was imprecise; gating on hydration is intentional to prevent showing stale/empty UI on new devices before server data arrives.

### F3 — Prompt injection via disallowList in generate-meals

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/api/generate-meals/route.ts:30, src/lib/generate.ts:30
- **Detail**: User-controlled disallowList values interpolated directly into LLM prompt without sanitization. Newline injection could manipulate output.
- **Fix**: Sanitize entries — strip newlines, trim, cap at 50 chars.
  - Strength: Minimal code; eliminates injection vector.
  - Tradeoff: Aggressive sanitization could reject edge-case food names.
  - Confidence: HIGH — standard LLM input hygiene.
  - Blind spot: None significant.
- **Decision**: FIXED

### F4 — generate-meals duplicates logic from shared lib

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/api/generate-meals/route.ts (entire file)
- **Detail**: Route duplicated ~60 lines of prompt + OpenAI call logic from src/lib/generate.ts.
- **Fix**: Refactor to call generateMealPlan() from shared lib.
  - Strength: Single source of truth; prompt changes propagate consistently.
  - Tradeoff: May need signature adjustments.
  - Confidence: HIGH — shared lib exists for this purpose.
  - Blind spot: None significant.
- **Decision**: FIXED

### F5 — Middleware is a significant unplanned routing change

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/middleware.ts
- **Detail**: Middleware not in this plan — belongs to auth change. Only checks cookie presence, not JWT validity. Defense-in-depth, not a bypass.
- **Decision**: SKIPPED
