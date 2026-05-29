# Snack Lookup — Independent Snack Generation

## Overview

Extract snack generation into a standalone function, expose it via a dedicated API endpoint, and build a `/snacks` page where users can generate and browse snack suggestions from their current supplies — independent of the daily meal plan. Snacks persist in localStorage for instant revisits, with a refresh button to regenerate.

## Current State Analysis

Snacks are fully coupled to meal generation — generated in the same LLM call (`generateMealPlan()` in `src/lib/generate.ts:53`), returned bundled with meal sets, and stored only ephemerally in component state. There is no `/snacks` page, no snack-specific API endpoint, and no persistent snack storage.

### Key Discoveries:

- Snack generation needs only `supplies` + `disallowList` — zero dependency on meal sets (`generate.ts:72`)
- `formatSupplies()`, `validateIngredients()`, `sanitizeName()` are all reusable (`generate.ts:17-51`)
- `Snack` type already defined at `src/types.ts:42-47`
- SnackSection rendering pattern exists inline at `src/app/plan/page.tsx:148-162`
- API pattern established in `src/app/api/generate-meals/route.ts`
- Lesson: all API routes must validate request bodies with try/catch + shape validation
- Lesson: fetch calls to OpenAI must include `AbortSignal.timeout(30_000)`

## Desired End State

1. User navigates to `/snacks` and sees cached snack suggestions (if any) instantly
2. User clicks "Generate Snacks" (or "Refresh") to get 4 fresh snack suggestions from current supplies
3. Snacks display name, description, and calorie count — view-only, no deduction
4. Snacks persist in localStorage across page refreshes
5. The feature is fully independent of the daily meal plan

## What We're NOT Doing

- No supply deduction when viewing/selecting snacks (view-only lookup)
- No server-side snack persistence in Redis
- No cron pre-generation for snacks
- No coupling to the plan page's snack state
- No "I ate this" tracking

## Implementation Approach

Bottom-up: extract the generation function first, then the API endpoint, then the page. Each phase is independently testable. The page follows the same optimistic-local + localStorage pattern used by supplies and settings.

---

## Phase 1: Snack Generation Function & API

### Overview

Extract a standalone `generateSnacks()` function and expose it via `POST /api/generate-snacks`.

### Changes Required:

#### 1. Standalone snack generation function

**File**: `src/lib/generate.ts`

**Intent**: Add a `generateSnacks()` function that calls OpenAI with a snack-only prompt. Reuses existing `formatSupplies()`, `sanitizeName()`, and `validateIngredients()` helpers.

**Contract**:
- `export async function generateSnacks(supplies: Supplies, disallowList: string[], email?: string): Promise<Snack[] | null>`
- Prompt requests 4 snacks at ~200 kcal each, constrained to exact supply item names
- Uses `response_format: { type: "json_object" }`, `AbortSignal.timeout(30_000)`
- Validates each snack's ingredients via `validateIngredients()`
- Returns null on failure
- Records metrics via `recordGeneration()` if email provided

#### 2. API endpoint — generate snacks

**File**: `src/app/api/generate-snacks/route.ts` (new)

**Intent**: POST endpoint that accepts supplies + disallowList, calls `generateSnacks()`, returns the result. Follows the same auth + validation pattern as `generate-meals/route.ts`.

**Contract**:
- `POST /api/generate-snacks`
- Request: `{ supplies: Supplies; disallowList: string[] }`
- Response: `{ snacks: Snack[] }`
- Auth required (`verifySession`)
- Validate request body: try/catch on `request.json()`, validate supplies shape (object, non-empty, valid entries), validate disallowList is string array
- Return 400 on invalid input, 502 on LLM failure

#### 3. API endpoint — get cached snacks

**File**: `src/app/api/user/snacks/route.ts` (new)

**Intent**: GET endpoint that returns the user's most recently generated snacks from `pregenerated.snacks` in Redis. Used by the client hook to hydrate when localStorage is empty.

**Contract**:
- `GET /api/user/snacks`
- Response: `{ snacks: Snack[] }` (empty array if no pregenerated snacks)
- Auth required (`verifySession`)
- Reads `user.pregenerated?.snacks ?? []` from Redis

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`

#### Manual Verification:

- POST `/api/generate-snacks` with valid supplies returns 4 snacks
- POST with empty supplies returns 400
- POST without auth returns 401

---

## Phase 2: Snacks Page with Persistence

### Overview

Build the `/snacks` page with localStorage caching, a generate/refresh button, and snack display.

### Changes Required:

#### 1. Snacks hook with localStorage persistence

**File**: `src/lib/storage.ts`

**Intent**: Add a `useSnacks()` hook that manages snack state with localStorage persistence and server hydration. On mount, reads localStorage first; if empty, fetches from the server (snacks stored in `pregenerated.snacks`). Provides cached snacks on load and a setter for new results.

**Contract**:
- Add `snacks: "fridge-explorer:snacks"` to `KEYS`
- `export function useSnacks(): { snacks: Snack[]; saveSnacks: (snacks: Snack[]) => void; clearSnacks: () => void; loaded: boolean }`
- Reads from localStorage on mount; if non-empty, uses cached snacks
- If localStorage is empty, fetches `GET /api/user/snacks` to hydrate from server (pulls from `pregenerated.snacks` if available)
- `saveSnacks` writes to localStorage
- `clearSnacks` removes the key

#### 2. Snacks page

**File**: `src/app/snacks/page.tsx` (new)

**Intent**: A client page that shows cached snacks (if any) with a "Refresh" button, or a "Generate Snacks" button if none cached. Calls `/api/generate-snacks` with current supplies and disallow list.

**Contract**:
- Reads supplies via `useSupplies()`, settings via `useSettings()`, snacks via `useSnacks()`
- Empty state: prompt to add supplies (if none) or generate snacks (if supplies exist)
- Loading state: button disabled with "Generating..." text
- Error state: red text with error message
- Success: renders snack cards (name, description, calories) in a grid
- "Refresh" button regenerates and replaces cached snacks
- Accessible: snack list uses `<ul>`, button has clear labels

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Navigate to /snacks with supplies → click Generate → 4 snacks appear
- Refresh page → cached snacks still visible
- Click Refresh → new snacks replace old ones
- Navigate to /snacks with no supplies → see "add supplies" prompt

---

## Phase 3: Navigation & Shared Component

### Overview

Add /snacks to the nav bar and extract the snack card rendering into a pattern reusable by both pages.

### Changes Required:

#### 1. Add nav link

**File**: `src/app/layout.tsx`

**Intent**: Add a "Snacks" link to the navigation bar alongside Plan, Supplies, Settings.

**Contract**: Add `<Link href="/snacks">Snacks</Link>` in the nav div, same styling as siblings.

#### 2. Align plan page snack display

**File**: `src/app/plan/page.tsx`

**Intent**: The plan page's inline SnackSection already works. No extraction needed — both pages render snacks with the same simple card pattern (name + description). Keep them independent to avoid coupling.

**Contract**: No change needed. The snacks page has its own inline rendering matching the same visual pattern.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Nav shows "Snacks" link on all pages
- Full flow: add supplies → navigate to /snacks → generate → see snacks → refresh page → still there → click Refresh → new snacks

---

## Testing Strategy

### Unit Tests:

- `generateSnacks()` returns null when supplies empty
- `generateSnacks()` validates ingredient structure in response
- API route returns 400 on malformed body
- API route returns 401 without session

### Manual Testing Steps:

1. Add supplies via /supplies ("500g chicken, 2 eggs, 300ml milk")
2. Navigate to /snacks → click "Generate Snacks"
3. Verify 4 snacks appear with names, descriptions, calories
4. Refresh the browser → snacks still visible (localStorage)
5. Click "Refresh" → new snacks generated
6. Remove all supplies → navigate to /snacks → see empty state prompt

## Performance Considerations

- Single LLM call per generation (~2-5s) — acceptable for on-demand feature
- localStorage persistence eliminates redundant calls on revisit
- No server-side caching needed for single-user app

## References

- Related research: `context/changes/snack-lookup/research.md`
- Existing generation: `src/lib/generate.ts`
- API pattern: `src/app/api/generate-meals/route.ts`
- Storage pattern: `src/lib/storage.ts`
- PRD: FR-009, FR-011

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Snack Generation Function & API

#### Automated

- [ ] 1.1 TypeScript compiles
- [ ] 1.2 Lint passes

#### Manual

- [ ] 1.3 POST /api/generate-snacks with valid supplies returns 4 snacks
- [ ] 1.4 POST with empty supplies returns 400
- [ ] 1.5 POST without auth returns 401
- [ ] 1.6 GET /api/user/snacks returns pregenerated snacks (or empty array)

### Phase 2: Snacks Page with Persistence

#### Automated

- [ ] 2.1 TypeScript compiles
- [ ] 2.2 Lint passes
- [ ] 2.3 Build succeeds

#### Manual

- [ ] 2.4 Generate snacks from /snacks page
- [ ] 2.5 Refresh page — cached snacks visible
- [ ] 2.6 Click Refresh — new snacks replace old
- [ ] 2.7 No supplies — empty state prompt shown

### Phase 3: Navigation & Shared Component

#### Automated

- [ ] 3.1 TypeScript compiles
- [ ] 3.2 Lint passes
- [ ] 3.3 Build succeeds

#### Manual

- [ ] 3.4 Nav shows Snacks link on all pages
- [ ] 3.5 Full flow: supplies → generate snacks → persist → refresh
