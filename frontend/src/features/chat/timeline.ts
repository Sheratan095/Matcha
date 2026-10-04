/**
 * Turns the server messages of a conversation, plus the messages being sent from this screen, into
 * what the thread draws: day dividers and bubbles grouped in runs.
 */
import type { Message } from '@/api/types'
import { clockTime, dayKey, dayLabel } from './time'

/** A message typed on this screen that the server has not confirmed (sending) or refused (failed). */
export interface PendingMessage {
  localId: string
  text: string
  status: 'sending' | 'failed'
  createdAt: number
  /** Server message ids that existed when it was sent: a new one of mine with the same text is its echo. */
  known: ReadonlySet<string>
  error: string | null
}

export type BubbleStatus = 'sending' | 'sent' | 'read' | 'failed'
export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

export interface DayItem {
  kind: 'day'
  key: string
  label: string
}

export interface MessageItem {
  kind: 'message'
  /** Stable across the sending -> sent transition, so the bubble is not redrawn (or re-announced). */
  key: string
  side: 'mine' | 'theirs'
  text: string
  at: number
  time: string
  position: BubblePosition
  /** Mine only. */
  status?: BubbleStatus
  /** Set on a message still owned by this screen (sending / failed). */
  pendingId?: string
}

export type TimelineItem = DayItem | MessageItem

/** Two messages from the same side further apart than this start a new run. */
export const RUN_GAP_MS = 5 * 60_000

interface Entry {
  key: string
  side: 'mine' | 'theirs'
  text: string
  at: number
  status?: BubbleStatus
  pendingId?: string
}

export interface Timeline {
  items: TimelineItem[]
  /** Server message id -> local id of the pending message it confirms. */
  claimed: Map<string, string>
  /** Ids of the server messages from the partner, oldest first. */
  theirIds: string[]
}

export function buildTimeline(
  messages: readonly Message[],
  pending: readonly PendingMessage[],
  partnerId: string,
  now: number,
  /** Keys given to confirmed messages that started on this screen. */
  keyFor: ReadonlyMap<string, string> = new Map(),
): Timeline {
  const claimed = new Map<string, string>()
  const delivered = new Set<string>()
  // A failed send may still have reached the server (a timeout): its echo settles it too.
  for (const item of pending) {
    const echo = messages.find(
      (message) =>
        message.senderId !== partnerId &&
        message.text === item.text &&
        !item.known.has(message.id) &&
        !claimed.has(message.id),
    )
    if (echo) {
      claimed.set(echo.id, item.localId)
      delivered.add(item.localId)
    }
  }

  let lastTheirs = -1
  messages.forEach((message, index) => {
    if (message.senderId === partnerId) lastTheirs = index
  })

  const entries: Entry[] = messages.map((message, index) => {
    const mine = message.senderId !== partnerId
    return {
      key: claimed.get(message.id) ?? keyFor.get(message.id) ?? message.id,
      side: mine ? 'mine' : 'theirs',
      text: message.text,
      at: Date.parse(message.sentAt),
      status: mine ? (index < lastTheirs ? 'read' : 'sent') : undefined,
    }
  })
  for (const item of pending) {
    if (delivered.has(item.localId)) continue
    entries.push({
      key: item.localId,
      side: 'mine',
      text: item.text,
      at: item.createdAt,
      status: item.status,
      pendingId: item.localId,
    })
  }

  const items: TimelineItem[] = []
  let day: string | null = null
  let run: MessageItem[] = []
  const closeRun = () => {
    if (run.length === 1) run[0].position = 'single'
    else if (run.length > 1) {
      run.forEach((item, index) => {
        item.position = index === 0 ? 'first' : index === run.length - 1 ? 'last' : 'middle'
      })
    }
    run = []
  }

  for (const entry of entries) {
    const key = dayKey(entry.at)
    if (key !== day) {
      closeRun()
      day = key
      items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(entry.at, now) })
    }
    const previous = run[run.length - 1]
    if (previous && (previous.side !== entry.side || entry.at - previous.at > RUN_GAP_MS)) closeRun()
    const item: MessageItem = {
      kind: 'message',
      key: entry.key,
      side: entry.side,
      text: entry.text,
      at: entry.at,
      time: clockTime(entry.at),
      position: 'single',
      status: entry.status,
      pendingId: entry.pendingId,
    }
    run.push(item)
    items.push(item)
  }
  closeRun()

  return {
    items,
    claimed,
    theirIds: messages.filter((message) => message.senderId === partnerId).map((message) => message.id),
  }
}
