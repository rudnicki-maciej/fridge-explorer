# Deploy Plan — First Production Deployment

**Date:** 2026-05-25
**Platform:** Vercel (Hobby tier)
**Production URL:** https://fridge-explorer.vercel.app
**Region:** iad1 (Washington, D.C., USA East)

## What Was Deployed

Next.js 16.2.6 (App Router, Turbopack) application with:
- 4 static pages: `/`, `/plan`, `/settings`, `/supplies`
- 7 dynamic API routes: auth (create, link), cron/generate, generate-meals, plan/today, user/settings, user/supplies

## Steps Executed

1. **Local build verification** — `npm run build` passed. Upstash Redis warnings expected (env vars not set locally).
2. **Vercel CLI installed** — `npm i -g vercel` (v54.4.1).
3. **Authentication** — `vercel login` (browser-based OAuth).
4. **Project linked** — `vercel link --yes` → linked as `maciej-r-projects/fridge-explorer`. GitHub repo auto-connect failed (private repo); not required for CLI deploys.
5. **Deployed** — `vercel` triggered build + deploy. First deployment auto-promoted to production.
6. **Verified** — `curl -L https://fridge-explorer.vercel.app` returns HTTP 200.

## Manual Gates (completed by human)

- Vercel account creation (pre-existing)
- `vercel login` authentication

## Environment Variables — Not Yet Configured

The following secrets need to be set via `vercel env add <NAME> production` before the app is fully functional:

- `KV_REST_API_URL` — Upstash Redis REST URL (e.g., `https://your-db.upstash.io`)
- `KV_REST_API_TOKEN` — Upstash Redis REST token
- `OPENAI_API_KEY` — OpenAI API key for meal plan generation
- `OPENAI_MODEL` — *(optional)* model name, defaults to `gpt-4o-mini`
- `CRON_SECRET` — secret token used to authenticate the scheduled cron job (`/api/cron/generate`)

> **Note:** The codebase reads `KV_REST_API_URL` and `KV_REST_API_TOKEN` (see `src/lib/kv.ts`). Set these exact names in Vercel — not the Upstash dashboard defaults (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).

## Scheduled Task (Vercel Cron)

Configured in `vercel.json`:

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/generate` | `0 3 * * *` (daily at 3:00 UTC) | Pre-generates next-day meal plans for all users with stocked supplies |

Vercel automatically calls this endpoint on schedule and passes the `CRON_SECRET` as a Bearer token in the `Authorization` header. The secret must be set in env vars for the job to succeed.

## Operational Commands

| Action | Command |
|--------|---------|
| Deploy preview | `vercel` |
| Deploy production | `vercel --prod` |
| Rollback | `vercel rollback` |
| Tail logs | `vercel logs https://fridge-explorer.vercel.app --follow` |
| Pull env vars locally | `vercel env pull .env.local` |
| Add secret | `vercel env add <NAME> production` |

## Known Limitations (Hobby Tier)

- 4 CPU-hours/month (monitor for AI workloads)
- 60s max function duration
- 1-hour log retention
- Personal/non-commercial use only
- No log drains (external logging recommended)

## Next Steps

- Configure Upstash Redis env vars in Vercel
- Add LLM API key
- Set up GitHub integration for auto-deploy on push (optional — CLI deploys work)
