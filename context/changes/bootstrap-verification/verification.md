---
bootstrapped_at: 2026-05-24T17:29:44Z
starter_id: next
starter_name: "Next.js"
project_name: fridge-explorer
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: next
package_manager: npm
project_name: fridge-explorer
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

Solo developer shipping a meal-planning web app in 4 weeks (after-hours) with auth and AI/LLM meal generation. Custom path — initially considered 10x Astro Starter but switched to Next.js because edge-runtime constraints on Cloudflare Workers complicate long-running LLM calls. Next.js clears all four agent-friendly gates (typed, convention-based, popular in training data, well-documented) with verified bootstrapper confidence. Vercel deployment is the starter's default and pairs naturally with Next.js server actions for AI calls. TypeScript + PostgreSQL preferences are satisfied; auth will be added via NextAuth or similar.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | create-next-app v16.2.6 published 2026-05-23 | fresh | resolved from cmd_template |
| GitHub repo | not run | — | gh CLI not authenticated |

## Scaffold log

**Resolved invocation**: `npx create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 13
**Conflicts (.scaffold siblings)**: AGENTS.md → AGENTS.md.scaffold
**.gitignore handling**: moved silently (none existed in cwd)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/1/0 direct of total 0/0/2/0

#### MODERATE findings

- **postcss** <8.5.10 — PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output. Advisory: GHSA-qx2v-qp2m-jg93. CVSS: 6.1. Transitive via `next`. Fix requires major version downgrade of `next` to 9.3.3 (not viable).
- **next** 9.3.4-canary.0 – 16.3.0-canary.5 — affected via transitive `postcss` dependency. Same advisory.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | verified |
| quality_override | false |
| path_taken | custom |
| self_check_answers | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: false |
| team_size | solo |
| deployment_target | vercel |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
