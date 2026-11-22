import { describe, expect, it } from 'vitest'
import type { OwnProfile } from '@/api/types'
import { firstRequiredGap, resumeStep, STEPS } from './steps'

const BASE: OwnProfile = {
  userId: 'u1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  sexualPreference: 'both',
  biography: 'Hello',
  interests: [{ id: 't1', name: 'tea' }],
  pictures: [{ id: 'p1', url: 'http://img.test/p1.webp', isProfile: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  latitude: 41.89,
  longitude: 12.51,
  dateOfBirth: '1995-12-10',
}

const indexOf = (key: string) => STEPS.findIndex((step) => step.key === key)

describe('onboarding steps', () => {
  it('asks for the location after the interests and before the photos', () => {
    expect(STEPS.map((step) => step.key)).toEqual(['about', 'into', 'bio', 'interests', 'location', 'photos'])
  })

  it('resumes at the location when it is the only thing missing', () => {
    const unplaced = { ...BASE, latitude: null, longitude: null }
    expect(firstRequiredGap(unplaced)).toBe(indexOf('location'))
    expect(resumeStep(unplaced)).toBe(indexOf('location'))
  })

  it('still resumes at an earlier gap first', () => {
    expect(firstRequiredGap({ ...BASE, biography: ' ', latitude: null, longitude: null })).toBe(indexOf('bio'))
  })

  it('goes to the photos once the location is set, and is done only with a profile picture', () => {
    const unpictured = { ...BASE, pictures: [] }
    expect(firstRequiredGap(unpictured)).toBe(indexOf('photos'))
    expect(resumeStep(unpictured)).toBe(indexOf('photos'))
    // a picture that is not the profile picture does not count (the backend wants is_profile)
    expect(firstRequiredGap({ ...BASE, pictures: [{ id: 'p2', url: 'http://img.test/p2.webp', isProfile: false }] })).toBe(indexOf('photos'))
    expect(firstRequiredGap(BASE)).toBe(-1)
    expect(resumeStep(BASE)).toBe(STEPS.length)
  })

  it('asks for the last name and the date of birth on the first step, like the backend', () => {
    expect(firstRequiredGap({ ...BASE, lastName: '  ' })).toBe(indexOf('about'))
    // a GitHub sign-up has no date of birth until it sets one
    expect(firstRequiredGap({ ...BASE, dateOfBirth: null })).toBe(indexOf('about'))
  })
})
