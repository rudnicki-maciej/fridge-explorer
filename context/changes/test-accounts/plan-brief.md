# Test Accounts — Plan Brief

> Full plan: `context/changes/test-accounts/plan.md`
> Research: `context/changes/test-accounts/research.md`

## What & Why

Add 10 test accounts that bypass magic link auth for instant access. Resend dev mode only allows one verified email, making testing and demos painful. This also enables programmatic API testing by agents via Bearer header support.

## Starting Point

Auth uses magic link flow: `/api/auth/send` emails a token → user clicks → `/api/auth/verify` sets a session cookie. `verifySession()` reads cookies only — no programmatic access path exists.

## Desired End State

Entering `test1@fridge.dev` (through `test10@fridge.dev`) on the login page shows a brief interstitial then grants immediate access. Agents can authenticate via the API and use `Authorization: Bearer <jwt>` on any protected endpoint.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-------------------|--------|
| Test email configuration | Hardcoded pattern `test[1-10]@fridge.dev` | Zero configuration needed, self-documenting | Plan |
| Programmatic auth | Add Bearer header to `verifySession()` | Standard REST pattern, makes all API testing trivial for agents | Plan |
| Login UX for test accounts | Brief interstitial before redirect | User sees feedback that bypass worked without adding delay | Plan |
| Bypass insertion point | Modify `/api/auth/send` | Natural decision point where "send email" happens; minimal change | Research |

## Scope

**In scope:**
- `isTestAccount()` helper with hardcoded regex
- Bearer header fallback in `verifySession()`
- `/api/auth/send` returns token directly for test emails
- Login page interstitial + redirect for test accounts

**Out of scope:**
- Env var configuration for test emails
- Pre-seeded data for test accounts
- Production safeguards beyond pattern specificity
- Rate limiting for test accounts

## Architecture / Approach

Two-point change: (1) `verifySession()` gains a Bearer header check before cookie fallback — one function, all endpoints covered. (2) `/api/auth/send` detects test emails and short-circuits the magic link flow, returning a JWT directly and setting the cookie. The login page reads the response and shows an interstitial before redirecting.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Auth bypass & Bearer | Backend: test detection + token return + Bearer support | Regex must be exact to prevent bypass |
| 2. Login interstitial | Frontend: smooth UX for test account login | None significant |

**Prerequisites:** F-01 (email-magic-link-auth) — done.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Test email pattern (`fridge.dev` domain) is not a real domain — if it becomes one, test accounts could collide with real users
- No production gate — test accounts work in all environments (acceptable for single-user MVP)

## Success Criteria (Summary)

- Test emails grant immediate session without email delivery
- Agents can authenticate and call any protected endpoint via Bearer header
- Regular email login flow is unchanged (no regression)
