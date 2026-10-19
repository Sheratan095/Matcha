/**
 * Realtime (docs/ARCHITECTURE.md §4.6, API_CONTRACT §5).
 *
 * - `realtime$` republishes the event source given to `startRealtime` (the mock backend's
 *   `mockEvents$`: the real socket carries no events) for toasts and typing indicators.
 * - Each event also refreshes the nodes it makes stale: a message reloads the open conversation and
 *   the matches, a match reloads matches and likes, a like reloads likes.
 * - With the real backend, an authenticated socket.io connection to the gateway is kept open while
 *   signed in. It carries nothing; it only makes the user count in `GET /notification/online`. Any
 *   failure there is logged and ignored.
 */
import { Subject, type Observable, type Subscription } from 'rxjs'
import type { Socket } from 'socket.io-client'
import type { RealtimeEvent } from '@/api/types'
import { API_URL, BACKEND } from '@/config'
import { refresh } from './commands'
import { getNodeValue, isStoreLive, node$, onStoreStop } from './store'

const events = new Subject<RealtimeEvent>()

/** Everything pushed to the client. Hot: subscribe when you need it (typing indicators, toasts). */
export const realtime$: Observable<RealtimeEvent> = events.asObservable()

export interface RealtimeOptions {
  /** Where events come from (`mockEvents$` from `@/mock`). */
  events$: Observable<RealtimeEvent>
  /** Keep the gateway's socket.io connection open while signed in. Default: with the real backend only. */
  socket?: boolean
}

async function onMessage(matchId: string): Promise<void> {
  // The conversation first: reading it marks the message read, which the matches then reflect.
  if (getNodeValue('activeMatchId') === matchId) await refresh('chatMessages')
  await refresh('matches')
}

function react(event: RealtimeEvent): void {
  if (!isStoreLive()) return
  switch (event.type) {
    case 'message':
      void onMessage(event.matchId)
      break
    case 'match':
      void refresh('matches')
      void refresh('likesReceived')
      break
    case 'like':
      void refresh('likesReceived')
      break
    case 'typing':
      break
  }
}

/** One socket per signed-in user; closed on sign-out. */
function keepPresenceSocket(): Subscription {
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
        // Cross-origin: websocket only (polling would hit the backend's broken CORS, API_CONTRACT §5.2).
        socket = io(`${API_URL}/notification`, {
          withCredentials: true,
          transports: ['websocket'],
          reconnectionAttempts: 5,
        })
        socket.on('connect', () => void refresh('onlineCount'))
      })
      .catch((error: unknown) => console.warn('Realtime: could not open the presence socket', error))
  })

  subscription.add(close)
  return subscription
}

/** Starts forwarding and reacting to events. Call once the store is ready. Returns the stopper. */
export function startRealtime(options: RealtimeOptions): () => void {
  const subscriptions: Subscription[] = []
  subscriptions.push(
    options.events$.subscribe({
      next(event) {
        events.next(event)
        react(event)
      },
      error(error: unknown) {
        console.warn('Realtime: the event source failed', error)
      },
    }),
  )
  if (options.socket ?? BACKEND === 'real') subscriptions.push(keepPresenceSocket())
  const stop = (): void => subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe())
  onStoreStop(stop)
  return stop
}
