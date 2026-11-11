- [x] remove wavebinder dependencies
- [x] remove support without backend
- [ ] Automatic(test) card creation needs to be handled in a more customizable approach. ex(asset usage)
- [ ] design needs heavy adjustement on mobile side (5 tabs in the bottom bar since /map: check the labels fit on narrow phones)
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

## Missing parts (subject, mandatory first)

The bonus is only graded when ALL of these work. Everything under "still mocked" talks to src/mock today.

### IV.2 User profile
- [ ] "Who liked me": Activity > Likes still reads the mock (`likesReceived`, GET social /likes) -> GET /profile/likes
- [ ] "Profiles I visited" (visit history): no screen yet -> GET /profile/visited
- [ ] Date of birth editable in Me (GitHub sign-ups have none, and the age shown everywhere depends on it): PATCH /profile accepts `dateOfBirth`, the frontend payload does not send it
- [ ] `profileComplete` (src/wb/functions.ts) checks less than the backend's `profile_is_complete` (last name, date of birth, profile picture are missing): align them, or onboarding lets through a profile the backend rejects
- [x] Remove `createMissingProfile` / `profileCreate` (POST /profile): that route no longer exists (only /internal/create, blocked by the gateway), so the "heal" path always failed

### IV.4 Research
- [ ] Advanced search page: age range, fame range, location (distance), tags (ALL of them), name, gender, preference -> GET /profile/search; results sortable / filterable like the deck (reuse `visibleDeck` sorting)

### IV.5 Profile view
- [ ] Blocked users list + unblock in Me: GET /profile/blocks, DELETE /profile/:id/block
- [ ] Block from chat / matches still goes to the mock (POST social /blocks) -> POST /profile/:id/block
- [ ] Unmatch from chat still goes to the mock (DELETE social /matches/:id) -> DELETE /profile/:id/like

### IV.6 Chat (real time, <= 10 s)
- [ ] Matches page: GET /profile/matches instead of GET social /matches
- [ ] Conversation list: GET /notification/chat
- [ ] History: GET /notification/chat/:chatId (`?after=` for the messages since the last one)
- [ ] Send: POST /notification/chat/message `{ toUserId, content }`
- [ ] Mark read: POST /notification/chat/:chatId/seen
- [ ] Live messages: socket events `message`, `chat-seen`
- [ ] "New message" visible from any page: unread badge on the Matches tab from real data
- [ ] After a real match, "Message" in the match moment should open the real conversation (today it goes to /matches)

### IV.7 Notifications (real time, <= 10 s)
- [ ] Listen on the socket (src/wb/realtime.ts only keeps it open for the online count today): `profile-like`, `profile-view`, `message`, `match`, `unmatch` (+ `event-invite`, `event-accept`, `event-decline`, `event-cancel` for the calendar)
- [ ] Unread notifications visible from any page (bell + count in the shell); a list of the last notifications
- [ ] Refresh the affected nodes on each event (likes, viewers, matches, matchesMap, chat)
- [ ] Remove `mockEvents$` and the typing indicator (the backend has no `typing` event) or ask for one

### General
- [ ] Remove src/mock and the `social` service once the items above are done (and `resetDemoData`, "Reset demo" in Me)
- [ ] No unhandled error in the console with the real backend (every page, logged in and out)
- [ ] Check every page on Firefox and Chrome, and on a phone width

## Bonus (only graded if the mandatory part is perfect)
- [x] Interactive map of users (/map)
- [x] GitHub OAuth
- [ ] Calendar: plan dates with a match (title, description, place as coordinates, date and time): GET /profile/calendar, POST /profile/calendar/event, POST .../:eventId/accept | decline | cancel, socket `event-*`
- [ ] Photo gallery: drag-and-drop upload, crop / rotate / filters
- [ ] Second OAuth provider
- [ ] Video / audio chat

## API calls: missing or incomplete

### Backend endpoints the frontend does not call yet
| Endpoint | For |
|---|---|
| GET /profile/likes | who liked me (IV.2) |
| GET /profile/visited | my visit history (IV.2) |
| GET /profile/matches | connections list (IV.6) |
| GET /profile/search | advanced search (IV.4) |
| GET /profile/blocks, DELETE /profile/:id/block | blocked list, unblock |
| GET /notification/chat | conversation list |
| GET /notification/chat/:chatId | conversation history |
| POST /notification/chat/message | send a message |
| POST /notification/chat/:chatId/seen | mark a conversation read |
| GET /profile/calendar, POST /profile/calendar/event, POST /profile/calendar/event/:eventId/accept, /decline, /cancel | calendar (bonus) |
| socket.io events (see NotificationTypes.ts) | live notifications and chat |

### Frontend calls that go to the mock (to replace)
| Today (social mock) | Real endpoint |
|---|---|
| GET /likes | GET /profile/likes |
| GET /matches | GET /profile/matches (+ GET /notification/chat for the last message) |
| GET /matches/:matchId/messages | GET /notification/chat/:chatId |
| POST /messages | POST /notification/chat/message |
| DELETE /matches/:matchId | DELETE /profile/:id/like |
| POST /blocks | POST /profile/:id/block |
| POST /swipes (answering a like on Activity) | POST /profile/:id/like or /pass |
| GET /profiles/:userId | GET /profile/:userId |
| POST /reset | none (demo only: remove) |

### Frontend calls that are broken
- [x] POST /profile (`profileCreate`, `actions.createMissingProfile`): no such route any more -> removed

### Backend gaps (missing or incomplete for the screens above)
- [ ] GET /profile/matches carries no `chatId`, and GET /notification/chat only lists chats that already have a message (INNER JOIN LATERAL on messages): a new match has no chat id to open its history with -> add `chatId` to the matches list (the chat row exists from the match)
- [ ] POST /notification/chat/message answers only `{ delivered }`: return the stored message (messageId, chatId, timestamp, status) so the sender can show it without refetching
- [ ] GET /notification/chat has no unread count (comment in ChatListItem.ts): needed for the badge "new message from any page"
- [ ] Calendar: no endpoint to EDIT an event (title, description, location as coordinates, date and time); only create / accept / decline / cancel
- [ ] No notifications list / mark-read endpoint: pending notifications are only replayed on reconnect, so the unread count must be kept by the client (or add GET /notification/notifications + POST .../read)
- [ ] GET /profile/viewers and GET /profile/likes carry no date (when did they view / like)
- [ ] No `typing` socket event (the chat UI has a typing indicator)
- Note: an unlike between connected users sends `unmatch` to both (`profile-unlike` is unused): the frontend must listen on `unmatch` for IV.7 "a connected user unlikes them"
- [ ] Untested here (no Docker): POST /profile/:id/like now returns `{ liked, matched }`; build the profile service once and try it
