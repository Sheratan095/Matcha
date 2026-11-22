/**
 * Shared by the Me screen and onboarding: labels for the profile enums, completeness checks, and the
 * diff that turns a form draft into the partial `PATCH /profile` body.
 */
import type { Gender, OwnProfile, Profile, ProfileUpdatePayload, SexualPreference, UserPicture } from '@/api/types'
import { checkDateOfBirth, checkName } from '@/features/auth/rules'
import { normaliseTags } from '@/wb'

export const GENDER_OPTIONS: readonly { value: Gender; label: string }[] = [
  { value: 'female', label: 'Woman' },
  { value: 'male', label: 'Man' },
  { value: 'other', label: 'Other' },
]

export const PREFERENCE_OPTIONS: readonly { value: SexualPreference; label: string }[] = [
  { value: 'female', label: 'Women' },
  { value: 'male', label: 'Men' },
  { value: 'both', label: 'Men & women' },
  { value: 'other', label: 'Other' },
]

export const GENDER_LABEL: Record<Gender, string> = { female: 'Woman', male: 'Man', other: 'Other' }

/** As the end of "Into …". */
export const PREFERENCE_LABEL: Record<SexualPreference, string> = {
  female: 'women',
  male: 'men',
  both: 'men & women',
  other: 'other',
}

/** Ids of the Me screen's edit sections, so other parts of the page can jump to them. */
export const SECTION_IDS = {
  names: 'me-names',
  identity: 'me-identity',
  biography: 'me-biography',
  interests: 'me-interests',
  location: 'me-location',
} as const

export function interestNames(profile: Profile): string[] {
  return profile.interests.map((tag) => tag.name)
}

/** The profile picture, or null when there is none (deleting it on the real backend leaves none). */
export function mainPicture(profile: Profile): UserPicture | null {
  return profile.pictures.find((picture) => picture.isProfile) ?? null
}

/** A stable six-digit number for the "№" serial printed on the profile. */
export function serialOf(userId: string): number {
  const hex = userId.replace(/[^0-9a-f]/gi, '').slice(0, 8)
  const value = Number.parseInt(hex || '0', 16)
  return Number.isFinite(value) ? value % 1_000_000 : 0
}

export type CheckKey = 'name' | 'birthday' | 'gender' | 'preference' | 'biography' | 'interests' | 'location' | 'photo'

export interface ProfileCheck {
  key: CheckKey
  /** Short mono label under the meter cell. */
  short: string
  /** What is missing, as a phrase. */
  missing: string
  /** Button text that leads to the fix (≤ 3 words). */
  fix: string
  done: boolean
  /** Required to appear in Discover: every item is (the backend's `profile_is_complete`). */
  required: boolean
}

/** One item per field the backend's `profile_is_complete` checks (`profileComplete` in src/wb/functions.ts). */
export function profileChecks(profile: OwnProfile): ProfileCheck[] {
  return [
    {
      key: 'name',
      short: 'Name',
      missing: 'your first and last name',
      fix: 'Add name',
      done: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
      required: true,
    },
    {
      key: 'birthday',
      short: 'Born',
      missing: 'your date of birth',
      fix: 'Add birthday',
      done: Boolean(profile.dateOfBirth),
      required: true,
    },
    { key: 'gender', short: 'I am', missing: 'your gender', fix: 'Set gender', done: Boolean(profile.gender), required: true },
    {
      key: 'preference',
      short: 'Into',
      missing: 'who you are into',
      fix: 'Set preference',
      done: Boolean(profile.sexualPreference),
      required: true,
    },
    {
      key: 'biography',
      short: 'Bio',
      missing: 'a biography',
      fix: 'Write bio',
      done: Boolean(profile.biography?.trim()),
      required: true,
    },
    { key: 'interests', short: 'Tags', missing: 'an interest', fix: 'Add interests', done: profile.interests.length > 0, required: true },
    {
      key: 'location',
      short: 'Place',
      missing: 'your location',
      fix: 'Set location',
      done: profile.latitude != null && profile.longitude != null,
      required: true,
    },
    {
      key: 'photo',
      short: 'Photo',
      missing: 'a profile photo',
      fix: 'Add photo',
      done: profile.pictures.some((picture) => picture.isProfile),
      required: true,
    },
  ]
}

/** "a, b and c". */
export function listPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// ---------------------------------------------------------------- drafts

/** Every editable profile field, as a form holds it. */
export interface ProfileDraft {
  firstName: string
  lastName: string
  /** 'YYYY-MM-DD'; editable only while the profile has none (set-once: GitHub sign-ups start without). */
  dateOfBirth: string
  gender: Gender | null
  sexualPreference: SexualPreference | null
  biography: string
  interests: string[]
}

export type DraftKey = keyof ProfileDraft

/** A profile a form edits: the own profile carries the date of birth, someone else's does not. */
export type EditableProfile = Profile & { dateOfBirth?: string | null }

export function draftOf(profile: EditableProfile): ProfileDraft {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    dateOfBirth: profile.dateOfBirth ?? '',
    gender: profile.gender,
    sexualPreference: profile.sexualPreference,
    biography: profile.biography ?? '',
    interests: interestNames(profile),
  }
}

/** The date of birth can still be set (PATCH accepts it once, while the profile has none). */
export function canSetDateOfBirth(profile: EditableProfile): boolean {
  return !profile.dateOfBirth
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  const left = normaliseTags([...a]).sort()
  const right = normaliseTags([...b]).sort()
  return left.length === right.length && left.every((tag, i) => tag === right[i])
}

/**
 * The `PATCH /profile` body for the given fields: only what differs from the saved profile, so a
 * step or a section never overwrites what it does not show. Interests are a full replacement list.
 */
export function profileChanges(profile: EditableProfile, draft: ProfileDraft, keys: readonly DraftKey[]): ProfileUpdatePayload {
  const saved = draftOf(profile)
  const body: ProfileUpdatePayload = {}
  for (const key of keys) {
    switch (key) {
      case 'firstName':
      case 'lastName':
        if (draft[key].trim() !== saved[key].trim()) body[key] = draft[key].trim()
        break
      case 'biography':
        if (draft.biography.trim() !== saved.biography.trim()) body.biography = draft.biography.trim()
        break
      case 'gender':
        if (draft.gender && draft.gender !== saved.gender) body.gender = draft.gender
        break
      case 'sexualPreference':
        if (draft.sexualPreference && draft.sexualPreference !== saved.sexualPreference) {
          body.sexualPreference = draft.sexualPreference
        }
        break
      case 'interests':
        if (!sameTags(draft.interests, saved.interests)) body.interests = normaliseTags(draft.interests)
        break
      case 'dateOfBirth':
        // set-once: sent only while the profile has none (the backend answers 409 otherwise)
        if (!saved.dateOfBirth && draft.dateOfBirth.trim()) body.dateOfBirth = draft.dateOfBirth.trim()
        break
    }
  }
  return body
}

export function isEmptyChange(body: ProfileUpdatePayload): boolean {
  return Object.keys(body).length === 0
}

/**
 * Client-side rules, the same as the backend's: names in its format (profiles_*_name_format_check, and
 * both required by `profile_is_complete`), a date of birth of someone 18 to 120 while one can still be
 * set (`saved` is the profile's own draft), the enums, a biography and an interest.
 */
export function draftProblems(
  draft: ProfileDraft,
  keys: readonly DraftKey[],
  saved?: ProfileDraft,
): Partial<Record<DraftKey, string>> {
  const problems: Partial<Record<DraftKey, string>> = {}
  for (const key of keys) {
    if (key === 'firstName' || key === 'lastName') {
      const problem = checkName(draft[key], key === 'firstName' ? 'first' : 'last')
      if (problem) problems[key] = problem
    }
    if (key === 'dateOfBirth' && !saved?.dateOfBirth) {
      const problem = checkDateOfBirth(draft.dateOfBirth)
      if (problem) problems.dateOfBirth = problem
    }
    if (key === 'gender' && !draft.gender) problems.gender = 'Pick the one that fits you best.'
    if (key === 'sexualPreference' && !draft.sexualPreference) problems.sexualPreference = 'Pick who you want to see.'
    if (key === 'biography' && !draft.biography.trim()) problems.biography = 'Write a line or two: it is required to appear in Discover.'
    if (key === 'biography' && draft.biography.length > 500) problems.biography = 'A biography is 500 characters at most.'
    if (key === 'interests' && normaliseTags(draft.interests).length === 0) problems.interests = 'Add at least one interest.'
  }
  return problems
}
