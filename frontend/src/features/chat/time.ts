/**
 * Date and time labels for matches, chat and activity. Pure functions of (iso, now) so a
 * minute ticker (`useNow`) keeps relative labels fresh.
 */

import { dateFormat, t } from '@/i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Dates follow the interface language (`@/i18n`): the formatters are looked up on use, never kept at module level.
const clock = () => dateFormat({ hour: '2-digit', minute: '2-digit' })
const weekday = () => dateFormat({ weekday: 'long' })
const weekdayShort = () => dateFormat({ weekday: 'short' })
const dayMonth = () => dateFormat({ day: 'numeric', month: 'short' })
const dayMonthYear = () => dateFormat({ day: 'numeric', month: 'short', year: 'numeric' })

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
  return clock().format(toDate(value))
}

/** "12 Mar", or "12 Mar 2025" when not this year. */
export function shortDate(value: string | number | Date, now: number): string {
  const date = toDate(value)
  return date.getFullYear() === new Date(now).getFullYear() ? dayMonth().format(date) : dayMonthYear().format(date)
}

/** Day divider: "Today", "Yesterday", "Monday" (this week), "12 Mar". */
export function dayLabel(value: string | number | Date, now: number): string {
  const days = daysBetween(value, now)
  if (days <= 0) return t('time.today')
  if (days === 1) return t('time.yesterday')
  if (days < 7) return weekday().format(toDate(value))
  return shortDate(value, now)
}

/** List meta: "Now", "5m", "3h", "Yesterday", "Mon", "12 Mar". */
export function shortAgo(value: string | number | Date, now: number): string {
  const date = toDate(value)
  const elapsed = Math.max(0, now - date.getTime())
  if (elapsed < MINUTE) return t('time.now')
  if (elapsed < HOUR) return t('time.minutesShort', { n: Math.floor(elapsed / MINUTE) })
  const days = daysBetween(date, now)
  if (days === 0) return t('time.hoursShort', { n: Math.floor(elapsed / HOUR) })
  if (days === 1) return t('time.yesterday')
  if (days < 7) return weekdayShort().format(date)
  return shortDate(date, now)
}

/** A date ahead: "Today, 20:00", "Tomorrow, 20:00", "Sat 21 Nov, 20:00", "9 Jan 2027, 20:00" (not this year). */
export function upcomingLabel(value: string | number | Date, now: number): string {
  const date = toDate(value)
  const ahead = daysBetween(now, date.getTime())
  let day: string
  if (ahead === 0) day = t('time.today')
  else if (ahead === 1) day = t('time.tomorrow')
  else if (date.getFullYear() === new Date(now).getFullYear()) day = `${weekdayShort().format(date)} ${dayMonth().format(date)}`
  else day = dayMonthYear().format(date)
  return t('time.upcoming', { day, time: clock().format(date) })
}

/** Zero-padded count for print-style numerals: 3 -> "03". */
export function pad2(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(2, '0')
}
