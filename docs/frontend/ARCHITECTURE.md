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
- **There is no mock.** Every node calls the real gateway; tests swap the axios adapter for a fake
  backend (`src/wb/testing`).
- TypeScript: `strict`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no `enum`, no
  constructor parameter properties, no namespaces). Import alias `@/` = `src/`.
- Styling: plain CSS with design tokens (`src/ui/styles/tokens.css`) and CSS Modules per component.
  No Tailwind, no CSS-in-JS, no UI library.

## 2. Backends

| Service | Served by |
|---|---|
| `api` (auth, profile, notification: discovery, search, likes, connections, chat) | the gateway at `VITE_API_URL` (`http://localhost:3000`) |
| realtime | the gateway's socket.io namespace `/notification` (§4.6, `src/wb/realtime.ts`) |

`npm run dev` must run on **port 4000** (CORS, OAuth redirect and email links are hardcoded to
`http://localhost:4000`). `src/config.ts` exposes `API_URL` and the third-party
location services (§6.1) `GEOIP_URL`, `GEOCODER_URL`, `MAP_TILES_URL` (each overridable with its `VITE_` variable).

## 3. Folder ownership

```
src/
  config.ts            env flags
  main.tsx             boot sequence                                   (state)
  api/types.ts         wire types shared by everything                 (fixed contract)
  api/http.ts          axios defaults, http event stream, 401 refresh  (state)
  wb/                  state layer: engine, nodes, hooks, commands, actions                  (state)
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
  services.ts       the `api` service
  registry.ts       request (method + URL) -> HTTP node
  store.ts          the running store: engine start-up, typed node access
  status.ts         request status per HTTP node
  stale.ts          drops in-flight reads whose node was reset
  commands.ts       run() and refresh()
  demand.ts         load(): reads loaded on demand, and refetched only when stale
  filters.ts        discover filters (one request for several changes)
  actions.ts        the flows screens call
  realtime.ts       the socket, realtime$ and the refreshes its events cause
  boot.ts           installStoreHttp() for main.tsx
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
    selection (`apiProfile`, `chatHistory`), so nothing is ever sent while anonymous.
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
  - A read only some screens show **loads on demand**: it waits behind a gate, a `<x>Wanted`
    selection node used as a *required* dependency with `onUpdate: false` and no `type` (`demand()` in
    `nodes/builders.ts`, the map in `LAZY_GATES`). Nothing is sent for it at sign-in, refreshes and
    realtime events send nothing while the gate is closed, and the first `load(name)` opens it for the
    rest of the session (4.4). Sign-out closes every gate. Only what the shell itself shows loads at
    sign-in: `myProfile` (guards, avatar), `connections` + `chatList` (Matches badge), `likesReceived`
    (Activity badge).
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
  on each of their emissions), so the per-user selection state (`activeChatUserId`, `activeChatId`,
  `unreadByUser`, `apiProfileId`, `swipedIds`, filters, the gates of the reads on demand) is reset by a
  watcher installed by `actions.bootSession()` when the signed-in user changes or signs out.

### 4.3 Services

| Name | Target | Notes |
|---|---|---|
| `api` | `API_URL` | The gateway. Cookie auth: `axios.defaults.withCredentials = true`. No `Authorization` header (not in the gateway's CORS allow-list). |

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
- `load(name, maxAgeMs = ∞)` (`demand.ts`; `useLoad(name, { maxAgeMs, enabled })` in a screen) is how a
  screen asks for what it shows, instead of refreshing on mount: it opens the gate of a lazy read (its
  first load); sends nothing while a request of the node is on its way (StrictMode's double effects, two
  screens asking at once); otherwise refetches in place only a read that failed, was never loaded, was
  marked stale (`markStale`, e.g. the visit history after a profile view) or is older than `maxAgeMs`
  (`REVISIT_MS` = 30 s for lists realtime already keeps current). `nodeStatus` remembers when each
  value arrived for this.
- A 401 from a guarded `api` endpoint (anything under `API_URL` except `/auth/refresh`, which includes
  `/auth/change-email`) triggers one single-flight refresh — the `sessionRefresh` command,
  `POST /auth/refresh` — then one retry with the same request id; if the refresh or the retry fails the
  session is re-probed (throttled to once per 3 s), which makes the user anonymous.
  `axios.defaults.timeout` is 15 s (60 s for uploads)
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
| `pictureUpload` | Payload (`FormData`, field `file`) + POST api `/profile/pictures` | payload | `PicturesResult` |
| `pictureDelete` | Payload (picture id) + DELETE api `/profile/pictures/{pictureId}` | payload (PATH_VARIABLE) | `PicturesResult` |
| `pictureMain` | Payload (picture id) + PATCH api `/profile/pictures/{pictureId}/profile` | payload (PATH_VARIABLE) | `PicturesResult` |
| `myViewers` | GET api `/profile/viewers`, **on demand** | `sessionUserId`, `viewersWanted`, `viewersRefresh` (opt) | `ViewersResult` (Activity, Me) |
| `visitedProfiles` | GET api `/profile/visited`, **on demand** | `sessionUserId`, `visitedWanted`, `visitedRefresh` (opt) | `VisitedResult`: the profiles you opened, latest first (Activity > You visited) |
| `blockedUsers` | GET api `/profile/blocks`, **on demand** | `sessionUserId`, `blocksWanted`, `blocksRefresh` (opt) | `BlocksResult` (Me > Account) |
| `unblockUser` | Payload (user id) + DELETE api `/profile/{userId}/block` | payload (PATH_VARIABLE) | empty |
| `apiProfileId` → `apiProfile` | P → GET api `/profile/{userId}` | `sessionUserId`, id (PATH_VARIABLE) | `Profile` (real user; records a profile view) |
| `matchesMap` | GET api `/profile/matches/map`, **on demand** | `sessionUserId`, `mapWanted`, `matchesMapRefresh` (opt) | `MatchesMapResult`: connections with a ~1 km-snapped position (the `/map` page) |

`GET /notification/online` (a global count of open sockets) is not read: nothing shows it.

**Discover**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `filterAgeMin` / `filterAgeMax` / `filterDistance` / `filterFameMin` | P with `defaultValue` (18 / 45 / 50 / 0) | — | number |
| `filterSort` | P, default `'best'` | — | `DiscoverSort` (`best` / `distance` / `age` / `fame` / `tags`); NOT a request parameter |
| `filterTags` | P | — | comma-separated tag names, or `null` |
| `discoverDeck` | GET api `/profile/discover`, **on demand** (`/discover`) | `sessionUserId`, `discoverWanted`, the filters (REQUEST_PARAMETER `minAge`, `maxAge`, `maxDistanceKm`, `minFame`, `tags` (opt)), `discoverRefresh` (opt) | `DeckCard[]`: the whole filtered list (200 max), best first |
| `swipedIds` | P, default `[]` | — | ids swiped (or blocked) in this session |
| `visibleDeck` | F | `discoverDeck` (opt), `swipedIds` (opt), `filterSort` (opt) | `DeckCard[]` still to show, sorted in the browser (stable: ties keep the server's ranking); `null` while no deck |
| `like` / `pass` / `unlike` | Payload (user id) + POST / POST / DELETE api `/profile/{userId}/like` \| `/pass` | payload (PATH_VARIABLE) | `LikeResult` (`{ liked, matched }`) / empty |
| `blockUser` / `reportUser` | Payload (user id) + POST api `/profile/{userId}/block` \| `/report` | payload (PATH_VARIABLE) | empty |
| `interestCatalogue` → `tagCatalogue` | GET api `/profile/interests`, **on demand** (a tag picker) → F | `sessionUserId`, `interestsWanted`, `interestsRefresh` (opt) | `string[]` (names, alphabetical) |

**Search**

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `searchQuery` / `searchAgeMin` / `searchAgeMax` / `searchDistance` / `searchFameMin` / `searchTags` / `searchGenders` / `searchPreferences` | P | — | the criteria: a name substring (1-50 chars), age bounds, max km, min fame, comma-separated tags (ALL required), comma-separated genders and sexual preferences (ANY of them, in the fixed order of `GENDERS` / `SEXUAL_PREFERENCES`); each `null` = not sent = no limit |
| `searchSort` | P, default `'best'` | — | `DiscoverSort`; NOT a request parameter |
| `searchActive` | P | — | nonce while a search is in force, `null` for none: the gate `writeSearch` (`src/wb/search.ts`) closes while it writes several criteria, so a change is one request |
| `searchResults` | GET api `/profile/search` | `sessionUserId`, `searchActive` (required), the criteria (REQUEST_PARAMETER `q`, `minAge`, `maxAge`, `maxDistanceKm`, `minFame`, `tags`, `genders`, `preferences`, all opt), `searchRefresh` (opt) | `DeckCard[]` without `likesYou`: the whole result list (200 max), nearest first; `null` while no search |
| `visibleSearch` | F | `searchResults` (opt), `searchSort` (opt) | `DeckCard[]` in `searchSort` order (`best` = the server's); `null` while no results |

**Matches, chat, activity**

| Node | Kind | Depends on | Value |
|---|---|---|---|
A conversation is addressed by the other person's user id (`/chat/:userId`): the backend lists a chat,
and so gives its id, only once it holds a message.

| Node | Kind | Depends on | Value |
|---|---|---|---|
| `connections` | GET api `/profile/matches` | `sessionUserId`, `connectionsRefresh` (opt) | `ConnectionsResult`: everyone you are connected to (mutual like) |
| `chatList` | GET api `/chat` | `sessionUserId`, `chatListRefresh` (opt) | `ChatListResult`: chats that hold a message, with the last one |
| `unreadByUser` | P, default `{}` | — | per user id, messages received over the socket since their chat was last opened (the backend keeps no unread count) |
| `matches` | F | `connections` (opt), `chatList` (opt), `unreadByUser` (opt) | `Match[]`: each connection with its chat id (or `null`), last message and unread count; `null` while `connections` is not loaded |
| `unreadCount` | F | `matches` (opt) | `number` (0 while not loaded) |
| `activeChatUserId` / `activeChatId` | P | — | the open conversation's person and chat id (`null` when none, or no message yet) |
| `chatAfter` | P (state layer only) | — | `?after=` of the next history request (epoch ms), `null` for the whole history; **each write fetches** the open conversation |
| `chatHistory` | GET api `/chat/{chatId}[?after=]` | `sessionUserId`, `activeChatId` (PATH_VARIABLE), `chatAfter` (REQUEST_PARAMETER `after`, opt, onUpdate false) | `ChatHistoryResult`, oldest first: the last answer, whole or only the newer messages; a pure read |
| `chatThread` | P (state layer only) | — | the open conversation, whole: a whole answer replaces it, a `?after=` answer is merged in (by message id), another conversation empties it (`watchChat` in `actions.ts`); `chat-seen` turns my messages read in place |
| `chatMessages` | F | `chatThread` (opt) | `Message[]` as the thread draws them |
| `chatSend` | Payload + POST api `/chat/message` | payload | `SendMessageResult` (`{ delivered }`); 403 unless connected |
| `chatSeen` | Payload (chat id) + POST api `/chat/{chatId}/seen` | payload (PATH_VARIABLE) | `ChatSeenResult`; the other person gets `chat-seen` |
| `likesReceived` | GET api `/profile/likes` | `sessionUserId`, `likesRefresh` (opt) | `LikersResult`: who liked you and was not liked back |

Unmatch and block reuse the discover commands (`unlike`, `blockUser`).

Refreshable in place (`refresh(name)` → nonce): `sessionCheck` (`sessionProbe`), `myProfile`,
`myViewers`, `visitedProfiles`, `blockedUsers`, `likesReceived`, `matchesMap`, `discoverDeck`,
`interestCatalogue`, `searchResults`, `connections`, `chatList` (`REFRESH_TRIGGERS`). The open thread
is refetched by writing `chatAfter` (whole: `openChat`; only what is new: `reloadOpenChat`). On demand
(`LAZY_GATES`, 4.2): `discoverDeck`, `interestCatalogue`, `myViewers`, `visitedProfiles`,
`blockedUsers`, `matchesMap`. Writable by screens (`setNode`, `useNode`): the filters, `swipedIds`, the
search criteria, `unreadByUser`, `activeChatUserId`, `activeChatId`, `apiProfileId` — prefer the
actions; gates, refresh nonces, payloads, `chatAfter` and `chatThread` are not.

### 4.6 What the UI imports (`@/wb`)

Names and value types are checked against the `NodeValues` / `Commands` maps (`nodes/index.ts`): a
misspelt node or command, a wrong payload or a write to a read node does not compile. `NodeValue<N>`
is `NodeValues[N] | null | undefined`.

- Hooks (`useSyncExternalStore`; StrictMode-safe; snapshots stable until the node emits):
  `useNodeValue(name): NodeValue<N>`, `useNode(writableName): [value, set]` (stable `set`),
  `useNodeStatus(httpNodeName): NodeStatus`, `useLoad(refreshableName, { maxAgeMs?, enabled? })` (4.4:
  what a screen shows, loaded on mount when missing or stale), `useFilters(): DiscoverFilters`,
  `useSearchCriteria(): SearchCriteria`.
- Imperative: `getNodeValue(name)`, `setNode(writableName, value)`, `node$(name): Observable`,
  `getNodeStatus(name)`, `nodeStatus$(name)`, `load(refreshableName, maxAgeMs?)`, `REVISIT_MS`,
  `refresh(refreshableName): Promise<void>`, `run(command, payload?): Promise<CommandResult>`,
  `isStoreLive()`.
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
  | `uploadPicture(file)`, `deletePicture(id)`, `setMainPicture(id)`: `Promise<PicturesResult>` | `myProfile` has the new pictures (upload validated first: type, 5 MB, 5 pictures) |
  | `showApiProfile(userId): Promise<OtherProfile>`, `closeProfile(): void` | the profile is in `apiProfile`; asked again while that profile loads, it joins the request (one GET, one recorded visit); `closeProfile` takes effect after the current task unless a profile opens meanwhile (StrictMode's close-and-reopen keeps the request); the visit history is marked stale |
  | `setFilters(partial): Promise<void>` | the deck reloaded (one request for the lot); a sort-only change sends nothing |
  | `swipe(card, 'like' \| 'pass'): Promise<SwipeOutcome>` | the card left `visibleDeck` at once (back on failure, e.g. 403 without a picture); `matched` says the like made a match; the deck is fetched again when empty |
  | `rewind(): Promise<RewindOutcome>` | the last swipe of this session is undone (a like with `DELETE .../like`) and its card is back on top; a like that matched is not undone |
  | `reloadDeck(): Promise<void>` | the deck reloaded; this session's passes come back |
  | `search(partialCriteria): Promise<DeckCard[]>`, `clearSearch(): void` | `searchResults` holds the answer to `GET /profile/search` for the merged criteria (name + the deck's filters, `null` = no limit, + genders / preferences, empty = any): one request however many changed, none for a sort-only change (`visibleSearch` sorts in the browser), a refetch in place for the same criteria; `INVALID` when nothing would be sent or a value is out of range. `clearSearch` drops every criterion, resets the results and drops a request still on its way |
  | `likeUser(userId, action)`, `reportUser(userId)` | the request succeeded (from an opened profile); a match reloads the connection lists in the background, "likes you" reloads when they were in it |
  | `unlikeUser(userId)`, `blockUser(userId)`: `Promise<void>` | the request succeeded; with a connection: an open conversation with them is closed, their unread count dropped, the connection lists reload in the background (this is also unmatch / block from the chat); a block also reloads `blockedUsers` (when shown) and the lists they were in |
  | `unblockUser(userId): Promise<void>` | `DELETE /profile/{userId}/block` succeeded and `blockedUsers` no longer has them; they may show up again in the deck |
  | `answerLike(userId, action): Promise<SwipeOutcome>` | answering someone who liked you (activity page): `likesReceived` reloaded without them (one request) |

  The backend pushes `match` / `unmatch` to both people, the one acting included, before it answers.
  While a like / unlike / block is on its way, realtime hands such an echo to `claimEcho` instead of
  refreshing: the action refreshes once its request settles. Whether a like made a match: the answer's
  `matched`; when the answer does not carry it (today's backend answers an empty body), the `match`
  echo; without the socket either, whether they had liked you first (`likesYou` on the card, or being
  in `likesReceived`).
  | `refreshMatches(): Promise<void>` | `connections` and `chatList` reloaded |
  | `openChat(userId): Promise<Message[]>`, `closeChat(): void` | a fresh chat list gave the chat id, the whole history is in `chatMessages` (or `[]` before the first message) and is marked read; `DROPPED` when another conversation opened (or this one closed) meanwhile |
  | `sendMessage(userId, text): Promise<void>` | the chat list and, when open, the thread show it (1–1000 chars; the first message gives the chat its id); the thread fetches only what is new (`?after=` its newest message minus 2 s, merged by id) |

- `realtime$` — `Observable<RealtimeEvent>` for toasts. `startRealtime()` keeps the gateway's socket.io
  connection (namespace `/notification`, websocket only) open while signed in (which also counts the
  user as online). Its address comes from `API_URL` (`socketTarget`): an origin connects there on
  `/socket.io`; a path prefix such as the Vite proxy's `/api` goes on the socket's `path`
  (`/api/socket.io`, which the proxy forwards as `/socket.io`), never into the namespace. It turns its events (`message`, `match`, `unmatch`, `profile-like`, `profile-view`,
  `chat-seen`, and the calendar's `event-invite`, `event-accept`, `event-decline`, `event-cancel`, which
  become one `calendar` event with its `action`; payloads checked) into `RealtimeEvent`s and reacts to
  them (a calendar event only shows a toast: no node holds the calendar): a message reloads the chat list
  and, when its conversation is open, fetches the thread's new messages (marked read), otherwise it
  counts in `unreadByUser`; a match or an unmatch reloads the connections, the chat list, the map and the
  likes (unless it is the echo of this client's own change, above); a like the likes; a view the viewers;
  `chat-seen` turns the open thread's ticks read with no request. Each event carries a mark (the last
  request id when its change had already been made: at its arrival, or at the connection for the events
  received in the 3 s after it, which are the backend's replay of what happened while we were offline).
  A list is not reloaded when a request of it started after the mark (one reload serves a whole burst,
  overtaken changes included), nor when, once the load on its way has landed, it already shows the
  change (`profile-like` + `match` about one person). A read on demand that was never asked for is not
  fetched by an event. Events queued by the backend while the user was offline arrive right
  after connecting. `events$` injects extra events (tests).
- Errors: `isApiError`, `toApiError`, `LOCAL_ERROR` (`NETWORK`, `TIMEOUT`, `NOT_SENT`, `INVALID`,
  `NO_SESSION`, `DROPPED`).
- Boot (only `src/main.tsx`): `installStoreHttp()`, `startStore()`, await `ready`,
  `actions.bootSession()`, `startRealtime()`, render; `src/app/StoreScreens.tsx` shows the starting /
  failed / died screens.

## 5. Tests (`src/wb/testing`)

The state layer is tested against the real wiring (`installStoreHttp`, a live store) with the axios
adapter swapped for a fake server:

```
src/wb/testing/
  fakeServer.ts    route handlers (`:param` segments, later routes win), recorded requests, Nest-shaped errors
  fakeBackend.ts   a small stateful gateway: session, profile, deck, likes, connections, chats (`?after=`),
                   blocks, visits (GET /profile/{id} records one)
  harness.ts       startTestStore() / flush()
```

`connect(backend, userId)` makes a connection (with its empty chat, as the backend creates it on a
match) and `incoming(backend, userId, text)` stores a message from them; realtime events are injected
with `startRealtime({ events$, socket: false })`.

## 6. Routes

| Path | Screen | Access |
|---|---|---|
| `/` | landing (anonymous) or redirect to `/discover` | — |
| `/login`, `/register`, `/forgot-password` | auth | anonymous |
| `/verify-email?token=`, `/reset-password?token=` | targets of the links in emails | any |
| `/onboarding` | complete the profile | signed in, profile incomplete |
| `/discover` | swipe deck | signed in + complete profile |
| `/matches`, `/chat/:userId` | connections and the conversation with one | signed in + complete profile |
| `/activity` | likes received, profile viewers | signed in + complete profile |
| `/me` | own profile, pictures, settings | signed in |
| `/styleguide` | design system showcase | any |

GitHub OAuth is a top-level navigation to `${API_URL}/auth/github`; the backend redirects back to `/`
with cookies set, and the boot-time session probe picks the session up.

Not a route: the search bar in the shell's top bar (`src/features/search`, the `search` slot of
`AppShell`) searches people by name on every page of the signed-in frame, narrowed by the deck's
filters (age, distance, fame, interests, sort; the same `FilterSheet`, where the open end of a rail
means no limit), and opens a result in the shared profile sheet. "/" focuses it.

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
