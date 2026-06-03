# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-02

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

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|-----------|-----------------|---------------|------------|--------|---------------|
| 1 | Critical-path generation constraints | Prove disallow-list and calorie limits are enforced on LLM output | #1, #2 | unit + integration | implementing | context/changes/testing-critical-path-constraints/ |
| 2 | Supply integrity | Prove supply state remains accurate after picks and NL additions | #3, #5 | unit + integration | not started | — |
| 3 | Plan persistence and cost control | Prove generated/picked plans are persisted and reused; cron failures are observable | #4, #6 | integration + unit | not started | — |
| 4 | Auth lifecycle and quality gates | Prove token expiry/reuse handling; wire CI gates to lock the floor | #7 | unit + e2e-light + CI gates | not started | — |

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

TBD — see §3 Phase 4 for auth lifecycle (expired token → error → recovery flow).

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 1 for generation endpoint testing pattern and §3 Phase 2 for supply parsing endpoint.

### 6.5 Per-rollout-phase notes

(Filled in after each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout. Future contributors should respect these unless the underlying assumption changes.

- **UI visual appearance / layout / Tailwind classes** — user explicitly deprioritized; functional behavior matters, not how it looks. Re-evaluate if the product gains a public marketing surface or design system. (Source: interview Q5.)
- **Admin metrics endpoint** — single user, low blast radius, bearer-token protected. Re-evaluate if admin tooling expands or gains more users. (Source: interview Q5 implied; observability archive confirms single-consumer pattern.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-02
- Stack versions last verified: 2026-06-02
- AI-native tool references last verified: 2026-06-02

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
