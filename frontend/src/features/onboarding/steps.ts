/** The onboarding steps, and where a returning user resumes. */
import type { Profile } from '@/api/types'
import type { DraftKey } from '@/features/me/profile'
import type { Tone } from '@/ui'

export type StepKey = 'about' | 'into' | 'bio' | 'interests' | 'photos'

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
    fields: ['firstName', 'lastName', 'gender'],
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
    key: 'photos',
    label: 'Photos',
    poster: 'Smile',
    tone: 'matcha',
    fields: [],
    title: ['Strike a', 'pose'],
    lead: 'Up to five photos. Optional, but a face gets a lot more right swipes than a poster.',
  },
]

export const STEP_LABELS: readonly string[] = STEPS.map((step) => step.label)

/** Index of the first step whose required content is missing. */
export function firstRequiredGap(profile: Profile): number {
  if (!profile.firstName?.trim() || !profile.gender) return 0
  if (!profile.sexualPreference) return 1
  if (!profile.biography?.trim()) return 2
  if (profile.interests.length === 0) return 3
  return -1
}

/**
 * Where to resume: the first step with something missing; the photos step while there is no photo;
 * `STEPS.length` when there is nothing left to do.
 */
export function resumeStep(profile: Profile): number {
  const gap = firstRequiredGap(profile)
  if (gap >= 0) return gap
  return profile.pictures.length === 0 ? STEPS.length - 1 : STEPS.length
}
