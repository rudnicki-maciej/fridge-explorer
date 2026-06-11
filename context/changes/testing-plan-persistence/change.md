---
change_id: testing-plan-persistence
title: Test plan persistence and cost control (Phase 3 rollout)
status: implemented
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: Plan persistence and cost control . Risks covered: #4 (Pre-generated or picked meal plans are not persisted to Redis, causing redundant LLM calls on every app open and escalating token costs), #6 (Cron pre-generation job fails silently — no plan available when user opens the app, triggering on-demand generation cost + latency). Test types planned: integration + unit. Risk response intent: - #4: Prove that opening the app when a pre-generated plan exists does NOT trigger a new LLM call; the persisted plan is served. Challenge: We persist plans, so they'll always be there — assumes the write succeeded and read path prefers it. Avoid: Snapshot-testing Redis key structure — tests format, not don't regenerate behavior. - #6: Prove that when cron runs and succeeds, a verifiable signal is written; when it fails, the failure is observable without opening the app. Challenge: Metrics exist, so we'll see it — assumes current metrics cover cron specifically. Avoid: Testing only that cron returns 200 — a 200 with no plan written is a silent failure. After creating the folder, follow the downstream continuation rule.
