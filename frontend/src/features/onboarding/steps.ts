/** The onboarding steps, and where a returning user resumes. */
import type { OwnProfile } from '@/api/types'
import type { DraftKey } from '@/features/me/profile'
import type { Tone } from '@/ui'

export type StepKey = 'about' | 'into' | 'bio' | 'interests' | 'location' | 'photos'

export interface StepDef {
  key: StepKey
  /** Name in the punch card. */
  label: string
  /** The giant word in the margin on wide screens. */
  poster: string
  /** Accent drum of the step: misregistered plate, numeral, chosen chips. */
  tone: Tone
  /** The fields this step saves (a partial PATCH of just these). */
  fields: readonly DraftKey[]
  title: readonly [string, string]
  lead: string
}

export const STEPS: readonly StepDef[] = [
  {
    key: 'about',
    label: 'About you',
    poster: 'Hello',
    tone: 'matcha',
    // dateOfBirth only reaches the PATCH when the profile has none yet (a GitHub sign-up): it is set-once
    fields: ['firstName', 'lastName', 'dateOfBirth', 'gender'],
    title: ['Nice to', 'meet you'],
    lead: 'Your first name goes on your card. You can change all of this later.',
  },
  {
    key: 'into',
    label: 'Into',
    poster: 'Crush',
    tone: 'strawberry',
    fields: ['sexualPreference'],
    title: ['Who’s your', 'cup of tea?'],
    lead: 'Discover deals you the people who fit, and shows you to them.',
  },
  {
    key: 'bio',
    label: 'Bio',
    poster: 'Story',
    tone: 'yolk',
    fields: ['biography'],
    title: ['Spill the', 'tea'],
    lead: 'A few lines about you. Short and true beats long and polished.',
  },
  {
    key: 'interests',
    label: 'Interests',
    poster: 'Taste',
    tone: 'blue',
    fields: ['interests'],
    title: ['Pick your', 'flavours'],
    lead: 'Shared interests are printed first on cards, on both sides. One at least.',
  },
  {
    key: 'location',
    label: 'Location',
    poster: 'Here',
    tone: 'strawberry',
    // Saved on its own (PUT /profile/location), not through the profile PATCH.
    fields: [],
    title: ['Where do', 'you brew?'],
    lead: 'Discover deals you people nearby. Others see how far away you are, never where.',
  },
  {
    key: 'photos',
    label: 'Photos',
    poster: 'Smile',
    tone: 'matcha',
    fields: [],
    title: ['Strike a', 'pose'],
    lead: 'Up to five photos. One at least: without a photo you stay out of the deck and cannot like anyone.',
  },
]

export const STEP_LABELS: readonly string[] = STEPS.map((step) => step.label)

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
