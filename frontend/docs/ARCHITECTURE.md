# Matcha frontend — architecture

A Tinder-style SPA (React 19 + Vite + TypeScript) whose state lives in a **WaveBinder** node graph
(`wave-binder`, an RxJS state manager). Companion documents in this folder:

- `WAVEBINDER.md` — what the library really does (researched from the package itself).
- `API_CONTRACT.md` — what the backend really exposes (researched from the backend source).

## 1. Ground rules

- **All domain state lives in WaveBinder nodes.** Components read nodes through hooks and never call
  axios/fetch themselves. Ephemeral view state (an open menu, a drag offset, a form draft) stays in
  React or in local RxJS streams.
- **Every HTTP call is a WaveBinder HTTP node.** Reads are `GET` nodes that depend on other nodes;
  writes are a `<name>Payload` node (`USER_SELECTION`) plus a `<name>Result` node (`POST`/`PATCH`/`DELETE`)
  that depends on it.
- **The mock boundary is the URL, not the code.** Nodes do not know whether a service is real. Any URL
  under `/__mock` is answered in the browser by `src/mock`; everything else goes to the network.
- TypeScript: `strict`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no `enum`, no
  constructor parameter properties, no namespaces). Import alias `@/` = `src/`.
- Styling: plain CSS with design tokens (`src/ui/styles/tokens.css`) and CSS Modules per component.
  No Tailwind, no CSS-in-JS, no UI library.

## 2. Modes

| Command | `VITE_BACKEND` | `api` service (auth, profile) | `social` service (discover, swipes, matches, chat) |
|---|---|---|---|
| `npm run dev` | `real` | gateway at `VITE_API_URL` (`http://localhost:3000`) | mock |
| `npm run dev:demo` | `mock` | mock | mock |

The dev server must run on **port 4000** in real mode (CORS, OAuth redirect and email links are
hardcoded to `http://localhost:4000`). `src/config.ts` exposes `BACKEND`, `IS_MOCK_BACKEND`, `API_URL`,
`SOCIAL_URL`, `MOCK_PREFIX`.

## 3. Folder ownership

```
src/
  config.ts            env flags
  main.tsx             boot sequence                                   (state)
  api/types.ts         wire types shared by everything                 (fixed contract)
  api/http.ts          axios defaults, http event stream, 401 refresh  (state)
  wb/                  WaveBinder layer: instance, engines, nodes, hooks, commands, actions  (state)
  mock/                in-browser backend: adapter, db, seed, handlers, portraits            (mock)
  ui/                  design system: tokens, global css, components, AppShell               (design)
  app/                 router, guards
  features/<name>/     screens
```

## 4. The WaveBinder layer (`src/wb`)

```
src/wb/
  index.ts          the public surface (§4.6): screens import from '@/wb' only
  types.ts          types shim for wave-binder (its config types are not exported)
  engine/           StoreEngine interface, the wavebinder adapter, the preview interpreter, request building
  nodes/            the graph (§4.5): builders, one file per domain, static validation
  functions.ts      CUSTOM_FUNCTION implementations
  services.ts       the `api` and `social` services
  registry.ts       request (method + URL) -> HTTP node
  license.ts        license file detection
  store.ts          the running store: engine choice, typed node access, storeInfo
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

### 4.1 Engines

WaveBinder 0.0.2 is license-gated (see `WAVEBINDER.md` §0): without a valid license file it destroys
every node a few milliseconds after construction. The layer therefore has two interchangeable engines
behind one interface (`src/wb/engine/types.ts`):

```ts
interface StoreEngine {
  kind: 'wavebinder' | 'preview'
  /** Resolves true when the graph is live, false when it could not start. Never rejects. */
  ready: Promise<boolean>
  /** A BehaviorSubject: subscribe / getValue / next. Throws on an unknown name. */
  getNode(name: string): BehaviorSubject<unknown>
  /** Emits once if the engine dies after being ready (license heartbeat failure). Replays. */
  dead$: Observable<void>
  /** Why `ready` resolved false or `dead$` fired; null while healthy. */
  failure: string | null
  destroy(): void
}
```

- **`wavebinder` engine** (`engine/wavebinder.ts`) — the real library, constructed from
  `src/wb/license.json` (`{ payload, payloadRaw, signature }`, git-ignored). The file is detected with
  `import.meta.glob('./license.json', { query: '?raw', eager: true })`, so a missing file is not a build
  error and a malformed one becomes a start-up failure. `wave-binder` is loaded with a dynamic `import()`
  only when the file exists, because evaluating the module already runs license code (it lives in its own
  chunk, never fetched otherwise). The adapter gives the library a `structuredClone` of the definitions
  (it mutates them), the service objects by reference, sets `globalThis.WAVEBINDER_LICENSE_SERVER_URL`
  when `VITE_WAVEBINDER_LICENSE_SERVER_URL` is set, calls `tangleNodes()`, awaits `waitUntilReady()` and
  checks `isReady()`. Death is detected by the `complete` of one node (the library has no event). After
  death the node objects stay readable (completed subjects) but nothing propagates any more.
  **This path has not been executed** (no license was available); it was checked against a fake of the
  library's documented API only.
- **`preview` engine** (`engine/preview.ts`) — used only when there is no license file. An interpreter
  of the *same* node definitions (`NodeDef[]`, services, custom functions) on plain RxJS
  `BehaviorSubject`s, written against the library's source for the subset this app uses: top-level
  `SINGLE` nodes, `USER_SELECTION` / `CUSTOM_FUNCTION` / HTTP loading actions, `isOptional` / `onUpdate`,
  `PATH_VARIABLE` / `REQUEST_PARAMETER` / `BODY` dependencies, `bodyType`, `defaultValue`, the
  argument mapping and snapshot of custom functions, `null` on a failed call (with the library's
  `console.error`), one request per dependency while tangling, no cancellation. It comes alive
  asynchronously like the real one (a value written before `ready` is reset by the tangle). Anything
  outside the subset is rejected at construction. The UI shows a permanent "PREVIEW STORE" marker while
  it is active (`storeInfo.engine === 'preview'`).

`startStore()` (`store.ts`) picks the engine, validates the graph first (`nodes/validate.ts`: dangling
dependencies, cycles, bad placeholders, mutations with a second dependency, wrong function arity...),
and returns a handle `{ kind, ready, dead$, failure }`. Node accessors throw until the engine has been
ready once; after a death reads still work but `run` / `refresh` refuse to send (`NOT_SENT`). A hot update
of anything under `src/wb` stops the store and reloads the page (never two heartbeating instances).

Node definitions are written once and must behave the same on both engines. Only use the feature
subset above: no `LIST`, `COMPLEX` or `MULTI` nodes (unverified or buggy in 0.0.2).

### 4.2 Conventions that follow from WaveBinder's semantics

- `undefined` = never loaded, `null` = loading / reset / failed. A node value alone cannot tell loading
  from failure, so status comes from the HTTP event stream (4.4).
- An HTTP node fires whenever a dependency emits and every non-optional dependency is non-null. So:
  - Reads that need a session depend on `sessionUserId` (non-optional, `onUpdate: true`, no `type`):
    they load on login and reset to `null` on logout. This also applies to the reads keyed by a
    selection (`apiProfile`, `socialProfile`, `chatMessages`), so nothing is ever sent while anonymous.
    Consequence, verified on the preview engine: the graph sends **no request at all while tangling**
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
  library falls back to order, and minifiers rename parameters). They declare exactly one parameter per
  dependency (more makes the library append a snapshot). Their inputs are **optional** dependencies
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
| `api` | `API_URL` | Real gateway or `/__mock`. Cookie auth: `axios.defaults.withCredentials = true`. No `Authorization` header (not in the gateway's CORS allow-list). |
| `social` | `SOCIAL_URL` (`/__mock/social`) | Mocked; see §5.2. |
| `mock` | `MOCK_PREFIX` (`/__mock`) | The mock backend's own demo conveniences (`/dev/inbox`), in every mode. |

### 4.4 HTTP plumbing (`src/api/http.ts`, `src/wb/status.ts`, `src/wb/commands.ts`)

WaveBinder uses the default axios instance and exposes neither status nor errors, so:

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
  because the library applies responses in arrival order. A GET still in flight when its node is reset
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
| `myProfile` | GET api `/profile` | `sessionUserId`, `myProfileRefresh` (opt) | `Profile` |
| `profileComplete` | F | `myProfile` (opt) | `boolean` (gender, preference, biography, ≥ 1 interest); `null` while no profile |
| `profileUpdate` | Payload + PATCH api `/profile` | payload | `Profile` |
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

**Demo**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `devInboxRefresh` | P | — | nonce |
| `devInbox` | GET mock `/dev/inbox` | `devInboxRefresh` (required, onUpdate false) | `MockEmail[]`; loads only when asked |

Refreshable in place (`refresh(name)` → nonce): `sessionCheck` (`sessionProbe`), `myProfile`,
`myViewers` and `likesReceived` (both `activityRefresh`), `onlineCount`, `discoverDeck`, `matches`,
`chatMessages`, `devInbox`. Writable by screens (`setNode`, `useNode`): the filters, `swipedIds`, `activeMatchId`,
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
  | `startGithubLogin(): void` | navigates to `${API_URL}/auth/github`; throws `UNAVAILABLE` with the mock backend |
  | `loadDevInbox(): Promise<MockEmail[]>` | demo mode: the mock's "sent" emails are in `devInbox`; rejects `UNAVAILABLE` with the real backend |
  | `updateProfile(changes): Promise<Profile>` | `myProfile` / `profileComplete` reflect it (interests normalised and de-duplicated) |
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
  reacts to events (message → open chat then matches; match → matches and likes; like → likes) and, with
  the real backend, keeps the gateway's socket.io connection (`/notification`, websocket only) open while
  signed in, which only makes the user count in `onlineCount`.
- `storeInfo` — `{ engine: 'wavebinder' | 'preview', backend: 'real' | 'mock' }`.
- Errors: `isApiError`, `toApiError`, `LOCAL_ERROR` (`NETWORK`, `TIMEOUT`, `NOT_SENT`, `INVALID`,
  `NO_SESSION`, `UNAVAILABLE`, `DROPPED`).
- Boot (only `src/main.tsx`): `installStoreHttp()`, `installMockBackend({ auth, getViewerId })` from
  `@/mock`, `startStore()`, await `ready`, `actions.bootSession()`, `startRealtime({ events$: mockEvents$ })`,
  render; `src/app/StoreScreens.tsx` shows the starting / failed / died screens.

## 5. The mock backend (`src/mock`)

```ts
installMockBackend(options: {
  /** true in demo mode: also serve /auth/*, /profile/*, /notification/* under /__mock. */
  auth: boolean
  /** Who is logged in when auth is real (the mock cannot read HttpOnly cookies). */
  getViewerId: () => string | null
  /** Simulated latency in ms: fixed or [min, max]. Default [120, 450]; 0 answers on the next microtask. */
  latency?: number | readonly [number, number]
}): void
uninstallMockBackend(): void          // tests: original adapter back, timers stopped, caches dropped
export const mockEvents$: Observable<RealtimeEvent>
```

```
src/mock/
  index.ts       install / uninstall, mockEvents$, real-mode profile hint
  adapter.ts     the axios adapter wrapper
  routes.ts      route table and dispatch
  nest.ts        MockRequest / MockResponse, Nest-shaped errors
  validate.ts    the class-validator subset (same messages, same order)
  storage.ts     versioned localStorage documents with a memory copy
  accounts.ts    demo auth service, demo accounts and their profiles, dev inbox
  profiles.ts    demo profile service, pictures, online count
  images.ts      upload downscaling
  social.ts      social service: per-viewer state, seeding, live agenda, incoming likes
  chat.ts        starter conversations and the reply bank
  people.ts      the 36 seeded people
  portraits.ts   risograph poster portraits (SVG data URLs)
  tags.ts        tag catalogue, tag ids
  viewer.ts      who is asking (session or getViewerId) and what is known about them
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

**Persistence.** `localStorage` documents `matcha.mock.v1.auth` (demo accounts, profiles, tokens,
inbox, account-to-account views), `matcha.mock.v1.session` (the demo "cookie") and
`matcha.mock.v1.social.<viewerId>`. Missing, unparsable or wrongly shaped documents are reseeded; an
unavailable storage degrades to memory; another tab's writes are picked up (`storage` event).

**Ids** are UUIDs (URL-safe), deterministic for seeded things (people, their pictures, tags, demo
accounts, starter matches), random for created ones.

### 5.1 `/__mock/auth/*`, `/__mock/profile/*`, `/__mock/notification/online` (demo mode)

Same paths, bodies, validation messages, status codes and error bodies as `API_CONTRACT.md` §2, §3 and
§4, including `EMAIL_NOT_VERIFIED` (a correct-password login on an unverified account mails a fresh token
and invalidates the previous one), `COMMON_PASSWORD`, `RESERVED_USERNAME`, `PASSWORD_REUSE`, 403 for bad
credentials and tokens, 201 for forgot / reset password, the change-email flow (the address changes when
the token mailed to it is verified), `POST /auth/refresh` (200 `{ message, userId }` while the mock
session exists, 403 otherwise) and the picture limits (5 pictures, 5 MB, JPEG / PNG / WEBP, field
`file`; `Unexpected field`, `Too many files`, 413 `File too large`, `Missing "file" field`, `File is not a
valid image`). With `auth: false` these routes do not exist (404).

Demo conveniences and deliberate differences:

- The "cookie" is a `localStorage` entry; sessions do not expire. GitHub OAuth cannot work (it is a
  top-level navigation).
- Seeded accounts `testuser` / `1234` (other / other, 5 pictures) and `alice` / `1234` (female / both,
  2 pictures), with generated portraits; `admin` exists and cannot log in, as in the backend seed.
- "Emails" are not sent; `GET /__mock/dev/inbox` → `MockEmail[]`, newest first (links
  `/verify-email?token=` and `/reset-password?token=`). The inbox route exists in every mode (the `mock`
  service); with the real backend it is `[]`.
- Reserved usernames: the technical entries of the backend list (the offensive-word entries are not
  reproduced). Common passwords: the entries of the backend list that are 8+ characters.
- Intended behaviour where the backend has a bug: an unknown profile is 404 `Profile not found` (backend:
  500); a non-string where a trim applies, and `interests` that is null or not an array, are 400s
  (backend: 500); duplicate and empty interest names are dropped; deleting the profile picture promotes
  the oldest remaining one, and an upload while there is no profile picture becomes it.
- Uploads are decoded and downscaled in the browser (longest side 720 px, WebP, JPEG fallback, smaller
  until the data URL is ≤ ~140 KB). Where images cannot be decoded (jsdom) a small file is kept as-is and a
  big one becomes a printed placeholder. A full storage answers 500 `Failed to store picture`.
- `GET /profile/{userId}` also resolves mock people (Profile shape). Views are recorded between demo
  accounts. `GET /profile/viewers` lists the mock people who viewed the viewer (seeded, and more arrive
  with incoming likes) and the demo accounts that did, most recent first.
- `GET /notification/online`: the mock people online now, plus one (you), as a bare number.

### 5.2 `/__mock/social/*`

The viewer is the mock session (demo mode) or `getViewerId()` (real mode); no viewer → 401 `Missing or
invalid access token`. Bodies are validated in the Nest style (400 with a message array).

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
filter. With the real backend the mock learns the viewer's gender, preference, interests and first name
by reading (never changing) the real `GET` / `PATCH {API_URL}/profile` responses that pass through the
adapter; without that, nothing is filtered and `commonTags` is empty.

**People.** 36 people (16 women, 16 men, 4 non-binary; 19–48 years old; every preference), placed by
distance from central Paris (the mock puts every viewer there), 3–6 interests each, 2–4 portraits,
fame, a job, an opener, a story and a question they use in chat. Presence is derived per quarter hour from
each person's activity level (online, or a `lastSeen` stable within the quarter); someone who just wrote
is online.

**A new viewer** gets a starter world that is a function of their id: 4 matches when 18 or more people
fit them, else 3 (one wrote first and is unread, one is an ongoing conversation with 2 unread, one was
answered and read, the fourth is fresh with no message); 4–6 likes received (~40% of the default deck,
at least 4); a couple more people who viewed them. While the viewer has not acted yet (swipe, message,
unmatch, block, rewind), the starter world follows their orientation (it is reseeded after onboarding).
Default-filter deck sizes: about 9 for one-gender preferences towards the other gender, 6–7 for
same-gender ones (10 of 36 people fit), 12–20 for open preferences.

**Realtime (`mockEvents$`).** `typing` before every reply, opener and second bubble; `message` for the
other person's messages only; `match` for later like-backs only (an immediate match is in the
`SwipeResult`); `like` when someone new likes the viewer: checked every 60–110 s while the viewer is
active (a social request in the last 2 minutes), at most about once a minute. A new match opens the
conversation half of the time (fixed per pair), 5–9 s later. Everything is persisted before it is
emitted. What happens later is kept in a persisted agenda run by timers that belong to the current
viewer: switching viewer, signing out, resetting or uninstalling cancels them, and the agenda resumes when
that viewer is back.

**Handy facts (demo).** `alice`: matches Mathieu, Malik, Hugo, Noa; liked by Antoine, Amara, Priya,
Aïssatou, Thomas, Yuki (liking one of them is a match). `testuser`: matches Malik, Eden, Amara, Rafael;
liked by Antoine, Samuel, Chloé, Aïssatou, Noa, Lucas. Accounts registered in the demo get their own
world (their ids are random). `POST /__mock/social/reset` (`actions.resetDemoData()`) restores it.

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
