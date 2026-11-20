/**
 * The notification feed (Activity > Notifications): what realtime told the user, kept so it can be read
 * after the toast is gone.
 *
 * The backend has no list of notifications: it only replays the ones queued while the user was offline,
 * once, when the socket connects. So the feed is built here from `realtime$` (the replay included) and
 * kept per user in this browser's localStorage, the latest `NOTIFICATION_LIMIT` of them. Signing out
 * (`actions.logout`) removes it; a session that merely expires keeps it.
 *
 * - One entry per thing: a newer event with the same `id` (a second visit by the same person, a
 *   second message from them) replaces the older one and brings it back to the top, unread.
 * - The feed has no clock of its own to offer: `at` is when the client heard of it (the backend's
 *   payloads carry no time).
 * - Not recorded: `chat-seen` (not news), the echo of the user's own unlike / block (`unmatch` with
 *   `own`), and a message from the person whose conversation is open (the thread shows it).
 * - Unread = not shown on the Activity > Notifications tab yet. The tab marks them read when it is open.
 */
import { useSyncExternalStore } from 'react'
import type { Observable, Subscription } from 'rxjs'
import type { CalendarAction, RealtimeEvent, UserSummary } from '@/api/types'
import { getNodeValue, isStoreLive, node$ } from './store'

export type NotificationKind = 'like' | 'view' | 'match' | 'unmatch' | 'message' | `date-${CalendarAction}`

export interface AppNotification {
  /** What it is about (`like:<userId>`, `date-accept:<eventId>`...): one entry per id. */
  id: string
  kind: NotificationKind
  /** Who it is about: who liked, visited, wrote, or answered a date. */
  person: UserSummary
  /** Epoch milliseconds the client heard of it. */
  at: number
  read: boolean
  /** A message: its text. A date: its title. */
  text?: string
  /** A date: when it starts (epoch milliseconds), null when the payload had no usable start. */
  startsAt?: number | null
}

/** How many notifications are kept; the oldest go first. */
export const NOTIFICATION_LIMIT = 50

const MAX_TEXT_LENGTH = 140

const KINDS = [
  'like',
  'view',
  'match',
  'unmatch',
  'message',
  'date-invite',
  'date-accept',
  'date-decline',
  'date-cancel',
  'date-start',
] as const satisfies readonly NotificationKind[]

// ---------------------------------------------------------------- events -> entries

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TEXT_LENGTH ? `${flat.slice(0, MAX_TEXT_LENGTH - 2)}…` : flat
}

/** The entry an event becomes; null for an event that is not news (`seen`). Always unread. */
export function notificationFrom(event: RealtimeEvent, at: number): AppNotification | null {
  switch (event.type) {
    case 'like':
    case 'view':
    case 'match':
    case 'unmatch':
      return { id: `${event.type}:${event.person.userId}`, kind: event.type, person: event.person, at, read: false }
    case 'message':
      return {
        id: `message:${event.from.userId}`,
        kind: 'message',
        person: event.from,
        at,
        read: false,
        text: excerpt(event.message.text),
      }
    case 'calendar': {
      const kind = `date-${event.action}` as const
      return {
        id: `${kind}:${event.event.id}`,
        kind,
        person: event.person,
        at,
        read: false,
        text: event.event.title,
        startsAt: event.event.startsAt,
      }
    }
    case 'seen':
      return null
  }
}

// ---------------------------------------------------------------- the store

const listeners = new Set<() => void>()
/** Whose feed `items` is; null while nobody is signed in. */
let owner: string | null = null
let items: readonly AppNotification[] = []

function storageKey(userId: string): string {
  return `matcha.notifications.${userId}`
}

function isStored(value: unknown): value is AppNotification {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const who = entry.person as Record<string, unknown> | null | undefined
  return (
    typeof entry.id === 'string' &&
    KINDS.includes(entry.kind as NotificationKind) &&
    typeof entry.at === 'number' &&
    typeof entry.read === 'boolean' &&
    typeof who === 'object' &&
    who !== null &&
    typeof who.userId === 'string' &&
    typeof who.username === 'string' &&
    (who.profilePictureUrl === null || typeof who.profilePictureUrl === 'string')
  )
}

/** What this browser kept for `userId`; whatever does not look like an entry is dropped. */
function readStored(userId: string): AppNotification[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isStored).slice(0, NOTIFICATION_LIMIT) : []
  } catch {
    // storage blocked, or not JSON: start empty
    return []
  }
}

function persist(): void {
  if (owner === null) return
  try {
    if (items.length === 0) localStorage.removeItem(storageKey(owner))
    else localStorage.setItem(storageKey(owner), JSON.stringify(items))
  } catch {
    // storage blocked or full: the feed lives for this page only
  }
}

function commit(next: readonly AppNotification[]): void {
  items = next
  persist()
  for (const listener of listeners) listener()
}

/** Another user (or nobody) is signed in: show their feed. Nothing is written back. */
function switchOwner(userId: string | null): void {
  if (userId === owner) return
  owner = userId
  items = userId === null ? [] : readStored(userId)
  for (const listener of listeners) listener()
}

function record(entry: AppNotification): void {
  commit([entry, ...items.filter((item) => item.id !== entry.id)].slice(0, NOTIFICATION_LIMIT))
}

function hear(event: RealtimeEvent): void {
  if (owner === null || !isStoreLive()) return
  if (event.type === 'unmatch' && event.own) return
  if (event.type === 'message' && getNodeValue('activeChatUserId') === event.from.userId) return
  const entry = notificationFrom(event, Date.now())
  if (entry) record(entry)
}

/** The user opened the conversation with `userId`: their messages are read there. */
function readMessagesFrom(userId: string): void {
  if (!items.some((item) => item.kind === 'message' && item.person.userId === userId && !item.read)) return
  commit(items.map((item) => (item.kind === 'message' && item.person.userId === userId ? { ...item, read: true } : item)))
}

/** Marks everything read (the Notifications tab does it while it is open). */
export function markAllNotificationsRead(): void {
  if (items.every((item) => item.read)) return
  commit(items.map((item) => (item.read ? item : { ...item, read: true })))
}

/** Empties the feed, here and in the browser's storage. */
export function clearNotifications(): void {
  if (items.length > 0) commit([])
  else persist()
}

/**
 * Follows the signed-in user (their stored feed is loaded, and dropped from memory on sign-out) and
 * records `events`. Started by `startRealtime`, which stops it with the store.
 */
export function startNotificationFeed(events: Observable<RealtimeEvent>): Subscription {
  const subscription = node$('sessionUserId').subscribe((value) => switchOwner(value ?? null))
  subscription.add(
    node$('activeChatUserId').subscribe((value) => {
      if (value) readMessagesFrom(value)
    }),
  )
  subscription.add(events.subscribe(hear))
  subscription.add(() => switchOwner(null))
  return subscription
}

// ---------------------------------------------------------------- React

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshot = (): readonly AppNotification[] => items

/** The feed as it is now, newest first (outside React: `useNotifications` is the hook). */
export function getNotifications(): readonly AppNotification[] {
  return items
}

/** The feed, newest first. Stable until it changes. */
export function useNotifications(): readonly AppNotification[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** How many entries of the feed are unread. */
export function useUnreadNotifications(): number {
  return useNotifications().filter((item) => !item.read).length
}
