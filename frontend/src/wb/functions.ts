/**
 * Custom functions of the node graph (`CUSTOM_FUNCTION` nodes).
 *
 * Rules that come from how the engine calls them (src/wb/engine/graph.ts, `callFunction`):
 * - arguments arrive in `dep` order (the engine only maps by name when every parameter name equals
 *   a dependency `parameterName`, which a minifier breaks), so parameters are declared in `dep` order;
 * - plain `function` declarations with exactly one simple parameter per dependency: the engine
 *   parses `fn.toString()`, and an extra parameter makes it append a snapshot argument;
 * - synchronous and pure; every input may be `null` (reset / failed) or `undefined` (never loaded).
 */
import type { DeckCard, DiscoverSort, InterestTag, Match, OwnProfile, SessionCheck } from '@/api/types'
import type { FunctionDef } from './types'

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated'

/** The signed-in user's id, or null when anonymous or not yet known. */
export function sessionUserId(check: SessionCheck | null | undefined): string | null {
  return check && check.valid && check.userId ? check.userId : null
}

/**
 * `sessionCheck` is `undefined` until the first probe answers and `null` when a probe failed (the
 * probe trigger has `onUpdate: false`, so it is never `null` merely because it is loading). A failed
 * probe counts as anonymous: the app stays usable and the error is on the node's status.
 */
export function authStatus(check: SessionCheck | null | undefined): AuthStatus {
  if (check === undefined) return 'checking'
  return sessionUserId(check) ? 'authenticated' : 'anonymous'
}

/**
 * What the backend's `profile_is_complete` checks that onboarding asks for: gender, preference, a
 * non-empty biography, at least one interest and a location (without one, discover answers 403).
 * The backend also wants a last name, a date of birth and a profile picture, not checked here yet.
 */
export function profileComplete(profile: OwnProfile | null | undefined): boolean | null {
  if (!profile) return null
  return Boolean(
    profile.gender &&
      profile.sexualPreference &&
      profile.biography?.trim() &&
      profile.interests.length > 0 &&
      profile.latitude != null &&
      profile.longitude != null,
  )
}

/** Nearest first; an unknown distance (no location) last. */
function byDistance(a: DeckCard, b: DeckCard): number {
  return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
}

/**
 * How each order compares two cards. Ties keep the backend's ranking (the sort is stable), so "best"
 * is still the tie-breaker of every other order.
 */
const DECK_ORDER: Record<Exclude<DiscoverSort, 'best'>, (a: DeckCard, b: DeckCard) => number> = {
  distance: byDistance,
  age: (a, b) => a.age - b.age,
  fame: (a, b) => b.fameRating - a.fameRating,
  tags: (a, b) => b.commonTagCount - a.commonTagCount,
}

/**
 * Cards still to show: the loaded deck minus what was swiped in this session, in the chosen order
 * ('best' keeps the backend's ranking). null while there is no deck.
 */
export function visibleDeck(
  deck: DeckCard[] | null | undefined,
  swiped: string[] | null | undefined,
  sort: DiscoverSort | null | undefined,
): DeckCard[] | null {
  if (!deck) return null
  const hidden = new Set(swiped ?? [])
  const left = hidden.size > 0 ? deck.filter((card) => !hidden.has(card.userId)) : [...deck]
  const order = sort && sort !== 'best' ? DECK_ORDER[sort] : undefined
  return order ? left.sort(order) : left
}

/** The tag names in use, alphabetical; null while not loaded. */
export function tagCatalogue(catalogue: { interests: InterestTag[] } | null | undefined): string[] | null {
  if (!catalogue || !Array.isArray(catalogue.interests)) return null
  return catalogue.interests.map((tag) => tag.name).sort((a, b) => a.localeCompare(b))
}

/** Unread messages across all matches; 0 while the matches are not loaded. */
export function unreadCount(matches: Match[] | null | undefined): number {
  if (!matches) return 0
  return matches.reduce((total, match) => total + match.unread, 0)
}

export const FUNCTIONS: FunctionDef[] = [
  { name: 'sessionUserId', implementation: sessionUserId },
  { name: 'authStatus', implementation: authStatus },
  { name: 'profileComplete', implementation: profileComplete },
  { name: 'visibleDeck', implementation: visibleDeck },
  { name: 'tagCatalogue', implementation: tagCatalogue },
  { name: 'unreadCount', implementation: unreadCount },
]
