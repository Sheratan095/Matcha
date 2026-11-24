/**
 * The match moment (the "It's a match" takeover) for every new connection, whichever page is open.
 * The app's `MatchMoments` (src/app/frame) plays the head of the queue kept here.
 *
 * Two sources feed one queue:
 * - every `match` from realtime: the other person liked you back, a match made from another tab or
 *   device, one the backend replays at connection because it happened while you were offline, and the
 *   echo of your own like (the backend pushes `match` to both people);
 * - `celebrateMatch`, called by the screens whose like made the match (the deck, "likes you", the
 *   profile sheet) as soon as the like's answer says so: no wait for the socket, and it works without
 *   one. What they know (a first name, the photo they showed) replaces what the event said about a
 *   person still waiting in the queue.
 * A connection is celebrated once: a second announcement of it (the echo of your own like, after or
 * before the screen's) is dropped, until an `unmatch` about that person ends the connection. Someone
 * whose connection ended while they waited in the queue leaves it. Another user signing in (or
 * signing out) empties it.
 */
import { useSyncExternalStore } from 'react'
import type { Observable, Subscription } from 'rxjs'
import type { RealtimeEvent } from '@/api/types'
import { isStoreLive, node$ } from './store'

export interface MatchedPerson {
  userId: string
  /** First name, else username; null when unknown (the takeover then says "someone"). */
  name: string | null
  photo: string | null
  /** Your like answered theirs: the takeover says they liked you first. */
  theyLikedFirst?: boolean
}

const listeners = new Set<() => void>()
let queue: readonly MatchedPerson[] = []
/** The connections announced since they began, by user id: each one's moment plays once. */
const celebrated = new Set<string>()

function commit(next: readonly MatchedPerson[]): void {
  queue = next
  for (const listener of listeners) listener()
}

/** `fromScreen`: the announcement comes with the screen's own details, better than the event's. */
function announce(person: MatchedPerson, fromScreen: boolean): void {
  if (celebrated.has(person.userId)) {
    if (fromScreen && queue.some((entry) => entry.userId === person.userId)) {
      commit(queue.map((entry) => (entry.userId === person.userId ? person : entry)))
    }
    return
  }
  celebrated.add(person.userId)
  commit([...queue, person])
}

/** The connection with `userId` ended: a later match with them is news again, and a queued one is not. */
function ended(userId: string): void {
  celebrated.delete(userId)
  if (queue.some((entry) => entry.userId === userId)) commit(queue.filter((entry) => entry.userId !== userId))
}

function reset(): void {
  celebrated.clear()
  if (queue.length > 0) commit([])
}

/** A like from this screen made a match with `person`: play their moment (once, see above). */
export function celebrateMatch(person: MatchedPerson): void {
  announce(person, true)
}

/** The moment on screen was closed: the next one in the queue, if any, plays. */
export function dismissMatchMoment(): void {
  if (queue.length > 0) commit(queue.slice(1))
}

/** Drops every waiting moment (the user went to a conversation from one). */
export function clearMatchMoments(): void {
  if (queue.length > 0) commit([])
}

/**
 * Announces every `match` realtime hears, and forgets connections that end. Follows the signed-in user.
 * Started by `startRealtime`, which stops it with the store.
 */
export function startMatchMoments(events: Observable<RealtimeEvent>): Subscription {
  let owner: string | null | undefined
  const subscription = node$('sessionUserId').subscribe((value) => {
    const next = value ?? null
    if (next !== owner) reset()
    owner = next
  })
  subscription.add(
    events.subscribe((event) => {
      if (owner == null || !isStoreLive()) return
      if (event.type === 'match') {
        announce({ userId: event.person.userId, name: event.person.username.trim() || null, photo: event.person.profilePictureUrl }, false)
      } else if (event.type === 'unmatch') {
        ended(event.person.userId)
      }
    }),
  )
  subscription.add(reset)
  return subscription
}

// ---------------------------------------------------------------- React

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The queue as it is now, the moment playing first (outside React: `useMatchMoment` is the hook). */
export function getMatchMoments(): readonly MatchedPerson[] {
  return queue
}

const head = (): MatchedPerson | null => queue[0] ?? null

/** The person whose moment is playing; null when none is. */
export function useMatchMoment(): MatchedPerson | null {
  return useSyncExternalStore(subscribe, head, head)
}
