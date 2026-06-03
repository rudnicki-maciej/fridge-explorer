# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Never add lodash — use native JS/TS APIs

- **Context**: TypeScript implementation on both frontend and backend sides of the application.
- **Problem**: Agent used `_.filter()` even though lodash is not part of the project. This would add an unnecessary dependency and break the local convention of using native APIs.
- **Rule**: Never add lodash without explicit instruction. The project prefers native JS/TS functions available in the 2026+ standard.
- **Applies to**: plan, implement, impl-review

## Never expose internal config key names in user-facing UI

- **Context**: Any UI surface that displays configuration status or error messages to end users.
- **Problem**: Messages like "OPENAI_API_KEY not configured" leak internal implementation details (env var names, service names) to users who can't act on them and shouldn't see them. It creates confusion and is a minor security smell.
- **Rule**: Never display internal configuration key names or technical identifiers in user-facing UI. Show a human-readable status ("AI provider not configured — contact your administrator") and keep technical details in logs or admin-only views.
- **Applies to**: plan, plan-review

## Always validate request bodies in API routes

- **Context**: `src/app/api/user/settings/route.ts`, `src/app/api/user/supplies/route.ts` — PUT handlers accepting user input.
- **Problem**: `request.json()` was called without try/catch (malformed JSON → 500 with stack trace) and the result was cast to a TypeScript type without runtime validation (arbitrary data persisted to Redis). TypeScript types provide zero runtime safety.
- **Rule**: Every API route that reads `request.json()` must: (1) wrap it in try/catch returning 400 on parse failure, (2) validate the parsed body's shape and value constraints before persisting. Never rely on TypeScript `as` casts as a substitute for runtime validation.
- **Applies to**: plan, implement, impl-review

## Never use serial await loops over unbounded collections in serverless handlers

- **Context**: src/app/api/cron/generate/route.ts — cron handler iterating all users with sequential `await` on LLM calls.
- **Problem**: Each iteration blocks on an external API call (2–10s). Total execution time grows linearly with user count, hitting serverless timeouts (60s) at low scale (~6–30 users). A single slow/failed call also delays all subsequent users.
- **Rule**: When iterating an unbounded collection with async external calls in a serverless function, use batched `Promise.all` (e.g., chunks of 5) with per-item try/catch for error isolation. Never serial-await over a list that grows with users/data.
- **Applies to**: plan, implement, impl-review

## Always confirm destructive client-side state mutations before executing

- **Context**: src/app/plan/page.tsx — "Pick this set" button immediately deducts supply quantities with no undo path.
- **Problem**: Irreversible client-side mutations (deleting data, deducting quantities, clearing state) triggered by a single click can cause data loss on misclick. When combined with optimistic updates and async server sync, the user has no recovery path if they act accidentally.
- **Rule**: Any user action that irreversibly mutates persisted state (deductions, deletions, resets) must have a confirmation step — either a confirm dialog, an undo window, or a two-step UI (select → confirm). Trivial toggles and editable fields are exempt.
- **Applies to**: plan, implement, impl-review

## Never use silent catch blocks — always log the error

- **Context**: src/lib/generate.ts — async functions calling external APIs (OpenAI) with empty `catch {}` blocks.
- **Problem**: Silent catch blocks swallow all errors (timeouts, network failures, JSON parse errors) indistinguishably. When generation returns null, there's no observability into whether it was a constraint violation, a network issue, or a bug. Debugging requires reproducing the exact conditions.
- **Rule**: Every catch block must log the error with at minimum `console.warn("[functionName] failed:", error)`. Never use bare `catch {}` or `catch { return null }` without logging.
- **Applies to**: plan, implement, impl-review

## No magic numbers — extract named constants for domain values

- **Context**: src/lib/generate.ts and src/lib/validate-constraints.ts — the number 400 (snack calorie reserve) appeared in both files without a name or comment.
- **Problem**: Magic numbers duplicated across files drift silently. A maintainer changes one without the other, producing inconsistent behavior that passes tests in isolation but breaks in production. Domain-meaningful values deserve a name that explains *what* and *why*.
- **Rule**: Extract domain-meaningful numeric literals into named constants with a JSDoc comment. Place shared constants in `src/lib/constants.ts`. Per-module constants can stay local. Never duplicate a magic number across files.
- **Applies to**: plan, implement, impl-review