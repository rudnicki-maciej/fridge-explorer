# Plan-Management Test Coverage (Phase 5) Implementation Plan

## Overview

Add integration and component tests covering risks #8, #9, and #10 from the test plan's Phase 5: plan-management coverage. This requires setting up React Testing Library (not yet in the project) then writing route-level and component-level tests.

## Current State Analysis

- `src/app/api/plan/today/route.ts` — handles `?options=true` bypass (Risk #8 surface). Zero test coverage on that branch.
- `src/app/plan/page.tsx` — implements `repickSet` (Risk #9) and `resetPlan` (Risk #10). No component tests exist.
- `src/lib/supply-math.ts` — pure deduct/restore functions with good unit coverage, but no "repick sequence" test (deduct A → restore A → deduct B).
- `vitest.config.ts` — configured with `@/` alias, excludes `tests/**` (Playwright). No `environment: 'jsdom'` — component tests won't work yet.
- No `@testing-library/react` in dependencies.

### Key Discoveries:

- `src/app/api/plan/today/__tests__/route.test.ts:1–96` — existing route tests cover cache hit/miss but never pass `options=true`
- `src/app/plan/page.tsx:112–128` — `repickSet` guards on `plan.deductedIngredients?.length` falling back to raw supplies
- `src/app/plan/page.tsx:131–145` — `resetPlan` has try/catch on post-reset fetch, sets error message on failure
- `src/lib/storage.ts` — hooks use `localStorage` + server hydration via fetch; need mocking for component tests
- `vitest.config.ts` — no `jsdom` environment; component test files need `// @vitest-environment jsdom` or a separate config

## Desired End State

All three risks have automated test coverage:
- Risk #8: Route test proves `?options=true` serves today's options and returns 404 for stale dates, with `vi.setSystemTime()` at UTC boundaries.
- Risk #9: Component test proves the full repick sequence (restore old → deduct new) yields correct supplies, including the guard path where `deductedIngredients` is empty.
- Risk #10: Component test proves reset restores supplies AND shows options (or error on fetch failure).

Verification: `npm test` passes with all new tests green.

## What We're NOT Doing

- Not fixing the timezone bug (Risk #8 documents current behavior — the test proves the boundary behavior exists)
- Not refactoring `page.tsx` to extract logic into testable functions — testing at component level as-is
- Not adding E2E tests — component + route tests are the cheapest signal per §1
- Not testing UI rendering details (CSS, layout) — only state/data flow

## Implementation Approach

Phase 1 installs React Testing Library and configures Vitest's jsdom environment for `*.component.test.tsx` files. Phase 2 adds route-level tests for the `?options=true` branch with date mocking. Phase 3 adds component tests for `repickSet` and `resetPlan` flows.

## Phase 1: React Testing Library Setup

### Overview

Install RTL dependencies and configure Vitest to support component tests with jsdom.

### Changes Required:

#### 1. Install dependencies

**File**: `package.json`

**Intent**: Add React Testing Library and jsdom so component tests can render React components in Vitest.

**Contract**: New `devDependencies`: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.

#### 2. Vitest config — jsdom environment for component tests

**File**: `vitest.config.ts`

**Intent**: Enable jsdom environment for files matching `*.component.test.tsx` while keeping existing tests in the default (node) environment.

**Contract**: Add `environmentMatchGlobs` mapping `**/*.component.test.tsx` → `jsdom`. No change to existing test behavior.

#### 3. Test setup file for jest-dom matchers

**File**: `src/test-setup.ts`

**Intent**: Import `@testing-library/jest-dom/vitest` so custom matchers (e.g., `toBeInTheDocument`) are available globally in component tests.

**Contract**: Single import: `import "@testing-library/jest-dom/vitest"`. Referenced by `setupFiles` in vitest config (scoped to jsdom environment or global — either works since it's a no-op in node env).

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Existing tests still pass: `npm test`
- A trivial component test file can import `{ render }` from `@testing-library/react` and run without error

#### Manual Verification:

- None required for this phase

---

## Phase 2: Route Tests for Risk #8

### Overview

Test the `?options=true` branch of `/api/plan/today` with `vi.setSystemTime()` at UTC date boundaries to prove correct 200/404 behavior.

### Changes Required:

#### 1. Options-true branch tests

**File**: `src/app/api/plan/today/__tests__/route.test.ts`

**Intent**: Add a new `describe` block for `?options=true` that tests: (a) returns 200 with mealSets when `pregenerated.date` matches today's UTC date, (b) returns 404 when `pregenerated.date` is yesterday, (c) boundary: at 23:30 UTC (still "today" in UTC) with pregenerated date matching UTC today → 200, (d) boundary: at 00:30 UTC (new UTC day) with pregenerated date = yesterday's UTC → 404.

**Contract**: Uses existing `buildUser`, `vi.mocked(getUser)`, and `vi.mocked(verifySession)` patterns. Adds `vi.useFakeTimers()` / `vi.setSystemTime()` / `vi.useRealTimers()` for date boundary cases. Request URL includes `?options=true`.

```typescript
// Boundary test shape — non-obvious use of vi.setSystemTime
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-06-11T23:30:00.000Z"));
// pregenerated.date = "2026-06-11" → should match
const response = await GET(new Request("http://localhost/api/plan/today?options=true"));
expect(response.status).toBe(200);
vi.useRealTimers();
```

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test`
- All 4 cases (match, stale, boundary-evening, boundary-morning) assert correct status codes

#### Manual Verification:

- None required for this phase

---

## Phase 3: Component Tests for Risks #9 and #10

### Overview

Test `repickSet` (Risk #9) and `resetPlan` (Risk #10) as component integration tests — render PlanPage, mock hooks/fetch, verify supply state mutations and UI feedback.

### Changes Required:

#### 1. Plan page component test — repick flow

**File**: `src/app/plan/__tests__/page.component.test.tsx`

**Intent**: Prove that repickSet correctly restores old deduction then applies new deduction, yielding `original - newSet` only. Also prove the guard path: when `deductedIngredients` is empty, repick deducts from raw supplies without restore.

**Contract**: Mocks `@/lib/storage` hooks to provide controlled `supplies`, `plan`, `savePlan`, `updateSupplies`, `clearPlan` values. Mocks `global.fetch` for the `/api/plan/today?options=true` call. Renders `<PlanPage />`, simulates user clicking repick option, asserts `updateSupplies` was called with correct computed supplies. Uses `window.confirm = vi.fn(() => true)` to bypass confirmation dialogs.

#### 2. Plan page component test — reset flow

**File**: `src/app/plan/__tests__/page.component.test.tsx` (same file, separate describe block)

**Intent**: Prove that resetPlan (a) restores supplies to pre-pick state, (b) calls clearPlan, (c) fetches options and displays them on success, (d) shows error message when fetch fails.

**Contract**: Same mock structure as repick tests. For success case: mock fetch returning 200 with mealSets → assert options rendered. For failure case: mock fetch throwing → assert error message "Could not load your options" appears in the DOM.

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test`
- Repick test: `updateSupplies` called with `original - newSetIngredients` (not `original - oldSet - newSet`)
- Repick guard test: when `deductedIngredients` is empty, `updateSupplies` called with `original - newSet` (same result, no restore step)
- Reset success test: options visible in DOM after fetch resolves
- Reset failure test: error message visible in DOM after fetch rejects

#### Manual Verification:

- None required for this phase

---

## Testing Strategy

### Unit Tests (Phase 2):

- Route handler `?options=true` branch: date match → 200, stale → 404, UTC boundaries

### Integration Tests (Phase 3):

- Component-level repick: restore→deduct sequence correctness
- Component-level repick: guard path (empty deductedIngredients)
- Component-level reset: supplies restored + options shown
- Component-level reset: fetch failure → error message

## References

- Test plan: `context/foundation/test-plan.md` (§2 Risks #8–#10, §3 Phase 5, §6 Cookbook)
- Existing route tests: `src/app/api/plan/today/__tests__/route.test.ts`
- Existing supply-math tests: `src/lib/__tests__/supply-math.test.ts`
- Route under test: `src/app/api/plan/today/route.ts`
- Component under test: `src/app/plan/page.tsx`
- Supply math: `src/lib/supply-math.ts`
- Storage hooks: `src/lib/storage.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: React Testing Library Setup

#### Automated

- [x] 1.1 Dependencies install cleanly — eaf7301
- [x] 1.2 Existing tests still pass — eaf7301
- [x] 1.3 Trivial component test renders without error — eaf7301

### Phase 2: Route Tests for Risk #8

#### Automated

- [x] 2.1 Options-true match returns 200 — 7dbdcb9
- [x] 2.2 Options-true stale date returns 404 — 7dbdcb9
- [x] 2.3 Boundary evening (23:30 UTC) returns 200 — 7dbdcb9
- [x] 2.4 Boundary morning (00:30 UTC next day) returns 404 — 7dbdcb9

### Phase 3: Component Tests for Risks #9 and #10

#### Automated

- [x] 3.1 Repick yields original minus new set only — 1733fd9
- [x] 3.2 Repick guard path (empty deductedIngredients) deducts from raw supplies — 1733fd9
- [x] 3.3 Reset success: options visible after fetch — 1733fd9
- [x] 3.4 Reset failure: error message visible after fetch rejects — 1733fd9
