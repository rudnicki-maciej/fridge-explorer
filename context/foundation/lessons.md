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
