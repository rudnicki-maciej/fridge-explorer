---
project: fridge-explorer
researched_at: 2026-05-25
recommended_platform: Vercel
runner_up: Cloudflare Workers + Pages
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Next.js 16
  runtime: Node.js
---

## Recommendation

**Deploy on Vercel.**

Vercel is the native deployment platform for Next.js — zero-config, instant deploys, and the only platform where every Next.js feature works without an adapter layer. The Hobby tier ($0/mo) comfortably handles MVP traffic for a personal meal-planning app. The developer interview confirmed no persistent connections, single-region use, and cost minimization as the top priority — Vercel's free tier satisfies all three. The scoring matrix gave Vercel 4.5/5 (only losing a half-point for MCP being in beta), and the cost weight pushed it above Cloudflare (whose Next.js adapter is itself beta) and Railway ($5/mo minimum).

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Vercel** | Pass | Pass | Pass | Pass | Partial (MCP beta) | 4.5 |
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | 5.0 |
| **Netlify** | Partial | Pass | Pass | Partial | Pass | 4.0 |
| **Railway** | Pass | Pass | Pass | Pass | Pass | 5.0 |
| **Fly.io** | Pass | Partial | Partial | Pass | Partial | 3.5 |
| **Render** | Partial | Pass | Pass | Partial | Pass | 4.0 |

**Notes on scoring:**

- **Vercel**: CLI covers deploy, rollback, logs, env management. Fully managed serverless. Docs available as `llms-full.txt` (GA). `vercel --prod` is deterministic with structured output. MCP server exists but is Public Beta.
- **Cloudflare**: Wrangler CLI is excellent. Fully serverless with unlimited wall-time. Docs have `llms.txt` and per-page markdown. MCP servers are GA. Scored highest raw, but the `@opennextjs/cloudflare` adapter being beta is a practical risk not captured in criteria scoring.
- **Netlify**: No dedicated CLI rollback command (API-only). Credit-based pricing is harder to predict. MCP server is GA and well-documented.
- **Railway**: Full CLI coverage including MCP install. Zero-config Next.js via Railpack. Docs serve `llms.txt` and `llms-full.txt`. $5/mo minimum cost penalized it in the cost-weighted ranking.
- **Fly.io**: Requires Docker (not managed/serverless in the same sense). No `llms.txt`. MCP is experimental. No free tier for new accounts.
- **Render**: No CLI rollback (dashboard-only). Free tier sleeps after 15 min with 30-55s cold starts. MCP server is GA.

**Cost-weighted adjustment:** Vercel ($0) and Cloudflare ($0-5) rose above Railway ($5/mo min), Fly.io ($6-12/mo), and Render ($7/mo for always-on). Cloudflare's beta adapter risk dropped it below Vercel for a Next.js 16 project.

### Shortlisted Platforms

#### 1. Vercel (Recommended)

Native Next.js platform with zero-config deployment. The Hobby tier includes 1M function invocations, 100 GB bandwidth, and 6,000 build minutes — more than sufficient for a personal MVP. Every Next.js 16 feature (App Router, Server Actions, ISR, image optimization, Turbopack builds) works out of the box. The `vercel` CLI provides deploy, rollback, logs, and env management with deterministic exit codes.

#### 2. Cloudflare Workers + Pages

Strongest raw score (5.0/5) with unlimited wall-time for streaming LLM responses, $0 free tier (100K requests/day), and GA MCP servers. The critical gap: Next.js 16 requires the `@opennextjs/cloudflare` adapter which is in beta (1.0.0-beta). For a solo developer on a 4-week timeline, debugging adapter edge cases is an unacceptable time risk. If the adapter reaches GA, Cloudflare becomes the stronger long-term choice.

#### 3. Railway

Excellent DX with zero-config Next.js detection, GA MCP server, and co-located Postgres/Redis. The $5/mo minimum (no free tier after 30-day trial) is the only reason it ranks third — for a cost-sensitive personal MVP, paying from day one when a $0 alternative exists is unnecessary friction.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **4 CPU-hours/month is dangerously low for AI workloads.** Each LLM server action consuming ~1s CPU means the cap hits at ~14,400 requests/month. A personal app generating 5 meals/day is fine (~150 req/mo), but testing, retries, or any growth forces a Pro upgrade ($20/mo).
2. **Hobby plan is personal/non-commercial only.** Monetization or public product launch requires immediate upgrade to Pro — no gradual path.
3. **Function duration cap at 60s on Hobby.** Complex multi-step LLM prompts that don't stream may timeout, forcing streaming patterns even when simpler approaches would suffice.
4. **Vendor lock-in is real.** Vercel's ISR caching, image optimization, and edge middleware behave differently elsewhere. Migration means rewriting deployment config.
5. **Log retention is 1 hour on Hobby.** Post-incident debugging is nearly impossible without external logging.

### Pre-Mortem — How This Could Fail

Six months in, the meal-planning app gained traction after being shared online. 200 daily users each generating 3 meal sets means 600 LLM calls/day at ~800ms CPU each. Monthly CPU: 600 × 30 × 0.8s = 14,400 seconds = exactly 4 CPU-hours. The app started returning 503 errors mid-month as quota exhausted. The developer upgraded to Pro ($20/mo) but discovered the Hobby-to-Pro migration reset some deployment settings. The non-commercial clause meant the app technically violated ToS for months. The 60s timeout had already forced meal generation into multiple sequential calls instead of one comprehensive prompt, adding latency. The 1-hour log retention meant debugging empty meal plans was impossible — errors had rotated out before investigation.

### Unknown Unknowns

- **Fluid Compute's CPU accounting boundary is opaque.** The line between "waiting on network" (free) and "processing streamed tokens" (billed) during LLM streaming is not clearly documented. CPU-hours may burn faster than expected.
- **Preview deployments share the Hobby CPU pool.** Active development with frequent pushes can exhaust quota before real users touch the app.
- **Next.js 16 server actions have different caching behavior on Vercel vs. self-hosted.** Vercel applies aggressive caching that may serve stale meal plans unless explicitly opted out with `revalidate: 0`.
- **Vercel's AI SDK ecosystem creates soft lock-in.** The path of least resistance pulls toward AI Gateway and their observability tools; opting out means less documentation coverage for your setup.

## Operational Story

- **Preview deploys**: Every git push to a non-production branch creates a unique preview URL (e.g., `project-git-branch-user.vercel.app`). Preview URLs are public by default on Hobby — no access protection available without Pro. Fork PRs from external contributors also get previews.
- **Secrets**: Environment variables stored in Vercel's project settings (encrypted at rest). Scoped per environment (Production / Preview / Development). Pulled locally via `vercel env pull .env.local`. No rotation automation — manual update via dashboard or `vercel env rm` + `vercel env add`.
- **Rollback**: `vercel rollback` instantly promotes the previous production deployment. Time-to-revert: <10 seconds. Caveat: database migrations are not rolled back — only the application code reverts.
- **Approval**: Human-required actions: publish custom domain DNS, upgrade plan tier, delete project, rotate integration tokens. Agent-safe actions: deploy, rollback, tail logs, pull env vars, create preview deployments.
- **Logs**: `vercel logs <deployment-url>` streams runtime logs. `vercel logs <url> --follow` for live tail. Retention: 1 hour on Hobby. For persistent logging, pipe to an external service from application code.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| CPU quota exhaustion at growth | Devil's advocate | Medium | High | Monitor via Vercel dashboard; budget for Pro upgrade ($20/mo) if >150 AI calls/day |
| Non-commercial ToS violation | Devil's advocate | Low | High | Keep as personal tool for MVP; upgrade to Pro before any public launch |
| Function timeout on complex LLM calls | Devil's advocate | Medium | Medium | Use streaming responses (Vercel AI SDK); keep individual calls under 30s |
| Vendor lock-in complicates migration | Devil's advocate | Low | Medium | Avoid Vercel-specific APIs where standard Next.js alternatives exist |
| Cannot debug production issues (1h logs) | Pre-mortem | Medium | Medium | Add structured logging to external service (e.g., Axiom free tier) early |
| Preview deploys exhaust CPU pool | Unknown unknowns | Low | Medium | Limit preview builds; use `vercel --no-wait` for non-critical branches |
| Stale meal plans from aggressive caching | Unknown unknowns | Medium | Low | Set `revalidate: 0` on all AI-generated server action responses |
| Platform outage (single vendor) | Research finding | Low | High | Accept for MVP; Cloudflare is documented fallback if Vercel becomes unreliable |

## Getting Started

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Link the project:**
   ```bash
   cd fridge-explorer
   vercel link
   ```
   Follow prompts to connect to your Vercel account and create the project.

3. **Deploy to preview:**
   ```bash
   vercel
   ```
   This deploys a preview build. Verify the app works at the generated URL.

4. **Deploy to production:**
   ```bash
   vercel --prod
   ```

5. **Set environment variables** (for LLM API keys):
   ```bash
   vercel env add OPENAI_API_KEY production
   ```

Note: `npm run dev` (Turbopack) provides full development fidelity locally — no Vercel-specific local dev command needed. The `vercel dev` command exists but is redundant for Next.js 16 projects where `next dev` already emulates the production runtime.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
