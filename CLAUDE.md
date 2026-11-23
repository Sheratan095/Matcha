# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Matcha is a dating web app: a NestJS microservice backend (`backend/`, pnpm + turbo monorepo) and a React 19 + Vite SPA (`frontend/`, npm). Notes from teammates (`SAL..md`, `backend/Todo.md`, `frontend/TODO.md`) are partly in Italian and track open bugs/tasks.

## Commands

### Backend (`cd backend`, pnpm 8, turbo)

- `make dev` — full dev setup + all services in watch mode. Creates `.env` via `infra/generate-env.sh` (random secrets; prompts for SMTP + GitHub OAuth creds), `pnpm install`, builds, starts Docker infra (Postgres + Garage), inits Garage and seeds pictures. Each step is skipped when already done.
- `make` / `make up` — same, but production mode (`node dist/main`).
- `make infra` / `make down` — start / stop only the Docker infra (the apps always run on the host, not in Docker).
- `make db-migrate` — apply new SQL migrations to the running DB (no data loss; migrations must be idempotent: `IF NOT EXISTS`).
- `make db-seed [SEED=<file>]` — apply `infra/db/seeds/003_test_accounts.sql` (test accounts, password `1234`) without reset.
- `make db-reset` — wipe Postgres + Garage volumes and re-init from migrations + seeds.
- `pnpm build` / `pnpm lint` / `pnpm test` — turbo across all workspaces.
- Single service: `pnpm --filter @matcha/profile test` (packages: `@matcha/auth`, `@matcha/profile`, `@matcha/notification`, `gateway`).
- Single test file: `pnpm --filter @matcha/profile exec jest src/calendar/eventStartWatcher.spec.ts` (jest `rootDir` is `src`, files `*.spec.ts`).

Do not hand-copy `.env.example`: `INTERNAL_KEY` and JWT secrets would be too short and the services refuse to start. Set `RATE_LIMIT_ENABLED=false` in `.env` if local testing trips rate limits.

### Frontend (`cd frontend`, npm, Node 24)

Use Node 24 (`nvm use` reads `.nvmrc`): the shell's default Node 20 cannot run vitest/jsdom.

- `cp .env.example .env && npm install && npm run dev` — dev server on **port 4000 (fixed, `strictPort`)**: CORS, GitHub OAuth redirect and email links all point there. `.env` is optional (its values are the defaults).
- `npm run prod` — production: `vite build` into `dist/`, then `npm start` (`server.mjs`, no dependencies) serves it on :4000 and forwards `/api` (HTTP + websocket) to `BACKEND_URL` like the Vite dev proxy. Keep `vite.config.ts` and `server.mjs` proxies in step.
- `npm test` — vitest (jsdom), `src/**/*.test.{ts,tsx}`. Single file: `npx vitest run src/wb/actions.test.ts`; by name: `npx vitest run -t "<name>"`.
- `npm run typecheck` (`tsc -b`), `npm run lint` (oxlint), `npm run build`.

### Manual end-to-end testers (`test/`)

`test/chat`, `test/ws`, `test/profile`, `test/oauth` are standalone Node scripts (own `package.json`, `npm install` each) that hit a running gateway (`GATEWAY_URL`, default `http://localhost:3000`) with the seeded `testuser`/`alice` accounts. See their READMEs.

## Architecture

### Backend

```
browser ──▶ gateway :3000 ──proxy──▶ auth :3001 / notification :3002 / profile :3003 (127.0.0.1 only)
                                      └── Postgres :5432, Garage S3 :3900 (public images :3902)
```

- **Gateway** (`apps/gateway/src/main.ts`) is plain `http-proxy-middleware` mounted on Express, not Nest controllers. Middleware order matters: CORS → security headers → global rate limit → identity → per-route rate limits → docs basic-auth → `/internal` block → proxies.
  - Identity: strips any client-supplied `x-user-id`, validates the `access_token` cookie (via `authenticateRequest` in `@repo/utils`), and injects a trusted `x-user-id`. It never rejects; enforcing auth is the job of `AuthenticatedUserGuard` on the service endpoint.
  - Proxies inject `x-internal-key` on every request; services trust only requests carrying it. Any path with an `internal` segment is blocked externally — service-to-service calls go directly to `host:port`, bypassing the gateway (e.g. profile → `POST /notify/<type>` on notification).
  - Also proxies the socket.io upgrade for the `/notification` namespace (`websocketGateway.ts`).
- **auth**: register/login/email verification/password reset, JWT access + rotating refresh tokens in cookies, GitHub OAuth (`strategies/`).
- **profile**: profiles, pictures (processed by `pictures/image.processor.ts`, stored in Garage via `storage/`), discover/search, likes/passes/blocks/reports/views, fame rating, matches, calendar.
- **notification**: socket.io gateway (`websocket/`), offline per-user in-memory queue, chat, and email via `mail/` (templates + `languages/` en/es/fr). See `docs/backend/WEBSOCKETS.md`.
- Each service: global `SanitizeInputPipe` then `ValidationPipe({ whitelist, transform })`; DTOs with class-validator; raw SQL through a `pg` Pool in `db/db.service.ts` (no ORM).
- Shared packages (`packages/`): `@repo/config` (typed `env`), `@repo/utils` (auth helpers, guards, sanitize), `@repo/shared-types` (DTOs, WS payloads), `@repo/logger`. Turbo builds them first (`^build`); apps import their `dist`.
- DB schema = ordered SQL files in `infra/db/migrations/` run by `infra/db/init.sh` on first container start; add a new numbered file for schema changes.
- Swagger: `/docs` on the gateway plus `/<service>/docs`, behind `DOCS_USER`/`DOCS_PASSWORD` (not served if unset).

More in `docs/backend/` (auth/OAuth flow, rate limiting, object storage, security, SMTP).

### Frontend

Read `docs/frontend/ARCHITECTURE.md` before touching state; `docs/frontend/API_CONTRACT.md` documents the backend contract as seen by the client.

- **All domain state lives in a node graph** (`src/wb`, a small RxJS interpreter). Screens import only from `@/wb` and never call axios/fetch directly (third-party geo services excepted).
  - Every HTTP call is a node: reads are `GET` nodes; writes are a `<name>Payload` (`USER_SELECTION`) + `<name>Result` node. A mutation `Result` must depend **only** on its `Payload`.
  - Node values: `undefined` = never loaded, `null` = loading/reset/failed; status comes from `useNodeStatus` (HTTP event stream in `src/api/http.ts`).
  - Session reads depend on `sessionUserId`; refetch via `<name>Refresh` nonce nodes; lazy reads sit behind `<x>Wanted` gates opened by `load()`/`useLoad()`.
  - Screens call `run(command, payload)`, `refresh(name)`, `load(name)` and flows in `actions.ts`. Realtime socket events (`realtime.ts`) trigger refreshes.
  - Graph is validated at startup (`nodes/validate.ts`): cycles, dangling deps, duplicate requests are rejected.
- In dev, the browser only talks to `:4000`; Vite proxies `/api/*` (HTTP + WS) to `BACKEND_URL` (the gateway), strips `/api`, rewrites cookie paths. Auth is cookie-based; a 401 triggers a single-flight `/auth/refresh` (cross-tab Web Lock) then one retry.
- Tests need no backend: they swap the axios adapter for a stateful fake gateway (`src/wb/testing`).
- Conventions: `@/` = `src/`; TS `strict` + `verbatimModuleSyntax` (use `import type`) + `erasableSyntaxOnly` (no `enum`, no parameter properties, no namespaces); plain CSS with tokens (`src/ui/styles/tokens.css`) + one CSS Module per component — no Tailwind/CSS-in-JS/UI libs. The design system is documented in `src/ui/README.md` and showcased at `/styleguide`. All UI text goes through `@/i18n` (en/fr/es): `useT()` in components, `t()` elsewhere, catalogues per domain in `src/i18n/messages/app/` (ARCHITECTURE §8); never hard-code English in a screen.
