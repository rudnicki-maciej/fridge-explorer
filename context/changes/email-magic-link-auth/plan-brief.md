# Email Magic-Link Authentication — Plan Brief

> Full plan: `context/changes/email-magic-link-auth/plan.md`

## What & Why

Replace the scaffold 6-character code auth with email magic-link authentication so user data is tied to a stable email identity that survives device resets and enables multi-device sync. The current code-based system was a placeholder — it has no recovery mechanism and codes are easily lost.

## Starting Point

The app has a working but minimal auth layer: random 6-char codes as user IDs, JWT session cookies (1-year TTL) via `jose`, user data stored in Upstash Redis as `user:{code}`. Two routes exist: `/api/auth/create` (new user) and `/api/auth/link` (link device via code). No login page — users are auto-created on first visit.

## Desired End State

Users enter their email on a login page, receive a magic-link email (via Resend), click it, and are authenticated with a 30-day session. New accounts are created automatically on first login. All user data is keyed by email in Redis. Protected routes redirect unauthenticated users to `/login`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| User identity model | Email as primary, no migration | Pre-launch app with no real users — clean slate is simplest |
| Email delivery service | Resend | Best DX, generous free tier (100/day), TypeScript SDK, works well with Vercel |
| Magic-link token TTL | 15 minutes | Industry standard balancing security with realistic email delivery delays |
| Token reuse policy | Single-use (deleted on first click) | Prevents replay attacks from browser history or email logs |
| Session duration | 30 days | Balances daily-use convenience with reasonable security |
| Sign-up vs sign-in UX | Single email input with info note | Minimal friction — user never thinks "do I have an account?" |
| Re-request behavior | Invalidate previous token | Clear mental model — only the latest link works |

## Scope

**In scope:**
- Resend integration for email delivery
- Magic-link token generation, storage (Redis), and verification
- New API routes: `/api/auth/send` and `/api/auth/verify`
- Login page with email input and "check your email" state
- Middleware auth guard for protected routes
- Session cookie with 30-day TTL
- Redis user keys migrated from `user:{code}` to `user:{email}`

**Out of scope:**
- Migration of existing user data
- Rate limiting on magic-link requests
- Custom email templates (minimal HTML is fine)
- OAuth providers
- Password fallback
- Logout UI (cookie clearing only)

## Architecture / Approach

Linear flow: User enters email → `POST /api/auth/send` generates a token, stores `magic:{token}` → email in Redis (15-min TTL), sends email via Resend → User clicks link → `GET /api/auth/verify?token=...` validates token, creates/finds user, sets JWT session cookie → Redirect to `/plan`. Middleware checks cookie presence on protected routes and redirects to `/login` if missing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Auth Infrastructure | Resend SDK, token gen/storage/verify logic, updated session TTL | None — pure library code |
| 2. API Routes | `/api/auth/send` and `/api/auth/verify` endpoints | Resend delivery reliability in dev (mitigated by `onboarding@resend.dev`) |
| 3. User Identity Migration | Redis keys use email, all routes verified | Minimal — string interface unchanged |
| 4. Login UI | Login page, middleware auth guard, redirect flow | None — straightforward Next.js patterns |

**Prerequisites:** Resend account (free tier), `RESEND_API_KEY` env var, `NEXT_PUBLIC_APP_URL` env var
**Estimated effort:** ~2-3 sessions across 4 phases

## Open Risks & Assumptions

- Resend free tier (100 emails/day) is sufficient for a personal app — true for foreseeable future
- `onboarding@resend.dev` sender works for development without domain verification
- No existing users need migration (pre-launch assumption)

## Success Criteria (Summary)

- User can authenticate via email magic link end-to-end (enter email → receive link → click → authenticated)
- Unauthenticated users are redirected to login page
- Magic links expire after 15 minutes and are single-use
