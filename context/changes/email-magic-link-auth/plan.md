# Email Magic-Link Authentication Implementation Plan

## Overview

Replace the existing 6-character code-based authentication with email magic-link authentication. Users enter their email, receive a one-time link via Resend, and clicking it creates a session. User data is keyed by email in Redis. This establishes a stable identity for multi-device sync that survives device resets.

## Current State Analysis

The app has a working but scaffold-level auth system:
- `src/lib/auth.ts` — JWT creation/verification via `jose`, session cookie management
- `src/app/api/auth/create/route.ts` — generates a random 6-char code, creates user in Redis, sets session cookie
- `src/app/api/auth/link/route.ts` — accepts a code, verifies it exists in Redis, sets session cookie
- `src/lib/kv.ts` — Redis operations keyed by `user:{code}`, plus a `users` set for cron iteration
- All API routes call `verifySession()` which returns the code from the JWT
- No middleware.ts — auth is checked per-route
- Session cookie TTL is 1 year

### Key Discoveries:

- `src/lib/auth.ts:5` — JWT secret from `JWT_SECRET` env var, cookie named `fridge-session`
- `src/lib/kv.ts:30` — `userKey()` helper builds `user:{userId}` — single point to change
- `src/lib/kv.ts:46` — `createUser()` also adds to `users` set for cron iteration
- `src/app/api/user/settings/route.ts` and `src/app/api/user/supplies/route.ts` — both use `verifySession()` → `getUser(userId)` pattern
- No login page exists — the app currently auto-creates a user on first visit (via client-side fetch to `/api/auth/create`)

## Desired End State

After this plan is complete:
- User visits the app → sees a login page with an email input and a note that a new account will be created if one doesn't exist
- User enters email → receives a magic-link email via Resend within seconds
- User clicks the link → session cookie is set (30-day TTL), redirected to `/plan`
- All user data in Redis is keyed by email (`user:{email}`)
- Magic-link tokens are stored in Redis with 15-min TTL, single-use, and invalidated when a new one is requested for the same email
- Protected routes return 401 without a valid session; the app redirects unauthenticated users to `/login`

### Verification:
- `npm run build` passes with no type errors
- `npm run lint` passes
- Manual test: enter email → receive email → click link → land on `/plan` authenticated
- Manual test: request new link → old link stops working
- Manual test: link expires after 15 minutes

## What We're NOT Doing

- No migration of existing code-based user data (pre-launch personal app, no real users)
- No email verification separate from login (magic link IS the verification)
- No password fallback
- No OAuth providers
- No rate limiting on magic-link requests (post-MVP concern)
- No custom email templates (plain text or minimal HTML is fine)

## Implementation Approach

Linear replacement: build the new auth infrastructure first, then swap the API routes, then update the data layer, then add the UI. Each phase is independently verifiable. Since there are no real users, we can drop the old code-based system without migration.

## Phase 1: Auth Infrastructure

### Overview

Install Resend, create magic-link token generation/storage/verification logic, and update session management to use 30-day TTL with email as the subject.

### Changes Required:

#### 1. Install Resend dependency

**File**: `package.json`

**Intent**: Add the Resend SDK for sending magic-link emails.

**Contract**: Add `resend` to `dependencies`.

#### 2. Create email sending module

**File**: `src/lib/email.ts` (new)

**Intent**: Encapsulate Resend client initialization and magic-link email sending. Keeps email delivery concerns separate from auth logic.

**Contract**: Exports `sendMagicLinkEmail(email: string, token: string): Promise<void>`. Constructs the magic-link URL from `NEXT_PUBLIC_APP_URL` env var + `/api/auth/verify?token={token}`. Sends via Resend using `RESEND_API_KEY` env var. From address: configurable via `EMAIL_FROM` env var (defaults to `onboarding@resend.dev` for development).

#### 3. Update auth module

**File**: `src/lib/auth.ts`

**Intent**: Replace code-based helpers with magic-link token generation and session creation keyed by email. Remove `generateUserCode()`. Update `createSessionToken()` to accept email and set 30-day expiry. Keep `verifySession()` returning the email string. Update cookie maxAge to 30 days.

**Contract**:
- Remove: `generateUserCode()`
- `createSessionToken(email: string): Promise<string>` — JWT with `{ email }` payload, `exp` set to 30 days
- `verifySession(): Promise<string | null>` — returns email from JWT payload (was userId/code)
- `setSessionCookie(token: string)` — `maxAge` changes from 1 year to `60 * 60 * 24 * 30`
- New: `generateMagicToken(): string` — crypto-random URL-safe token (32 bytes, hex-encoded)
- New: `storeMagicToken(email: string, token: string): Promise<void>` — stores in Redis as `magic:{token}` → `email`, TTL 15 min. Also deletes any previous token for this email (stored as `magic-email:{email}` → `token`).
- New: `verifyMagicToken(token: string): Promise<string | null>` — looks up `magic:{token}`, returns email if found, deletes both keys (single-use).

#### 4. Update environment variables

**File**: `.env.example`

**Intent**: Document the new env vars required for magic-link auth.

**Contract**: Add `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL` (e.g., `http://localhost:3000`), `EMAIL_FROM` (optional, defaults to `onboarding@resend.dev`). Remove `JWT_SECRET` comment about "generate-a-random-32-char-string" — keep the var but update the comment to note it's for session signing.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- N/A for this phase (no routes to call yet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: API Routes

### Overview

Replace the existing auth routes with magic-link send and verify endpoints.

### Changes Required:

#### 1. Create send magic-link route

**File**: `src/app/api/auth/send/route.ts` (new, replaces `create/`)

**Intent**: Accept an email address, generate a magic-link token, store it in Redis, and send the email via Resend. This is the single entry point for both sign-up and sign-in.

**Contract**: `POST` handler. Request body: `{ email: string }`. Validates email format (basic regex). Calls `generateMagicToken()`, `storeMagicToken(email, token)`, `sendMagicLinkEmail(email, token)`. Returns `{ ok: true }` on success, `{ error }` on failure.

#### 2. Create verify magic-link route

**File**: `src/app/api/auth/verify/route.ts` (new, replaces `link/`)

**Intent**: Validate the magic-link token from the URL query param, create or find the user, set the session cookie, and redirect to `/plan`.

**Contract**: `GET` handler (user clicks a link). Reads `token` from URL search params. Calls `verifyMagicToken(token)`. If invalid/expired, redirects to `/login?error=expired`. If valid, calls `getUser(email)` — if null, calls `createUser(email)`. Then `createSessionToken(email)` → `setSessionCookie(token)` → redirect to `/plan`.

#### 3. Delete old auth routes

**File**: `src/app/api/auth/create/route.ts` (delete)
**File**: `src/app/api/auth/link/route.ts` (delete)

**Intent**: Remove the code-based auth routes that are no longer needed.

**Contract**: Delete both files entirely.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `POST /api/auth/send` with `{ "email": "test@example.com" }` returns `{ "ok": true }` and an email arrives
- Clicking the link in the email sets a session cookie and redirects to `/plan`
- Clicking the same link again shows an expired error
- Requesting a new link invalidates the previous one

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: User Identity Migration

### Overview

Update the Redis data layer to key users by email instead of code. Update all consuming routes.

### Changes Required:

#### 1. Update kv.ts user key function

**File**: `src/lib/kv.ts`

**Intent**: Change the user key from `user:{code}` to `user:{email}`. The `createUser` function now accepts an email string. Remove the `generateUserCode` import if present.

**Contract**: `userKey(email: string)` returns `user:{email}`. `createUser(email: string)` creates default user data keyed by email. `getUser(email: string)` and `setUser(email: string, data)` unchanged in signature (they already accept a string). The `users` set stores emails instead of codes.

#### 2. Verify consuming routes still work

**File**: `src/app/api/user/settings/route.ts`
**File**: `src/app/api/user/supplies/route.ts`
**File**: `src/app/api/plan/today/route.ts`
**File**: `src/app/api/generate-meals/route.ts`
**File**: `src/app/api/cron/generate/route.ts`

**Intent**: These routes already use `verifySession()` → `getUser(userId)`. Since `verifySession()` now returns email and `getUser()` accepts a string, they should work without changes. Verify this is the case.

**Contract**: No code changes expected — just verification that the string-based interface holds.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- After logging in via magic link, `/api/user/settings` PUT works (returns `{ "ok": true }`)
- After logging in, `/api/user/supplies` PUT works
- Redis shows keys as `user:{email}` format

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Login UI

### Overview

Create a login page with email input, "check your email" confirmation state, and error handling. Add auth guard to redirect unauthenticated users.

### Changes Required:

#### 1. Create login page

**File**: `src/app/login/page.tsx` (new)

**Intent**: A simple form with an email input. On submit, calls `POST /api/auth/send`. Shows a "check your email" message on success. Displays an info note: "If you don't have an account, one will be created automatically." Handles the `?error=expired` query param to show "Link expired, please request a new one."

**Contract**: Client component (`"use client"`). States: `idle` (email form), `sent` (check your email message), `error` (error display). Tailwind-styled, centered on page, consistent with existing app design.

#### 2. Add middleware for auth guard

**File**: `src/middleware.ts` (new)

**Intent**: Redirect unauthenticated users to `/login` for protected routes. Allow `/login`, `/api/auth/*`, and static assets through without auth check.

**Contract**: Exports Next.js middleware. Checks for `fridge-session` cookie presence (existence check only — full JWT verification happens in route handlers). If missing and path is protected, redirect to `/login`. Matcher config excludes `/login`, `/api/auth`, `/_next`, `/favicon.ico`.

#### 3. Update home page redirect

**File**: `src/app/page.tsx`

**Intent**: Keep the existing redirect to `/plan` — middleware handles the auth guard, so no change needed here.

**Contract**: No change.

#### 4. Remove client-side auto-create logic

**File**: `src/lib/storage.ts`

**Intent**: If there's any client-side code that auto-calls `/api/auth/create` on first visit, remove it. The login page is now the entry point.

**Contract**: Review and remove any auth-creation calls. The `syncToServer` helper and storage hooks remain unchanged.

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Visiting `/plan` without a session redirects to `/login`
- Login page shows email input with account-creation info note
- Submitting email shows "check your email" state
- After clicking magic link, user lands on `/plan` and can navigate freely
- Visiting `/login` with `?error=expired` shows appropriate message
- Logging out (clearing cookie) redirects back to `/login`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No test framework exists yet — not adding one for this change (per roadmap, Vitest is preferred when added)

### Integration Tests:

- N/A for this change

### Manual Testing Steps:

1. Start dev server, visit `/plan` → should redirect to `/login`
2. Enter email on login page → should show "check your email"
3. Check email inbox → magic link received
4. Click magic link → redirected to `/plan`, session cookie set
5. Refresh page → still authenticated
6. Open in incognito → redirected to `/login` (multi-device: enter same email, get new link, click it → same user data)
7. Request link, wait 15+ minutes, click → should show expired error
8. Request link, request again, click first link → should show expired error
9. Click second link → should work

## Performance Considerations

- Magic-link token lookup is O(1) in Redis — no performance concern
- Resend API call adds ~200-500ms to the send request — acceptable since user waits for email anyway
- No change to the hot path (authenticated API calls remain JWT verification only)

## Migration Notes

- No data migration needed — pre-launch app with no real users
- Old `user:{code}` keys in Redis can be manually deleted or left to expire
- The `users` Redis set will contain emails going forward

## References

- Resend docs: https://resend.com/docs
- jose JWT library (already in use): `src/lib/auth.ts`
- Upstash Redis (already in use): `src/lib/kv.ts`
- Next.js middleware: https://nextjs.org/docs/app/building-your-application/routing/middleware

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth Infrastructure

#### Automated

- [x] 1.1 TypeScript compiles: `npm run build` — 1b13f0c
- [x] 1.2 Lint passes: `npm run lint` — 1b13f0c

### Phase 2: API Routes

#### Automated

- [x] 2.1 TypeScript compiles: `npm run build` — 15ac0d7
- [x] 2.2 Lint passes: `npm run lint` — 15ac0d7

#### Manual

- [x] 2.3 POST /api/auth/send returns ok and email arrives — 15ac0d7
- [x] 2.4 Clicking magic link sets session and redirects to /plan — 15ac0d7
- [x] 2.5 Same link fails on second click — 15ac0d7
- [x] 2.6 New link request invalidates previous — 15ac0d7

### Phase 3: User Identity Migration

#### Automated

- [x] 3.1 TypeScript compiles: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`

#### Manual

- [ ] 3.3 Authenticated PUT /api/user/settings works
- [ ] 3.4 Redis shows user:{email} keys

### Phase 4: Login UI

#### Automated

- [ ] 4.1 TypeScript compiles: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`

#### Manual

- [ ] 4.3 Unauthenticated visit to /plan redirects to /login
- [ ] 4.4 Login page shows email input with info note
- [ ] 4.5 Full flow: email → link → authenticated on /plan
- [ ] 4.6 Expired link shows error message
- [ ] 4.7 Clearing cookie redirects to /login
