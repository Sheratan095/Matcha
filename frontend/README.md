# Matcha — frontend

A Tinder-style dating app (React 19, Vite 8, TypeScript) whose state lives in a node graph
(`src/wb`, a small interpreter built on RxJS), dressed in a tactile, poster-print design
("Press Edition": heavy Archivo lettering, ink outlines, hard shadows, stamps and halftones).

## Run it

Needs Node 24 (`nvm use` reads `.nvmrc`; vitest and jsdom refuse Node 20) and npm (this app is installed
with npm; the backend uses pnpm), and the backend running (`make dev` or `make` in `backend/`).

```bash
cp .env.example .env   # optional: the defaults below are the same
npm install
npm run dev            # development: Vite, hot reload
npm run prod           # production: build into dist/, then serve it (npm start serves an existing build)
```

Open <http://localhost:4000> either way. The port is fixed: the gateway's CORS rule, the GitHub OAuth
redirect and the email links all point there, so stop the dev server before starting the production one.

The browser only talks to `:4000`. `/api/*` (HTTP and the socket.io upgrade) is forwarded to
`BACKEND_URL` with the `/api` prefix stripped and cookie paths rewritten to `/`: by Vite in development,
by `server.mjs` in production. `/pictures/*` (the profile pictures: the backend's `S3_PUBLIC_URL`) is
forwarded the same way to Garage's image endpoint (`PICTURES_URL`). `server.mjs` has no dependencies: it
serves `dist/` (hashed assets cached for a year, index.html for every app route, compressed), and needs only
Node and the built `dist/`.

**From other devices** (a phone, another computer on the network): `server.mjs` listens on every interface
and prints the addresses to use. The Vite dev server stays on `localhost` only. In `backend/.env`, set
`FRONTEND_URL` to that address (e.g. `http://192.168.1.10`) so email links and the GitHub sign-in redirect
lead there, and `GITHUB_CALLBACK_URL` to `http://<that address>:4000/api/auth/github/callback` (the GitHub
OAuth app must use the same callback URL). Cookies get the `Secure` flag only when `FRONTEND_URL` is
`https://`, so plain HTTP on a LAN address works.

| Variable | Default | What |
|---|---|---|
| `VITE_API_URL` | `/api` | base URL every request (and the socket) uses; read at build time |
| `BACKEND_URL` | `http://localhost:3000` | where `/api` is forwarded (the gateway: `GATEWAY_PORT` in `backend/.env`) |
| `PORT`, `HOST` | `4000`, every interface | where `server.mjs` listens (production only) |
| `PICTURES_URL` | `http://profile-pictures.web.garage.localhost:3902` | where `/pictures` is forwarded (Garage's web endpoint; a `*.localhost` host is reached on `127.0.0.1`) |
| `VITE_GEOIP_URL` | GeoJS | IP geolocation, the fallback when the device position is refused |
| `VITE_GEOCODER_URL` | Nominatim | place search, and the name of the spot under the pin |
| `VITE_MAP_TILES_URL` | OpenStreetMap tiles | Leaflet tile template |

`VITE_API_URL`, `BACKEND_URL` and `PICTURES_URL` are in `.env.example`. The `VITE_` ones are baked into the
build (`src/config.ts` has their defaults); `server.mjs` reads `BACKEND_URL`, `PICTURES_URL`, `PORT` and
`HOST` from the environment, then from `.env`.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | dev server on `:4000` |
| `npm run build` | typecheck, then `vite build` into `dist/` |
| `npm start` | production server (`server.mjs`) on `:4000`: serves `dist/`, forwards `/api` |
| `npm run prod` | `build`, then `start` |
| `npm run preview` | Vite's preview of `dist/` on `:4000` (same proxy as dev): a quick look, not a production server |
| `npm test` | vitest (jsdom), every `src/**/*.test.{ts,tsx}` |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |

The design system's styleguide is at `/styleguide` in the app. To open it on its own, run
`npx vite --port 4100` and go to <http://localhost:4100/styleguide.html>
(`?demo=shell|auth|chat|match` opens the full-page layout demos).

## The backend

There is no mock: every screen talks to the gateway (auth, profile, discovery, search, likes,
visits, connections, chat, map), and live events come over its socket.io namespace (`/notification`).
Without the backend running, the app shows its error states. Tests don't need it: they swap the axios
adapter for a small stateful fake gateway (`src/wb/testing`). What is still missing, on either side,
is listed in `TODO.md`.

## Screens

| Path | Screen | Code |
|---|---|---|
| `/` | landing, or a redirect to `/discover` when signed in | `features/auth` |
| `/login`, `/register`, `/forgot-password` | sign in, sign up (anonymous only) | `features/auth` |
| `/verify-email`, `/reset-password` | targets of the links in emails | `features/auth` |
| `/onboarding` | complete the profile | `features/onboarding` |
| `/me` | own profile, pictures, location, account settings | `features/me` |
| `/discover` | swipe deck, with filters and sort | `features/discover` |
| `/matches`, `/chat/:userId` | connections, and the conversation with one | `features/matches`, `features/chat` |
| `/calendar` | dates with your connections: answer invites, plan one, call one off | `features/calendar` |
| `/activity` | likes received, profile viewers, profiles you visited | `features/activity` |
| `/map` | your connections on a Leaflet map | `features/map` |
| `/styleguide` | design system showcase | `ui/styleguide` |

Everything from `/discover` to `/chat/:userId` needs a signed-in user with a filled-in profile (otherwise
`/onboarding`); `/discover` also needs a profile photo, and without one shows how to add it. Some
pieces are not routes but are shared by several screens: the search bar in the top bar
(`features/search`), the profile sheet (`features/profile`) and the location picker
(`features/location`). Routes are in `src/app/router.tsx`, guards in `src/app/guards.tsx`.

## Where things are

| Path | What |
|---|---|
| `../docs/frontend/ARCHITECTURE.md` | how it fits together: engine, node graph and its conventions, tests, routes, location, design direction |
| `../docs/frontend/API_CONTRACT.md` | the backend's client-facing contract, its bugs and gaps |
| `server.mjs` | production server: `dist/` plus the `/api` proxy (HTTP and websocket) and the `/pictures` proxy |
| `src/main.tsx` | boot: HTTP plumbing, store, session probe, realtime, then the app |
| `src/config.ts` | build-time configuration (the variables above) |
| `src/api` | wire types, axios plumbing (status events, 401 refresh) |
| `src/wb` | state layer: engine, node definitions, hooks, `run`, `actions`, realtime; `testing/` holds the fake backend |
| `src/ui` | design system (`src/ui/README.md` documents every component) |
| `src/app` | router, guards, the signed-in frame, realtime toasts, full-page states |
| `src/features/*` | screens, one folder per feature |
| `styleguide.html` | standalone entry for the styleguide |

## Conventions

- Screens read and write state through `@/wb` only, never with axios or `fetch` (the third-party
  location services aside).
- `@/` is `src/`.
- Plain CSS: design tokens (`src/ui/styles/tokens.css`) and one CSS Module per component. No
  Tailwind, no CSS-in-JS, no UI library.
- TypeScript `strict`, `verbatimModuleSyntax` (use `import type`) and `erasableSyntaxOnly` (no `enum`,
  no constructor parameter properties, no namespaces).
