/** Small, pure helpers shared by the deck and the profile sheet. */
import type { DeckCard, Gender, OtherProfile, Profile, ProfileRelation, SexualPreference, UserPicture, UserSummary } from '@/api/types'
import { dateFormat, t, type MessageKey } from '@/i18n'

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
  return name ? name : t('toast.someone')
}

/** "Alice" (the first name), else the username. */
export function cardName(card: Pick<DeckCard, 'firstName' | 'username'>): string {
  return card.firstName?.trim() || card.username
}

/**
 * What a list entry already tells about someone (username, picture), shaped as a profile: shown at
 * once while `GET /profile/{userId}` loads the rest. Without a known relation, the sheet waits for the
 * full profile before offering to like.
 */
export function summaryPreviewProfile(person: UserSummary, relation?: ProfileRelation): OtherProfile {
  return {
    userId: person.userId,
    username: person.username,
    firstName: null,
    lastName: null,
    gender: null,
    sexualPreference: null,
    biography: null,
    interests: [],
    pictures: person.profilePictureUrl ? [{ id: `preview-${person.userId}`, url: person.profilePictureUrl, isProfile: true }] : [],
    createdAt: '',
    updatedAt: '',
    relation,
  }
}

/**
 * What a deck card already tells about someone, shaped as a profile: shown at once while
 * `GET /profile/{userId}` loads the rest (bio, every picture, interests, presence).
 */
export function deckPreviewProfile(card: DeckCard): OtherProfile {
  return {
    ...summaryPreviewProfile(card, { liked: false, likesYou: card.likesYou === true, matched: false }),
    firstName: card.firstName,
    age: card.age,
    fameRating: card.fameRating,
    distanceKm: card.distanceKm,
  }
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
  return t('deck.kmValue', { n: km < 1 ? '<1' : Math.round(km) })
}

/** "Last seen 5 min ago"; null when unknown. */
export function lastSeenText(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 1) return t('prof.seenNow')
  if (minutes < 60) return t('prof.seenMin', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('prof.seenHours', { n: hours })
  const days = Math.round(hours / 24)
  if (days < 7) return t('prof.seenDays', { n: days })
  return t('prof.seenDate', { date: dateFormat({ day: 'numeric', month: 'short' }).format(new Date(at)) })
}

const GENDER: Record<Gender, MessageKey> = { female: 'prof.genderFemale', male: 'prof.genderMale', other: 'prof.genderOther' }
const INTO: Record<SexualPreference, MessageKey> = {
  female: 'prof.intoFemale',
  male: 'prof.intoMale',
  both: 'prof.intoBoth',
  other: 'prof.intoOther',
}

/** "Woman · into men"; null when neither is set. */
export function identityText(profile: Pick<Profile, 'gender' | 'sexualPreference'>): string | null {
  const parts = [profile.gender ? t(GENDER[profile.gender]) : null, profile.sexualPreference ? t(INTO[profile.sexualPreference]) : null]
  const text = parts.filter(Boolean).join(' · ')
  return text || null
}
