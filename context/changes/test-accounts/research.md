---
date: 2026-05-29T22:23:15+02:00
researcher: Kiro
git_commit: b6f2c54
branch: main
repository: fridge-explorer
topic: "Test accounts for agent-based API testing"
tags: [research, codebase, auth, testing, agents, api]
status: complete
last_updated: 2026-05-29
last_updated_by: Kiro
---

# Research: Test Accounts for Agent-Based API Testing

**Date**: 2026-05-29T22:23:15+02:00
**Researcher**: Kiro
**Git Commit**: b6f2c54
**Branch**: main
**Repository**: fridge-explorer

## Research Question

Can test accounts (once implemented) be used by agents to programmatically test new API endpoints? What's the auth flow, and what needs to change?

## Summary

**Yes — test accounts can enable full programmatic API testing by agents.** The auth system uses JWT sessions stored in cookies. Once test accounts bypass the magic link flow and return a session token directly, an agent can include that token as a `Cookie: fridge-session=<jwt>` header in all subsequent API calls. All 7 session-protected endpoints use the same `verifySession()` function, so a single token works everywhere.

**Key insight**: In local dev, an agent can already mint valid JWTs without any code changes (the secret defaults to `"dev-secret-change-in-production"`). The test-accounts feature formalizes this into a proper, env-gated bypass.

## Detailed Findings

### Auth Architecture

- `verifySession()` reads exclusively from the `fridge-session` cookie (`src/lib/auth.ts:49-57`)
- No `Authorization: Bearer` header support exists
- Session tokens are HS256 JWTs with `{ email }` payload, 30-day expiry (`src/lib/auth.ts:41-46`)
- Secret: `process.env.JWT_SECRET` or `"dev-secret-change-in-production"` (`src/lib/auth.ts:6-8`)

### Current Login Flow (blocks agents)

1. `POST /api/auth/send` — accepts `{ email }`, generates magic token, stores in Redis, **emails it** (`src/app/api/auth/send/route.ts:4-25`)
2. `GET /api/auth/verify?token=...` — consumes token from Redis, creates JWT, sets cookie via redirect (`src/app/api/auth/verify/route.ts:6-21`)

The magic token is never returned in the API response — only sent via email. This blocks headless testing.

### API Surface (11 endpoints)

| Auth Pattern | Endpoints | Agent-Testable with Session Cookie? |
|---|---|---|
| `verifySession()` (cookie) | 7 endpoints (supplies, settings, generate-meals, plan/today, supplies/parse) | ✅ Yes, with test account JWT |
| Bearer token (env var) | 2 endpoints (admin/metrics, cron/generate) | ✅ Already testable with env vars |
| Public (no auth) | 2 endpoints (auth/send, auth/verify) | ✅ Always testable |

### How Test Accounts Enable Agent Testing

With the planned test-accounts feature, the `/api/auth/send` endpoint would detect a test email and **return a session token directly** (or auto-redirect through verify). The agent workflow becomes:

```
1. POST /api/auth/send { "email": "test1@fridge.dev" }
   → Response includes session token (or Set-Cookie header)

2. All subsequent requests include:
   Cookie: fridge-session=<jwt>

3. Agent can now call any protected endpoint:
   - PUT /api/user/supplies (seed test data)
   - POST /api/generate-meals (test generation)
   - POST /api/generate-snacks (test new features)
   - GET /api/user/supplies (verify state)
```

### Three Implementation Options for Agent Access

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A. Bypass in /api/auth/send** ⭐ | Test emails get token in response body | Minimal change, single endpoint, env-gated | Slightly non-standard response shape for test vs real |
| **B. Add Bearer header to verifySession()** | Check `Authorization: Bearer <jwt>` before cookies | Standard API auth pattern, works with any HTTP client | Changes auth contract for all endpoints; security surface |
| **C. Dedicated /api/auth/test-login** | New endpoint, dev-only, returns JWT for any test email | Clean separation, obvious intent | Extra endpoint to maintain; must be disabled in prod |

**Recommended: Option A** — it's the simplest, keeps the auth contract unchanged, and the test-accounts feature already plans to modify `/api/auth/send`.

### Dev-Mode Shortcut (works today, no code changes)

Since `JWT_SECRET` defaults to `"dev-secret-change-in-production"` in dev, an agent can mint its own valid JWT:

```typescript
// Agent-side: create a valid session token
import { SignJWT } from "jose";
const secret = new TextEncoder().encode("dev-secret-change-in-production");
const token = await new SignJWT({ email: "test1@fridge.dev" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(secret);
// Use: Cookie: fridge-session=<token>
```

This works immediately for local testing but is fragile (depends on knowing the secret).

### Test Data Seeding

No seed scripts exist, but the KV layer exports everything needed (`src/lib/kv.ts`):
- `createUser(email)` — creates user with defaults
- `setUser(email, data)` — writes full UserData
- `redis` — raw Upstash Redis client

An agent testing flow would be:
1. Authenticate (get session cookie)
2. Seed supplies via `PUT /api/user/supplies`
3. Seed settings via `PUT /api/user/settings`
4. Test the target endpoint (e.g., `POST /api/generate-snacks`)
5. Verify state via `GET /api/user/supplies`

All seeding can happen through existing API endpoints — no direct Redis access needed.

## Code References

- `src/lib/auth.ts:6-8` — JWT secret (defaults to dev value)
- `src/lib/auth.ts:9` — Cookie name: `fridge-session`
- `src/lib/auth.ts:14-15` — `generateMagicToken()` (random 64-char hex)
- `src/lib/auth.ts:18-27` — `storeMagicToken()` (Redis with 15-min TTL)
- `src/lib/auth.ts:41-46` — `createSessionToken()` (HS256 JWT, 30-day expiry)
- `src/lib/auth.ts:49-57` — `verifySession()` (cookie-only)
- `src/lib/auth.ts:59-66` — `setSessionCookie()` (httpOnly, secure in prod)
- `src/app/api/auth/send/route.ts:4-25` — Magic link send endpoint
- `src/app/api/auth/verify/route.ts:6-21` — Token verification + session creation
- `src/lib/kv.ts:24` — Redis key pattern: `user:{email}`

## Architecture Insights

- The auth system is simple and consistent — all protected endpoints use the same `verifySession()` → cookie → JWT path
- Adding test-account bypass at the `/api/auth/send` level is the natural insertion point — it's where the "send email" decision happens
- The response shape change for test accounts is minimal: add `{ ok: true, token?: string }` where `token` is only present for test emails
- No middleware.ts exists — auth is checked per-route, which means test accounts don't need middleware changes

## Historical Context

- `context/archive/2026-05-26-email-magic-link-auth/` — Original auth implementation
- `context/foundation/roadmap.md` — F-03 test-accounts is `ready` status, depends on F-01 (done)

## Open Questions

1. **Should the test-account bypass return the JWT in the response body, or set it as a Set-Cookie header?** Response body is more agent-friendly (no cookie parsing needed); Set-Cookie is more browser-friendly for manual demo testing. Could do both.
2. **Should test accounts have pre-seeded data?** An agent could seed via API, but pre-seeded supplies/settings would make testing faster.
3. **Should we add an Authorization header fallback to `verifySession()`?** Not strictly needed for test accounts, but would make all API testing simpler (no cookie management). Small change (~5 lines) with broader benefit.
