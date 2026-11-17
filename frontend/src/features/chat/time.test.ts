import { describe, expect, it } from 'vitest'
import { upcomingLabel } from './time'

// local time, so the labels do not depend on the machine's time zone (Tue 17 Nov 2026)
const NOW = new Date(2026, 10, 17, 9, 30).getTime()

describe('upcomingLabel', () => {
  it('names today and tomorrow', () => {
    expect(upcomingLabel(new Date(2026, 10, 17, 20, 0), NOW)).toBe('Today, 20:00')
    expect(upcomingLabel(new Date(2026, 10, 18, 7, 5), NOW)).toBe('Tomorrow, 07:05')
  })

  it('gives the weekday and the date later this year, the year after that', () => {
    expect(upcomingLabel(new Date(2026, 10, 21, 20, 0), NOW)).toBe('Sat 21 Nov, 20:00')
    expect(upcomingLabel(new Date(2027, 0, 9, 20, 0).getTime(), NOW)).toBe('9 Jan 2027, 20:00')
  })
})
