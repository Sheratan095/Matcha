import { describe, expect, it } from 'vitest'
import type { Message, PlannedDate } from '@/api/types'
import { icebreakersFor } from './icebreakers'
import { buildTimeline, dateNotes, type MessageItem, type PendingMessage } from './timeline'

const ME = 'me'
const THEM = 'them'
const NOW = new Date(2026, 9, 3, 18, 0).getTime()

function message(id: string, senderId: string, minutesAgo: number, text = id, status: Message['status'] = 'sent'): Message {
  return { id, senderId, text, sentAt: NOW - minutesAgo * 60_000, status }
}

/** A date with them, tomorrow, waiting for an answer. */
function date(id: string, patch: Partial<PlannedDate> = {}): PlannedDate {
  return {
    id,
    title: id,
    description: null,
    startsAt: NOW + 24 * 60 * 60_000,
    endsAt: NOW + 26 * 60 * 60_000,
    plannedAt: null,
    status: 'pending',
    mine: false,
    person: { userId: THEM, username: THEM, profilePictureUrl: null },
    place: null,
    ...patch,
  }
}

function bubbles(items: ReturnType<typeof buildTimeline>['items']): MessageItem[] {
  return items.filter((item): item is MessageItem => item.kind === 'message')
}

describe('buildTimeline', () => {
  it('groups runs by side and time, with a divider per day', () => {
    const { items } = buildTimeline(
      [
        message('a', THEM, 26 * 60),
        message('b', THEM, 60),
        message('c', THEM, 59),
        message('d', ME, 58),
        message('e', THEM, 30),
      ],
      [],
      THEM,
      NOW,
    )
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.kind === 'message' ? `${item.key}:${item.position}` : item.key))).toEqual([
      'Yesterday',
      'a:single',
      'Today',
      'b:first',
      'c:last',
      'd:single',
      'e:single',
    ])
  })

  it('marks my messages read once the server says so, sent otherwise (delivered included)', () => {
    const { items } = buildTimeline(
      [message('a', ME, 10, 'a', 'read'), message('b', THEM, 9), message('c', ME, 8, 'c', 'delivered')],
      [],
      THEM,
      NOW,
    )
    expect(bubbles(items).map((item) => [item.key, item.status])).toEqual([
      ['a', 'read'],
      ['b', undefined],
      ['c', 'sent'],
    ])
  })

  it('shows a pending message at the end, then hands its key to the server copy', () => {
    const pending: PendingMessage = {
      localId: 'local-1',
      text: 'hello',
      status: 'sending',
      createdAt: NOW,
      known: new Set(['a']),
      error: null,
    }
    const before = buildTimeline([message('a', THEM, 5)], [pending], THEM, NOW)
    expect(bubbles(before.items).map((item) => [item.key, item.status])).toEqual([
      ['a', undefined],
      ['local-1', 'sending'],
    ])

    // the server copy arrives while the send is still settling: drawn once, under the local key
    const echoed = buildTimeline([message('a', THEM, 5), message('srv', ME, 0, 'hello')], [pending], THEM, NOW)
    expect(bubbles(echoed.items).map((item) => [item.key, item.status])).toEqual([
      ['a', undefined],
      ['local-1', 'sent'],
    ])
    expect(echoed.claimed.get('srv')).toBe('local-1')

    // an older identical message of mine is not mistaken for the echo
    const older = buildTimeline([message('old', ME, 9, 'hello')], [{ ...pending, known: new Set(['old']) }], THEM, NOW)
    expect(bubbles(older.items).map((item) => item.key)).toEqual(['old', 'local-1'])
  })

  it('keeps a failed message with its pending id', () => {
    const failed: PendingMessage = {
      localId: 'local-2',
      text: 'oops',
      status: 'failed',
      createdAt: NOW,
      known: new Set(),
      error: 'No connection',
    }
    const { items } = buildTimeline([], [failed], THEM, NOW)
    expect(bubbles(items)).toMatchObject([{ key: 'local-2', status: 'failed', pendingId: 'local-2', side: 'mine' }])
  })

  it('places the date notes among the messages by time, each breaking the run around it', () => {
    const notes = dateNotes([date('d1', { plannedAt: NOW - 30 * 60_000 })], NOW)
    const { items } = buildTimeline(
      [message('a', THEM, 33), message('b', THEM, 31), message('c', THEM, 29)],
      [{ localId: 'local-1', text: 'see you', status: 'sending', createdAt: NOW, known: new Set(), error: null }],
      THEM,
      NOW,
      new Map(),
      notes,
    )
    expect(items.map((item) => (item.kind === 'message' ? `${item.key}:${item.position}` : item.key))).toEqual([
      'day-2026-9-3',
      'a:first',
      'b:last',
      'date-d1-planned',
      'c:single',
      'local-1:single',
    ])
  })

  it('keeps a date that began after a failed message after it, each day printed once', () => {
    const MIDNIGHT = new Date(2026, 9, 3).getTime()
    const notes = dateNotes(
      [date('d1', { plannedAt: MIDNIGHT - 4 * 60 * 60_000, status: 'accepted', startsAt: MIDNIGHT, endsAt: MIDNIGHT + 2 * 60 * 60_000 })],
      NOW,
    )
    const failed: PendingMessage = {
      localId: 'local-1',
      text: 'on my way',
      status: 'failed',
      createdAt: MIDNIGHT - 60_000,
      known: new Set(),
      error: 'No connection',
    }
    const { items } = buildTimeline([message('a', THEM, 20 * 60)], [failed], THEM, NOW, new Map(), notes)
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.key))).toEqual([
      'Yesterday',
      'date-d1-planned',
      'a',
      'local-1',
      'Today',
      'date-d1-started',
    ])
  })

  it('leaves a message still being sent from an earlier day under the last divider', () => {
    const failed: PendingMessage = {
      localId: 'local-1',
      text: 'late',
      status: 'failed',
      createdAt: NOW - 20 * 60 * 60_000,
      known: new Set(),
      error: 'No connection',
    }
    const { items } = buildTimeline([message('a', THEM, 60)], [failed], THEM, NOW)
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.key))).toEqual(['Today', 'a', 'local-1'])
    const keys = items.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('starts a day for a note on a day without messages', () => {
    const notes = dateNotes([date('d1', { plannedAt: NOW - 26 * 60 * 60_000 })], NOW)
    const { items } = buildTimeline([message('a', THEM, 5)], [], THEM, NOW, new Map(), notes)
    expect(items.map((item) => (item.kind === 'day' ? item.label : item.key))).toEqual(['Yesterday', 'date-d1-planned', 'Today', 'a'])
  })
})

describe('dateNotes', () => {
  it('notes where each invite was sent, and where an accepted date began once it has', () => {
    const notes = dateNotes(
      [
        date('later', { plannedAt: NOW - 10 * 60_000 }),
        date('begun', { plannedAt: NOW - 50 * 60_000, status: 'accepted', startsAt: NOW - 20 * 60_000, endsAt: NOW + 60 * 60_000 }),
        // pending when it started: nobody said yes, so it did not begin
        date('unanswered', { plannedAt: NOW - 40 * 60_000, startsAt: NOW - 15 * 60_000, endsAt: NOW + 60 * 60_000 }),
      ],
      NOW,
    )
    expect(notes.map((note) => `${note.dateId}:${note.kind}`)).toEqual([
      'begun:planned',
      'unanswered:planned',
      'begun:started',
      'later:planned',
    ])
  })

  it('puts an invite the backend gave no time for at the end of the thread', () => {
    expect(dateNotes([date('d1')], NOW)).toEqual([{ kind: 'planned', dateId: 'd1', at: NOW }])
  })
})

describe('icebreakersFor', () => {
  it('starts from shared interests, then theirs, then generic lines', () => {
    const lines = icebreakersFor({ commonTags: ['board-games'], interests: ['board-games', 'jazz'] })
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ tag: 'board-games' })
    expect(lines[0].text).toContain('board games')
    expect(lines[1]).toMatchObject({ tag: 'jazz' })
    expect(lines[2].tag).toBeNull()
  })

  it('falls back to generic lines when nothing about them is known', () => {
    expect(icebreakersFor().map((line) => line.tag)).toEqual([null, null, null])
  })
})
