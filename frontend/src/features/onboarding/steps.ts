/** The onboarding steps, and where a returning user resumes. */
import type { OwnProfile } from '@/api/types'
import type { DraftKey } from '@/features/me/profile'
import type { MessageKey } from '@/i18n'
import type { Tone } from '@/ui'

export type StepKey = 'about' | 'into' | 'bio' | 'interests' | 'location' | 'photos'

export interface StepDef {
  key: StepKey
  /** Name in the punch card (a catalogue key: print it with `t(step.label)`). */
  label: MessageKey
  /** The giant word in the margin on wide screens. */
  poster: MessageKey
  /** Accent drum of the step: misregistered plate, numeral, chosen chips. */
  tone: Tone
  /** The fields this step saves (a partial PATCH of just these). */
  fields: readonly DraftKey[]
  /** A stack of two lines (`a|b`: read it with `t.stack`). */
  title: MessageKey
  lead: MessageKey
}

export const STEPS: readonly StepDef[] = [
  {
    key: 'about',
    label: 'onb.aboutLabel',
    poster: 'onb.aboutPoster',
    tone: 'matcha',
    // dateOfBirth only reaches the PATCH when the profile has none yet (a GitHub sign-up): it is set-once
    fields: ['firstName', 'lastName', 'dateOfBirth', 'gender'],
    title: 'onb.aboutTitle',
    lead: 'onb.aboutLead',
  },
  {
    key: 'into',
    label: 'onb.intoLabel',
    poster: 'onb.intoPoster',
    tone: 'strawberry',
    fields: ['sexualPreference'],
    title: 'onb.intoTitle',
    lead: 'onb.intoLead',
  },
  {
    key: 'bio',
    label: 'onb.bioLabel',
    poster: 'onb.bioPoster',
    tone: 'yolk',
    fields: ['biography'],
    title: 'onb.bioTitle',
    lead: 'onb.bioLead',
  },
  {
    key: 'interests',
    label: 'onb.interestsLabel',
    poster: 'onb.interestsPoster',
    tone: 'blue',
    fields: ['interests'],
    title: 'onb.interestsTitle',
    lead: 'onb.interestsLead',
  },
  {
    key: 'location',
    label: 'onb.locationLabel',
    poster: 'onb.locationPoster',
    tone: 'strawberry',
    // Saved on its own (PUT /profile/location), not through the profile PATCH.
    fields: [],
    title: 'onb.locationTitle',
    lead: 'onb.locationLead',
  },
  {
    key: 'photos',
    label: 'onb.photosLabel',
    poster: 'onb.photosPoster',
    tone: 'matcha',
    fields: [],
    title: 'onb.photosTitle',
    lead: 'onb.photosLead',
  },
]

/** The profile picture the backend's completeness check asks for (the first upload becomes it). */
export function hasProfilePicture(profile: OwnProfile): boolean {
  return profile.pictures.some((picture) => picture.isProfile)
}

/**
 * Index of the first step whose required content is missing: the backend's `profile_is_complete`, step by
 * step (`profileComplete` in src/wb/functions.ts is the same rule). -1 when nothing is missing.
 */
export function firstRequiredGap(profile: OwnProfile): number {
  if (!profile.firstName?.trim() || !profile.lastName?.trim() || !profile.dateOfBirth || !profile.gender) return 0
  if (!profile.sexualPreference) return 1
  if (!profile.biography?.trim()) return 2
  if (profile.interests.length === 0) return 3
  if (profile.latitude == null || profile.longitude == null) return 4
  if (!hasProfilePicture(profile)) return 5
  return -1
}

/** Where to resume: the first step with something missing; `STEPS.length` when there is nothing left to do. */
export function resumeStep(profile: OwnProfile): number {
  const gap = firstRequiredGap(profile)
  return gap >= 0 ? gap : STEPS.length
}
