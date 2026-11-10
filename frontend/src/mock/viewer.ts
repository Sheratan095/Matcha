/**
 * Who is asking, and what the mock knows about them.
 *
 * The viewer is `getViewerId()` (the real session), with a profile *hint* read passively from the
 * real `GET /profile` / `PATCH /profile` responses that pass through the adapter (gender, preference,
 * interests, first name), so discovery can filter by orientation and compute common tags. Without a hint the defaults apply: no orientation filter, no
 * common tags.
 */
import type { Gender, SexualPreference } from '@/api/types'
import { GENDERS, SEXUAL_PREFERENCES } from '@/api/types'
import { runtime } from './runtime'
import { isRecord, isString } from './storage'

export interface Viewer {
  id: string
  firstName: string | null
  gender: Gender | null
  sexualPreference: SexualPreference | null
  /** Interest names. */
  interests: string[]
}

type Hint = Omit<Viewer, 'id'>

const hints = new Map<string, Hint>()

/** Reads what it can from a real profile body; ignores anything that is not one. */
export function rememberProfile(raw: unknown): void {
  if (!isRecord(raw) || !isString(raw.userId) || !Array.isArray(raw.interests)) return
  const gender = GENDERS.find((value) => value === raw.gender) ?? null
  const sexualPreference = SEXUAL_PREFERENCES.find((value) => value === raw.sexualPreference) ?? null
  const interests = raw.interests
    .map((tag: unknown) => (isRecord(tag) && isString(tag.name) ? tag.name : null))
    .filter((name): name is string => name !== null)
  hints.set(raw.userId, {
    firstName: isString(raw.firstName) && raw.firstName ? raw.firstName : null,
    gender,
    sexualPreference,
    interests,
  })
}

export function forgetHints(): void {
  hints.clear()
}

export function currentViewer(): Viewer | null {
  let id: string | null = null
  try {
    id = runtime.options.getViewerId()
  } catch {
    id = null
  }
  if (!id) return null
  const hint = hints.get(id)
  return hint ? { id, ...hint, interests: hint.interests.slice() } : { id, firstName: null, gender: null, sexualPreference: null, interests: [] }
}
