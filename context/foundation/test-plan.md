# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put a vision model on top of a deterministic diff that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is worried about X, and the failure would surface somewhere in area Y" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what could fail* and *why we believe it's likely* — drawn from documents, interview, and codebase *signal* (churn, structure, test base). It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding `node_modules`, `.next`, `context/`, `public/`).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk = impact × likelihood. Risks are failure scenarios in user/business terms, not test names. The Source column cites the *evidence that surfaced this risk* — never a specific file as "where the failure lives."

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|-------------------------------|
| 1 | Generated meal set contains items from the user's disallow-list | High | High | PRD FR-002 guardrail; interview Q1; hot-spot dir `src/lib` (28 commits/30d) |
| 2 | Generated meal set exceeds daily calorie target | High | High | PRD guardrail "must never exceed"; interview Q1; PRD FR-011 snack budget (2×200 kcal) |
| 3 | Picking a meal set deducts wrong supply amounts or fails to deduct, corrupting inventory state | High | Medium | Interview Q1; archive supply-management plan (exact-name deduction); hot-spot dir `src/app/api/user/supplies` (6 commits/30d) |
| 4 | Pre-generated or picked meal plans are not persisted to Redis, causing redundant LLM calls on every app open and escalating token costs | High | Medium | Interview Q1 "sky rocketing costs"; archive daily-meal-set-generation plan (hydration gap); roadmap S-04 depends on persisted options |
| 5 | NL supply parser creates duplicate items from typos or near-synonyms instead of matching existing entries | Medium | High | Interview Q2 "typo treated as new product"; archive supply-management plan (LLM parsing); hot-spot dir `src/lib` (28 commits/30d) |
| 6 | Cron pre-generation job fails silently — no plan available when user opens the app, triggering on-demand generation (cost + latency) | Medium | Medium | Interview Q3 "not sure cron runs properly"; archive observability plan (metrics exist but no cron-specific health signal) |
| 7 | Auth session expires or magic-link token is reused, leaving the user locked out with no clear recovery path | Medium | Low | Archive email-magic-link-auth plan (single-use tokens, 15-min TTL, 30-day session); PRD Access Control |
| 8 | Options bypass (`?options=true`) serves yesterday's stale options due to timezone mismatch in date comparison | High | Medium | Interview Q1 (refresh 2026-06-11); hot-spot dir `src/app/api/plan/today` (3 commits/30d) |
| 9 | Re-pick deducts from already-deducted supplies (double-deduction) because restore is skipped or uses stale state | High | Medium | Interview Q3 (refresh 2026-06-11); archive plan-management; hot-spot dir `src/app/plan` (11 commits/30d) |
| 10 | Reset restores supplies but fails to display original options — user lands on empty state with no feedback | Medium | Medium | Interview Q3 (refresh 2026-06-11); impl-review finding (resetPlan error path) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|----------------------------|----------------|--------------------------------------|-----------------------|----------------------|
| #1 | A generated meal set is programmatically validated: no ingredient name matches any disallow-list item | "The prompt says no X, so it won't happen" — LLM compliance is probabilistic | How disallow-list reaches the prompt; how response is parsed; whether post-generation validation exists | Integration test (generate with known disallow-list, assert output) | Testing only that the prompt *contains* the disallow string — that tests the template, not behavior |
| #2 | Total calories across all meals in a generated set sum to ≤ mainCalories (dailyCalorieTarget minus 400 kcal snack reserve), within a defined tolerance (e.g., 10%) | "The prompt says stay under X kcal" — same LLM compliance issue; "approximately" gives wiggle room without a hard cap | How calorie target flows into prompt; the 400 kcal snack reserve subtraction; how per-meal calories are returned; whether they're validated post-generation; what tolerance is acceptable | Integration test (generate with target, sum calories, assert ≤ mainCalories × 1.10) | Asserting the prompt mentions the number — template test, not calorie test |
| #3 | After picking a set, each recipe ingredient amount is subtracted from the correct supply item; items at 0 are removed; no phantom items appear | "LLM returns exact names so deduction always matches" — assumes perfect LLM output | Deduction algorithm matching strategy; what happens on mismatch; Redis write after deduction | Unit test (pure function: supplies + ingredients → new supplies) | Mocking the entire supplies object and asserting "called with" — tests the mock, not the math |
| #4 | Opening the app when a pre-generated plan exists does NOT trigger a new LLM call; the persisted plan is served | "We persist plans, so they'll always be there" — assumes the write succeeded and read path prefers it | Persistence write (cron + pick); read path decision (serve cached vs. generate fresh); TTL/expiry | Integration test (seed Redis with plan, hit endpoint, assert no OpenAI call) | Snapshot-testing Redis key structure — tests format, not "don't regenerate" behavior |
| #5 | Adding a supply via NL text that is a near-synonym or typo of an existing item merges rather than creates a duplicate | "We pass existing items as context" — assumes LLM always uses the hint | Whether existing supply names are passed to parsing prompt; how response is reconciled with existing keys | Integration test (existing: "chicken breast"; input: "chiken breast" → merged) | Asserting the prompt includes the items list — template test, not merge-behavior test |
| #6 | When cron runs and succeeds, a verifiable signal is written; when it fails, the failure is observable without opening the app | "Metrics exist, so we'll see it" — assumes current metrics cover cron specifically | Whether recordGeneration distinguishes cron from user; whether cron-specific success key exists | Unit test (signal write) + integration test (failed generation leaves observable trace) | Testing only that cron returns 200 — a 200 with no plan written is a silent failure |
| #7 | An expired or reused magic-link token returns a clear error; user with expired session is redirected to login with recovery path | "We redirect to /login?error=expired" — assumes all failure modes land there | Token lifecycle (creation, single-use deletion, TTL); session cookie lifecycle; client behavior on 401 | Unit test (token verification) + lightweight e2e (expired token → error → re-request works) | Testing only the happy path (valid token → session) and calling auth "covered" |
| #8 | `GET /api/plan/today?options=true` returns today's options correctly regardless of server timezone; returns 404 when stored date is yesterday | "JS Date gives consistent 'today'" — `toISOString().split('T')[0]` uses UTC, not local | How `today` is computed in route; whether cron stores date in UTC or local; timezone of comparison | Integration test (route handler with seeded dates, boundary cases) | Testing only the happy-path where dates obviously match |
| #9 | After re-pick: net supply state equals "original supplies minus new set only" — old deduction fully reversed before new one applied | "restoreIngredients is unit-tested so the sequence works" — unit test doesn't prove composition | How supplies state flows through repickSet; stale closure risk; legacy plan guard | Unit test (round-trip: deduct A → restore A → deduct B === original − B) | Testing restore and deduct separately and calling the sequence "covered" |
| #10 | After reset: supplies match pre-pick state AND options are displayed (or error shown if fetch fails) | "clearPlan + restoreIngredients = full reset" — misses async fetch and error path | How resetPlan sequences restore → clear → fetch; error feedback on failure | Integration test (route returns options after supply change) + unit test (restore sequence) | Testing only that clearPlan was called |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|-----------|-----------------|---------------|------------|--------|---------------|
| 1 | Critical-path generation constraints | Prove disallow-list and calorie limits are enforced on LLM output | #1, #2 | unit + integration | complete | context/changes/testing-critical-path-constraints/ |
| 2 | Supply integrity | Prove supply state remains accurate after picks and NL additions | #3, #5 | unit + integration | complete | context/changes/testing-supply-integrity/ |
| 3 | Plan persistence and cost control | Prove generated/picked plans are persisted and reused; cron failures are observable | #4, #6 | integration + unit | complete | context/changes/testing-plan-persistence/ |
| 4 | Auth lifecycle and quality gates | Prove token expiry/reuse handling; wire CI gates to lock the floor | #7 | unit + e2e-light + CI gates | complete | context/changes/testing-auth-lifecycle/ |
| 5 | Plan-management coverage | Prove options-bypass date logic, undo→re-deduct sequence, and reset+fetch behavior | #8, #9, #10 | integration + unit | change opened | context/changes/testing-plan-management-coverage/ |

## 4. Stack

The classic test base for this project.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | latest | Preferred per AGENTS.md; not yet installed — see §3 Phase 1 |
| API/LLM mocking | MSW or vi.mock | — | Mock at the network edge (OpenAI, Redis); never mock internal modules |
| e2e | Playwright | latest | For auth flow only (§3 Phase 4); not installed until needed |
| accessibility | none yet | — | Not prioritized per interview Q5 (UI appearance excluded) |

**Stack grounding tools (current session):**
- Docs: Context7 — available; used for Next.js/Vitest API verification; checked: 2026-06-02
- Search: Exa.ai — available; can verify tool currency and alternatives; checked: 2026-06-02
- Runtime/browser: none — no Playwright MCP in current session; checked: 2026-06-02
- Provider/platform: GitLab via glab tools — relevant for CI gate wiring in Phase 4; checked: 2026-06-02

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired: `npm run lint`, `npm run build`) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic regressions on generation constraints, supply math |
| e2e on auth flow | CI on PR | required after §3 Phase 4 | broken login/session lifecycle |

**Auth E2E gate command** (requires Playwright browsers installed in CI):

```bash
npx playwright install --with-deps chromium
npx playwright test tests/auth-expired.spec.ts --project=chromium
```
| cron health signal | Vercel cron logs + metrics | required after §3 Phase 3 | silent pre-generation failures |
| post-edit hook | local (agent loop) | recommended after §3 Phase 2 | regressions at edit time |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section fills in once the relevant rollout phase ships.

### 6.1 Adding a unit test

**Location**: `src/lib/__tests__/<module>.test.ts`

**Naming**: Backtick method names describing behavior — `` `should return null when X` ``.

**Structure** (given / when / then):

```typescript
import { describe, expect, test, vi } from "vitest";
import { validateMealPlanConstraints } from "@/lib/validate-constraints";
import type { MealSet, Meal, Snack, UserSettings } from "@/types";

// Inline fixture helpers — set only what matters per test
function makeMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    name: "Test Meal",
    description: "A test meal",
    calories: 500,
    ingredients: [{ name: "Chicken Breast", amount: 200, unit: "g" }],
    category: "lunch",
    ...overrides,
  };
}

test("returns null when ingredient contains disallowed item", () => {
  // given
  const result = { mealSets: [makeMealSet({ lunch: makeMeal({ ingredients: [{ name: "Red Onion", amount: 50, unit: "g" }] }) })], snacks: [] };
  const settings: UserSettings = { dailyCalorieTarget: 2000, disallowList: ["onion"] };

  // when / then
  expect(validateMealPlanConstraints(result, settings)).toBeNull();
});
```

**Assertion pattern**: Functions return the input on success or `null` on violation. Assert with `toBe(result)` (referential equality) or `toBeNull()`.

**Run**: `npm test`

### 6.2 Adding an integration test

**Location**: `src/lib/__tests__/<module>.integration.test.ts`

**Mocking `global.fetch`** (for OpenAI responses):

```typescript
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { generateMealPlan } from "@/lib/generate";

// Mock modules that hit external services (Redis, etc.)
vi.mock("@/lib/metrics", () => ({
  recordGeneration: vi.fn().mockResolvedValue(undefined),
}));

// Helper: shape a valid OpenAI chat completion response
function makeOpenAIResponse(content: object) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
  };
}

describe("generateMealPlan integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
  });

  test("returns null when LLM violates constraints", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse(payloadWithViolation),
    ) as unknown as typeof fetch;

    const result = await generateMealPlan(settings, supplies);
    expect(result).toBeNull();
  });
});
```

**Key points**:
- Set `process.env.OPENAI_API_KEY` in `beforeEach` to bypass the early-return guard.
- Restore `global.fetch` in `afterEach` to avoid test pollution.
- Mock `@/lib/metrics` (or any Redis-dependent module) at the top level with `vi.mock`.
- Shape the response to match OpenAI's `{ choices: [{ message: { content } }] }` format.

**Run**: `npm test`

### 6.3 Adding an e2e test

**Location**: `tests/<feature>.spec.ts`

**Pattern** (Playwright, role-based locators, wait-for-state):

```typescript
import { test, expect } from '@playwright/test';

// Risk: #N — [risk description from §2]
// Seed: tests/seed.spec.ts

test('describes the user-facing behavior being protected', async ({ page }) => {
  // Navigate to trigger the risk scenario
  await page.goto('http://localhost:3000/path-that-triggers-risk');

  // Assert redirect / URL change (wait for navigation, not time)
  await expect(page).toHaveURL(/\/expected-path/);

  // Assert user-visible outcome with role-based locators
  await expect(page.getByText('Expected message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recovery action' })).toBeVisible();
});
```

**Key points**:
- One test per file, one risk per test.
- `getByRole` / `getByLabel` / `getByText` first; `getByTestId` only when accessibility attributes are ambiguous. Never CSS selectors or XPath.
- Never `page.waitForTimeout()` — wait for state: `toBeVisible()`, `toHaveURL()`, `waitForResponse()`.
- Each test is self-contained — own setup, action, assertion, cleanup; no shared state between tests.
- Comment the risk # at the top for traceability back to §2.
- Dev server must be running (`npm run dev`) or use `webServer` in `playwright.config.ts`.

**Run single spec**: `npx playwright test tests/<feature>.spec.ts --project=chromium`
**Run all e2e**: `npx playwright test`

### 6.4 Adding a test for a new API endpoint

**Location**: `src/app/api/<route>/__tests__/route.test.ts`

**Pattern** (call route handler directly — no HTTP server):

```typescript
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/kv", () => ({
  redis: { set: vi.fn().mockResolvedValue("OK") },
  getUser: vi.fn(),
  setUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({
  verifySession: vi.fn(),
}));

const { getUser } = await import("@/lib/kv");
const { verifySession } = await import("@/lib/auth");
const { GET } = await import("../route");

test("returns cached plan without calling fetch", async () => {
  // given
  vi.mocked(verifySession).mockResolvedValue("user@test.dev");
  vi.mocked(getUser).mockResolvedValue(seededUserData);

  // when
  const response = await GET();
  const body = await response.json();

  // then
  expect(body).toEqual(expectedShape);
});
```

**Key points**:
- Import `{ GET }` / `{ POST }` directly from the route module — Next.js handlers are plain async functions.
- Mock dependencies at module level with `vi.mock`, then import with `await import()`.
- For auth-protected routes, mock `verifySession` to return a test email.
- For cron endpoints, set `process.env.CRON_SECRET` and pass `Authorization: Bearer` header.
- Assert on response shape and side effects (e.g., `redis.set` called / `global.fetch` not called).

**Run**: `npm test`

### 6.5 Per-rollout-phase notes

(Filled in after each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout. Future contributors should respect these unless the underlying assumption changes.

- **UI visual appearance / layout / Tailwind classes** — user explicitly deprioritized; functional behavior matters, not how it looks. Re-evaluate if the product gains a public marketing surface or design system. (Source: interview Q5.)
- **Admin metrics endpoint** — single user, low blast radius, bearer-token protected. Re-evaluate if admin tooling expands or gains more users. (Source: interview Q5 implied; observability archive confirms single-consumer pattern.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-11
- Stack versions last verified: 2026-06-11
- AI-native tool references last verified: 2026-06-02

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
