# Matcha — frontend

A Tinder-style dating app (React 19, Vite, TypeScript) whose state lives in a node graph
(`src/wb`, an interpreter built on RxJS), dressed in a
tactile, poster-print design ("Press Edition": heavy Archivo lettering, ink outlines, hard shadows,
stamps and halftones).

## Run it

```bash
npm install
npm run dev        # every call goes to the gateway (backend/ must be running: make dev)
```

Open <http://localhost:4000> (the port is fixed: the gateway's CORS rule, the GitHub OAuth redirect and
the email links all point there).

Other scripts: `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run build`.
The design system's styleguide is at `/styleguide` (or `styleguide.html` standalone).

## The backend

There is no mock: every screen talks to the gateway (auth, profile, discovery, search, likes,
connections, chat), and live events come over its socket.io connection (`/notification`). Without the
backend running, the app shows its error states. What the backend still lacks is listed in `TODO.md`.

## Where things are

| Path | What |
|---|---|
| `docs/ARCHITECTURE.md` | how it fits together: engine, node graph, routes, design direction |
| `docs/API_CONTRACT.md` | the real backend's client-facing contract, bugs and gaps |
| `src/wb` | state layer: engine, node definitions, hooks, `run`, `actions`, realtime |
| `src/api` | wire types, axios plumbing (status events, 401 refresh) |
| `src/ui` | design system (`src/ui/README.md` documents every component) |
| `src/app`, `src/features/*` | router, guards, app frame, screens |
