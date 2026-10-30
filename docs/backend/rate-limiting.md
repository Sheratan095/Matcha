# Rate Limiting

## What is it?

Rate limiting caps how many requests one client can make in a period of time. Once a client goes over the cap, the server refuses its requests with **`429 Too Many Requests`** until its window resets.

In Matcha every limit is enforced in the **gateway** (`backend/apps/gateway`), the only public entry point. The services behind it can't be called directly: every controller has `@UseGuards(InternalKeyGuard)`, so a request that skips the gateway is rejected anyway.

The implementation uses [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit) (pinned at `8.7.1`) with its built-in in-memory store. All the code is in `backend/apps/gateway/src/rateLimit.ts`.

---

## Why we need it

| Threat | Without a limit | Protected by |
|--------|-----------------|--------------|
| **Password brute force** | unlimited login attempts | `login` limiter |
| **Email bombing** | each register / forgot-password / change-email request sends an email to an address the attacker chooses | `register`, `forgot-password`, `change-email` limiters |
| **Notification spam** | like/unlike or calendar-invite loops flood the target user with notifications | `social-action`, `calendar-event` limiters |
| **Chat flooding** | unlimited messages | `chat-message` limiter |
| **CPU exhaustion** | every picture upload is decoded and re-encoded by `sharp` | `picture-upload` limiter |
| **Auth-service amplification** | every request with an `access_token` cookie (even a fake one) costs the gateway a call to `auth/internal/validate` | `global` limiter, placed *before* that call |

---

## The algorithm: fixed window per client

express-rate-limit's memory store uses a **fixed window, kept separately for each client**. It is **not** a sliding window.

- A client's window **opens on its first request** and lasts `windowMs`.
- Every request in the window increments the client's counter.
- When the window ends the counter resets to 0, and the next request opens a new window.
- When the counter goes over `limit`, the request is refused with a 429.

```
limit = 10, windowMs = 15 min

  first request                                window resets
       │                                             │
       ▼                                             ▼
  ─────┼──x─x──x────x─x──x──x─x───x──x──X──X─────────┼──x──x─ ...
       │  1 2  3    4 5  6  7 8   9  10 429 429      │  1  2
       └──────────────── 15 minutes ─────────────────┘
```

### Known edge: the boundary burst

A client can use its whole limit at the **end** of one window and again at the **start** of the next. That allows up to **2× the limit** in a short span: for example 20 failed logins close together instead of 10.

We accept this:

- **Brute force:** passwords are bcrypt-hashed and the email / reset tokens are random hex, so 20 guesses instead of 10 changes nothing.
- **Spam:** the volume stays bounded. At worst 60 chat messages arrive in a burst instead of 30, and the next window caps it again.

A sliding window would need a **custom store**: any object implementing `increment`, `decrement` and `resetKey` can replace the memory store, with no change to the rest of the code.

---

## Limits depend on the route

The library itself knows nothing about routes. Each call to `rateLimit({...})` creates an **independent limiter** with its own `windowMs`, `limit` and counters, and it applies only to the requests it is given. The per-route limits come from attaching a different limiter to each kind of route (the `ROUTE_LIMITS` table in `rateLimit.ts`).

What this means in practice:

- **Separate budgets.** Counters are never shared between limiters. Using up the `login` budget doesn't touch your `chat-message` budget.
- **The global limit stacks.** Every request *also* counts against the global limiter, so one chat message costs one hit on `chat-message` and one on `global`.
- **One store per limiter.** Each limiter needs its own store instance. The library logs an `ERR_ERL_STORE_REUSE` error if two limiters share one. `createLimiter()` never passes a `store`, so each limiter gets its own new `MemoryStore`.
- **At most one route rule per request.** The route patterns don't overlap, so a request is checked against the first (and only) matching entry.

---

## Layers and their order in the gateway

The order of the middlewares in `backend/apps/gateway/src/main.ts` matters:

```
request
  │
  ├─ CORS                                   app.enableCors(...)
  ├─ LAYER 1: global limiter, per IP        applyGlobalRateLimit(app)
  ├─ identity middleware                    validates access_token, sets x-user-id
  ├─ LAYERS 2+3: route limiters             applyRouteRateLimits(app)
  ├─ docs / internal-route blockers
  └─ proxies → auth, profile, notification

WebSocket upgrade ('upgrade' event, bypasses Express entirely)
  ├─ upgrade limiter, per IP                checkUpgradeRateLimit(req)
  ├─ authenticateRequest(req)
  └─ proxy → notification
```

1. **After CORS.** A 429 must carry the CORS headers, otherwise the browser hides it from the frontend as a network error.
2. **Global limiter before identity.** The identity middleware calls the auth service for every request with an `access_token` cookie. If the global limiter came after it, a flood of fake cookies would cost one auth round trip per request before being counted.
3. **Route limiters after identity.** Per-user limits key on the `x-user-id` header, which only exists once the identity middleware has validated the token.
4. **WebSocket upgrades are handled separately.** The `'upgrade'` event never passes through Express, so no middleware sees it. `checkUpgradeRateLimit()` counts upgrades on a bare `MemoryStore`, before `authenticateRequest`, for the same amplification reason as point 2.

---

## The limits

| Limiter | Route(s) | Key | Limit | Why |
|---------|----------|-----|-------|-----|
| `global` | every request except `/health` and `/notification/health` | IP | **600 / 1 min** | backstop; generous because one SPA page fires several requests, socket.io long-polling adds more, and a campus can share one IP |
| `login` | `POST /auth/login` | IP | **10 failed / 15 min** | brute force; only **failed** logins count (`skipSuccessfulRequests`) |
| `register` | `POST /auth/register` | IP | **10 / 1 h** | sends an email |
| `forgot-password` | `POST /auth/forgot-password` | IP | **5 / 1 h** | sends an email |
| `email-token` | `POST /auth/verify-email`, `POST /auth/reset-password` | IP | **20 / 15 min** | hygiene: the tokens are random hex and can't be guessed anyway |
| `change-email` | `POST /auth/change-email` | user | **5 / 1 h** | sends an email |
| `chat-message` | `POST /chat/message` | user | **30 / 1 min** | flooding |
| `social-action` | `POST`/`DELETE /profile/:id/like`, `POST /profile/:id/pass`, `POST`/`DELETE /profile/:id/block`, `POST /profile/:id/report` | user | **30 / 1 min** | each one can notify the target user |
| `calendar-event` | `POST /profile/calendar/event` | user | **20 / 1 h** | each invite notifies the invitee |
| `picture-upload` | `POST /profile/pictures` | user | **20 / 1 h** | `sharp` re-encoding is CPU heavy |
| upgrade | `/socket.io` WebSocket upgrade | IP | **30 / 1 min** | each attempt costs an auth round trip |

Deliberate choices:

- **`POST /auth/refresh` only has the global limit.** The frontend refreshes the session automatically on a 401. A 429 there would log the user out, which is worse than what it prevents.
- **Login counts only failures.** A user who types the right password is never locked out by their own earlier mistakes.
- **Route patterns ignore case and a trailing slash** (`/^\/auth\/login\/?$/i`). Express routing does the same, so `/auth/Login/` reaches the login handler and must hit the same limiter. Otherwise it would be a free bypass.
- **Methods are part of the match.** `GET /chat/message` isn't limited by the `POST` rule, and `DELETE /profile/pictures/:id` isn't caught by the social-action pattern.

---

## Keys: who counts as "one client"

| Key | Used by | Value |
|-----|---------|-------|
| **IP** | global, the public auth routes, upgrades | the socket's address, IPv6 grouped by /56 |
| **user** | the logged-in write actions | `user:<userId>` from `x-user-id`; falls back to `ip:<address>` if the request is anonymous |

**Why per user for logged-in actions.** Many people can share one public IP: the 42 campus NAT, or several evaluators on the same network. Keying on the user id gives each person their own budget. The `x-user-id` header is trustworthy at this point: the identity middleware deletes any copy the client sent and sets it only from a validated token.

**Why not `X-Forwarded-For`.** The gateway is exposed directly, with no reverse proxy in front, so Express's `trust proxy` stays **off** and `req.ip` is the real socket address. Trusting `X-Forwarded-For` would let any client choose its own key by sending a different value with each request. If a reverse proxy (nginx, a load balancer) is ever put in front of the gateway, set `app.set('trust proxy', 1)` (one trusted hop). Otherwise every client would share the proxy's IP.

**IPv6 /56 grouping.** An IPv6 client usually controls a whole block of addresses. `ipKeyGenerator()` (from express-rate-limit) groups addresses by their /56 prefix, so rotating addresses inside that block doesn't produce a fresh budget.

---

## The 429 response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 742
RateLimit-Policy: 10;w=900
RateLimit: limit=10, remaining=0, reset=742
Content-Type: application/json

{ "statusCode": 429, "message": "Too many requests, retry in 742 seconds", "error": "Too Many Requests" }
```

- **Body:** the same shape as every Nest `HttpException`, so the frontend's `toApiError()` (`frontend/src/api/http.ts`) turns it into an `ApiError` with `status: 429` and that message. No frontend change was needed.
- **`Retry-After`:** seconds until the client's window resets.
- **`RateLimit` / `RateLimit-Policy`:** the IETF draft-7 standard headers (`standardHeaders: 'draft-7'`). The old `X-RateLimit-*` headers are off.
- **WebSocket upgrades** have no body. The gateway writes `HTTP/1.1 429 Too Many Requests` with `Retry-After` on the raw socket and closes it.
- Every refusal is logged by the gateway as a warning, with the limiter name, method, path and key.

---

## Configuration

| Variable | Default | Effect |
|----------|---------|--------|
| `RATE_LIMIT_ENABLED` | `true` | `false` turns off **every** layer, and the gateway logs a warning at startup. In dev every tester shares `127.0.0.1`, so switch it off if local testing trips the limits. It must be exactly `true` or `false`. Any other value, including an empty one, stops the service at startup, like every other invalid variable. |

The variable is parsed with `z.enum(["true", "false"])`, **not** `z.coerce.boolean()`, because the latter runs `Boolean("false")`, which is `true`.

### Changing or adding a limit

1. Edit the `ROUTE_LIMITS` table (or the global and upgrade constants) in `backend/apps/gateway/src/rateLimit.ts`. Each entry is a method list, a path pattern, and `createLimiter(name, windowMs, limit, 'ip' | 'user')`.
2. Write patterns as `^...\/?$` with the `i` flag, and make sure they don't overlap with an existing entry.
3. Update the table in this document.

---

## Known limitations

- **Counters live in memory.** They reset when the gateway restarts, and they assume a **single gateway instance**: two instances would each keep their own counts. Scaling out would need a shared store (for example Redis via `rate-limit-redis`).
- **Garage's public image endpoint (`:3902`) isn't covered.** The browser loads pictures from it directly, without going through the gateway. This is acceptable: the endpoint is anonymous and **read-only**, it doesn't list the bucket, and every key contains a random UUID. The only possible abuse is wasting bandwidth, not reading data. Uploads go through the gateway and are limited by `picture-upload`.
- **Per-account login limits don't exist.** The login limit is per IP, so an attacker spreading guesses for one account across many IPs isn't stopped by it. With bcrypt and the 10-failures limit per IP, that's slow enough for this project. A per-account lockout would have to live in the auth service, which can read the username from the request body. The gateway can't: it streams request bodies straight to the services without reading them.

---

## Testing

Point these at a running stack with `RATE_LIMIT_ENABLED=true` (the default). `G=http://localhost:3000`.

**Login brute force.** The 11th failed attempt returns 429:

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $G/auth/login \
    -H 'Content-Type: application/json' -d '{"username":"testuser","password":"wrong"}'
done
```

**Headers on the 429:**

```bash
curl -i -X POST $G/auth/login -H 'Content-Type: application/json' -d '{"username":"testuser","password":"wrong"}'
```

**Forgot-password.** The 6th request within an hour returns 429:

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $G/auth/forgot-password \
    -H 'Content-Type: application/json' -d '{"email":"testuser@matcha.local"}'
done
```

**Per-user budget.** Log in as two users (saving each cookie jar), send 31 chat messages as the first, then one as the second. The first user's 31st message returns 429; the second user's message passes.

**Global limit.** A loop of 605 `GET $G/profile` returns 429 from the 601st request.

**Disable switch.** Restart with `RATE_LIMIT_ENABLED=false`. None of the above returns 429, and the gateway logs `Rate limiting is DISABLED`.
