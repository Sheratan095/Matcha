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
  pictures: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  latitude: 41.89,
  longitude: 12.51,
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

  it('goes to the photos, then is done, once the location is set', () => {
    expect(firstRequiredGap(BASE)).toBe(-1)
    expect(resumeStep(BASE)).toBe(indexOf('photos'))
    expect(resumeStep({ ...BASE, pictures: [{ id: 'p1', url: 'http://img.test/p1.webp', isProfile: true }] })).toBe(STEPS.length)
  })
})
