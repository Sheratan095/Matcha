/**
 * The calendar's pure helpers: how `dates` splits into what the page shows, the times a form describes,
 * and the labels of a date. Functions of (dates, now) so a minute ticker keeps them current.
 */
import type { Coordinates, PlannedDate } from '@/api/types'
import { clockTime, daysBetween } from '@/features/chat/time'
import { dateFormat, t, tn } from '@/i18n'

const DAY = 24 * 60 * 60 * 1000

// ------------------------------------------------------------ the agenda

/** What the calendar page shows at `now`. */
export interface Agenda {
  /** Invites waiting for your answer, soonest first. */
  invites: PlannedDate[]
  /** Dates not over yet (confirmed, or your invites still out or turned down), soonest first. */
  ahead: PlannedDate[]
  /** Confirmed dates that are over, latest first. */
  past: PlannedDate[]
}

/** They invited you, nobody answered, and it has not started (after that it can no longer be answered). */
export function isOpenInvite(date: PlannedDate, now: number): boolean {
  return !date.mine && date.status === 'pending' && date.startsAt > now
}

/** Has started and is not over. */
export function isHappening(date: Pick<PlannedDate, 'startsAt' | 'endsAt'>, now: number): boolean {
  return date.startsAt <= now && now < date.endsAt
}

/**
 * Splits the dates for the page. An invite nobody answered before it started is dropped (it can no
 * longer be answered), and so is one of yours that was still out or declined by then.
 */
export function agendaOf(dates: readonly PlannedDate[], now: number): Agenda {
  const invites: PlannedDate[] = []
  const ahead: PlannedDate[] = []
  const past: PlannedDate[] = []
  for (const date of [...dates].sort((a, b) => a.startsAt - b.startsAt)) {
    if (isOpenInvite(date, now)) {
      invites.push(date)
      continue
    }
    if (date.status === 'accepted' && date.endsAt <= now) {
      past.push(date)
      continue
    }
    const stillOn = date.status === 'accepted' ? date.endsAt > now : date.mine && date.startsAt > now
    if (stillOn && date.status !== 'cancelled') ahead.push(date)
  }
  return { invites, ahead, past: past.reverse() }
}

/** Invites waiting for your answer (the tab's badge). */
export function invitesWaiting(dates: readonly PlannedDate[] | null | undefined, now: number): number {
  return dates ? dates.filter((date) => isOpenInvite(date, now)).length : 0
}

/** What you can still do about a date: nothing once it has started. */
export function movesOf(date: PlannedDate, now: number): { answer: boolean; cancel: boolean } {
  if (date.startsAt <= now) return { answer: false, cancel: false }
  return {
    answer: !date.mine && date.status === 'pending',
    // the inviter can always call it off (a declined one leaves your list); the invitee once accepted
    cancel: date.status !== 'cancelled' && (date.mine || date.status === 'accepted'),
  }
}

// ------------------------------------------------------------ the form

const pad = (value: number): string => String(value).padStart(2, '0')

/** 'YYYY-MM-DD' of the local day of `time` (an `<input type="date">` value). */
export function dayInput(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 'HH:MM' local (an `<input type="time">` value). */
export function timeInput(time: number): string {
  const date = new Date(time)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A form's default: tomorrow, 20:00 to 22:00. */
export function defaultSlot(now: number): { day: string; start: string; end: string } {
  return { day: dayInput(now + DAY), start: '20:00', end: '22:00' }
}

export interface Slot {
  startsAt: number
  endsAt: number
  /** The end time is at or before the start time: it is on the next day. */
  overnight: boolean
}

/**
 * The times a form describes, in local time: `day` 'YYYY-MM-DD', `start` and `end` 'HH:MM'. An end at
 * or before the start is on the next day (drinks from 22:00 to 01:00). null when a field is not a real
 * day or time.
 */
export function slotFrom(day: string, start: string, end: string): Slot | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const s = /^(\d{2}):(\d{2})$/.exec(start)
  const e = /^(\d{2}):(\d{2})$/.exec(end)
  if (!d || !s || !e) return null
  const [year, month, date] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])]
  const [startH, startM, endH, endM] = [Number(s[1]), Number(s[2]), Number(e[1]), Number(e[2])]
  if (startH > 23 || endH > 23 || startM > 59 || endM > 59) return null
  const begin = new Date(year, month, date, startH, startM)
  // 2026-02-31 rolls over into March: not a real day
  if (begin.getFullYear() !== year || begin.getMonth() !== month || begin.getDate() !== date) return null
  const sameDayEnd = new Date(year, month, date, endH, endM).getTime()
  const overnight = sameDayEnd <= begin.getTime()
  const endsAt = overnight ? new Date(year, month, date + 1, endH, endM).getTime() : sameDayEnd
  return { startsAt: begin.getTime(), endsAt, overnight }
}

// ------------------------------------------------------------ labels

// Dates follow the interface language (as in chat/time.ts): looked up on use, never kept at module level.
const weekdayShort = () => dateFormat({ weekday: 'short' })
const monthShort = () => dateFormat({ month: 'short' })
const longDay = () => dateFormat({ weekday: 'long', day: 'numeric', month: 'long' })
const longDayYear = () => dateFormat({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** The ticket stub of a day: 'SAT', '21', 'NOV'. */
export function stubOf(time: number): { weekday: string; day: string; month: string } {
  const date = new Date(time)
  return { weekday: weekdayShort().format(date), day: String(date.getDate()), month: monthShort().format(date) }
}

/** The whole day: 'Saturday 21 November' (with the year when not this one). */
export function longDayLabel(time: number, now: number): string {
  return new Date(time).getFullYear() === new Date(now).getFullYear() ? longDay().format(time) : longDayYear().format(time)
}

/** How far off a date is: 'Now' while it is on, 'Today', 'Tomorrow', 'In 3 days' (this week), else null. */
export function soonLabel(date: Pick<PlannedDate, 'startsAt' | 'endsAt'>, now: number): string | null {
  if (isHappening(date, now)) return t('time.now')
  if (date.startsAt < now) return null
  const ahead = daysBetween(now, date.startsAt)
  if (ahead === 0) return t('time.today')
  if (ahead === 1) return t('time.tomorrow')
  return ahead < 7 ? tn('time.inDays', ahead) : null
}

/** '20:00 – 22:00', or '22:00 – 01:00 +1' when it ends on a later day. */
export function timeRange(date: Pick<PlannedDate, 'startsAt' | 'endsAt'>): string {
  const later = daysBetween(date.startsAt, date.endsAt)
  return `${clockTime(date.startsAt)} – ${clockTime(date.endsAt)}${later > 0 ? ` +${later}` : ''}`
}

/** The place on OpenStreetMap (the map the app's tiles come from), pinned. */
export function mapLink(place: Coordinates): string {
  const lat = place.latitude.toFixed(6)
  const lon = place.longitude.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
}

/** A name to print for the other side; never empty. */
export function nameOf(date: PlannedDate): string {
  return date.person.username.trim() || t('chat.yourMatch')
}
