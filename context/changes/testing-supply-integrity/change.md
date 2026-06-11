---
change_id: testing-supply-integrity
title: "E2E and unit tests for supply integrity: deduction math and NL dedup"
status: implementing
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: Supply integrity . Risks covered: #3 (picking a meal set deducts wrong supply amounts or fails to deduct, corrupting inventory state), #5 (NL supply parser creates duplicate items from typos or near-synonyms instead of matching existing entries). Test types planned: unit + integration. Risk response intent: - #3: Prove that after picking a set, each recipe ingredient amount is subtracted from the correct supply item; items at 0 are removed; no phantom items appear. Challenge: LLM returns exact names so deduction always matches. Avoid: mocking the entire supplies object and asserting called with — tests the mock, not the math. - #5: Prove that adding a supply via NL text that is a near-synonym or typo of an existing item merges rather than creates a duplicate. Challenge: We pass existing items as context — assumes LLM always uses the hint. Avoid: asserting the prompt includes the items list — template test, not merge-behavior test. After creating the folder, follow the downstream continuation rule.
