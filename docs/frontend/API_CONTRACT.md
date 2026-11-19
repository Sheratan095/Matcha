# Matcha backend — client-facing API contract

Source of truth: the code in `C:\Users\leona\Documents\GitHub\Matcha\backend` at commit `e41ebec` (branch `main`).
Where `docs/` and code disagree, the code is reported and the disagreement is listed in section 10.

**How this was produced.** Read-only source reading. The backend was NOT run (there is no `node_modules` and no `.env` in the checkout), so nothing here was observed on the wire. Two confidence labels are used:

- **[CODE]** — read directly from the repository source.
- **[INFERRED]** — derived from the source plus known behaviour of the pinned library versions (NestJS 10.4.22, http-proxy-middleware 3.0.5, socket.io 4.8.x, multer 2.0.2, jsonwebtoken 9.0.3, class-validator 0.15.1, cors 2.8.5, passport-oauth2 1.8.0, from `backend/pnpm-lock.yaml`). Verify these once the stack is up.

Unlabelled statements are [CODE].

---

## 0. TL;DR for frontend engineers

1. Base URL is the gateway: `http://localhost:3000`. Paths are `/auth/*`, `/profile/*`, `/notification/{online,health,docs-json}`, `/socket.io` (WebSocket), `/health`, `/docs` (Swagger).
2. **Auth is cookie-only.** Login sets two `HttpOnly; SameSite=Strict` cookies (`access_token`, `refresh_token`). No token ever appears in a JSON body. There is **no `Authorization: Bearer` support** (the header is not even in the CORS allow-list). Every request must be sent with `credentials: 'include'` (axios: `withCredentials: true`).
3. **CORS allows exactly one origin: `http://localhost:4000`** (`FRONTEND_URL:FRONTEND_PORT`). Run Vite on port 4000, or use a dev proxy. The GitHub OAuth redirect and the links in emails also point at `http://localhost:4000`.
4. Error bodies are the NestJS default: `{ "message": string | string[], "error": string, "statusCode": number }`. The `code` / `timestamp` / `path` fields shown in Swagger do not exist.
5. Real: register, login, verify email, refresh, logout, forgot/reset password, change email, GitHub OAuth, own profile read/update, pictures upload/delete/set-main, read a profile by UUID, list of viewer IDs, authenticated socket connection.
6. **Absent at that commit:** discovery feed, like/pass, matches, chat, block/report, search/filters, geolocation, age/birth date, fame rating, notifications, per-user online status, account info (username/email), tag catalogue. See section 8. (Since then the backend gained all of these; the frontend no longer mocks anything.)

---

## 1. Reaching the backend from a browser

### 1.1 Hosts and ports

| Thing | Address | Source |
|---|---|---|
| Gateway (the only thing the browser calls) | `http://localhost:3000` | `GATEWAY_HOST=http://localhost`, `GATEWAY_PORT=3000` (`.env.example`, defaults in `packages/config/src/env.ts`); `app.listen(env.GATEWAY_PORT)` in `apps/gateway/src/main.ts` |
| Auth service (internal) | `http://localhost:3001` | `AUTH_PORT` |
| Notification service (internal) | `http://localhost:3002` | `NOTIFICATION_PORT` |
| Profile service (internal) | `http://localhost:3003` | `PROFILE_PORT` |
| Postgres | `localhost:5432` | `docker-compose.yml` |
| Garage S3 API (backend only) | `http://localhost:3900` | `docker-compose.yml` |
| Garage public web endpoint (browser loads images from here) | `http://profile-pictures.web.garage.localhost:3902` | `S3_PUBLIC_URL` |
| Expected frontend origin | `http://localhost:4000` | `FRONTEND_URL=http://localhost`, `FRONTEND_PORT=4000` |

Never call ports 3001–3003 from the browser: every microservice controller is behind `InternalKeyGuard` and answers `401 {"message":"Invalid or missing internal key","error":"Unauthorized","statusCode":401}` without the `x-internal-key` header, which only the gateway adds.

### 1.2 URL prefix scheme (gateway proxying)

`apps/gateway/src/app.module.ts` is empty apart from a health controller. All routing is done with `http-proxy-middleware` in `apps/gateway/src/main.ts`. `Models/Microservice.ts` is only a `{name, host, port, docsUrl}` holder used to build the Swagger dropdown.

| Browser path | Forwarded to | Notes |
|---|---|---|
| `/auth/<x>` | auth `:3001/<x>` | prefix stripped; `x-internal-key` injected |
| `/profile/<x>` (and `/profile` itself) | profile `:3003/<x>` | prefix stripped; `x-internal-key` injected |
| `/notification/docs-json` | notification `:3002/docs-json` | |
| `/notification/health` | notification `:3002/health` | internal key injected |
| `/notification/online` | notification `:3002/online` | `x-internal-key` injected |
| `/socket.io/...` | notification `:3002/socket.io/...` | socket.io, authenticated (section 5) |
| `/health` | gateway itself | returns text `OK` |
| `/docs`, `/docs-json` | gateway itself | Swagger |
| anything else under `/notification/*` | not proxied | Nest 404 |

The whole `/auth` and `/profile` trees are proxied, except service-to-service routes: the gateway answers **404** to any path with an `internal` segment (`/auth/internal/validate`, `/profile/internal/create`, `/profile/internal/<userId>/is-complete`, …) before any proxy runs.

Identity middleware (runs before every proxy, `apps/gateway/src/main.ts`):
1. Deletes any client-supplied `x-user-id` header.
2. If the `Cookie` header contains `access_token=`, calls auth `GET /internal/validate` directly (not through the gateway); on success sets `x-user-id: <userId>` on the proxied request.
3. **Never rejects.** A missing/invalid/expired token just means the request is forwarded anonymously; the 401 comes from the microservice's `AuthenticatedUserGuard`.

`apps/gateway/src/authMiddleware.ts` (`requireAuthenticatedUser`) exists but is **not mounted anywhere**.

### 1.3 CORS

```ts
app.enableCors({
	origin: `${env.FRONTEND_URL}:${env.FRONTEND_PORT}`,   // "http://localhost:4000"
	credentials: true,
	methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
	allowedHeaders: ['Content-Type', 'x-internal-key']
});
```

- Exactly one allowed origin, a static string: `http://localhost:4000`. `http://127.0.0.1:4000` and `http://localhost:5173` are not allowed.
- Allowed request headers: only `Content-Type` and `x-internal-key`. Adding `Authorization`, `X-Requested-With`, or any other custom header makes the preflight fail. [INFERRED from cors semantics]
- The microservices do not enable CORS themselves.

### 1.4 Can a Vite dev server on another port call it directly?

**No.** A Vite server on its default port 5173 (or any port other than 4000) is blocked by CORS when calling `http://localhost:3000` directly. Three ways to make it work:

| Option | What to do | Caveats |
|---|---|---|
| A. Vite on port 4000, direct calls | `server: { port: 4000, strictPort: true }`; call `http://localhost:3000/...` with `credentials: 'include'` | Works for HTTP. For socket.io you must force `transports: ['websocket']` (see 5.2). Browse via `http://localhost:4000`, never `127.0.0.1`. |
| B. Vite dev proxy (recommended) | Proxy an `/api` prefix and `/socket.io` to the gateway; app calls are same-origin | No CORS involved at all. Still run on port 4000, because the OAuth redirect and email links are hardcoded to `FRONTEND_URL:FRONTEND_PORT`. Do not proxy `/profile` or `/auth` un-prefixed if the SPA has routes with those names. |
| C. Change the backend | Set `FRONTEND_PORT=<vite port>` in `backend/.env`, restart services | CORS origin is read at boot. |

Proxy sketch for option B:

```ts
// vite.config.ts
server: {
  port: 4000, strictPort: true,
  proxy: {
    '/api':       { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
    '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
  },
}
```

Cookies are host-scoped, not port-scoped, so cookies set by `localhost:3000` are also visible to `localhost:4000` and vice versa; both options share the same session cookies. `localhost:4000 → localhost:3000` is same-site, so `SameSite=Strict` cookies are sent. [INFERRED]

### 1.5 Swagger

- Gateway Swagger UI: `http://localhost:3000/docs` (explorer dropdown: `gateway` → `/docs-json`, `auth` → `/auth/docs-json`, `notification` → `/notification/docs-json`, `profile` → `/profile/docs-json`).
- Per-service UIs are also reachable through the proxy at `/auth/docs` and `/profile/docs`.
- **Do not trust Swagger for error shapes or some status codes.** The `*ErrorDto` classes (`code`, `timestamp`, `path`) are documentation only; no exception filter produces them. Specific mismatches are in section 10.

---

## 2. HTTP endpoints (as seen through the gateway)

### 2.0 Conventions that apply everywhere

**Request bodies** are JSON (`Content-Type: application/json`) except picture upload (multipart).

**Validation** (auth and profile services): `new ValidationPipe({ whitelist: true, transform: true })`.
- Unknown properties are silently stripped (no error).
- `@Transform` runs before validation (trim / lowercase).
- A property present with a non-string value where a `.trim()` transform exists (e.g. `"username": null` or a number) throws inside the transform and yields **500**, not 400. Always send strings. [INFERRED]

**Error body shape** (NestJS 10 default, no custom filter):

```jsonc
// HttpException thrown with a message
{ "message": "Invalid credentials", "error": "Forbidden", "statusCode": 403 }

// HttpException thrown with a message and a custom description: the description replaces "error"
{ "message": "Email not verified", "error": "EMAIL_NOT_VERIFIED", "statusCode": 403 }

// Validation failure: message is an ARRAY of class-validator strings
{ "message": ["username must be longer than or equal to 3 characters", "email must be an email"], "error": "Bad Request", "statusCode": 400 }

// Uncaught non-HTTP error
{ "statusCode": 500, "message": "Internal server error" }

// Unknown route (path shown is the one the microservice saw, prefix stripped)
{ "message": "Cannot GET /google", "error": "Not Found", "statusCode": 404 }
```

Machine-readable discriminators that exist (all in the `error` field): `EMAIL_NOT_VERIFIED`, `COMMON_PASSWORD`, `PASSWORD_REUSE`, `RESERVED_USERNAME`. Everything else must be matched on `statusCode` + `message` text.

**Auth-required endpoints** (marked "Auth: yes") fail with:

```json
{ "message": "Missing or invalid access token", "error": "Unauthorized", "statusCode": 401 }
```

**Microservice down:** every proxy answers with the usual error shape instead of hanging: **502** `{ "statusCode": 502, "message": "The <service> service is unavailable, try again later", "error": "Bad Gateway" }` when the service can't be reached, **504** (`"Gateway Timeout"`) when it accepts the request but doesn't answer within 30 s (`proxyTimeout`). The socket.io proxy has no timeout (long-polling holds requests open by design).

---

### 2.1 Auth service — `/auth/*`

#### POST `/auth/register` — Auth: no

Body (`RegisterDto`):

| Field | Type | Required | Rules |
|---|---|---|---|
| `username` | string | yes | trimmed + lowercased, then `Length(3, 20)`, `Matches(/^[a-z0-9_.]+$/)`; must not be in the reserved list (see below) |
| `email` | string | yes | trimmed + lowercased, `IsEmail`, `Length(0, 100)` |
| `password` | string | yes | `Length(8, 128)`, `Matches(/^(?!\s*$).+$/)` (not whitespace-only, no newlines); must not be in the common-password list. No character-class requirements. |
| `firstName` | string | **yes** (TS marks it optional, validators make it required) | trimmed, `Length(1, 50)`, `Matches(/^[a-zA-Z]+$/)` — ASCII letters only: no spaces, hyphens, apostrophes or accents |
| `lastName` | string | **yes** | same as `firstName` |
| `dateOfBirth` | string | **yes** | `Matches(/^\d{4}-\d{2}-\d{2}$/)` (`YYYY-MM-DD`). The profile service then requires a real calendar date, not in the future, and an age of 18 to 120 (counted in UTC). Cannot be changed once set. |
| `language` | `'en' \| 'fr' \| 'es'` | no | `IsEnum(SupportedLanguages)`, default `'en'`. Only used for email language. |

Success **200** (no cookies are set; the user is not logged in):

```json
{ "message": "Email verification required", "date": "2026-10-02T21:00:00.000Z", "userId": "<uuid>" }
```

Errors:

| Status | Body |
|---|---|
| 400 | validation array (see 2.0) |
| 400 | `{ "message": "This password is too common. Please choose a more secure password.", "error": "COMMON_PASSWORD", "statusCode": 400 }` |
| 400 | `{ "message": "This username isn't available. Please choose a different username.", "error": "RESERVED_USERNAME", "statusCode": 400 }` |
| 400 | `{ "message": "Invalid date of birth: it must be a real date and you must be at least 18 years old", "error": "Bad Request", "statusCode": 400 }` (relayed from the profile service; the user row is rolled back) |
| 400 | `{ "message": "Invalid first name: it may only contain letters, with single spaces, hyphens or apostrophes between parts", "error": "Bad Request", "statusCode": 400 }`, same for `Invalid last name` (the name rule lives in the database: letters from any alphabet, so `Jean-Luc`, `O'Brien`, `José` pass; relayed like the date of birth) |
| 409 | `{ "message": "User already exists", "error": "Conflict", "statusCode": 409 }` (username taken) |
| 409 | `{ "message": "Email already in use", "error": "Conflict", "statusCode": 409 }` |
| 500 | `{ "message": "User registration failed", "error": "Internal Server Error", "statusCode": 500 }` |

Side effects: creates the `users` row, then the 1:1 `profiles` row (first/last name, date of birth), then emails a verification token. If the email cannot be sent (retried `EMAIL_VERIFICATION_MAX_ATTEMPTS` times), registration **still returns 200**.

Reserved usernames (`infra/security/policies/reserved-usernames.txt`): `admin administrator root superuser system internal api auth matcha support help contact info mail webmaster postmaster hostmaster null undefined none` plus 16 offensive words (see the file). Exact match after lowercasing.
Common passwords: `infra/security/policies/common-password.txt`, 186 lines, exact case-sensitive match.

#### POST `/auth/verify-email` — Auth: no

Body: `{ "token": string }` (trimmed, non-empty). The token is 16 hex chars (`randomBytes(8).toString('hex')`), valid 15 minutes (`EMAIL_VERIFICATION_EXPIRATION_MS`, also printed in the email), one live token per user.

Success **200**: `{ "message": "Email verified successfully", "userId": "<uuid>" }`. **No cookies are set** — send the user to the login page.

Errors: 400 validation; **403** `{ "message": "Invalid or expired verification token", "error": "Forbidden", "statusCode": 403 }`.

The same endpoint finalises an email change (2.1 change-email): on success `email` is replaced by `pending_email`.

The email contains both a link `http://localhost:4000/verify-email?token=<token>` and the same token displayed as a "Verification Code". The frontend needs a `/verify-email` route that reads `?token=`, and may also offer a manual code field.

There is **no "resend verification" endpoint**. A login attempt with correct credentials on an unverified account re-sends a fresh token (and invalidates the previous one).

#### POST `/auth/login` — Auth: no

Body (`LoginDto`): `{ "username": string, "password": string }` — `username` trimmed + lowercased, both non-empty strings. Login is by **username only**, not email.

Success **200** + `Set-Cookie: access_token=...` + `Set-Cookie: refresh_token=...`:

```json
{ "message": "Login successful", "userId": "<uuid>", "isProfileComplete": true }
```

Errors (check order in code: user exists → password matches → email verified):

| Status | Body | When |
|---|---|---|
| 400 | validation array | |
| 403 | `{ "message": "Invalid credentials", "error": "Forbidden", "statusCode": 403 }` | unknown username or wrong password (same body for both) |
| 403 | `{ "message": "Email not verified", "error": "EMAIL_NOT_VERIFIED", "statusCode": 403 }` | credentials correct but email unverified; a new verification email is sent |
| 500 | `{ "message": "Login failed", "error": "Internal Server Error", "statusCode": 500 }` | anything else, including the profile service being down |

`isProfileComplete` is true when the profile has first and last name, `gender`, `sexual_preference`, date of birth, location, a non-empty `biography`, at least one interest and a profile picture. It is the same rule that decides who appears in other users' discover deck and search results (`profile_is_complete()` in `002_profiles.sql`), so a complete profile is exactly a findable one.

#### POST `/auth/refresh` — Auth: `refresh_token` cookie

No body. Success **200** + both cookies re-issued: `{ "message": "Tokens refreshed", "userId": "<uuid>" }`.

Errors: **403** `{ "message": "Invalid refresh token", "error": "Forbidden", "statusCode": 403 }` (missing, malformed, expired, or not the one stored in DB); 403 `"User not found"`.

#### POST `/auth/logout` — Auth: access token (`AuthenticatedUserGuard`)

No body. Success **200**: `{ "message": "Logged out successfully" }`; clears both cookies. Also deletes the refresh token server-side and closes the user's notification sockets (best effort). Without a valid access token: **401** `{ "message": "Missing or invalid access token", "error": "Unauthorized", "statusCode": 401 }` (the frontend treats that as "already signed out").

#### GET `/auth/validate` — Auth: none required (reads `access_token` cookie)

The public twin of the gateway's `/auth/internal/validate`, and the **only "am I logged in / who am I" endpoint**. Always **200**:

```json
{ "valid": true,  "userId": "<uuid>" }
{ "valid": false, "userId": null }
```

Use it on app boot and after the OAuth redirect.

#### POST `/auth/forgot-password` — Auth: no

Body: `{ "email": string }` (trimmed + lowercased, `IsEmail`, `Length(0, 100)`).

Success **200**: `{ "message": "If an account with this email exists, you will receive a password reset link shortly" }` — identical whether or not the email exists.

Errors: 400 validation.

Email link: `http://localhost:4000/reset-password?token=<token>`; token is 24 hex chars, valid 15 minutes (`FORGOT_PASSWORD_EXPIRATION_MS`). Frontend needs a `/reset-password` route reading `?token=`.

#### POST `/auth/reset-password` — Auth: no

Body (`ResetPasswordDto`): `{ "token": string, "password": string }` — `token` trimmed, non-empty; `password` same rules as registration.

Success **200**: `{ "message": "Password reset successfully" }`. Does not log the user in and does not clear cookies; the server-side refresh token is deleted. It also closes the user's open notification sockets on every device and emails a "Your password was changed" alert (in the account's language, with a button to `/forgot-password` in case the user did not make the change). Both are best effort: if the notification service is down, the reset still succeeds.

Errors:

| Status | Body |
|---|---|
| 400 | validation array |
| 400 | `{ "message": "This password is too common. Please choose a more secure password.", "error": "COMMON_PASSWORD", "statusCode": 400 }` |
| 400 | `{ "message": "The new password must be different from the previous one.", "error": "PASSWORD_REUSE", "statusCode": 400 }` |
| 403 | `{ "message": "Invalid or expired reset token", "error": "Forbidden", "statusCode": 403 }` |
| 403 | `{ "message": "User not found", "error": "Forbidden", "statusCode": 403 }` |

#### POST `/auth/change-email` — Auth: yes

Body: `{ "newEmail": string }` (trimmed + lowercased, `IsEmail`, `Length(0, 100)`).

Success **200**: `{ "message": "Email change initiated. Please verify your new email address." }`. The active email is unchanged until the token mailed to the new address is submitted to `POST /auth/verify-email`.

Errors: 400 validation; 400 `"New email is the same as the current email"`; 401; 403 `"User not found"`; 409 `{ "message": "Email already exists", "error": "Conflict", "statusCode": 409 }`.

#### GET `/auth/github` and GET `/auth/github/callback` — GitHub OAuth

- Start with a **top-level navigation** (not fetch): `window.location.assign('http://localhost:3000/auth/github')`. Responds 302 to GitHub (scope `user:email`).
- GitHub redirects to `GITHUB_CALLBACK_URL` = `http://localhost:3000/auth/github/callback`. The auth service finds or creates the user, sets the `access_token` and `refresh_token` cookies, and responds **302 to `http://localhost:4000`** — bare origin, no path, no query string, no token, no error info.
- The frontend then discovers the session by calling `GET /auth/validate`, and decides onboarding via `GET /profile/<userId>/is-complete` or `GET /profile`.
- Failure cases do not redirect back to the frontend; the browser is left on the gateway URL showing JSON: user denies consent → 401 `{"message":"Unauthorized","statusCode":401}`; GitHub account exposes no email → 500. [INFERRED]
- User resolution: by `(provider, providerId)`; else by email (links GitHub to the existing account); else creates a new user with `email_verified = TRUE`, `password_hash = NULL`, username = lowercased GitHub login (suffix `_NNNN` on collision).
- **Newly created OAuth users get no `profiles` row** (see bug 9.3).
- `GET /auth/google` does not exist (404), although `test/oauth/index.html` links to it.

#### GET `/auth/health` — returns text `OK`.

---

### 2.2 Profile service — `/profile/*`

Profile JSON shape returned by GET/PATCH (class `Profile` in shared-types; dates are ISO-8601 strings on the wire):

```json
{
  "userId": "3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963",
  "firstName": "Alice",
  "lastName": "Wonderland",
  "gender": "female",
  "sexualPreference": "both",
  "biography": "Curiouser and curiouser.",
  "interests": [ { "id": "<uuid>", "name": "travel" } ],
  "pictures":  [ { "id": "<uuid>", "url": "http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp", "isProfile": true } ],
  "createdAt": "2026-09-30T08:45:31.644Z",
  "updatedAt": "2026-09-30T08:45:31.644Z"
}
```

- Nullable: `firstName`, `lastName`, `gender`, `sexualPreference`, `biography` (empty strings are returned as `null`).
- `interests` has no defined order. `pictures` is ordered by `created_at` ascending (seeded pictures share one timestamp, so their relative order is not guaranteed — use `isProfile`).
- It also carries `username`, `age`, `fameRating` and `lastSeen`. The own profile (`GET` / `PATCH /profile`) adds
  `latitude` and `longitude` (decimal degrees, full precision, both `null` until set); someone else's
  (`GET /profile/:userId`) never has them, and adds `isOnline`, `relation` and `distanceKm` instead. [VERIFIED 2026-11-10]

#### GET `/profile` — my profile — Auth: yes

Success **200**: profile object. Errors: 401; **500** `{ "message": "Failed to fetch profile", "error": "Internal Server Error", "statusCode": 500 }` (also returned when the profile row does not exist — bug 9.2).

#### GET `/profile/:userId` — someone's profile — Auth: yes

Param `userId`: `IsUUID`. Success **200**: profile object (same shape as own).

**Side effect:** when `userId` is not the caller, a row `(viewer = me, viewed = userId)` is inserted into `profile_views` (once per pair, fire-and-forget). Only call this when the user actually opens a profile.

Errors: 400 `{ "message": ["userId must be a UUID"], "error": "Bad Request", "statusCode": 400 }`; 401; **500** `"Failed to fetch profile"` for a non-existent user/profile (should be 404 — bug 9.2).

Note `GET /profile/pictures` hits this route and returns the 400 above; there is no "list my pictures" endpoint (pictures come inside the profile).

#### PATCH `/profile` — update my profile — Auth: yes

Body (`UpdateProfileDto`), every field optional, only provided fields are applied:

| Field | Type | Rules |
|---|---|---|
| `firstName` | string | trimmed, `MaxLength(50)` (no letters-only rule here, unlike registration) |
| `lastName` | string | trimmed, `MaxLength(50)` |
| `gender` | string | `IsIn(['male', 'female', 'other'])` |
| `sexualPreference` | string | `IsIn(['male', 'female', 'both', 'other'])` |
| `biography` | string | `MaxLength(500)` |
| `interests` | string[] | `IsString({ each: true })`, `MaxLength(50, { each: true })`. **Full replacement list.** Each name is lowercased + trimmed server-side and upserted into the shared tag table. Send names without `#` (it is not stripped). `[]` clears all interests. |

Behaviour to know:
- Explicit `null` for a scalar field passes validation (`@IsOptional`) and sets the column to NULL.
- `"interests": null` → 500. Duplicate names after lowercasing (e.g. `["Vegan","vegan"]`) → 500 (primary-key violation). De-duplicate client-side. A non-array string is iterated character by character. [INFERRED]
- No maximum number of interests; empty-string tags are accepted.

Success **200**: the full updated profile object. Errors: 400 validation (e.g. `"gender must be one of the following values: male, female, other"`); 401; **500** `{ "message": "Failed to update profile", ... }` (including "profile row missing").

#### PUT `/profile/location` — set my location — Auth: yes

Body (`UpdateLocationDto`): `{ "latitude": number, "longitude": number }`, both required, numbers (not strings),
latitude in [-90, 90], longitude in [-180, 180]. Stored at full precision; others only see a distance computed
from a copy snapped to ~1 km. The backend never locates anyone itself: the client sends the device's position,
an IP-based guess or a spot picked on a map.

Success **200**: `{ "updated": true }`. Errors: 400 validation, e.g.
`{ "message": ["latitude must not be greater than 90"], "error": "Bad Request", "statusCode": 400 }`; 401; 404
`"Profile not found"`. A location is part of `profile_is_complete()`, and `GET /profile/discover` and
`GET /profile/search` answer **403** `"You must have a location to browse other users"` (resp. "to search") until
one is set. [VERIFIED 2026-11-10]

#### GET `/profile/viewers` — who viewed me — Auth: yes

Success **200**: `{ "viewers": ["<uuid>", "<uuid>"] }` — user IDs only, no names, pictures or timestamps, no defined order. Errors: 401; 500 `"Failed to fetch profile viewers"`.

To render viewers you must `GET /profile/:id` for each, which records *you* as a viewer of *them*.

#### GET `/profile/:userId/is-complete` — Auth: **none** (intended as internal, but exposed)

Success **200**: `{ "isComplete": boolean }`. `false` when no profile row exists. Errors: 400 non-UUID; 500 `"Failed to check profile completeness"`.

Completeness rule: the SQL function `profile_is_complete()` (`002_profiles.sql`), shared with discover and search: first and last name, `gender`, `sexual_preference`, date of birth, location, a non-empty `biography`, at least one interest and a profile picture.

#### POST `/profile` — create profile — Auth: **none** (intended as internal, but exposed)

Called by the auth service during registration. Body (`CreateProfileDto`): `{ "userId": uuid, "firstName"?: string ≤ 50, "lastName"?: string ≤ 50 }`.

Success **200**: `{ "message": "Profile created", "userId": "<uuid>" }`. Errors: 400; 409 `{ "message": "Profile already exists", "error": "Conflict", "statusCode": 409 }`; 500 `"Profile creation failed"` (e.g. unknown `userId`).

A normal frontend never needs this. It is the only way to give a GitHub-created user a profile row today (bug 9.3). It is an unauthenticated write and will presumably be closed off.

#### Calendar — Auth: yes (all five)

Dates between connected people (`012_calendar.sql`): each event hangs off the pair's chat, so an unmatch or a block deletes it.

- **GET `/profile/calendar`** → `{ "events": CalendarEvent[] }`, earliest first, past ones included. Never the cancelled ones; the declined ones only for the inviter. `CalendarEvent` = `{ eventId, inviterId, inviteeId, title, description | null, startTime, endTime (ISO 8601), status: "pending" | "accepted" | "declined" | "cancelled", latitude | null, longitude | null, createdAt (ISO 8601, when the invite was sent) }`.
- **POST `/profile/calendar/event`** body `{ inviteeId: uuid, title: 1-100 (one line), description?: ≤ 500, startTime, endTime (ISO 8601 with a mandatory offset, `Z` or `±hh:mm`), latitude?, longitude? (both or neither) }` → the stored `CalendarEvent` (`pending`), and `event-invite` to the invitee. 400 for yourself, a start in the past, an end not after the start, a lone coordinate; 403 unless you are connected; rate-limited at the gateway (20 an hour per user).
- **POST `/profile/calendar/event/:eventId/accept`** \| **`/decline`** \| **`/cancel`** → `{ "success": true }`, and `event-accept` / `event-decline` to the inviter or `event-cancel` to the other side. Accept and decline: the invitee, from `pending`. Cancel: the inviter at any time, the invitee once accepted. Anything else is a 404; once the event has started, a 400.
- No request: when an **accepted** event starts, both sides get `event-start` (the same `EventPayload`, each one about the other side). The profile service polls for it every 30 s (`apps/profile/src/calendar/eventStartWatcher.ts`), so it lands up to 30 s after the start. It is live only: not queued for someone offline, and a start that fell while the profile service was down is not announced.

#### GET `/profile/health` — returns text `OK`.

#### Pictures — see section 4 for the three picture endpoints.

---

### 2.3 Notification service — `/notification/*`

| Method + path | Auth | Response |
|---|---|---|
| GET `/notification/online` | none | **200**, body is the bare number of distinct users with an open socket, e.g. `3` (sent as text, not JSON object) |
| GET `/notification/health` | none | **200**, body `OK` (text) |
| GET `/notification/docs-json` | none | OpenAPI JSON |

`POST /email-verification`, `POST /forgot-password`, `POST /close-ws-connections` exist on the service but are **not proxied** by the gateway.

### 2.4 Gateway itself

`GET /health` → `OK`. `GET /docs` → Swagger UI. `GET /docs-json` → gateway OpenAPI.

---

## 3. Auth mechanics

### 3.1 Where tokens live

`apps/auth/src/utils/jwt.ts`:

```ts
res.cookie('access_token', tokens.access_token, {
	httpOnly: true,
	secure: env.NODE_ENV === 'production',
	sameSite: 'strict',
	maxAge: env.JWT_ACCESS_EXPIRATION_MS,      // 900000 ms = 15 min
});
res.cookie('refresh_token', tokens.refresh_token, {
	httpOnly: true,
	secure: env.NODE_ENV === 'production',
	sameSite: 'strict',
	maxAge: env.JWT_REFRESH_EXPIRATION_MS,     // 604800000 ms = 7 days
});
```

- Both are cookies only; never in a JSON body; not readable from JS.
- No `Domain`, default `Path=/`. Not `Secure` in development.
- JWT payload is `{ sub: <userId> }`.
- Cookies are set by: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/github/callback`. Not by register or verify-email.

### 3.2 Lifetimes

| | Browser cookie lifetime | JWT `exp` inside the token |
|---|---|---|
| access | 15 minutes | bug 9.1: `expiresIn` is given the millisecond value as a number, which jsonwebtoken reads as seconds → ~10.4 days [INFERRED] |
| refresh | 7 days | same bug → ~19 years [INFERRED] |

From a browser's point of view the effective lifetimes are the cookie lifetimes (15 min / 7 days), because the browser drops the cookie.

### 3.3 What the gateway expects

- The `Cookie` header carrying `access_token`. Nothing else. No `Authorization` header is read anywhere.
- No CSRF token; protection relies on `SameSite=Strict`.

### 3.4 Invalid / expired / missing access token

- The gateway forwards the request anonymously.
- Endpoints guarded by `AuthenticatedUserGuard` answer **401** `{ "message": "Missing or invalid access token", "error": "Unauthorized", "statusCode": 401 }`.
- Unguarded endpoints work normally.
- There is no automatic refresh on the server side.

### 3.5 Refresh

- `POST /auth/refresh` with the `refresh_token` cookie → new pair of cookies. Failure is **403** (not 401).
- Rotation: each refresh (and each login) overwrites the single stored refresh-token hash for that user (`refresh_tokens.user_id` is the primary key). Consequences:
  - One live refresh token per user: logging in from a second browser invalidates the first browser's refresh token.
  - Two concurrent refresh calls race; the loser gets 403. **Serialise refresh on the client** (single in-flight promise).
- Suggested client logic: on a 401 from a protected endpoint → one `POST /auth/refresh` → retry once → on 403 treat as logged out. Because the access cookie silently disappears after 15 minutes, expect this on the first call after idle.
- `GET /auth/validate` never refreshes: with the access cookie gone it answers `{ valid: false }` even though a live refresh cookie is still in the browser, and an app that boots anonymous sends no protected request that could 401. So the client must call `POST /auth/refresh` **before** its first `GET /auth/validate` (the frontend's `bootSession` does; the 403 for a visitor is expected and ignored), and again when the socket is refused (§ websockets).

### 3.6 Unverified-email login

`POST /auth/login` → 403 with `"error": "EMAIL_NOT_VERIFIED"` (only when the password is correct). The server sends a new verification email. No cookies are set. The frontend should show a "check your inbox / enter code" screen that posts to `/auth/verify-email`, then return to login.

### 3.7 OAuth hand-off

Tokens are handed back **as cookies on the 302 response** from `/auth/github/callback`; on success the redirect target is exactly `http://localhost:4000`.

**On failure the callback also redirects (never a JSON error page)**, to `http://localhost:4000/login?oauthError=<code>`, no cookies set. The login page should read the parameter and show a message:

| `oauthError` | Meaning | Suggested message |
|---|---|---|
| `cancelled` | The user pressed Cancel on GitHub's consent screen | none, or "GitHub sign-in cancelled" |
| `invalid_state` | The `state` check failed: sign-in started in another browser/tab, took over 10 min, or a forged link | "Sign-in expired, please try again" |
| `no_verified_email` | The GitHub account has no primary, verified email | "Verify your email on GitHub first" |
| `failed` | Anything else (GitHub or a service unavailable) | "GitHub sign-in failed, please try again" |

Username of a new GitHub account: the GitHub handle made valid for the app's rule (lowercased, `-` → `_`, other characters dropped, cut to 20, padded with `_user` below 3), with `_` + 4 random digits when that name is reserved or taken. Users can't type a GitHub-derived name the register form wouldn't accept. Nothing is put in the URL. The SPA must call `GET /auth/validate` on load to learn the `userId`. `isProfileComplete` is not provided on this path.

CSRF protection: `/auth/github` sets a short-lived `oauth_state` cookie (httpOnly, `SameSite=Lax`, path `/auth/github`, 10 min) holding the same random value it sends to GitHub as `state`. The callback refuses (403) unless the `state` GitHub echoes back matches that cookie, so a callback link crafted by someone else can't log the browser into their account. Nothing for the frontend to do, as long as the sign-in starts with a full-page navigation to `/auth/github` and comes back to the same gateway host.

Which account a GitHub sign-in lands in:
- Only the GitHub account's **primary AND verified** email is used; without one, the sign-in fails.
- A Matcha account already linked to that GitHub identity → that account.
- Else a **verified** Matcha account with the same email → GitHub is linked to it (both ways of logging in work afterwards).
- Else an **unverified** Matcha account with the same email is **deleted** and a fresh account is created (never linked: that would let whoever registered the address keep a password on the GitHub user's account). It never got past registration, so nothing is lost.
- Else a new account (email already verified, no password, no name or date of birth yet).

---

## 4. Pictures

### 4.1 Endpoints

All three return the caller's full picture list after the change:

```json
{ "pictures": [ { "id": "<uuid>", "url": "http://profile-pictures.web.garage.localhost:3902/<userId>/<uuid>.webp", "isProfile": true } ] }
```

#### POST `/profile/pictures` — Auth: yes — **200**

- `multipart/form-data`, single file field named **`file`** (`FileInterceptor('file')`). Let the browser set the `Content-Type` boundary.
- One file per request (`limits.files: 1`).
- Max size: `5 * 1024 * 1024` bytes (5 MB).
- Accepted declared MIME types: `image/jpeg`, `image/png`, `image/webp`. (No GIF, HEIC, AVIF.)
- Max **5** pictures per user (`MAX_USER_PICTURES`).
- The server re-encodes to WebP quality 85, longest side ≤ 1080 px, EXIF stripped, EXIF orientation applied.
- The first picture a user uploads (when they have zero) becomes the profile picture.

| Status | Body `message` |
|---|---|
| 400 | `Only JPEG, PNG and WEBP images are allowed` |
| 400 | `Missing "file" field` |
| 400 | `You can upload at most 5 pictures` |
| 400 | `File is not a valid image` |
| 400 | `Unexpected field` (wrong field name) / `Too many files` [INFERRED multer messages] |
| 401 | `Missing or invalid access token` |
| 413 | `{ "message": "File too large", "error": "Payload Too Large", "statusCode": 413 }` [INFERRED] |
| 500 | `Failed to store picture` (Garage down / not initialised) or `Failed to save picture` |

#### DELETE `/profile/pictures/:pictureId` — Auth: yes — **200**

Errors: 400 `["pictureId must be a UUID"]`; 401; 404 `{ "message": "Picture not found", "error": "Not Found", "statusCode": 404 }` (also when it belongs to someone else); 500 `Failed to delete picture`.

Deleting the current profile picture does **not** promote another one; the user then has no `isProfile: true` picture, and later uploads are not auto-promoted either (only the very first upload is). The UI must tolerate "no profile picture" and offer the next endpoint.

#### PATCH `/profile/pictures/:pictureId/profile` — Auth: yes — **200**

No body. Marks that picture as the profile picture and clears the previous one. Errors: 400; 401; 404 `Picture not found`; 500 `Failed to set profile picture`.

#### Ordering

**Absent.** There is no reorder endpoint and no position column. Order is upload time ascending.

### 4.2 Displaying images

- `url` is an absolute, **public, unsigned** URL served directly by Garage's web endpoint (port 3902); it is not proxied by the gateway and needs no cookies. Use it as-is in `<img src>`.
- Format: `${S3_PUBLIC_URL}/${userId}/${randomUUID}.webp`, default `http://profile-pictures.web.garage.localhost:3902/<userId>/<uuid>.webp`. The full URL is stored in the DB (`user_pictures.url VARCHAR(255)`).
- `*.localhost` resolves to loopback in Chrome, Edge and Firefox without DNS setup.
- No CORS is configured on the Garage web endpoint: fine for `<img>`, but reading the pixels via `fetch`/canvas will not work cross-origin. [INFERRED]
- If Vite adds a CSP, allow that host in `img-src`.

### 4.3 Seed pictures

`make seed-pictures` uploads the seven committed files in `backend/infra/garage/seed-images/` under the key prefix `seed/`, plus 60 generated illustrated avatars (`seed/avatar-01.webp` … `avatar-60.webp`, drawn deterministically by `apps/profile/scripts/seed-pictures.mjs`) used by the 500 generated profiles (7.1). The seed SQL references them:

| User | Picture URLs | `isProfile` |
|---|---|---|
| testuser | `http://profile-pictures.web.garage.localhost:3902/seed/testuser-1.webp` … `testuser-5.webp` | `testuser-1` |
| alice | `…/seed/alice-1.webp`, `…/seed/alice-2.webp` | `alice-1` |
| admin | none | — |

`testuser` already has 5 pictures, so an upload as `testuser` returns 400 until one is deleted. These URLs hardcode the default `S3_PUBLIC_URL`.

---

## 5. WebSocket

### 5.1 What it is

Not a raw WebSocket: it is **socket.io 4.8** (`@nestjs/platform-socket.io`). Use `socket.io-client@^4.8`.

- Gateway URL: `http://localhost:3000`, engine path `/socket.io` (default), **namespace `/notification`**.
- Auth: the `access_token` cookie on the handshake. No `auth` payload, no query token (`?userId=` is explicitly no longer used). The gateway validates the cookie and injects `x-user-id`; the notification service registers the socket under that user.
- Rejections: polling handshake without a valid cookie → HTTP 401 body `Unauthorized`; websocket upgrade without a valid cookie → `HTTP/1.1 401 Unauthorized` and the socket is destroyed. In the client this surfaces as `connect_error`.
- Authentication happens only at connect time; an open socket survives access-token expiry. A reconnect after the 15-minute cookie expiry needs a refresh first.

### 5.2 Client connection

```ts
import { io } from 'socket.io-client';

// Option A (direct, frontend on http://localhost:4000)
const socket = io('http://localhost:3000/notification', {
  withCredentials: true,
  transports: ['websocket'],
});

// Option B (through the Vite proxy on /socket.io)
const socket = io('/notification', { transports: ['websocket'] });
```

`transports: ['websocket']` is what the frontend uses. The websocket transport is not subject to CORS. The notification service no longer enables socket.io's own CORS (it used to, and socket.io then answered polling requests with `Access-Control-Allow-Origin: *`, overwriting the gateway's header, which browsers reject on credentialed requests). Polling responses should now carry only the gateway's CORS headers for `FRONTEND_URL`, so the long-polling fallback should work cross-origin too. [INFERRED, not yet tested in a browser]

### 5.3 Envelope and events

There is no application-level envelope; it is plain socket.io `(eventName, ...args)`.

| Direction | Events implemented |
|---|---|
| server → client | **None.** No `emit` call exists anywhere in the backend. |
| client → server | **None handled.** `client.onAny` logs `Inbound event on <id>: <event> <args>` and does nothing else (no ack, no reply). |

Built-in socket.io lifecycle events are all the client will see: `connect`, `connect_error`, `disconnect`.

The only observable effect of being connected is being counted by `GET /notification/online`. Multiple sockets per user (tabs/devices) are supported and counted once.

`docs/ws.md` only describes the `Map<userId, Set<Socket>>` storage; it defines no events.

---

## 6. Shared types (`backend/packages/shared-types/src`)

Verbatim type-level declarations. The package also exports classes `InterestTag`, `UserPicture`, `Profile`, `User`, `ProfileView` that implement these interfaces and add `fromDbRow()` and helper methods; they are server-side and not reproduced here.

`languages.ts` (complete file):

```ts
export enum SupportedLanguages
{
	ENGLISH = 'en',
	FRENCH = 'fr',
	SPANISH = 'es',
}

export const AVAILABLE_LANGUAGES: string[] = Object.values(SupportedLanguages);

export type SupportedLanguage = `${SupportedLanguages}`;
```

`User.ts` (types, interfaces, constant):

```ts
import { SupportedLanguage } from './languages';

export type Gender = 'male' | 'female' | 'other';

export type SexualPreference = 'male' | 'female' | 'both' | 'other';

export interface IInterestTag {
	id: string;
	name: string; // stored without the leading '#', e.g. "vegan"
}

export interface IUserPicture {
	id: string;
	url: string;
	isProfile: boolean;
}

export const MAX_USER_PICTURES = 5;

/**
 * A user's profile as owned by the profile service.
 * Contains only the fields the profile service stores — no auth fields.
 */
export interface IProfile
{
	userId: string;
	firstName: string | null;
	lastName: string | null;
	gender: Gender | null;
	sexualPreference: SexualPreference | null;
	biography: string | null;
	interests: IInterestTag[];
	pictures: IUserPicture[];
	createdAt: Date;
	updatedAt: Date;
}

export interface IUser
{
	id: string;
	username: string;
	email: string;
	pendingEmail: string | null;
	passwordHash: string;
	emailVerified: boolean;
	language: SupportedLanguage;
	firstName: string | null;
	lastName: string | null;
	gender: Gender | null;
	sexualPreference: SexualPreference | null;
	biography: string | null;
	interests: IInterestTag[];
	pictures: IUserPicture[];
	createdAt: Date;
	updatedAt: Date;
}
```

`ProfileView.ts`:

```ts
export interface IProfileView
{
	viewerId: string;
	viewedId: string;
}
```

`index.ts` also exports `export type Shared = { placeholder?: string };`.

Notes for frontend typing:
- On the wire, `createdAt` / `updatedAt` are ISO strings, not `Date`.
- `IProfile` is the shape of `GET /profile`, `GET /profile/:userId` and `PATCH /profile` responses.
- **`IUser` is never returned by any endpoint.** It is the auth service's internal row model (it contains `passwordHash`). `User.toPublicProfile()` exists in the class but nothing calls it.
- `IProfileView` is never returned either; `/profile/viewers` returns only `viewerId` values as `string[]`.

---

## 7. Seed data and local bring-up

### 7.1 Seeded users (`backend/infra/db/seeds/001_users.sql`)

| username | password | email | verified | Can log in? | Profile |
|---|---|---|---|---|---|
| `testuser` | `1234` | `testuser@matcha.local` | yes | yes | Test User, gender `other`, preference `other`, bio "I am a test user for this site.", interests `hiking`, `photography`, 5 pictures → complete |
| `alice` | `1234` | `alice@matcha.local` | yes | yes | Alice Wonderland, `female`, `both`, bio "Curiouser and curiouser.", interests `travel`, `reading`, 2 pictures → complete |
| `admin` | — | `admin@matcha.local` | yes | **no** (`password_hash` is the literal `fake_hash_1`) | Admin User, `other`/`other`, no interests, no pictures |

- User IDs are random UUIDs generated at seed time; read them from the login response (`userId`).
- Seeded interest tags: `vegan hiking photography travel reading gaming cooking fitness music art`.
- `1234` only works for the seeded accounts; it cannot be chosen via register/reset (too short and on the common list).
- **500 generated profiles** (`backend/infra/db/seeds/002_generated_profiles.sql`), on top of the hand-made ones above:
  - usernames are an Italian first name + a number (`giulia42`, `niccolo7`), email `<username>@matcha.local`, password `1234`, all verified;
  - every one is complete (they all appear in discover and search): 18-60 years old, spread across about 28 Italian cities weighted by size (Rome and Milan the most), 1-5 interests out of 37 tags, an avatar as profile picture plus 0-3 more;
  - about 160 matches (both likes plus their chat), about 3,000 one-way likes and 8,000 views, so fame ratings range roughly 30-90; some of them like `testuser` and `alice`;
  - **deterministic**: every `make db-reset` recreates exactly the same people, with the same ids (md5 of the row number, shaped into valid v4 UUIDs).
- No messages are seeded.
- The only way to get another user's UUID from the API is to log in as that user, or to find it in `GET /profile/viewers`.

### 7.2 Bring-up

Prerequisites: Docker, Node ≥ 18, pnpm 8.15.0 (`packageManager`), GNU make and bash (on Windows: Git Bash or WSL — the Makefile and `infra/garage/init.sh` are bash).

```bash
cd backend
cp .env.example .env
# Edit .env BEFORE the first run:
#   GARAGE_RPC_SECRET = openssl rand -hex 32            (Garage exits if not 64 hex chars)
#   S3_ACCESS_KEY     = echo "GK$(openssl rand -hex 12)" (must be GK + 24 hex)
#   S3_SECRET_KEY     = openssl rand -hex 32
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET = non-empty (see note)
#   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS if you want emails to be delivered
make dev
```

`make dev` does: `generate_env` (copies `.env.example` if `.env` is missing) → `pnpm install` if needed → `pnpm build` if no `dist` → `docker compose up -d postgres garage` → `./infra/garage/init.sh` → `make seed-pictures` → `pnpm dev` (turbo: `nest start --watch` for gateway 3000, auth 3001, notification 3002, profile 3003).

Other Makefile targets: `install`, `build`, `up` (same setup as `dev`, then every service compiled with `pnpm start`, no watchers), `down`, `db-reset` (`docker compose down -v`, recreate postgres + garage, re-init, re-seed pictures), `storage`, `seed-pictures`, `clean`, `generate_env`.

Notes:
- Migrations and seeds run only when the Postgres volume is created. Use `make db-reset` to re-run them (also wipes uploaded pictures).
- `docker-compose.yml` defines only the infrastructure (`postgres`, `garage`); the apps always run on the host. Postgres and the Garage S3 API are published on `127.0.0.1` only, and auth / notification / profile listen on `127.0.0.1` only: just the gateway (3000), the frontend (4000) and Garage's image endpoint (3902) are reachable from other machines.
- With `GITHUB_CLIENT_ID` empty, `passport-oauth2` throws "OAuth2Strategy requires a clientID option" at construction, which would stop the auth service from booting. Put any non-empty placeholder if you do not need OAuth. [INFERRED]
- Without working SMTP, registration succeeds but no email arrives and the token is stored only as a bcrypt hash. For local testing use the seeded users, or mark a user verified by hand:
  `docker compose exec postgres psql -U pg-admin -d matcha -c "UPDATE users SET email_verified = TRUE WHERE username = '<name>';"`
- DB inspection (from `docs/postgresql.txt`): `docker compose exec postgres psql -U pg-admin -d matcha -c "SELECT * FROM users;"`
- Manual test clients: `test/ws` (`npm install && npm run test:ws`, env `GATEWAY_URL`, `USERNAME`, `PASSWORD`) and `test/oauth` (an Express page on port 4000 that proxies `/login` and `/validate`).

---

## 8. What did NOT exist at that commit

> **Superseded (2026-11-17).** This table describes commit `e41ebec`. The backend now has discovery, likes, connections, chat, block / report, search, location, age, fame and live notifications, and the frontend's in-browser mock (`src/mock`) has been removed: every screen calls the gateway. What is still missing is tracked in `frontend/TODO.md`.

Database tables that exist: `users`, `oauth_accounts`, `refresh_tokens`, `email_verification_tokens`, `forgot_password_tokens`, `profiles`, `interest_tags`, `user_interests`, `user_pictures`, `profile_views`. Nothing else.

| Feature | Status | Detail |
|---|---|---|
| Register / login / logout / refresh | present | cookie session |
| Email verification, forgot/reset password, change email | present | |
| GitHub OAuth | present | |
| Other OAuth providers (Google…) | absent | |
| Own profile read / update | present | `GET`/`PATCH /profile` |
| Profile completeness flag | present | in login response and `GET /profile/:id/is-complete` |
| View another profile by UUID | present | `GET /profile/:userId` |
| Pictures upload / delete / set main | present | |
| Picture reordering | absent | |
| "Who viewed my profile" | partial | `GET /profile/viewers` → IDs only; no timestamps, names or pictures |
| "Profiles I viewed" | absent | |
| Browse / discover / suggestions feed | **absent** | no endpoint lists or enumerates users |
| Like / pass / swipe / unlike | **absent** | no table, no endpoint ("remove a like" is an open item in `Todo.md`) |
| "Who liked me" | absent | |
| Matches list | **absent** | |
| Chat (history, send, typing, read receipts) | **absent** | no table, no HTTP endpoint, no socket event |
| Block / report | **absent** | |
| Search / filters / sorting (age, distance, fame, tags) | **absent** | |
| Geolocation (store, update, distance) | **absent** | no column |
| Age / birth date | **absent** | no column anywhere |
| Fame rating | **absent** | |
| Notifications list / unread count / mark read | **absent** | |
| Real-time notifications | partial | authenticated socket connects; zero events defined |
| Online status / last seen per user | partial | only a global count at `GET /notification/online` |
| Account info for the current user (username, email, language, verified) | **absent** | `GET /auth/validate` returns `userId` only; the profile has no username/email |
| Username shown on other profiles | absent | profile carries first/last name only |
| Change password while logged in | absent | only the forgot/reset email flow |
| Change username / change language | absent | |
| Delete account | absent | |
| Resend verification email | partial | implicit: a correct-password login on an unverified account re-sends |
| Tag catalogue / autocomplete | absent | tags are only visible inside profiles |
| Rate limiting | present | enforced at the gateway: any route can answer **429** `{ "statusCode": 429, "message": "Too many requests, retry in N seconds", "error": "Too Many Requests" }` with a `Retry-After` header (seconds); `toApiError` maps it like any other error. Limits per route: [`docs/backend/rate-limiting.md`](../backend/rate-limiting.md) |

**Where the boundary sat (historical).** Real at that commit: the session, the logged-in user's own profile and pictures, opening one profile whose UUID is already known, the viewer-ID list, and an idle authenticated socket. Everything that involved discovering or interacting with other users was mocked in the browser until the backend caught up.

---

## 9. Bugs and hazards found in the code

Rechecked against the code on 2026-10-31; items fixed since the first pass were removed (JWT expiry units, profile "not found" as 500, GitHub users without a profile row, refresh-token expiry, logout revocation, public internal endpoints, `SECURE` parsing, main-picture promotion, email expiry text, forgot/reset password returning 201, `/notification/health` returning 401, proxies hanging when a service is down, cookies set on a failed login, GitHub usernames over 30 chars or with `-`, no OAuth `state`).

1. **Name rule mismatch** — registration requires `firstName`/`lastName` to match `/^[a-zA-Z]+$/`; `PATCH /profile` accepts any string ≤ 50. "Jean-Luc" or "José" cannot register but can be set afterwards.
2. **Viewing has side effects** — any `GET /profile/:userId` for another user records a view and notifies the owner.

---

## 10. Where the docs are stale (code wins)

| Doc | Says | Code does |
|---|---|---|
| `docs/auth_flow.txt` | unverified login → "401 + EMAIL_NOT_VERIFIED" | 403 with `"error": "EMAIL_NOT_VERIFIED"` |
| `docs/auth_flow.txt` | login checks verification before the password | password is checked first; `EMAIL_NOT_VERIFIED` is only returned with a correct password |
| `docs/auth_flow.txt` | reserved usernames are `[admin, support, api, system, root]` | 36 entries in `reserved-usernames.txt` |
| `docs/auth_flow.txt` | registration sends "email, username, psw, language" | `firstName` and `lastName` are also required |
| `docs/auth_flow.txt` | forgot-password only issues a token if the email is verified | a token is issued for unverified accounts too (only a warning is logged) |
| `docs/auth_flow.txt` | endpoint `/auth/forgot-passwords` | `/auth/forgot-password` |
| `docs/jwtValidation.txt` | "NO endpoint uses [the guards] yet" | used by `/auth/change-email` and all authenticated profile endpoints |
| `docs/jwtValidation.txt` | "Logout does not close sockets yet" | code now closes them on logout (best effort, does not fail the logout) |
| `docs/oauth_flow.md` | base class in `strategies/oauth.strategy.ts` | file does not exist; only `github.strategy.ts` |
| `docs/oauth_flow.md` | OAuth login verifies a previously unverified manual account | `linkOAuthAccount` only links; `email_verified` is not touched (tokens are still issued) |
| `docs/oauth_flow.md` | Google as a second provider | DB `CHECK (provider IN ('github'))`; no Google strategy |
| Swagger (all services) | error bodies with `code`, `timestamp`, `path` | Nest default `{message, error, statusCode}` |
| Swagger auth | login failure 401; verify/reset token failure 400 | all are 403 |
| Swagger profile | `GET /profile/viewers` and `PATCH /profile` 403 "not the profile owner" | cannot occur; both act on the caller only |
| `docs/object-storage.md`, `docs/profile.txt`, `docs/language.txt` | — | consistent with the code |
