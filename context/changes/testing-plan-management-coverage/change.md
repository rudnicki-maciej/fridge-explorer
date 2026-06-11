---
change_id: testing-plan-management-coverage
title: Plan-management test coverage for Phase 5 risks 8–10
status: implemented
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 5 of context/foundation/test-plan.md: Plan-management coverage . Risks covered: #8 (stale options from timezone date bug), #9 (double-deduction on re-pick), #10 (reset fails to show options/error). Test types planned: integration + unit. Risk response intent: - #8: prove ?options=true returns correct options for today and 404 for stale dates, regardless of timezone. - #9: prove full undo→re-deduct sequence yields original supplies minus new set only. - #10: prove reset restores supplies AND surfaces options (or error on fetch failure). After creating the folder, follow the downstream continuation rule.
