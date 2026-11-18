import { describe, expect, it } from 'vitest'
import type { PlannedDate } from '@/api/types'
import { lookOf } from './moves'

const NOW = new Date(2026, 9, 3, 20, 30).getTime()
const HOUR = 60 * 60_000

/** A date of mine with them, 20:00 to 22:00 today: under way at NOW. */
function date(patch: Partial<PlannedDate> = {}): PlannedDate {
  return {
    id: 'd1',
    title: 'Drinks',
    description: null,
    startsAt: NOW - 30 * 60_000,
    endsAt: NOW + 90 * 60_000,
    plannedAt: null,
    status: 'accepted',
    mine: true,
    person: { userId: 'ann', username: 'ann', profilePictureUrl: null },
    place: null,
    ...patch,
  }
}

describe('lookOf', () => {
  it('lights an accepted date while it is on', () => {
    expect(lookOf(date(), NOW)).toEqual({ tone: 'strawberry', badge: 'Now' })
    expect(lookOf(date({ startsAt: NOW + HOUR, endsAt: NOW + 3 * HOUR }), NOW)).toEqual({ tone: 'matcha', badge: "It's on" })
  })

  it('keeps a declined date declined through the hours it would have run', () => {
    expect(lookOf(date({ status: 'declined' }), NOW)).toEqual({ tone: 'ink', badge: 'Declined' })
    expect(lookOf(date({ status: 'declined', startsAt: NOW - 3 * HOUR, endsAt: NOW - HOUR }), NOW)).toEqual({ tone: 'kraft', badge: null })
  })

  it('says nobody answered an invite that started while pending', () => {
    expect(lookOf(date({ status: 'pending' }), NOW)).toEqual({ tone: 'kraft', badge: 'No answer' })
  })
})
