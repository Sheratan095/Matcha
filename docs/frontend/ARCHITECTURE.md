# Matcha frontend — architecture

A Tinder-style SPA (React 19 + Vite + TypeScript) whose state lives in a **node graph** run by a small
RxJS-based engine (`src/wb`). Companion document in this folder:

- `API_CONTRACT.md` — what the backend really exposes (researched from the backend source).

## 1. Ground rules

- **All domain state lives in graph nodes.** Components read nodes through hooks and never call
  axios/fetch themselves. Ephemeral view state (an open menu, a drag offset, a form draft) stays in
  React or in local RxJS streams.
- **Every HTTP call is an HTTP node.** Reads are `GET` nodes that depend on other nodes;
  writes are a `<name>Payload` node (`USER_SELECTION`) plus a `<name>Result` node (`POST`/`PATCH`/`DELETE`)
  that depends on it.
- **The mock boundary is the URL, not the code.** Nodes do not know whether a service is real. Any URL
  under `/__mock` is answered in the browser by `src/mock`; everything else goes to the network.
- TypeScript: `strict`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no `enum`, no
  constructor parameter properties, no namespaces). Import alias `@/` = `src/`.
- Styling: plain CSS with design tokens (`src/ui/styles/tokens.css`) and CSS Modules per component.
  No Tailwind, no CSS-in-JS, no UI library.

## 2. Backends

| Service | Served by |
|---|---|
| `api` (auth, profile, notification) | the gateway at `VITE_API_URL` (`http://localhost:3000`) |
| `social` (discover, swipes, matches, chat) | the in-browser mock (§5): the backend has no such service yet. `VITE_SOCIAL_URL` overrides it |

`npm run dev` must run on **port 4000** (CORS, OAuth redirect and email links are hardcoded to
`http://localhost:4000`). `src/config.ts` exposes `API_URL`, `SOCIAL_URL`, `MOCK_PREFIX`, and the third-party
location services (§6.1) `GEOIP_URL`, `GEOCODER_URL`, `MAP_TILES_URL` (each overridable with its `VITE_` variable).

## 3. Folder ownership

```
src/
  config.ts            env flags
  main.tsx             boot sequence                                   (state)
  api/types.ts         wire types shared by everything                 (fixed contract)
  api/http.ts          axios defaults, http event stream, 401 refresh  (state)
  wb/                  state layer: engine, nodes, hooks, commands, actions                  (state)
  mock/                in-browser social backend: adapter, seed, handlers, portraits         (mock)
  ui/                  design system: tokens, global css, components, AppShell               (design)
  app/                 router, guards
  features/<name>/     screens
```

## 4. The state layer (`src/wb`)

```
src/wb/
  index.ts          the public surface (§4.6): screens import from '@/wb' only
  types.ts          the node-graph vocabulary (NodeDef, DepDef, loading actions...)
  engine/           StoreEngine interface, the graph interpreter, request building
  nodes/            the graph (§4.5): builders, one file per domain, static validation
  functions.ts      CUSTOM_FUNCTION implementations
  services.ts       the `api` and `social` services
  registry.ts       request (method + URL) -> HTTP node
  store.ts          the running store: engine start-up, typed node access
  status.ts         request status per HTTP node
  stale.ts          drops in-flight reads whose node was reset
  commands.ts       run() and refresh()
  filters.ts        discover filters (one request for several changes)
  actions.ts        the flows screens call
  realtime.ts       realtime$ and the presence socket
  boot.ts           installStoreHttp(), getViewerId() for main.tsx
  hooks.ts          React hooks
  testing/          test-only fake adapter / backend / harness
```

### 4.1 The engine

The graph is run by an interpreter of the app's node definitions (`NodeDef[]`, services, custom
functions) on plain RxJS `BehaviorSubject`s (`src/wb/engine/graph.ts`), behind one interface
(`src/wb/engine/types.ts`):

```ts
interface StoreEngine {
  /** Resolves true when the graph is live, false when it could not start. Never rejects. */
  ready: Promise<boolean>
  /** A BehaviorSubject: subscribe / getValue / next. Throws on an unknown name. */
  getNode(name: string): BehaviorSubject<unknown>
  /** Why `ready` resolved false; null while healthy. */
  failure: string | null
  destroy(): void
}
```

It implements the subset this app uses: top-level `SINGLE` nodes, `USER_SELECTION` / `CUSTOM_FUNCTION` /
HTTP loading actions, `isOptional` / `onUpdate`, `PATH_VARIABLE` / `REQUEST_PARAMETER` / `BODY`
dependencies, `bodyType`, `defaultValue`, the argument mapping and snapshot of custom functions, `null`
on a failed call (with a `console.error`), one request per dependency while tangling, no cancellation.
The graph comes alive asynchronously (a value written before `ready` is reset by the tangle). Anything
outside the subset is rejected at construction: no `LIST`, `COMPLEX` or `MULTI` nodes.

`startStore()` (`store.ts`) creates the engine, validates the graph first (`nodes/validate.ts`: dangling
dependencies, cycles, bad placeholders, mutations with a second dependency, wrong function arity...),
and returns a handle `{ ready, failure }`. Node accessors throw until the engine has been ready once;
after `stopStore()` reads are refused and `run` / `refresh` refuse to send (`NOT_SENT`). A hot update of
anything under `src/wb` stops the store and reloads the page (never two stores).

### 4.2 Conventions that follow from the engine's semantics

- `undefined` = never loaded, `null` = loading / reset / failed. A node value alone cannot tell loading
  from failure, so status comes from the HTTP event stream (4.4).
- An HTTP node fires whenever a dependency emits and every non-optional dependency is non-null. So:
  - Reads that need a session depend on `sessionUserId` (non-optional, `onUpdate: true`, no `type`):
    they load on login and reset to `null` on logout. This also applies to the reads keyed by a
    selection (`apiProfile`, `socialProfile`, `chatMessages`), so nothing is ever sent while anonymous.
    Consequence, verified: the graph sends **no request at all while tangling**
    and only `GET /auth/validate` while anonymous.
  - A **refresh trigger** is a `USER_SELECTION` nonce node (`<name>Refresh`) used as an *optional*
    dependency with `onUpdate: false` and no `type`: bumping it refetches without flashing to `null`.
  - A **mutation** `Result` node depends on its `Payload` node **only** (`type: 'BODY'`,
    `onUpdate: true`). Never give a mutation a second dependency: it would re-send the request when
    that other node changes.
  - With exactly one `BODY` dependency the payload value is the request body as-is (objects become
    JSON, a `FormData` stays multipart). With no `BODY` dependency set `bodyType: 'JSON_OBJECT'` so the
    body is `{}` (payload-less commands use a nonce dependency without `type`).
  - Each dependency emission is one request: several filters are changed behind a closed gate
    (`filters.ts`: `filterAgeMin` is held at `null` while the others change, then written last).
- Custom functions receive dependency values **in `dep` order** (never rely on parameter names: the
  engine falls back to order, and minifiers rename parameters). They declare exactly one parameter per
  dependency (more makes the engine append a snapshot). Their inputs are **optional** dependencies
  without `onUpdate` (`input()` in `nodes/builders.ts`): a required input would freeze the derived node
  on its last value when the input resets to `null`.
- Path values are inserted into the URL raw (not encoded): actions refuse ids that are not URL-safe
  (`[A-Za-z0-9._~-]+`) instead of encoding them, so node values stay the real ids.
- Node names are one global namespace; use camelCase.
- Never write to a node before the engine is ready.
- Selection nodes cannot depend on `sessionUserId` (a `USER_SELECTION` node with dependencies is reset
  on each of their emissions), so the per-user selection state (`activeMatchId`, `socialProfileId`,
  `apiProfileId`, `swipedIds`, filters) is reset by a watcher installed by `actions.bootSession()` when
  the signed-in user changes or signs out.

### 4.3 Services

| Name | Target | Notes |
|---|---|---|
| `api` | `API_URL` | The gateway. Cookie auth: `axios.defaults.withCredentials = true`. No `Authorization` header (not in the gateway's CORS allow-list). |
| `social` | `SOCIAL_URL` (`/__mock/social`) | Mocked; see §5.1. |

### 4.4 HTTP plumbing (`src/api/http.ts`, `src/wb/status.ts`, `src/wb/commands.ts`)

The engine uses the default axios instance and exposes neither status nor errors, so:

- Interceptors publish every request to `httpEvents$` (`start` / `success` / `error`, with an id per
  logical request, method, URL without query, status, data and a normalised `ApiError`). The request
  interceptor is `synchronous`, so `start` is published inside the node write that causes the request.
- The registry (`registry.ts`) maps an event back to the single most specific HTTP node whose method and
  `addr` pattern match the URL: a `{placeholder}` matches exactly one non-empty segment and, segment by
  segment, a literal beats a placeholder (`/profile/viewers` never resolves to `/profile/{userId}`).
  Two nodes that would send the same request are refused at start-up.
- `nodeStatus$(name)` / `useNodeStatus(name)` → `{ status: 'idle' | 'loading' | 'success' | 'error',
  error: ApiError | null }`, per HTTP node. Only the most recently started request of a node settles
  it. `success` drops to `idle` when the node is reset without a request; nodes depending on
  `sessionUserId` forget their outcome when the user changes.
- Concurrent GETs of the same node: the newest wins (an older one settles with the newer outcome),
  because the engine applies responses in arrival order. A GET still in flight when its node is reset
  with no newer request (sign-out, a closed conversation) is **dropped** (`stale.ts` +
  `dropPendingRequests`): it fails with code `DROPPED` whatever the server answered, so the node stays
  `null`, and its status ends `idle`.
- `run(command, payload?)` writes `<command>Payload` and returns a Promise that settles from the event
  of the request *that write caused* (the first start of `<command>Result` after it; calls to the same
  command are serialised), and only after the result node has had the chance to take the value
  (it waits for the node to hold the response object, with a macrotask as safety net). It resolves with
  the response body or rejects with the `ApiError`; `INVALID` for a missing payload, `NOT_SENT` when the
  store is not running. Payload-less commands get a fresh nonce. The payloads of `login`, `register`,
  `resetPassword` and `pictureUpload` are cleared once settled (credentials must not linger in a global
  store), which also resets their result node.
- `refresh(name)` bumps the node's refresh nonce and resolves once the new value is in the node. It
  never rejects (the error is on the node's status) and resolves at once when nothing could be sent.
- A 401 from a guarded `api` endpoint (anything under `API_URL` except `/auth/refresh`, which includes
  `/auth/change-email`) triggers one single-flight refresh — the `sessionRefresh` command,
  `POST /auth/refresh` — then one retry with the same request id; if the refresh or the retry fails the
  session is re-probed (throttled to once per 3 s), which makes the user anonymous. This is installed in
  both modes (the mock implements `/auth/refresh`). `axios.defaults.timeout` is 15 s (60 s for uploads)
  because the gateway can hang when a microservice is down.

### 4.5 Node graph

`P` = `USER_SELECTION`, `F` = `CUSTOM_FUNCTION`. All are top-level `SINGLE` nodes. "(opt)" = optional
dependency; F inputs are always optional (4.2).

**Session**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `sessionProbe` | P | — | nonce; bumped at boot, after login / logout, when the session is lost |
| `sessionCheck` | GET api `/auth/validate` | `sessionProbe` (required, onUpdate false) | `SessionCheck` |
| `sessionUserId` | F | `sessionCheck` (opt) | `string`, or `null` when anonymous or the probe failed |
| `authStatus` | F | `sessionCheck` (opt) | `'checking' \| 'anonymous' \| 'authenticated'` (`checking` only before the first answer) |
| `login` / `register` / `verifyEmail` / `forgotPassword` / `resetPassword` / `changeEmail` / `logout` | `…Payload` P + `…Result` POST api `/auth/…` | payload only | see `api/types.ts` |
| `sessionRefresh` | Payload (nonce) + POST api `/auth/refresh` | payload | `RefreshResult`; fired by the HTTP layer after a 401, never by screens |

**Own profile**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `myProfile` | GET api `/profile` | `sessionUserId`, `myProfileRefresh` (opt) | `OwnProfile` (`Profile` + `latitude` / `longitude`) |
| `profileComplete` | F | `myProfile` (opt) | `boolean` (gender, preference, biography, ≥ 1 interest, a location); `null` while no profile |
| `profileUpdate` | Payload + PATCH api `/profile` | payload | `OwnProfile` |
| `locationUpdate` | Payload + PUT api `/profile/location` | payload | `LocationResult` |
| `profileCreate` | Payload + POST api `/profile` | payload | `ProfileCreateResult`; workaround for OAuth users without a profile row |
| `pictureUpload` | Payload (`FormData`, field `file`) + POST api `/profile/pictures` | payload | `PicturesResult` |
| `pictureDelete` | Payload (picture id) + DELETE api `/profile/pictures/{pictureId}` | payload (PATH_VARIABLE) | `PicturesResult` |
| `pictureMain` | Payload (picture id) + PATCH api `/profile/pictures/{pictureId}/profile` | payload (PATH_VARIABLE) | `PicturesResult` |
| `myViewers` | GET api `/profile/viewers` | `sessionUserId`, `activityRefresh` (opt) | `ViewersResult` |
| `apiProfileId` → `apiProfile` | P → GET api `/profile/{userId}` | `sessionUserId`, id (PATH_VARIABLE) | `Profile` (real user; records a profile view) |
| `onlineCount` | GET api `/notification/online` | `sessionUserId`, `presenceRefresh` (opt) | `number` |

**Discover**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `filterAgeMin` / `filterAgeMax` / `filterDistance` / `filterSort` | P with `defaultValue` (18 / 45 / 50 / `'best'`) | — | number / `DiscoverSort` |
| `filterTags` | P | — | comma-separated tag names, or `null` |
| `discoverDeck` | GET social `/discover` | `sessionUserId`, the filters (REQUEST_PARAMETER `ageMin`, `ageMax`, `distance`, `sort`, `tags` (opt)), `discoverRefresh` (opt) | `Card[]` |
| `swipedIds` | P, default `[]` | — | ids swiped (or blocked) in this session |
| `visibleDeck` | F | `discoverDeck` (opt), `swipedIds` (opt) | `Card[]` still to show; `null` while no deck |
| `swipe` | Payload + POST social `/swipes` | payload | `SwipeResult` |
| `rewind` | Payload (nonce) + POST social `/swipes/rewind` | payload | `RewindResult` |
| `tagCatalogue` | GET social `/tags` | `sessionUserId` | `string[]` |

**Matches, chat, activity**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `matches` | GET social `/matches` | `sessionUserId`, `matchesRefresh` (opt) | `Match[]` |
| `unreadCount` | F | `matches` (opt) | `number` (0 while not loaded) |
| `activeMatchId` | P | — | match being read, or `null` |
| `chatMessages` | GET social `/matches/{matchId}/messages` | `sessionUserId`, `activeMatchId` (PATH_VARIABLE), `chatRefresh` (opt) | `Message[]`; reading marks them read |
| `sendMessage` | Payload + POST social `/messages` | payload | `Message` |
| `unmatch` | Payload (match id) + DELETE social `/matches/{matchId}` | payload (PATH_VARIABLE) | `OkResult` |
| `block` | Payload + POST social `/blocks` | payload | `OkResult` |
| `likesReceived` | GET social `/likes` | `sessionUserId`, `activityRefresh` (opt) | `Card[]` |
| `socialProfileId` → `socialProfile` | P → GET social `/profiles/{userId}` | `sessionUserId`, id (PATH_VARIABLE) | `Card` |
| `demoReset` | Payload (nonce) + POST social `/reset` | payload | `OkResult` |

Refreshable in place (`refresh(name)` → nonce): `sessionCheck` (`sessionProbe`), `myProfile`,
`myViewers` and `likesReceived` (both `activityRefresh`), `onlineCount`, `discoverDeck`, `matches`,
`chatMessages`. Writable by screens (`setNode`, `useNode`): the filters, `swipedIds`, `activeMatchId`,
`apiProfileId`, `socialProfileId` — prefer the actions.

### 4.6 What the UI imports (`@/wb`)

Names and value types are checked against the `NodeValues` / `Commands` maps (`nodes/index.ts`): a
misspelt node or command, a wrong payload or a write to a read node does not compile. `NodeValue<N>`
is `NodeValues[N] | null | undefined`.

- Hooks (`useSyncExternalStore`; StrictMode-safe; snapshots stable until the node emits):
  `useNodeValue(name): NodeValue<N>`, `useNode(writableName): [value, set]` (stable `set`),
  `useNodeStatus(httpNodeName): NodeStatus`, `useFilters(): DiscoverFilters`.
- Imperative: `getNodeValue(name)`, `setNode(writableName, value)`, `node$(name): Observable`,
  `getNodeStatus(name)`, `nodeStatus$(name)`, `refresh(refreshableName): Promise<void>`,
  `run(command, payload?): Promise<CommandResult>`, `isStoreLive()`.
- `actions` — the flows screens actually call; each composes `run` / node writes / `refresh` so that the
  dependent nodes are fresh when it settles. Async ones reject with an `ApiError`; a failed follow-up
  refresh does not fail a successful mutation (its error is on the node's status).

  | Action | Resolves when |
  |---|---|
  | `bootSession(): Promise<AuthStatus>` | the probe answered (installs the session watcher) |
  | `login({ username, password }): Promise<LoginResult>` | re-probed and `sessionUserId` is set (`NO_SESSION` if the browser kept no cookie) |
  | `logout(): Promise<void>` | re-probed; authenticated nodes and selection state are reset |
  | `register(payload): Promise<RegisterResult>` | the account exists (not signed in) |
  | `verifyEmail(token)`, `forgotPassword(email)`, `resetPassword({ token, password })`, `changeEmail(newEmail)` | the request succeeded |
  | `startGithubLogin(): void` | navigates to `${API_URL}/auth/github` |
  | `updateProfile(changes): Promise<OwnProfile>` | `myProfile` / `profileComplete` reflect it (interests normalised and de-duplicated) |
  | `setLocation({ latitude, longitude }): Promise<void>` | `myProfile` / `profileComplete` have it (out-of-range coordinates rejected `INVALID` first); the deck reloads |
  | `createMissingProfile(): Promise<Profile \| null>` | the row exists and `myProfile` reloaded (also automatic on the first 500 of `myProfile` per user) |
  | `uploadPicture(file)`, `deletePicture(id)`, `setMainPicture(id)`: `Promise<PicturesResult>` | `myProfile` has the new pictures (upload validated first: type, 5 MB, 5 pictures) |
  | `showApiProfile(userId): Promise<Profile>`, `showSocialProfile(userId): Promise<Card>`, `closeProfile(): void` | the profile is in `apiProfile` / `socialProfile` |
  | `setFilters(partial): Promise<void>` | the deck reloaded (one request for the lot) |
  | `swipe(card, action): Promise<SwipeResult>` | the card left `visibleDeck` at once (back on failure); on a match `matches` reloaded; next deck fetched when empty |
  | `rewind(): Promise<RewindResult>` | the restored card is back on top of `visibleDeck` |
  | `reloadDeck(): Promise<void>` | the deck reloaded |
  | `openChat(matchId): Promise<Message[]>`, `closeChat(): void` | messages loaded, then `matches` (unread counts) |
  | `sendMessage(matchId, text): Promise<Message>` | the open chat and `matches` show it (1–1000 chars) |
  | `unmatch(matchId)`, `block(userId, reason?)`: `Promise<void>` | `matches` (and likes) reloaded, the open chat closed if affected |
  | `resetDemoData(): Promise<void>` | `POST /__mock/social/reset` done and every social node reloaded |

- `realtime$` — `Observable<RealtimeEvent>` for toasts and typing indicators. `startRealtime` also
  reacts to events (message → open chat then matches; match → matches and likes; like → likes) and
  keeps the gateway's socket.io connection (`/notification`, websocket only) open while signed in, which
  only makes the user count in `onlineCount`.
- Errors: `isApiError`, `toApiError`, `LOCAL_ERROR` (`NETWORK`, `TIMEOUT`, `NOT_SENT`, `INVALID`,
  `NO_SESSION`, `DROPPED`).
- Boot (only `src/main.tsx`): `installStoreHttp()`, `installMockBackend({ getViewerId })` from
  `@/mock`, `startStore()`, await `ready`, `actions.bootSession()`, `startRealtime({ events$: mockEvents$ })`,
  render; `src/app/StoreScreens.tsx` shows the starting / failed / died screens.

## 5. The mock social backend (`src/mock`)

```ts
installMockBackend(options: {
  /** Who is logged in, per the real auth (the mock cannot read HttpOnly cookies). */
  getViewerId: () => string | null
  /** Simulated latency in ms: fixed or [min, max]. Default [120, 450]; 0 answers on the next microtask. */
  latency?: number | readonly [number, number]
}): void
uninstallMockBackend(): void          // tests: original adapter back, timers stopped, caches dropped
export const mockEvents$: Observable<RealtimeEvent>
```

```
src/mock/
  index.ts       install / uninstall, mockEvents$, profile hint
  adapter.ts     the axios adapter wrapper
  routes.ts      route table and dispatch
  nest.ts        MockRequest / MockResponse, Nest-shaped errors
  validate.ts    the class-validator subset (same messages, same order)
  storage.ts     versioned localStorage documents with a memory copy
  social.ts      social service: per-viewer state, seeding, live agenda, incoming likes
  chat.ts        starter conversations and the reply bank
  people.ts      the 36 seeded people
  portraits.ts   risograph poster portraits (SVG data URLs)
  tags.ts        tag catalogue, tag ids
  viewer.ts      who is asking (getViewerId) and what is known about them
  runtime.ts     options, event subject, viewer-scoped timers
  ids.ts         hashing, deterministic UUIDs, tokens
  testkit.ts     helpers for src/mock/*.test.ts
```

**Adapter.** It wraps `axios.defaults.adapter` only (no interceptors). A URL that does not start with
`MOCK_PREFIX` (after `baseURL` is applied) goes to the original adapter, resolved with
`axios.getAdapter`, with the same config, returning the same promise. A mock URL is answered after the
latency with a genuine `AxiosResponse` whose `config` is the very object the adapter received, a JSON
string body that axios' own `transformResponse` parses, `AxiosHeaders`, and `validateStatus` applied;
failures are `AxiosError`s (`ERR_BAD_REQUEST` / `ERR_BAD_RESPONSE`) carrying that config and the
response. Abort signals, cancel tokens and timeouts are honoured. Bodies are read as axios hands them
over: JSON strings, urlencoded strings, `FormData` (an empty one, like `{}`, is a body-less POST); the
query comes from the URL merged with `config.params` (null / undefined dropped). An unknown route is a
Nest 404 (`Cannot GET /x`), a handler crash a Nest 500 (and a console error). Installing again replaces
the wrapper instead of stacking it, and a newer copy of the module (Vite HMR) uninstalls the older one.

**Persistence.** One `localStorage` document per viewer, `matcha.mock.v1.social.<viewerId>`. Missing, unparsable or wrongly shaped documents are reseeded; an
unavailable storage degrades to memory; another tab's writes are picked up (`storage` event).

**Ids** are UUIDs (URL-safe), deterministic for seeded things (people, their pictures, tags, starter
matches), random for created ones.

### 5.1 `/__mock/social/*`

The viewer is `getViewerId()` (the real session); no viewer → 401 `Missing or invalid access token`. Bodies are validated in the Nest style (400 with a message array).

| Method + path | Request | Response |
|---|---|---|
| GET `/discover` | query `ageMin`, `ageMax` (integers 18–120, defaults 18 / 120), `distance` (km, integer 1–20000, default no limit), `sort` (`best` / `distance` / `fame` / `age`, default `best`), `tags` (comma-separated, optional; `#`, case and spaces ignored) | `Card[]` (≤ 20) of people who fit the viewer's orientation both ways, within the filters, sharing at least one of `tags`; excluding people swiped, matched (or unmatched) and blocked; `[]` when exhausted. `best`: 10 per common tag, +6 if they liked you, +fame/10, −distance/5 (capped at 100 km), +3 if online, plus a small per-viewer tiebreak; `distance` ascending; `fame` descending; `age` ascending |
| POST `/swipes` | `SwipePayload` | `SwipeResult`. 404 unknown or blocked, 409 `Already swiped`. `like` matches when `likedYou`; `superlike` matches when `likedYou` and otherwise 70% of the time (fixed per pair). A like that does not match may be returned later (20%, superlike 60%, after 8–25 s), as a `match` event |
| POST `/swipes/rewind` | — | `RewindResult`: undoes the last swipe and returns the full `Card`; `restored: null` when there is none or it created a match (also by a later like-back) |
| GET `/matches` | — | `Match[]`, most recent activity (last message, else `matchedAt`) first |
| DELETE `/matches/{matchId}` | — | `OkResult`; 404 `Match not found`. The person stays out of the deck |
| GET `/matches/{matchId}/messages` | — | `Message[]` oldest first; sets the match's `unread` to 0 (the next `GET /matches` shows it); 404 |
| POST `/messages` | `SendMessagePayload` (`matchId` UUID, `text` trimmed, 1–1000 chars) | `Message`; marks the conversation read. The other person types (0.6–1.3 s) and replies (1.5–5 s); a burst of messages gets one reply, sometimes followed by a second bubble |
| GET `/likes` | — | `Card[]` of people who liked the viewer and are not swiped, matched or blocked, newest first |
| GET `/profiles/{userId}` | — | `Card`; 404 `Profile not found` when unknown or blocked |
| POST `/blocks` | `BlockPayload` (`reason` ≤ 500) | `OkResult`; 404 for an unknown person; removes the match, hides the person everywhere, cancels what they had pending |
| GET `/tags` | — | `string[]`: the 45-tag catalogue (it includes the backend's seed tags) plus the viewer's own interests, sorted |
| POST `/reset` | — | `OkResult`; the viewer's social state (swipes, matches, messages, blocks, likes, pending events) is deleted and reseeded, timers are cancelled |

**Orientation.** `male` / `female` want that gender; `both` and `other` are open to everyone,
non-binary people included. A card is shown when each side accepts the other; an unknown side does not
filter. The mock learns the viewer's gender, preference, interests and first name by reading (never changing) the real `GET` / `PATCH {API_URL}/profile` responses that pass through the
adapter; without that, nothing is filtered and `commonTags` is empty.

**People.** 36 people (16 women, 16 men, 4 non-binary; 19–48 years old; every preference), placed by
distance from central Paris (the mock puts every viewer there), 3–6 interests each, 2–4 portraits,
fame, a job, an opener, a story and a question they use in chat. Presence is derived per quarter hour from
each person's activity level (online, or a `lastSeen` stable within the quarter); someone who just wrote
is online.

**A new viewer** gets a starter world that is a function of their id: 4 matches when 18 or more people
fit them, else 3 (one wrote first and is unread, one is an ongoing conversation with 2 unread, one was
answered and read, the fourth is fresh with no message); 4–6 likes received (~40% of the default deck,
at least 4). While the viewer has not acted yet (swipe, message,
unmatch, block, rewind), the starter world follows their orientation (it is reseeded after onboarding).
Default-filter deck sizes: about 9 for one-gender preferences towards the other gender, 6–7 for
same-gender ones (10 of 36 people fit), 12–20 for open preferences.

**Realtime (`mockEvents$`).** `typing` before every reply, opener and second bubble; `message` for the
other person's messages only; `match` for later like-backs only (an immediate match is in the
`SwipeResult`); `like` when someone new likes the viewer: checked every 60–110 s while the viewer is
active (a social request in the last 2 minutes), at most about once a minute. A new match opens the
conversation half of the time (fixed per pair), 5–9 s later. Everything is persisted before it is
emitted. What happens later is kept in a persisted agenda run by timers that belong to the current
viewer: switching viewer (at their first social request), resetting or uninstalling cancels them, a timer
that fires while its viewer is signed out does nothing, and the agenda resumes when that viewer is back.

Every account gets its own world. `POST /__mock/social/reset` (`actions.resetDemoData()`) restores it.

## 6. Routes

| Path | Screen | Access |
|---|---|---|
| `/` | landing (anonymous) or redirect to `/discover` | — |
| `/login`, `/register`, `/forgot-password` | auth | anonymous |
| `/verify-email?token=`, `/reset-password?token=` | targets of the links in emails | any |
| `/onboarding` | complete the profile | signed in, profile incomplete |
| `/discover` | swipe deck | signed in + complete profile |
| `/matches`, `/chat/:matchId` | matches and conversation | signed in + complete profile |
| `/activity` | likes received, profile viewers | signed in + complete profile |
| `/me` | own profile, pictures, settings | signed in |
| `/styleguide` | design system showcase | any |

GitHub OAuth is a top-level navigation to `${API_URL}/auth/github`; the backend redirects back to `/`
with cookies set, and the boot-time session probe picks the session up.

### 6.1 Location (`src/features/location`)

The backend requires a location for a complete profile (discover and search answer 403 without one) and
stores what the client sends (`PUT /profile/location`); others only ever get a distance from a ~1 km-snapped
copy. The client finds it in this order:

1. **The device** (Geolocation API), on a button press only: the browser's permission prompt is never
   triggered on page load.
2. **The connection**, when the device is refused or fails, and on arrival at the onboarding step when no
   location is set yet: an IP lookup (`GEOIP_URL`, GeoJS by default), city-level and sometimes tens of km
   off, with no prompt. The screen says it is approximate.
3. **By hand**: click or drag the pin on a Leaflet map (`MAP_TILES_URL`, OpenStreetMap tiles), or search a
   place (`GEOCODER_URL`, Nominatim, which also names the spot under the pin).

`LocationPicker` is the shared control (onboarding step "Location", Me → Details → Location). Third-party
calls use `fetch` without credentials (the app's axios sends cookies, which these open-CORS services
refuse). A per-user, per-browser mode (`mode.ts`, `localStorage`) records whether the spot is automatic
(saved from the device or the connection) or pinned by hand; while automatic, `useAutoLocation` (mounted in
`AppLayout`) refreshes it once per page load from the device when the permission is already granted and it
moved more than 1 km.

## 7. Design direction — "Press Edition"

Matcha looks like printed matter: tea tins, letterpress posters, punch cards and stickers.
Tactile, bold, typographic.

- **Ink and paper.** Warm cream paper, near-black ink, a saturated matcha green as the brand colour,
  and hot accents (strawberry for likes, yolk for super-likes, one cool accent for info). Flat colour
  fields, no soft gradients, no glassmorphism.
- **Tactile.** 3px ink outlines, chunky radii, hard offset shadows with no blur. Pressing a control
  moves it into its shadow. Cards have weight: they tilt, fling and land.
- **Heavy lettering.** Archivo variable (weight 900, width axis from condensed 62 to expanded 125) for
  huge uppercase headlines with tight leading; Space Mono for small "ticket" labels and numbering.
  Lettering is a design element: oversized words cropped by their container, stacked condensed type,
  misregistered riso offsets, rotated stamps ("MATCH!", "NOPE"), marquee ticker bands.
- **Print furniture.** Halftone dots, paper grain, perforations, crop and registration marks, serial
  numbers, barcodes, stickers at slight angles.
- **Motion.** Physical and brief: press, thunk, fling. Everything respects `prefers-reduced-motion`.
- Mobile-first (360px and up); on wide screens the app keeps a phone-sized working column and uses the
  extra space for poster-like composition.
- Accessible: real buttons and labels, visible focus, WCAG AA text contrast, swipe actions reachable
  by button and keyboard.
