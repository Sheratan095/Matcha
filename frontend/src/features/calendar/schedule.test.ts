import { describe, expect, it } from 'vitest'
import type { PlannedDate } from '@/api/types'
import { agendaOf, dayInput, defaultSlot, invitesWaiting, movesOf, slotFrom, soonLabel, timeInput, timeRange } from './schedule'

const HOUR = 60 * 60 * 1000
// Saturday 21 November 2026, 12:00 local time
const NOW = new Date(2026, 10, 21, 12, 0).getTime()

function date(id: string, patch: Partial<PlannedDate> = {}): PlannedDate {
  return {
    id,
    title: id,
    description: null,
    startsAt: NOW + 24 * HOUR,
    endsAt: NOW + 26 * HOUR,
    plannedAt: null,
    status: 'pending',
    mine: false,
    person: { userId: 'ann', username: 'ann', profilePictureUrl: null },
    place: null,
    ...patch,
  }
}

describe('slotFrom', () => {
  it('reads a day and two times in local time', () => {
    expect(slotFrom('2026-11-21', '20:00', '22:30')).toEqual({
      startsAt: new Date(2026, 10, 21, 20, 0).getTime(),
      endsAt: new Date(2026, 10, 21, 22, 30).getTime(),
      overnight: false,
    })
  })

  it('puts an end at or before the start on the next day', () => {
    expect(slotFrom('2026-12-31', '22:00', '01:00')).toEqual({
      startsAt: new Date(2026, 11, 31, 22, 0).getTime(),
      endsAt: new Date(2027, 0, 1, 1, 0).getTime(),
      overnight: true,
    })
    expect(slotFrom('2026-11-21', '20:00', '20:00')?.overnight).toBe(true)
  })

  it('refuses what is not a real day or time', () => {
    expect(slotFrom('2026-02-31', '20:00', '22:00')).toBeNull()
    expect(slotFrom('', '20:00', '22:00')).toBeNull()
    expect(slotFrom('2026-11-21', '24:00', '22:00')).toBeNull()
    expect(slotFrom('2026-11-21', '20:00', '')).toBeNull()
  })

  it('round-trips the input values it starts from', () => {
    const slot = defaultSlot(NOW)
    expect(slot).toEqual({ day: '2026-11-22', start: '20:00', end: '22:00' })
    const at = new Date(2026, 0, 5, 7, 5).getTime()
    expect(slotFrom(dayInput(at), timeInput(at), '09:00')?.startsAt).toBe(at)
  })
})

describe('agendaOf', () => {
  it('puts open invites first, then what is ahead, then the confirmed dates that are over', () => {
    const agenda = agendaOf(
      [
        date('later-invite', { startsAt: NOW + 72 * HOUR, endsAt: NOW + 74 * HOUR }),
        date('invite'),
        date('mine-waiting', { mine: true, startsAt: NOW + 2 * HOUR, endsAt: NOW + 3 * HOUR }),
        date('mine-declined', { mine: true, status: 'declined' }),
        date('on', { status: 'accepted', startsAt: NOW + 48 * HOUR, endsAt: NOW + 50 * HOUR }),
        date('happening', { status: 'accepted', startsAt: NOW - HOUR, endsAt: NOW + HOUR }),
        date('been', { status: 'accepted', startsAt: NOW - 50 * HOUR, endsAt: NOW - 48 * HOUR }),
        date('been-recently', { status: 'accepted', startsAt: NOW - 5 * HOUR, endsAt: NOW - 4 * HOUR }),
      ],
      NOW,
    )
    expect(agenda.invites.map((entry) => entry.id)).toEqual(['invite', 'later-invite'])
    expect(agenda.ahead.map((entry) => entry.id)).toEqual(['happening', 'mine-waiting', 'mine-declined', 'on'])
    expect(agenda.past.map((entry) => entry.id)).toEqual(['been-recently', 'been'])
  })

  it('drops what started without an answer: it can no longer be answered', () => {
    const started = { startsAt: NOW - HOUR, endsAt: NOW + HOUR }
    const agenda = agendaOf(
      [date('their-unanswered', started), date('mine-unanswered', { ...started, mine: true }), date('mine-declined', { ...started, mine: true, status: 'declined' })],
      NOW,
    )
    expect(agenda).toEqual({ invites: [], ahead: [], past: [] })
    expect(invitesWaiting([date('their-unanswered', started), date('open')], NOW)).toBe(1)
    expect(invitesWaiting(null, NOW)).toBe(0)
  })
})

describe('movesOf', () => {
  it('lets the invitee answer a pending invite, and call off only what they accepted', () => {
    expect(movesOf(date('invite'), NOW)).toEqual({ answer: true, cancel: false })
    expect(movesOf(date('on', { status: 'accepted' }), NOW)).toEqual({ answer: false, cancel: true })
  })

  it('lets the inviter call off their date whatever the answer', () => {
    for (const status of ['pending', 'accepted', 'declined'] as const) {
      expect(movesOf(date('mine', { mine: true, status }), NOW)).toEqual({ answer: false, cancel: true })
    }
  })

  it('allows nothing once it has started', () => {
    expect(movesOf(date('on', { status: 'accepted', startsAt: NOW - HOUR }), NOW)).toEqual({ answer: false, cancel: false })
  })
})

describe('labels', () => {
  it('prints the times, with the days an end runs over', () => {
    const start = new Date(2026, 10, 21, 22, 0).getTime()
    expect(timeRange({ startsAt: start, endsAt: start + 2 * HOUR })).toBe('22:00 – 00:00 +1')
    expect(timeRange({ startsAt: start - 2 * HOUR, endsAt: start })).toBe('20:00 – 22:00')
  })

  it('says how soon a date is, this week only', () => {
    expect(soonLabel({ startsAt: NOW - HOUR, endsAt: NOW + HOUR }, NOW)).toBe('Now')
    expect(soonLabel({ startsAt: NOW + HOUR, endsAt: NOW + 2 * HOUR }, NOW)).toBe('Today')
    expect(soonLabel({ startsAt: NOW + 24 * HOUR, endsAt: NOW + 25 * HOUR }, NOW)).toBe('Tomorrow')
    expect(soonLabel({ startsAt: NOW + 72 * HOUR, endsAt: NOW + 73 * HOUR }, NOW)).toBe('In 3 days')
    expect(soonLabel({ startsAt: NOW + 240 * HOUR, endsAt: NOW + 241 * HOUR }, NOW)).toBeNull()
    expect(soonLabel({ startsAt: NOW - 3 * HOUR, endsAt: NOW - 2 * HOUR }, NOW)).toBeNull()
  })
})
