# Matcha — frontend

A Tinder-style dating app (React 19, Vite, TypeScript) whose state lives in a node graph
(`src/wb`, an interpreter built on RxJS), dressed in a
tactile, poster-print design ("Press Edition": heavy Archivo lettering, ink outlines, hard shadows,
stamps and halftones).

## Run it

```bash
npm install
npm run dev        # auth + profile go to the gateway (backend/ must be running: make dev)
```

Open <http://localhost:4000> (the port is fixed: the gateway's CORS rule, the GitHub OAuth redirect and
the email links all point there).

Other scripts: `npm test` (vitest), `npm run typecheck`, `npm run lint`, `npm run build`.
The design system's styleguide is at `/styleguide` (or `styleguide.html` standalone).

## What is real and what is mocked

The backend currently provides auth, your own profile, pictures, profile-by-id and viewer ids. Discovery,
swipes, matches, chat and likes have no backend yet, so they are served by an in-browser mock
(`src/mock`), with generated poster portraits instead of photos. The boundary is the URL:
anything under `/__mock` is answered in the browser. Details in `docs/API_CONTRACT.md` §8 and
`docs/ARCHITECTURE.md` §5.

## Where things are

| Path | What |
|---|---|
| `docs/ARCHITECTURE.md` | how it fits together: engine, node graph, mock contract, routes, design direction |
| `docs/API_CONTRACT.md` | the real backend's client-facing contract, bugs and gaps |
| `src/wb` | state layer: engine, node definitions, hooks, `run`, `actions`, realtime |
| `src/api` | wire types, axios plumbing (status events, 401 refresh) |
| `src/mock` | in-browser social backend, seeded people, portraits |
| `src/ui` | design system (`src/ui/README.md` documents every component) |
| `src/app`, `src/features/*` | router, guards, app frame, screens |
