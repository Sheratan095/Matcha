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
import type { Card, Match, Profile, SessionCheck } from '@/api/types'
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

/** Same rule as the backend: gender, preference, a non-empty biography and at least one interest. */
export function profileComplete(profile: Profile | null | undefined): boolean | null {
  if (!profile) return null
  return Boolean(
    profile.gender && profile.sexualPreference && profile.biography?.trim() && profile.interests.length > 0,
  )
}

/** Cards still to show: the loaded deck minus what was swiped in this session. null while there is no deck. */
export function visibleDeck(deck: Card[] | null | undefined, swiped: string[] | null | undefined): Card[] | null {
  if (!deck) return null
  if (!swiped || swiped.length === 0) return deck
  const hidden = new Set(swiped)
  return deck.filter((card) => !hidden.has(card.userId))
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
  { name: 'unreadCount', implementation: unreadCount },
]
