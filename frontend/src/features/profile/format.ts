/** Small, pure helpers shared by the deck and the profile sheet. */
import type { Card, Gender, Profile, SexualPreference, UserPicture } from '@/api/types'

/** The profile picture, else the first one, else null. */
export function mainPicture(profile: Pick<Profile, 'pictures'> | null | undefined): UserPicture | null {
  if (!profile) return null
  return profile.pictures.find((picture) => picture.isProfile) ?? profile.pictures[0] ?? null
}

/** Pictures with the profile picture first (the order a carousel should show them in). */
export function orderedPictures(profile: Pick<Profile, 'pictures'>): UserPicture[] {
  const main = mainPicture(profile)
  if (!main) return []
  return [main, ...profile.pictures.filter((picture) => picture !== main)]
}

export function displayName(profile: Pick<Profile, 'firstName'> | null | undefined): string {
  const name = profile?.firstName?.trim()
  return name ? name : 'Someone'
}

/** True when the value carries the social extras (age, city, fame...), not only the real profile. */
export function isCard(profile: Profile | Card): profile is Card {
  return 'age' in profile && typeof (profile as Card).age === 'number'
}

/** A stable 4-digit "print run" number for a person, printed in ticket strips. */
export function serialOf(userId: string): number {
  let hash = 2166136261
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return 1000 + ((hash >>> 0) % 9000)
}

export function distanceText(km: number): string {
  return km < 1 ? '<1 km' : `${Math.round(km)} km`
}

/** "Last seen 5 min ago"; null when unknown. */
export function lastSeenText(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 1) return 'Last seen just now'
  if (minutes < 60) return `Last seen ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `Last seen ${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `Last seen ${days} d ago`
  return `Last seen ${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

const GENDER: Record<Gender, string> = { female: 'Woman', male: 'Man', other: 'Non-binary' }
const INTO: Record<SexualPreference, string> = {
  female: 'into women',
  male: 'into men',
  both: 'into everyone',
  other: 'open-minded',
}

/** "Woman · into men"; null when neither is set. */
export function identityText(profile: Pick<Profile, 'gender' | 'sexualPreference'>): string | null {
  const parts = [profile.gender ? GENDER[profile.gender] : null, profile.sexualPreference ? INTO[profile.sexualPreference] : null]
  const text = parts.filter(Boolean).join(' · ')
  return text || null
}

/** "Alice, 27" / "Alice". */
export function nameAndAge(profile: Profile | Card): string {
  const name = displayName(profile)
  return isCard(profile) ? `${name}, ${profile.age}` : name
}
