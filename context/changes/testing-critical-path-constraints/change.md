---
change_id: testing-critical-path-constraints
title: Prove disallow-list and calorie-target enforcement on generated meal sets
status: implementing
created: 2026-06-02
updated: 2026-06-03
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: Critical-path generation constraints. Risks covered: #1 (disallow-list violation), #2 (calorie target exceeded). Test types planned: unit + integration. Risk response intent:
- Risk #1: Prove that a generated meal set contains zero ingredients matching any disallow-list item. The LLM is probabilistic — prompt compliance is not guaranteed.
- Risk #2: Prove that total calories across all meals in a generated set sum to at most the daily target. Per-meal calorie values must be validated post-generation, not trusted from the prompt alone.
