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
import type {
  CalendarResult,
  ChatHistoryResult,
  ChatListResult,
  ConnectionsResult,
  DeckCard,
  DiscoverSort,
  InterestTag,
  Match,
  Message,
  OwnProfile,
  PlannedDate,
  SessionCheck,
} from '@/api/types'
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

/** Sorts the cards in place in the chosen order; 'best' keeps the backend's ranking. */
export function sortCards(cards: DeckCard[], sort: DiscoverSort | null | undefined): DeckCard[] {
  const order = sort && sort !== 'best' ? DECK_ORDER[sort] : undefined
  return order ? cards.sort(order) : cards
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
  return sortCards(left, sort)
}

/** Search results in the chosen order ('best' is the backend's: nearest first). null while there are none. */
export function visibleSearch(results: DeckCard[] | null | undefined, sort: DiscoverSort | null | undefined): DeckCard[] | null {
  if (!results) return null
  return sortCards([...results], sort)
}

/** The tag names in use, alphabetical; null while not loaded. */
export function tagCatalogue(catalogue: { interests: InterestTag[] } | null | undefined): string[] | null {
  if (!catalogue || !Array.isArray(catalogue.interests)) return null
  return catalogue.interests.map((tag) => tag.name).sort((a, b) => a.localeCompare(b))
}

/**
 * Each connection with its conversation (the chat list only has chats that hold a message) and its
 * unread count, in the backend's order. null while the connections are not loaded; a chat list that
 * is missing or failed leaves every conversation without a preview.
 */
export function matches(
  connections: ConnectionsResult | null | undefined,
  chats: ChatListResult | null | undefined,
  unread: Record<string, number> | null | undefined,
): Match[] | null {
  if (!connections || !Array.isArray(connections.matches)) return null
  const chatOf = new Map((Array.isArray(chats?.chats) ? chats.chats : []).map((chat) => [chat.userId, chat]))
  return connections.matches.map((person) => {
    const chat = chatOf.get(person.userId)
    return {
      userId: person.userId,
      username: person.username,
      profilePictureUrl: person.profilePictureUrl ?? null,
      chatId: chat?.chatId ?? null,
      lastMessage: chat ? { text: chat.lastMessage, sentAt: chat.timestamp, senderId: chat.lastSenderId } : null,
      unread: unread?.[person.userId] ?? 0,
    }
  })
}

/** Unread messages across all matches; 0 while the matches are not loaded. */
export function unreadCount(matches: Match[] | null | undefined): number {
  if (!matches) return 0
  return matches.reduce((total, match) => total + match.unread, 0)
}

/** The open conversation's messages as the thread draws them, oldest first; null while not loaded. */
export function chatMessages(history: ChatHistoryResult | null | undefined): Message[] | null {
  if (!history || !Array.isArray(history.messages)) return null
  return history.messages.map((message) => ({
    id: message.messageId,
    senderId: message.userId,
    text: message.content,
    sentAt: message.timestamp,
    status: message.status,
  }))
}

/**
 * The calendar as it is drawn: each event's times parsed and its other person found among the
 * connections (dates only exist between connected people; one not listed yet gets an empty username),
 * earliest first. An event whose times do not parse is left out. null while the calendar or the
 * signed-in user is not known.
 */
export function dates(
  calendar: CalendarResult | null | undefined,
  connections: ConnectionsResult | null | undefined,
  me: string | null | undefined,
): PlannedDate[] | null {
  if (!calendar || !Array.isArray(calendar.events) || !me) return null
  const people = new Map((Array.isArray(connections?.matches) ? connections.matches : []).map((person) => [person.userId, person]))
  const planned: PlannedDate[] = []
  for (const event of calendar.events) {
    const startsAt = Date.parse(event.startTime)
    const endsAt = Date.parse(event.endTime)
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) continue
    const mine = event.inviterId === me
    const otherId = mine ? event.inviteeId : event.inviterId
    const known = people.get(otherId)
    const createdAt = typeof event.createdAt === 'string' ? Date.parse(event.createdAt) : Number.NaN
    planned.push({
      id: event.eventId,
      title: event.title,
      description: event.description?.trim() ? event.description : null,
      startsAt,
      endsAt,
      plannedAt: Number.isNaN(createdAt) ? null : createdAt,
      status: event.status,
      mine,
      person: {
        userId: otherId,
        username: known?.username ?? '',
        profilePictureUrl: known?.profilePictureUrl ?? null,
      },
      place:
        typeof event.latitude === 'number' && typeof event.longitude === 'number'
          ? { latitude: event.latitude, longitude: event.longitude }
          : null,
    })
  }
  return planned.sort((a, b) => a.startsAt - b.startsAt)
}

export const FUNCTIONS: FunctionDef[] = [
  { name: 'sessionUserId', implementation: sessionUserId },
  { name: 'authStatus', implementation: authStatus },
  { name: 'profileComplete', implementation: profileComplete },
  { name: 'visibleDeck', implementation: visibleDeck },
  { name: 'visibleSearch', implementation: visibleSearch },
  { name: 'tagCatalogue', implementation: tagCatalogue },
  { name: 'matches', implementation: matches },
  { name: 'unreadCount', implementation: unreadCount },
  { name: 'chatMessages', implementation: chatMessages },
  { name: 'dates', implementation: dates },
]
