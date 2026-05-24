---
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
---

## Why this stack

Solo developer shipping a meal-planning web app in 4 weeks (after-hours) with auth and AI/LLM meal generation. Custom path — initially considered 10x Astro Starter but switched to Next.js because edge-runtime constraints on Cloudflare Workers complicate long-running LLM calls. Next.js clears all four agent-friendly gates (typed, convention-based, popular in training data, well-documented) with verified bootstrapper confidence. Vercel deployment is the starter's default and pairs naturally with Next.js server actions for AI calls. TypeScript + PostgreSQL preferences are satisfied; auth will be added via NextAuth or similar.
