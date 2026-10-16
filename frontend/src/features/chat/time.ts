/**
 * Date and time labels for matches, chat and activity. Pure functions of (iso, now) so a
 * minute ticker (`useNow`) keeps relative labels fresh.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// The interface is written in English: dates follow it (24-hour clock, "3 Oct"), whatever the browser locale.
const LOCALE = 'en-GB'
const clock = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const weekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Whole calendar days between the two dates (0 = same day, 1 = yesterday...). */
export function daysBetween(earlier: string | number | Date, now: number): number {
  return Math.round((startOfDay(new Date(now)) - startOfDay(toDate(earlier))) / DAY)
}

/** A stable key for the calendar day of a date (local time). */
export function dayKey(value: string | number | Date): string {
  const date = toDate(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** "14:02". */
export function clockTime(value: string | number | Date): string {
  return clock.format(toDate(value))
}

/** "12 Mar", or "12 Mar 2025" when not this year. */
export function shortDate(value: string | number | Date, now: number): string {
  const date = toDate(value)
  return date.getFullYear() === new Date(now).getFullYear() ? dayMonth.format(date) : dayMonthYear.format(date)
}

/** Day divider: "Today", "Yesterday", "Monday" (this week), "12 Mar". */
export function dayLabel(value: string | number | Date, now: number): string {
  const days = daysBetween(value, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekday.format(toDate(value))
  return shortDate(value, now)
}

/** List meta: "Now", "5m", "3h", "Yesterday", "Mon", "12 Mar". */
export function shortAgo(value: string | number | Date, now: number): string {
  const date = toDate(value)
  const elapsed = Math.max(0, now - date.getTime())
  if (elapsed < MINUTE) return 'Now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  const days = daysBetween(date, now)
  if (days === 0) return `${Math.floor(elapsed / HOUR)}h`
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekdayShort.format(date)
  return shortDate(date, now)
}

/** Longer relative phrase: "just now", "12 min ago", "3 h ago", "yesterday", "on 12 Mar". */
export function agoPhrase(value: string | number | Date, now: number): string {
  const date = toDate(value)
  const elapsed = Math.max(0, now - date.getTime())
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  const days = daysBetween(date, now)
  if (days === 0) return `${Math.floor(elapsed / HOUR)} h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return `on ${shortDate(date, now)}`
}

/** The presence line under a name. */
export function presenceLabel(online: boolean, lastSeen: string | null, now: number): string {
  if (online) return 'Online now'
  if (!lastSeen) return 'Offline'
  return `Last seen ${agoPhrase(lastSeen, now)}`
}

/** Zero-padded count for print-style numerals: 3 -> "03". */
export function pad2(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(2, '0')
}
