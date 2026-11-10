import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkDateOfBirth, checkName, dateOfBirthBounds, NAME_RULE } from './rules'

describe('checkName', () => {
  it('accepts what the database accepts: any alphabet, single spaces, hyphens or apostrophes between parts', () => {
    for (const name of ['Jo', 'Jean-Luc', "O'Brien", 'D’Angelo', 'José', 'Zoë', 'Anne Marie', 'Łukasz', 'Ελένη', '  Mia  ']) {
      expect(checkName(name, 'first'), name).toBeNull()
    }
  })

  it('refuses digits, symbols, doubled or dangling separators', () => {
    for (const name of ['R2D2', 'Jo!', 'Anne  Marie', 'Jean--Luc', '-Jean', "Brien'", 'Jo_Doe']) {
      expect(checkName(name, 'last'), name).toBe(NAME_RULE)
    }
  })

  it('asks for a value and caps the length', () => {
    expect(checkName('   ', 'first')).toBe('Enter your first name.')
    expect(checkName('a'.repeat(51), 'last')).toBe('At most 50 characters.')
  })
})

describe('checkDateOfBirth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts an adult, including on their 18th birthday', () => {
    expect(checkDateOfBirth('1995-06-15')).toBeNull()
    expect(checkDateOfBirth('2008-11-09')).toBeNull()
    expect(checkDateOfBirth(' 1995-06-15 ')).toBeNull()
  })

  it('refuses the day before the 18th birthday, and the future', () => {
    expect(checkDateOfBirth('2008-11-10')).toBe('You must be at least 18 to join.')
    expect(checkDateOfBirth('2027-01-01')).toBe("That date hasn't happened yet.")
  })

  it('refuses dates off the calendar, other formats and empty input', () => {
    expect(checkDateOfBirth('2001-02-29')).toBe("That date doesn't exist.")
    expect(checkDateOfBirth('2000-02-29')).toBeNull()
    expect(checkDateOfBirth('15/06/1995')).toBe('Use the format YYYY-MM-DD.')
    expect(checkDateOfBirth('')).toBe('Enter your date of birth.')
  })

  it('stops at 120 years, like the profile service', () => {
    expect(checkDateOfBirth('1906-11-09')).toBeNull()
    expect(checkDateOfBirth('1905-11-09')).toBe('Check the year: that is more than 120 years ago.')
  })

  it('gives the date picker the same bounds as the check', () => {
    const { min, max } = dateOfBirthBounds()
    expect(max).toBe('2008-11-09')
    expect(min).toBe('1905-11-10')
    expect(checkDateOfBirth(max)).toBeNull()
    expect(checkDateOfBirth(min)).toBeNull()
  })

  it('keeps Feb 29 inside the bounds in a common year', () => {
    vi.setSystemTime(new Date('2028-02-29T12:00:00Z'))
    expect(dateOfBirthBounds().max).toBe('2010-02-28')
    expect(checkDateOfBirth('2010-02-28')).toBeNull()
    expect(checkDateOfBirth('2010-03-01')).toBe('You must be at least 18 to join.')
  })
})
