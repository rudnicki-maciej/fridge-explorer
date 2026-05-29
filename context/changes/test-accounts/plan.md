# Test Accounts — Magic Link Bypass for Demo & Development

## Overview

Add 10 hardcoded test accounts (`test1@fridge.dev` through `test10@fridge.dev`) that bypass magic link auth, granting immediate session access. Also add `Authorization: Bearer` header support to `verifySession()` so agents can call any protected endpoint without cookie management.

## Current State Analysis

- `verifySession()` reads exclusively from the `fridge-session` cookie (`src/lib/auth.ts:49-57`)
- No Bearer header support exists anywhere
- Login flow: `/api/auth/send` → email → `/api/auth/verify?token=...` → cookie set → redirect
- The magic token is never returned in the API response — only emailed
- Login page (`src/app/login/page.tsx`) has states: idle → sending → sent (shows "check your email")

### Key Discoveries:

- All 7 session-protected endpoints use the same `verifySession()` function — one change covers all
- JWT secret defaults to `"dev-secret-change-in-production"` in dev (`src/lib/auth.ts:6-8`)
- `createSessionToken(email)` and `setSessionCookie(token)` already exist and can be reused
- Login page uses client-side state machine — adding a "test-entering" state is straightforward

## Desired End State

1. Entering `test1@fridge.dev` (through `test10@fridge.dev`) on the login page shows a brief interstitial then redirects to `/plan` with a valid session
2. `POST /api/auth/send` with a test email returns `{ ok: true, token: "<jwt>" }` and sets the session cookie
3. `verifySession()` accepts `Authorization: Bearer <jwt>` as an alternative to cookies
4. Agents can authenticate and call any protected endpoint programmatically

## What We're NOT Doing

- No env var configuration for test emails (hardcoded pattern)
- No pre-seeded data for test accounts (agents seed via API)
- No production safeguards beyond the pattern being non-guessable (fridge.dev domain)
- No admin UI for managing test accounts
- No rate limiting specific to test accounts

## Implementation Approach

Phase 1 handles the backend: Bearer header support in `verifySession()` and test-email detection in `/api/auth/send`. Phase 2 handles the frontend: login page detects the token in the response and shows an interstitial before redirecting.

## Critical Implementation Details

**Prompt injection surface**: The test email pattern (`test[1-10]@fridge.dev`) is hardcoded, not user-configurable. The check must be exact — regex `^test([1-9]|10)@fridge\.dev$` — to prevent bypass via `test1@fridge.dev.evil.com` or similar.

---

## Phase 1: Auth Bypass & Bearer Support

### Overview

Add Bearer header support to `verifySession()` and make `/api/auth/send` return a session token directly for test emails (skipping email delivery).

### Changes Required:

#### 1. Add Bearer header fallback to verifySession

**File**: `src/lib/auth.ts`

**Intent**: Modify `verifySession()` to check `Authorization: Bearer <jwt>` header first, falling back to the cookie. This enables programmatic API access for agents and test scripts.

**Contract**:
- Import `headers` from `next/headers`
- Check `authorization` header for `Bearer ` prefix before reading cookie
- Same `jwtVerify` logic applies to both paths
- Return type unchanged: `Promise<string | null>`

#### 2. Add test account detection helper

**File**: `src/lib/auth.ts`

**Intent**: Add a `isTestAccount(email: string): boolean` function that checks if an email matches the hardcoded test pattern.

**Contract**:
- `export function isTestAccount(email: string): boolean`
- Pattern: `^test([1-9]|10)@fridge\.dev$` (exactly test1 through test10)
- Case-insensitive match (email is already lowercased by the send route)

#### 3. Bypass magic link for test emails

**File**: `src/app/api/auth/send/route.ts`

**Intent**: When a test email is detected, skip `storeMagicToken` + `sendMagicLinkEmail`. Instead, create a session token directly, set the session cookie, and return the token in the response body. Also ensure the user exists in Redis (call `createUser` if needed).

**Contract**:
- Import `isTestAccount`, `createSessionToken`, `setSessionCookie` from `@/lib/auth`
- Import `getUser`, `createUser` from `@/lib/kv`
- After email validation, check `isTestAccount(normalized)`
- If test account: create user if not exists, create session token, set cookie, return `{ ok: true, token: "<jwt>", testAccount: true }`
- If regular account: existing flow unchanged, returns `{ ok: true }`

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`

#### Manual Verification:

- POST `/api/auth/send` with `test1@fridge.dev` returns `{ ok: true, token: "...", testAccount: true }`
- POST `/api/auth/send` with `test11@fridge.dev` sends email normally (not a test account)
- Protected endpoint works with `Authorization: Bearer <token>` header
- Protected endpoint still works with cookie auth (no regression)
- POST `/api/auth/send` with `test1@fridge.DEV` (uppercase) still matches

---

## Phase 2: Login Page Interstitial

### Overview

Update the login page to detect test account responses and show a brief "Test account — entering..." message before redirecting.

### Changes Required:

#### 1. Add test-entering state to login form

**File**: `src/app/login/page.tsx`

**Intent**: After submitting a test email, the API returns `{ testAccount: true, token: "..." }`. The login form detects this, shows a brief interstitial message ("Test account — entering..."), then redirects to `/plan` after a short delay.

**Contract**:
- Add `"test-entering"` to the state union type
- After successful fetch, check `data.testAccount === true` in the response
- If test account: set state to `"test-entering"`, then `router.push("/plan")` after ~1s delay
- If regular account: existing "sent" state (check your email)
- Interstitial UI: centered message "Test account — entering..." with a subtle animation or spinner
- Import `useRouter` from `next/navigation`

### Success Criteria:

#### Automated Verification:

- TypeScript compiles: `npx tsc --noEmit`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Enter `test1@fridge.dev` on login page → see "Test account — entering..." → redirected to /plan
- Enter a real email on login page → see "Check your email" (unchanged behavior)
- After redirect, user is authenticated (can access /supplies, /plan, etc.)
- Refresh after login → session persists (cookie was set)

---

## Testing Strategy

### Manual Testing Steps:

1. Navigate to /login → enter `test1@fridge.dev` → see interstitial → land on /plan authenticated
2. Open new incognito → enter `test5@fridge.dev` → same flow, different user
3. Enter `test11@fridge.dev` → normal magic link flow (not a test account)
4. Enter `test1@FRIDGE.DEV` → still works (case-insensitive)
5. Use curl: `curl -X POST /api/auth/send -d '{"email":"test1@fridge.dev"}'` → get token in response
6. Use token: `curl -H "Authorization: Bearer <token>" /api/user/supplies` → 200 OK
7. Verify cookie still works: browser session after login can access all pages

## References

- Related research: `context/changes/test-accounts/research.md`
- Auth implementation: `src/lib/auth.ts`
- Login page: `src/app/login/page.tsx`
- Send endpoint: `src/app/api/auth/send/route.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth Bypass & Bearer Support

#### Automated

- [x] 1.1 TypeScript compiles — cb92e14
- [x] 1.2 Lint passes — cb92e14

#### Manual

- [ ] 1.3 POST /api/auth/send with test email returns token
- [ ] 1.4 Non-test email sends magic link normally
- [ ] 1.5 Bearer header works on protected endpoints
- [ ] 1.6 Cookie auth still works (no regression)
- [ ] 1.7 Case-insensitive test email matching

### Phase 2: Login Page Interstitial

#### Automated

- [x] 2.1 TypeScript compiles — 2776129
- [x] 2.2 Lint passes — 2776129
- [x] 2.3 Build succeeds — 2776129

#### Manual

- [ ] 2.4 Test email shows interstitial then redirects to /plan
- [ ] 2.5 Real email shows "Check your email" (unchanged)
- [ ] 2.6 Session persists after redirect (cookie set)
