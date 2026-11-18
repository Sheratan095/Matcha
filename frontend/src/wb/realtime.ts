/**
 * Realtime (docs/ARCHITECTURE.md §4.6, docs/backend/WEBSOCKETS.md).
 *
 * While signed in, one socket.io connection to the gateway's `/notification` namespace stays open. It
 * counts the user as online and carries the live events, which are:
 * - republished on `realtime$` for toasts;
 * - turned into refreshes of the nodes they make stale: a message reloads the chat list and, when its
 *   conversation is open, fetches the thread's new messages (marked read at once), otherwise it counts
 *   as unread; a match or an unmatch reloads the connections (unless it is the echo of this client's
 *   own like / unlike / block, which refreshes them itself), a like the likes, a view the viewers;
 *   `chat-seen` turns the open thread's ticks read without a request; the calendar's `event-invite`,
 *   `event-accept`, `event-decline`, `event-cancel` reload the calendar, and so does an unmatch with
 *   someone you had dates with (the backend deletes them with the match); `event-start` (an accepted
 *   date began) changes nothing stored, so it is only republished.
 * A list that already shows the change (after the load on its way, if any) is not reloaded, so the
 * events the backend replays at connection, or two events about one change, cost no extra request.
 * A read that loads on demand and was never asked for (e.g. the viewers) is not fetched by an event.
 *
 * Events the backend queued while the user was offline arrive right after the connection opens.
 * A failure to connect is logged and ignored.
 */
import { Subject, type Observable, type Subscription } from 'rxjs'
import type { Socket } from 'socket.io-client'
import type { CalendarAction, CalendarResult, ChatMessage, MessageStatus, RealtimeEvent, UserSummary } from '@/api/types'
import { API_URL } from '@/config'
import { claimEcho, countUnread, hasDatesWith, markChatSeen, markThreadRead, reloadOpenChat } from './actions'
import { awaitPending, refresh } from './commands'
import type { NodeValue, RefreshableNodeName } from './nodes'
import { getLastRequestId, getNodeStatus, getNodeValue, getRequestId, isStoreLive, node$, onStoreStop } from './store'

const events = new Subject<RealtimeEvent>()

/** Everything pushed to the client. Hot: subscribe when you need it (toasts). */
export const realtime$: Observable<RealtimeEvent> = events.asObservable()

export interface RealtimeOptions {
  /** Keep the gateway's socket.io connection open while signed in. Default: true. */
  socket?: boolean
  /** Extra events, handled as if they came from the socket (tests). */
  events$?: Observable<RealtimeEvent>
}

// ---------------------------------------------------------------- payloads

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The backend's StdPayload; null when the payload is not one. */
function person(payload: unknown): UserSummary | null {
  if (!isRecord(payload) || typeof payload.userId !== 'string') return null
  return {
    userId: payload.userId,
    username: typeof payload.username === 'string' ? payload.username : '',
    profilePictureUrl: typeof payload.profilePictureUrl === 'string' ? payload.profilePictureUrl : null,
  }
}

const STATUSES: readonly MessageStatus[] = ['sent', 'delivered', 'read']

function messageEvent(payload: unknown): RealtimeEvent | null {
  const from = person(payload)
  if (!from || !isRecord(payload)) return null
  const { messageId, content, timestamp, status } = payload as Partial<ChatMessage>
  if (typeof messageId !== 'string' || typeof content !== 'string') return null
  return {
    type: 'message',
    from,
    message: {
      id: messageId,
      senderId: from.userId,
      text: content,
      sentAt: typeof timestamp === 'number' ? timestamp : Date.now(),
      status: status && STATUSES.includes(status) ? status : 'sent',
    },
  }
}

function seenEvent(payload: unknown): RealtimeEvent | null {
  if (!isRecord(payload) || typeof payload.chatId !== 'string' || typeof payload.userId !== 'string') return null
  return { type: 'seen', chatId: payload.chatId, userId: payload.userId }
}

/** The backend's EventPayload: the person who acted (StdPayload) plus `eventId`, `title`, `startTime`. */
function calendarEvent(action: CalendarAction): (payload: unknown) => RealtimeEvent | null {
  return (payload) => {
    const who = person(payload)
    if (!who || !isRecord(payload) || typeof payload.eventId !== 'string') return null
    const startsAt = typeof payload.startTime === 'string' ? Date.parse(payload.startTime) : Number.NaN
    return {
      type: 'calendar',
      action,
      person: who,
      event: {
        id: payload.eventId,
        title: typeof payload.title === 'string' ? payload.title.trim() : '',
        startsAt: Number.isNaN(startsAt) ? null : startsAt,
      },
    }
  }
}

/** Socket event name (NotificationType) -> the event it becomes. */
const DECODERS: Record<string, (payload: unknown) => RealtimeEvent | null> = {
  message: messageEvent,
  match: (payload) => {
    const who = person(payload)
    return who && { type: 'match', person: who }
  },
  unmatch: (payload) => {
    const who = person(payload)
    return who && { type: 'unmatch', person: who }
  },
  'profile-like': (payload) => {
    const who = person(payload)
    return who && { type: 'like', person: who }
  },
  'profile-view': (payload) => {
    const who = person(payload)
    return who && { type: 'view', person: who }
  },
  'chat-seen': seenEvent,
  'event-invite': calendarEvent('invite'),
  'event-accept': calendarEvent('accept'),
  'event-decline': calendarEvent('decline'),
  'event-cancel': calendarEvent('cancel'),
  'event-start': calendarEvent('start'),
}

/**
 * The event a socket event becomes: undefined for a name the client does not listen to, null for a
 * payload that is not the expected one.
 */
export function decodeSocketEvent(name: string, payload: unknown): RealtimeEvent | null | undefined {
  return Object.hasOwn(DECODERS, name) ? DECODERS[name](payload) : undefined
}

// ---------------------------------------------------------------- reactions

async function onMessage(from: string): Promise<void> {
  if (getNodeValue('activeChatUserId') !== from) countUnread(from)
  await refresh('chatList')
  const chatId = await reloadOpenChat(from)
  // read where it is shown: the sender's ticks turn read
  if (chatId) markChatSeen(chatId)
}

/**
 * A request started after `mark` (`getLastRequestId()` taken when the change was already made) sees
 * that change, whatever the order of the answers.
 */
const startedAfter = (name: RefreshableNodeName, mark: number): boolean => getRequestId(name) > mark

/**
 * Refreshes `name` for a change made before `mark`, unless a request of it started after `mark` (it
 * covers the change: one refresh serves every event of a burst), or what it holds, once the load on its
 * way has landed, already shows the change (`profile-like` then `match` about one person; the sign-in
 * reads that the events replayed at connection are about). A read on demand that was never asked for
 * holds nothing and sends nothing.
 */
async function refreshUnlessShown<N extends RefreshableNodeName>(
  name: N,
  mark: number,
  shown: (value: NonNullable<NodeValue<N>>) => boolean,
): Promise<void> {
  if (startedAfter(name, mark)) return
  if (getNodeStatus(name).status === 'loading') {
    await awaitPending(name)
    if (startedAfter(name, mark)) return
  }
  const value = getNodeValue(name)
  if (value != null && shown(value as NonNullable<NodeValue<N>>)) return
  await refresh(name)
}

const has = (list: readonly { userId: string }[] | undefined, userId: string): boolean =>
  Array.isArray(list) && list.some((entry) => entry.userId === userId)

/** `userId` connected with us (`connected`) or left our connections. */
function onConnectionChange(userId: string, connected: boolean, mark: number): void {
  void refreshUnlessShown('connections', mark, (value) => has(value.matches, userId) === connected)
  // a new connection has no conversation listed yet (the list only has chats with a message)
  void refreshUnlessShown('chatList', mark, (value) => !has(value.chats, userId))
  void refreshUnlessShown('matchesMap', mark, (value) => has(value.matches, userId) === connected)
  // connected people are not in "likes you"; one who left it no longer likes us
  void refreshUnlessShown('likesReceived', mark, (value) => !has(value.likes, userId))
  // a broken connection takes its dates with it (a new one has none yet)
  void refreshUnlessShown('calendar', mark, (value) => connected || !hasDatesWith(userId, value))
}

/** The calendar already shows what a calendar notification tells of. */
function calendarShows(calendar: CalendarResult, action: CalendarAction, eventId: string): boolean {
  const listed = calendar.events.find((event) => event.eventId === eventId)
  switch (action) {
    case 'invite':
      return listed !== undefined
    case 'accept':
      return listed?.status === 'accepted'
    // the inviter is told, and the inviter still lists a declined date
    case 'decline':
      return listed?.status === 'declined'
    // nobody lists a cancelled date
    case 'cancel':
      return listed === undefined
    // a start changes nothing stored: there is nothing to reload
    case 'start':
      return true
  }
}

/** `mark`: the last request id when the change the event tells of had already been made. */
function react(event: RealtimeEvent, mark: number): void {
  if (!isStoreLive()) return
  switch (event.type) {
    case 'message':
      onMessage(event.from.userId).catch((error: unknown) => console.warn('Realtime: the conversation did not reload', error))
      break
    case 'match':
    case 'unmatch':
      if (!claimEcho(event.type, event.person.userId)) onConnectionChange(event.person.userId, event.type === 'match', mark)
      break
    case 'like': {
      const from = event.person.userId
      // listed, or already a connection (their like made a match: connected people are not listed)
      void refreshUnlessShown('likesReceived', mark, (value) => has(value.likes, from) || has(getNodeValue('connections')?.matches, from))
      break
    }
    case 'view':
      // newest first: their visit is on top once it is in
      void refreshUnlessShown('myViewers', mark, (value) => value.viewers[0]?.userId === event.person.userId)
      break
    case 'seen':
      markThreadRead(event.chatId)
      break
    case 'calendar': {
      const { action, event: date } = event
      void refreshUnlessShown('calendar', mark, (value) => calendarShows(value, action, date.id))
      break
    }
  }
}

/**
 * How long after a connection the events received are taken for the backend's replay of what happened
 * while we were offline (it sends them at once, right after the handshake).
 */
const REPLAY_WINDOW_MS = 3000

/**
 * Where an event source stands: right after it connects, its events are the replay of changes made
 * before the connection, so their mark is the one of the connection (a request started since covers
 * them all); later ones are live, made just before they arrive.
 */
interface Arrival {
  connectedAt: number
  connectionMark: number
}

function markOf(arrival: Arrival): number {
  return Date.now() - arrival.connectedAt < REPLAY_WINDOW_MS ? arrival.connectionMark : getLastRequestId()
}

function connectedNow(): Arrival {
  return { connectedAt: Date.now(), connectionMark: isStoreLive() ? getLastRequestId() : 0 }
}

function deliver(event: RealtimeEvent, arrival: Arrival): void {
  events.next(event)
  if (isStoreLive()) react(event, markOf(arrival))
}

// ---------------------------------------------------------------- the socket

/**
 * Where the gateway's socket.io server is, from `API_URL`. socket.io takes the PATH of its URL as the
 * namespace and always connects to `<origin>/socket.io`, so a gateway behind a path prefix (the Vite
 * proxy's `/api`, which forwards `/api/*` and nothing else) needs the prefix on the socket's `path`:
 * `http://localhost:3000` -> `http://localhost:3000/notification` on `/socket.io`;
 * `/api` -> `<page origin>/notification` on `/api/socket.io`.
 */
export function socketTarget(apiUrl: string, pageOrigin: string): { url: string; path: string } {
  const api = new URL(apiUrl, pageOrigin)
  const prefix = api.pathname.replace(/\/+$/, '')
  return { url: `${api.origin}/notification`, path: `${prefix}/socket.io` }
}

/** One socket per signed-in user; closed on sign-out. */
function keepSocket(): Subscription {
  let socket: Socket | null = null
  let connectedFor: string | null = null
  let generation = 0

  const close = (): void => {
    generation += 1
    socket?.disconnect()
    socket = null
  }

  const subscription = node$('sessionUserId').subscribe((value) => {
    const userId = value ?? null
    if (userId === connectedFor) return
    close()
    connectedFor = userId
    if (!userId) return
    const mine = generation
    import('socket.io-client')
      .then(({ io }) => {
        if (mine !== generation) return
        // Websocket only (polling would hit the backend's broken CORS when cross-origin, API_CONTRACT §5.2).
        const target = socketTarget(API_URL, window.location.origin)
        socket = io(target.url, {
          path: target.path,
          withCredentials: true,
          transports: ['websocket'],
          reconnectionAttempts: 5,
        })
        // every (re)connection is followed by the replay of what was queued meanwhile
        let arrival = connectedNow()
        socket.on('connect', () => {
          arrival = connectedNow()
        })
        socket.onAny((name: string, payload: unknown) => {
          // an event that arrives after sign-out (or for the previous user) is not for us
          if (mine !== generation) return
          const event = decodeSocketEvent(name, payload)
          if (event === undefined) return
          if (event) deliver(event, arrival)
          else console.warn(`Realtime: unexpected "${name}" payload`, payload)
        })
      })
      .catch((error: unknown) => console.warn('Realtime: could not open the socket', error))
  })

  subscription.add(close)
  return subscription
}

/** Starts the socket and the reactions to its events. Call once the store is ready. Returns the stopper. */
export function startRealtime(options: RealtimeOptions = {}): () => void {
  const subscriptions: Subscription[] = []
  if (options.events$) {
    // an injected source counts as connected when it is subscribed
    const arrival = connectedNow()
    subscriptions.push(
      options.events$.subscribe({
        next: (event) => deliver(event, arrival),
        error(error: unknown) {
          console.warn('Realtime: the event source failed', error)
        },
      }),
    )
  }
  if (options.socket ?? true) subscriptions.push(keepSocket())
  const stop = (): void => subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe())
  onStoreStop(stop)
  return stop
}
