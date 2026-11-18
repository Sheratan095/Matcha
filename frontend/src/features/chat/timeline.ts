/**
 * Turns the server messages of a conversation, plus the messages being sent from this screen and the
 * notes about the dates planned with the partner, into what the thread draws: day dividers, bubbles
 * grouped in runs, and the notes in between.
 */
import type { Message, PlannedDate } from '@/api/types'
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

/**
 * A line of the conversation that nobody typed, drawn from the calendar: a date was planned (the
 * invite, with its answer), or an accepted date began.
 */
export interface DateNote {
  kind: 'planned' | 'started'
  dateId: string
  at: number
}

export interface NoteItem {
  kind: 'note'
  key: string
  note: DateNote['kind']
  dateId: string
  at: number
}

export type TimelineItem = DayItem | MessageItem | NoteItem

/** Two messages from the same side further apart than this start a new run. */
export const RUN_GAP_MS = 5 * 60_000

/**
 * The notes of the dates planned with the partner, oldest first: each one where its invite was sent
 * (at `now` when the backend did not say, i.e. at the end), and, once an accepted one has begun, where
 * it began.
 */
export function dateNotes(dates: readonly PlannedDate[], now: number): DateNote[] {
  const notes: DateNote[] = []
  for (const date of dates) {
    notes.push({ kind: 'planned', dateId: date.id, at: date.plannedAt ?? Math.min(now, date.startsAt) })
    if (date.status === 'accepted' && date.startsAt <= now) notes.push({ kind: 'started', dateId: date.id, at: date.startsAt })
  }
  return notes.sort((a, b) => a.at - b.at)
}

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
  /** Oldest first (`dateNotes`); placed among the messages by time, those being sent included. */
  notes: readonly DateNote[] = [],
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

  const entries: Array<Entry | DateNote> = []
  let next = 0
  for (const message of messages) {
    // a note goes after the messages of its very moment
    while (next < notes.length && notes[next].at < message.sentAt) entries.push(notes[next++])
    const mine = message.senderId !== partnerId
    entries.push({
      key: claimed.get(message.id) ?? keyFor.get(message.id) ?? message.id,
      side: mine ? 'mine' : 'theirs',
      text: message.text,
      at: message.sentAt,
      status: mine ? (message.status === 'read' ? 'read' : 'sent') : undefined,
    })
  }
  // What is being sent goes after the server messages, still with the notes kept in time order around
  // it: a date that began after a failed message comes after it, as it will once the message is in.
  for (const item of pending) {
    if (delivered.has(item.localId)) continue
    while (next < notes.length && notes[next].at < item.createdAt) entries.push(notes[next++])
    entries.push({
      key: item.localId,
      side: 'mine',
      text: item.text,
      at: item.createdAt,
      status: item.status,
      pendingId: item.localId,
    })
  }
  entries.push(...notes.slice(next))

  const items: TimelineItem[] = []
  let day: string | null = null
  /** The latest time drawn so far: the dividers only move forward. */
  let latest = Number.NEGATIVE_INFINITY
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
    // A message still being sent from an earlier day (it failed yesterday) stays under the last
    // divider: going back a day would print that day twice, under one key.
    if (key !== day && entry.at >= latest) {
      closeRun()
      day = key
      items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(entry.at, now) })
    }
    latest = Math.max(latest, entry.at)
    if (!('side' in entry)) {
      // a note ends the run before it
      closeRun()
      items.push({ kind: 'note', key: `date-${entry.dateId}-${entry.kind}`, note: entry.kind, dateId: entry.dateId, at: entry.at })
      continue
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
