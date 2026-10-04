import { describe, expect, it } from 'vitest'
import type { Message } from '@/api/types'
import { icebreakersFor } from './icebreakers'
import { buildTimeline, type MessageItem, type PendingMessage } from './timeline'

const ME = 'me'
const THEM = 'them'
const NOW = new Date(2026, 9, 3, 18, 0).getTime()

function message(id: string, senderId: string, minutesAgo: number, text = id): Message {
  return { id, matchId: 'm1', senderId, text, sentAt: new Date(NOW - minutesAgo * 60_000).toISOString() }
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
    expect(items.map((item) => (item.kind === 'day' ? item.label : `${item.key}:${item.position}`))).toEqual([
      'Yesterday',
      'a:single',
      'Today',
      'b:first',
      'c:last',
      'd:single',
      'e:single',
    ])
  })

  it('marks my messages read once they answered, sent otherwise', () => {
    const { items } = buildTimeline([message('a', ME, 10), message('b', THEM, 9), message('c', ME, 8)], [], THEM, NOW)
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
})

describe('icebreakersFor', () => {
  it('starts from shared interests, then theirs, then generic lines', () => {
    const lines = icebreakersFor({
      commonTags: ['board-games'],
      interests: [
        { id: '1', name: 'board-games' },
        { id: '2', name: 'jazz' },
      ],
      city: 'Lyon',
    })
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ tag: 'board-games' })
    expect(lines[0].text).toContain('board games')
    expect(lines[1]).toMatchObject({ tag: 'jazz' })
    expect(lines[2].tag).toBeNull()
  })
})
