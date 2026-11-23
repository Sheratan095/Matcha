- [x] remove wavebinder dependencies
- [x] remove support without backend
- [ ] Automatic(test) card creation needs to be handled in a more customizable approach. ex(asset usage)
- [ ] design needs heavy adjustement on mobile side (6 tabs in the bottom bar since /calendar: about 58px a tab on a 360px phone; "Calendar" and "Activity" touched: below 420px the labels now track tighter with a gutter between tabs, and end in an ellipsis on narrower phones)
- [x] User map shared among friends (leaflet implementation): /map, GET /profile/matches/map
- [ ] design document draft
- [x] location fetching at runtime (useAutoLocation + "Locate me precisely" on /map)
- [x] UPDATE Registration requirements (docs/auth_flow.md):
	Username: 3-20 chars, allowed chars: [a-z, A-Z, 0-9, '_', '.'],
	Psw: 8-128 chars, exlcluded popular passwords, In db: hashed
	Email: max 100 chars, In db: trimmed, lowercased and UNIQUE
- [x] Date of birth at registration

- [x] BROWSING: deck on GET /profile/discover, like/pass on POST /profile/:id/like|pass
- [x] FILTERS are done in BACKEND, SORT is done in FRONEND
- [x] user would be able to sort by age, location(distance with you), fame rating, common tags(count)
- [x] remove online status in cards
- [x] remove common interets tags list
- [x] common interests count is used only for sort

- [ ] remove the manual verification code entering now verification and psw reset works only with link

### IV.2 User profile
- [x] "Who liked me": Activity > Likes reads GET /profile/likes (username + picture only: the sheet loads the rest)
- [x] "Profiles I visited" (visit history): Activity > You visited reads GET /profile/visited (asked for with the page, so its tab has a count at once; refetched after you open a profile from the page, and after a block)
- [x] Date of birth for GitHub sign-ups (they have none, and the age shown everywhere depends on it): onboarding's first step and Me > Details > Names ask for it while it is missing; PATCH /profile `dateOfBirth`, set once
- [x] `profileComplete` (src/wb/functions.ts) is the backend's `profile_is_complete`, field for field (last name, date of birth and a profile picture were missing): the photos step of onboarding is required; without a photo /discover does not open (it says why and links to the photos), the other sections stay open; deleting the last photo warns first
- [x] Remove `createMissingProfile` / `profileCreate` (POST /profile): that route no longer exists (only /internal/create, blocked by the gateway), so the "heal" path always failed

### IV.4 Research
- [x] Search from the shell's top bar (src/features/search): name (`q`) plus the deck's filters (age range, distance, min fame, tags = ALL of them, sort in the browser) -> GET /profile/search; a result opens the profile sheet
- [x] Search by gender / preference (`genders`, `preferences`): chips in the search's filter sheet
- [ ] A fame / distance range in the search (`maxFame`, `minDistanceKm`): accepted by GET /profile/search, no control yet

### IV.5 Profile view
- [x] Blocked users list + unblock in Me > Account: GET /profile/blocks, DELETE /profile/:id/block
- [x] Block from chat / matches: POST /profile/:id/block (the reason picker is gone: the route takes none)
- [x] Unmatch from chat: DELETE /profile/:id/like

### IV.6 Chat (real time, <= 10 s)
- [x] Matches page: GET /profile/matches, joined with GET /chat for the last message
- [x] Conversation list: GET /chat
- [x] History: GET /chat/:chatId, whole on open, then only the new messages (`?after=`) on each message sent or received
- [x] Send: POST /chat/message `{ toUserId, content }`
- [x] Mark read: POST /chat/:chatId/seen (on open, and on each message received in the open chat)
- [x] Live messages: socket events `message`, `chat-seen`
- [ ] "New message" visible from any page: the Matches tab badge counts messages received over the socket since the page loaded; it starts at 0 on every load (backend gap below)
- [x] After a real match, "Message" in the match moment opens the conversation (`/chat/:userId`)

### IV.7 Notifications (real time, <= 10 s)
- [x] Listen on the socket (src/wb/realtime.ts): `profile-like`, `profile-view`, `message`, `match`, `unmatch`, `chat-seen`
- [x] Calendar events on the socket: `event-invite`, `event-accept`, `event-decline`, `event-cancel` -> a toast each (who, the date's title and start, a link to /calendar) and a reload of the calendar unless it already shows the change
- [x] Profile views on the socket: `profile-view` -> a toast ("<name> viewed your profile", "See visitors" -> Activity > Viewers), besides the reload of the viewers
- [x] A list of the last notifications: Activity > Notifications (src/wb/notifications.ts: built from the socket events, the last 50 kept per user in this browser, unread count on the tab)
- [x] "A connected user unlikes them": a toast ("<name> ended the connection"), and an entry in the list; the echo of your own unlike / block is skipped (`own`)
- [ ] Unread notifications visible from any page: the Activity badge in the shell still counts the pending likes, not the unread notifications (`useUnreadNotifications`)
- [x] Refresh the affected nodes on each event (likes, viewers, connections, chat list, open chat, matchesMap)
- [x] Remove `mockEvents$` and the typing indicator (the backend has no `typing` event)

### General
- [x] Remove src/mock and the `social` service (and `resetDemoData`, "Reset demo" in Me)
- [x] Realtime never connected behind the Vite proxy (SAL: "problemi con i ws"): `io('/api/notification')` made `/api/notification` the namespace and connected to `/socket.io`, which Vite does not forward (it answered its index.html). The socket now connects to namespace `/notification` on path `/api/socket.io` (`socketTarget` in src/wb/realtime.ts)
- [x] Unnecessary / duplicate requests (SAL 12/11): only what the shell shows loads at sign-in (profile, matches, chat list, likes); the deck, interests, viewers, visits, blocks and the map load when a screen asks (`useLoad`), StrictMode no longer doubles them, an opened profile is fetched (and the visit recorded) once, the `match` / `unmatch` echo of your own action no longer refreshes the lists a second time, GET /notification/online is no longer called (nothing showed it)
- [x] No unhandled error in the console with the real backend (every page, logged in and out): checked on the production build in Chrome (headless), 360px and 1280px. A first-time visitor no longer sends the boot `POST /auth/refresh` that 403'd on every page (src/wb/sessionHint.ts), and the engine logs an HTTP failure as a debug line (the screens show it)
- [ ] Check every page on Firefox and Chrome, and on a phone width

## Bonus 
- [x] Interactive map of users (/map)
- [x] GitHub OAuth
- [x] Calendar (/calendar, its own tab with a badge for the invites waiting): plan dates with a match (title, description, place as coordinates, date and time; also from a conversation's menu), answer an invite, call a date off: GET /profile/calendar, POST /profile/calendar/event, POST .../:eventId/accept | decline | cancel
- [x] Photo editing on upload: a chosen photo opens in `PhotoEditor` (`src/features/me`) before it is sent: crop (original, 3:4, square; drag and zoom), rotate, six filters, resize (540 / 810 / 1080 px); all in the browser, so a phone picture over 5 MB now works (the editor opens files up to 20 MB and sends a JPEG of at most 1080 px)
- [ ] Photo gallery: drag-and-drop upload
- [ ] Second OAuth provider
- [ ] Video / audio chat

## API calls: missing or incomplete

### Backend endpoints the frontend does not call yet
| Endpoint | For |
|---|---|
| GET /profile/search | search (IV.4): `maxFame`, `minDistanceKm` still unused (everything else is sent) |
| GET /notification/online | a global count of open sockets: nothing shows it, so it is not called |

### Frontend calls that are broken
- [x] POST /profile (`profileCreate`, `actions.createMissingProfile`): no such route any more -> removed

### Backend gaps (missing or incomplete for the screens above)
- [ ] GET /profile/matches carries no `chatId`, and GET /chat only lists chats that already have a message (INNER JOIN LATERAL on messages): a new match has no chat id to open its history with -> add `chatId` to the matches list (the chat row exists from the match)
- [ ] POST /chat/message answers only `{ delivered }`: return the stored message (messageId, chatId, timestamp, status) so the sender can show it without refetching
- [ ] GET /chat has no unread count (comment in ChatListItem.ts): needed for the badge "new message from any page"
- [ ] Calendar: no endpoint to EDIT an event (title, description, location as coordinates, date and time); only create / accept / decline / cancel
- [ ] No notifications list / mark-read endpoint: pending notifications are only replayed on reconnect, so the unread count must be kept by the client (or add GET /notification/notifications + POST .../read)
- [ ] GET /profile/viewers and GET /profile/likes carry no date (when did they view / like)
- [ ] Swagger is wrong for GET /profile/viewers and GET /profile/likes: their DTOs say `viewerId` / `likerId`, the wire sends `userId` (StdPayload); the frontend follows the wire
- [ ] No `typing` socket event (the chat UI has a typing indicator)
- Note: an unlike between connected users sends `unmatch` to both (`profile-unlike` is unused): the frontend must listen on `unmatch` for IV.7 "a connected user unlikes them"
- [ ] POST /profile/:id/like answers an EMPTY body: the controller discards what the service returns, and the service returns only `{ liked: true }` (`nowMatched` is computed but not sent). The frontend expects `{ liked, matched }`; meanwhile it takes the `match` the backend pushes to the liker (before answering) as the match, or, without the socket, whether the person had liked you first.
- [ ] The profile service logs "My likes requested" for GET /profile/viewers too (copy-paste in `getProfileViewers`, app.service.ts): in the logs a visitors load looks like a second likes load
- [ ] GET /auth/validate only reads the access cookie (15 min) and never the refresh token (7 days): reloading the app after 15 idle minutes looks signed out, though the session could be refreshed. Fix in /auth/validate (try the refresh token) or have the frontend try POST /auth/refresh once at boot when the probe says invalid.
