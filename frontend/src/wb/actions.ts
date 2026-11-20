/**
 * The flows screens call (docs/ARCHITECTURE.md §4.6). Each one composes `run`, node writes and
 * `refresh` so that, when its promise settles, the nodes that depend on what it changed are fresh:
 * screens never orchestrate nodes by hand.
 *
 * Conventions:
 * - async actions reject with an `ApiError` (from the backend, or a local one: INVALID for input
 *   rejected before sending, NOT_SENT when the store is not running);
 * - an action rejects only when its own request fails: a follow-up refresh that fails does not undo a
 *   successful mutation, its error is on `useNodeStatus(<node>)`;
 * - ids that end up in a URL path are checked to be URL-safe, because the engine inserts path values
 *   without encoding them.
 */
import { apiError, LOCAL_ERROR, renewSession, toApiError } from '@/api/http'
import {
  GENDERS,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  MAX_PICTURE_BYTES,
  MAX_USER_PICTURES,
  PICTURE_MIME_TYPES,
  SEXUAL_PREFERENCES,
  type CalendarAction,
  type CalendarEvent,
  type ChatMessage,
  type Coordinates,
  type CreateEventPayload,
  type DeckAction,
  type DeckCard,
  type LoginPayload,
  type LocationPayload,
  type LoginResult,
  type Message,
  type MessageResult,
  type OtherProfile,
  type OwnProfile,
  type PicturesResult,
  type ProfileUpdatePayload,
  type RegisterPayload,
  type RegisterResult,
  type ResetPasswordPayload,
  type VerifyEmailResult,
} from '@/api/types'
import { API_URL } from '@/config'
import { awaitLoad, awaitPending, refresh, reload, run } from './commands'
import { closeGates, markStale } from './demand'
import {
  currentFilters,
  DEFAULT_DISCOVER_FILTERS,
  filtersProblem,
  normaliseTags,
  writeFilters,
  type DiscoverFilters,
} from './filters'
import type { AuthStatus } from './functions'
import { clearNotifications } from './notifications'
import {
  currentSearch,
  EMPTY_SEARCH,
  hasSearchCriteria,
  normaliseQuery,
  pickKnown,
  searchProblem,
  writeSearch,
  type SearchCriteria,
} from './search'
import { firstTimeForStore, getNodeStatus, getNodeValue, isStoreLive, node$, onStoreStop, setNode, writeNode } from './store'

export const MAX_MESSAGE_LENGTH = 1000

// ---------------------------------------------------------------- helpers

function invalid(message: string): never {
  throw apiError(0, message, LOCAL_ERROR.INVALID)
}

const URL_SAFE = /^[A-Za-z0-9._~-]+$/

/** The engine puts path values into the URL raw: refuse anything that would change its shape. */
function pathId(value: string, what: string): string {
  if (typeof value !== 'string' || !URL_SAFE.test(value)) invalid(`Invalid ${what}.`)
  return value
}

async function probeSession(): Promise<void> {
  const error = await reload('sessionCheck')
  if (error) throw error
}

function hideFromDeck(userId: string): void {
  const swiped = getNodeValue('swipedIds') ?? []
  if (!swiped.includes(userId)) setNode('swipedIds', [...swiped, userId])
}

function unhideFromDeck(userId: string): void {
  const swiped = getNodeValue('swipedIds') ?? []
  if (swiped.includes(userId)) setNode('swipedIds', swiped.filter((id) => id !== userId))
}

/** This session's deck swipes, newest last: what `rewind` can take back. */
interface SwipeRecord {
  card: DeckCard
  action: DeckAction
  matched: boolean
}
const swipeHistory: SwipeRecord[] = []
const MAX_SWIPE_HISTORY = 50
/** Deck swipes whose request has not answered yet: their cards stay hidden, whatever reloads. */
const swipesInFlight = new Set<string>()

/** Bumped by every open and close of a conversation: an `openChat` that was overtaken stops there. */
let chatTicket = 0

/**
 * Forgets the `?after=` cursor of the last thread, without fetching: the cursor is written while no
 * conversation is open (a write of `chatAfter` fetches the open one).
 */
function resetChatCursor(): void {
  if (getNodeValue('chatAfter') == null) return
  if (getNodeValue('activeChatId') != null) setNode('activeChatId', null)
  writeNode('chatAfter', null)
}

function closeChat(): void {
  chatTicket += 1
  setNode('activeChatId', null)
  setNode('activeChatUserId', null)
  resetChatCursor()
}

/** Bumped by every open of a profile: it cancels a close scheduled before it. */
let profileTicket = 0

function closeProfileNow(): void {
  profileTicket += 1
  setNode('apiProfileId', null)
}

/**
 * Closes the open profile once the current task is over, unless a profile opens meanwhile: a sheet
 * that StrictMode closes and reopens at once, or that moves on to another person, keeps its request
 * (the conversation does the same in src/features/chat/ChatPage.tsx).
 */
function closeProfile(): void {
  profileTicket += 1
  const ticket = profileTicket
  setTimeout(() => {
    if (ticket === profileTicket && isStoreLive()) setNode('apiProfileId', null)
  }, 0)
}

/** Selection state belongs to one signed-in user: clear it when the user changes or signs out. */
function resetSessionState(): void {
  closeChat()
  closeProfileNow()
  closeGates()
  setNode('unreadByUser', {})
  writeSearch(EMPTY_SEARCH)
  setNode('swipedIds', [])
  swipeHistory.length = 0
  writeFilters({ ...DEFAULT_DISCOVER_FILTERS, tags: [] })
}

// ---------------------------------------------------------------- own connection changes

type ConnectionEvent = 'match' | 'unmatch'

interface OwnChange {
  /** The backend's push about it arrived while the request was on its way. */
  echoed: boolean
}

/**
 * Connection changes this client has in flight, by `event:userId`. The backend pushes `match` /
 * `unmatch` to BOTH people, the one acting included, before it answers the request: realtime hands
 * such an echo to `claimEcho` instead of refreshing the connection lists, because the action refreshes
 * them itself once its request settles (one refresh, not two).
 */
const ownChanges = new Map<string, OwnChange[]>()

function beginOwnChange(event: ConnectionEvent, userId: string): OwnChange & { end(): void } {
  const key = `${event}:${userId}`
  const change: OwnChange = { echoed: false }
  ownChanges.set(key, [...(ownChanges.get(key) ?? []), change])
  return {
    get echoed() {
      return change.echoed
    },
    end() {
      const left = (ownChanges.get(key) ?? []).filter((entry) => entry !== change)
      if (left.length > 0) ownChanges.set(key, left)
      else ownChanges.delete(key)
    },
  }
}

/**
 * For realtime: true when a `match` / `unmatch` about `userId` is the echo of a change this client has
 * in flight. The caller then leaves the refreshes to that action.
 */
export function claimEcho(event: ConnectionEvent, userId: string): boolean {
  const change = ownChanges.get(`${event}:${userId}`)?.find((entry) => !entry.echoed)
  if (!change) return false
  change.echoed = true
  return true
}

/**
 * Like `claimEcho`, but only looks: true when a `match` / `unmatch` about `userId` is the echo of a
 * change this client has in flight, without claiming it. For whoever sees the event before realtime
 * reacts to it (the toasts and the notification feed, which skip the echo of the user's own unlike).
 */
export function isOwnChange(event: ConnectionEvent, userId: string): boolean {
  return ownChanges.get(`${event}:${userId}`)?.some((entry) => !entry.echoed) ?? false
}

/** Whether `userId` is among the connections; true when they are not loaded (refresh rather than miss it). */
function isConnection(userId: string): boolean {
  const connections = getNodeValue('connections')
  return connections ? connections.matches.some((person) => person.userId === userId) : true
}

/** Whether `userId` is in "likes you"; true when it is not loaded. */
function likesMe(userId: string): boolean {
  const likes = getNodeValue('likesReceived')
  return likes ? likes.likes.some((person) => person.userId === userId) : true
}

function profileUpdateBody(changes: ProfileUpdatePayload): ProfileUpdatePayload {
  const body: ProfileUpdatePayload = {}
  if (changes.firstName !== undefined) body.firstName = changes.firstName.trim()
  if (changes.lastName !== undefined) body.lastName = changes.lastName.trim()
  if (changes.gender !== undefined) body.gender = changes.gender
  if (changes.sexualPreference !== undefined) body.sexualPreference = changes.sexualPreference
  if (changes.biography !== undefined) body.biography = changes.biography
  // A full replacement list; duplicates after lowercasing make the backend answer 500.
  if (changes.interests !== undefined) body.interests = normaliseTags(changes.interests)
  return body
}

/**
 * Installed by `bootSession`, once per store: selection state is reset when the signed-in user
 * changes or signs out. (The backend creates the profile row at sign-up, GitHub included.)
 */
function watchSession(): void {
  if (!firstTimeForStore('session-watch')) return
  // A new store is a new session: nothing swiped before it can be rewound.
  swipeHistory.length = 0
  let user: string | null = null
  let first = true
  const users = node$('sessionUserId').subscribe((value) => {
    const previous = user
    user = value ?? null
    if (first) {
      first = false
      return
    }
    if (previous !== null && user !== previous) resetSessionState()
  })
  onStoreStop(() => users.unsubscribe())
}

/** Messages of both lists, one per id (the newer copy wins: its status may have changed), oldest first. */
function mergeMessages(held: readonly ChatMessage[], fresh: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(held.map((message) => [message.messageId, message]))
  for (const message of fresh) byId.set(message.messageId, message)
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/**
 * Installed by `bootSession`, once per store: `chatThread` is the open conversation, whole. An answer
 * to `?after=` (`chatAfter` set) is merged into it; a whole history replaces it; another conversation
 * (or none) starts it again from nothing.
 */
function watchChat(): void {
  if (!firstTimeForStore('chat-watch')) return
  const answers = node$('chatHistory').subscribe((history) => {
    if (!history || !Array.isArray(history.messages)) return
    const held = getNodeValue('chatThread')?.messages
    const delta = getNodeValue('chatAfter') != null
    writeNode('chatThread', { messages: delta && held ? mergeMessages(held, history.messages) : history.messages })
  })
  let open: string | null = null
  const chats = node$('activeChatId').subscribe((chatId) => {
    const next = chatId ?? null
    if (next === open) return
    open = next
    if (getNodeValue('chatThread') != null) writeNode('chatThread', null)
  })
  onStoreStop(() => {
    answers.unsubscribe()
    chats.unsubscribe()
  })
}

// ---------------------------------------------------------------- session

/**
 * Probes the session (`GET /auth/validate`) and resolves with the resulting status. Called once at
 * boot; also picks up a session created by the GitHub OAuth redirect.
 */
async function bootSession(): Promise<AuthStatus> {
  watchSession()
  watchChat()
  await renewSession().catch(() => undefined)
  await probeSession()
  return getNodeValue('authStatus') ?? 'anonymous'
}

/** Signs in, then re-probes: resolves once `sessionUserId` is set (authenticated reads start loading). */
async function login(credentials: LoginPayload): Promise<LoginResult> {
  const result = await run('login', { username: credentials.username, password: credentials.password })
  await probeSession()
  if (getNodeValue('sessionUserId') == null) {
    throw apiError(
      0,
      'Signed in, but the browser kept no session. Open the app on http://localhost:4000 (not 127.0.0.1 or another port) and allow cookies.',
      LOCAL_ERROR.NO_SESSION,
    )
  }
  return result
}

/**
 * Signs out, then re-probes: resolves once the session is gone (authenticated nodes reset to null).
 * `POST /auth/logout` is guarded: a 401 (after the HTTP layer's refresh attempt failed too) means the
 * session was already over, e.g. expired, or its refresh token replaced by a sign-in on another device
 * (one per user). That is the outcome a sign-out wants, so it is not an error.
 */
async function logout(): Promise<void> {
  try {
    await run('logout')
  } catch (thrown) {
    if (toApiError(thrown).status !== 401) throw thrown
  }
  // the feed is kept in this browser: signing out takes it away (a session that merely expires keeps it)
  clearNotifications()
  await probeSession()
}

/** Creates an account. The user is not signed in afterwards: the email must be verified first. */
function register(payload: RegisterPayload): Promise<RegisterResult> {
  const body: RegisterPayload = {
    username: payload.username.trim(),
    email: payload.email.trim(),
    password: payload.password,
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    dateOfBirth: payload.dateOfBirth.trim(),
  }
  if (payload.language) body.language = payload.language
  return run('register', body)
}

/** Submits the token from the email link (or typed as a code). Also completes an email change. */
function verifyEmail(token: string): Promise<VerifyEmailResult> {
  return run('verifyEmail', { token: token.trim() })
}

function forgotPassword(email: string): Promise<MessageResult> {
  return run('forgotPassword', { email: email.trim() })
}

function resetPassword(payload: ResetPasswordPayload): Promise<MessageResult> {
  return run('resetPassword', { token: payload.token.trim(), password: payload.password })
}

/** Starts an email change; it completes when the token mailed to the new address is verified. */
function changeEmail(newEmail: string): Promise<MessageResult> {
  return run('changeEmail', { newEmail: newEmail.trim() })
}

/**
 * Leaves the app for GitHub (a top-level navigation, not a request). The backend redirects back to `/`
 * with the session cookies set, and the boot-time probe picks the session up.
 */
function startGithubLogin(): void {
  window.location.assign(`${API_URL}/auth/github`)
}

// ---------------------------------------------------------------- own profile

/** Applies the given fields; resolves once `myProfile` (and `profileComplete`) reflect them. */
async function updateProfile(changes: ProfileUpdatePayload): Promise<OwnProfile> {
  const body = profileUpdateBody(changes)
  const profile = await run('profileUpdate', body)
  await refresh('myProfile')
  // The deck is filtered by the viewer's gender / preference and lists common interests.
  if (body.gender !== undefined || body.sexualPreference !== undefined || body.interests !== undefined) {
    void refresh('discoverDeck')
  }
  return profile
}

/**
 * Stores the viewer's position (`PUT /profile/location`, full precision; others only get a distance
 * from a ~1 km-snapped copy). Resolves once `myProfile` (and `profileComplete`) have it.
 */
async function setLocation(spot: LocationPayload): Promise<void> {
  const { latitude, longitude } = spot
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) invalid('Latitude must be between -90 and 90')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) invalid('Longitude must be between -180 and 180')
  await run('locationUpdate', { latitude, longitude })
  await refresh('myProfile')
  // Distances on the cards are measured from here.
  void refresh('discoverDeck')
}

/** Uploads one picture (JPEG / PNG / WEBP, 5 MB, 5 pictures at most); resolves once `myProfile` has it. */
async function uploadPicture(file: Blob): Promise<PicturesResult> {
  if (!PICTURE_MIME_TYPES.includes(file.type)) invalid('Only JPEG, PNG and WEBP images are allowed')
  if (file.size > MAX_PICTURE_BYTES) invalid('File too large: 5 MB at most')
  const count = getNodeValue('myProfile')?.pictures.length ?? 0
  if (count >= MAX_USER_PICTURES) invalid(`You can upload at most ${MAX_USER_PICTURES} pictures`)
  const form = new FormData()
  form.append('file', file, file instanceof File ? file.name : 'picture')
  const result = await run('pictureUpload', form)
  await refresh('myProfile')
  return result
}

async function deletePicture(pictureId: string): Promise<PicturesResult> {
  const result = await run('pictureDelete', pathId(pictureId, 'picture id'))
  await refresh('myProfile')
  return result
}

/** Makes this picture the profile picture (deleting the main picture leaves none: offer this). */
async function setMainPicture(pictureId: string): Promise<PicturesResult> {
  const result = await run('pictureMain', pathId(pictureId, 'picture id'))
  await refresh('myProfile')
  return result
}

/**
 * Opens a real user's profile (`GET /profile/{id}`; records a profile view). Resolves with it. Asked
 * again for the profile that is loading (a sheet StrictMode re-mounted), it waits for that request
 * instead of sending (and recording) another.
 */
async function showApiProfile(userId: string): Promise<OtherProfile> {
  pathId(userId, 'user id')
  profileTicket += 1
  const same = getNodeValue('apiProfileId') === userId
  const loaded = getNodeValue('apiProfile')
  if (same && loaded?.userId === userId) return loaded
  const outcome =
    same && getNodeStatus('apiProfile').status === 'loading'
      ? await awaitPending('apiProfile')
      : await awaitLoad('apiProfile', () => setNode('apiProfileId', userId))
  if (outcome.error) throw outcome.error
  const profile = getNodeValue('apiProfile')
  if (!profile) throw apiError(0, 'The profile could not be loaded.', LOCAL_ERROR.NOT_SENT)
  if (profile.userId !== userId) throw apiError(0, 'Another profile was opened meanwhile.', LOCAL_ERROR.DROPPED)
  // the visit is recorded: the visit history is out of date (refetched when it is shown next)
  markStale('visitedProfiles')
  return profile
}

// ---------------------------------------------------------------- discover

/**
 * Changes some filters. The sort applies at once (no request); the other filters reload the deck with
 * one request for the lot. Resolves once `visibleDeck` reflects them.
 */
async function setFilters(changes: Partial<DiscoverFilters>): Promise<void> {
  const current = currentFilters()
  const next: DiscoverFilters = {
    ...current,
    ...changes,
    tags: changes.tags !== undefined ? normaliseTags(changes.tags) : current.tags,
  }
  const problem = filtersProblem(next)
  if (problem) invalid(problem)
  const outcome = await awaitLoad('discoverDeck', () => writeFilters(next))
  if (outcome.error) throw outcome.error
}

/** What a like or a pass did. */
export interface SwipeOutcome {
  /** The like completed a match (always false for a pass). */
  matched: boolean
}

/**
 * A like or a pass. Whether a like made a match: what the answer says; when it says nothing (the
 * backend answers an empty body), the `match` it pushed to us while the like was on its way; without
 * that either (no socket), whether they had liked us first (`theyLikeMe`), which is what makes a match.
 */
async function sendSwipe(userId: string, action: DeckAction, theyLikeMe: boolean): Promise<SwipeOutcome> {
  if (action === 'pass') {
    await run('pass', userId)
    return { matched: false }
  }
  const change = beginOwnChange('match', userId)
  try {
    const answer = await run('like', userId)
    const said = typeof answer?.matched === 'boolean' ? answer.matched : null
    return { matched: said ?? (change.echoed || theyLikeMe) }
  } finally {
    change.end()
  }
}

/** A like made a match: the lists that show connections reload, and they leave "likes you". */
function onMatched(): void {
  refreshConnections()
  void refresh('likesReceived')
}

/**
 * Likes or passes on a deck card (`POST /profile/{userId}/like | pass`). It leaves `visibleDeck` at
 * once and comes back if the request fails (e.g. 403: no profile picture yet). When the last card is
 * gone and no swipe is still on its way, the deck is fetched again for anyone new; the people passed
 * on in this session stay hidden until `reloadDeck` (so an empty deck can say "that's everyone").
 */
async function swipe(card: DeckCard, action: DeckAction): Promise<SwipeOutcome> {
  const userId = pathId(card.userId, 'user id')
  hideFromDeck(userId)
  swipesInFlight.add(userId)
  let outcome: SwipeOutcome
  try {
    outcome = await sendSwipe(userId, action, card.likesYou === true)
  } catch (error) {
    unhideFromDeck(userId)
    throw error
  } finally {
    swipesInFlight.delete(userId)
  }
  swipeHistory.push({ card, action, matched: outcome.matched })
  if (swipeHistory.length > MAX_SWIPE_HISTORY) swipeHistory.shift()
  if (outcome.matched) onMatched()
  if (swipesInFlight.size === 0 && getNodeValue('visibleDeck')?.length === 0) await reload('discoverDeck')
  return outcome
}

/** What `rewind` brought back. */
export interface RewindOutcome {
  /** The card whose swipe was undone; null when there was nothing to undo. */
  restored: DeckCard | null
  /** The last swipe made a match, which is not undone (unlike from the profile instead). */
  matched: boolean
}

/**
 * Takes back the last deck swipe: a pass is only hidden in this session, a like is removed
 * (`DELETE /profile/{userId}/like`). A like that made a match is not undone. The card goes back on
 * top of the loaded deck (a sort other than 'best' puts it where it belongs).
 */
async function rewind(): Promise<RewindOutcome> {
  const last = swipeHistory[swipeHistory.length - 1]
  if (!last) return { restored: null, matched: false }
  if (last.matched) return { restored: null, matched: true }
  const userId = pathId(last.card.userId, 'user id')
  if (last.action === 'like') await run('unlike', userId)
  swipeHistory.pop()
  const deck = getNodeValue('discoverDeck')
  if (deck) writeNode('discoverDeck', [last.card, ...deck.filter((card) => card.userId !== userId)])
  unhideFromDeck(userId)
  if (!deck) await reload('discoverDeck')
  return { restored: last.card, matched: false }
}

/**
 * Fetches the deck again with the current filters. Everyone passed on in this session comes back (at
 * the bottom: the server ranks them last), so nothing is left to rewind. Cards whose swipe is still
 * on its way stay hidden (a like not yet stored would otherwise come back).
 */
async function reloadDeck(): Promise<void> {
  setNode('swipedIds', (getNodeValue('swipedIds') ?? []).filter((id) => swipesInFlight.has(id)))
  swipeHistory.length = 0
  const error = await reload('discoverDeck')
  if (error) throw error
}

/** A connection was made or broken: the lists that show connections reload (in the background). */
function refreshConnections(): void {
  void refresh('connections')
  void refresh('chatList')
  void refresh('matchesMap')
}

/**
 * Whether `calendar` (the loaded one by default) holds a date with `userId`; true when it is not loaded
 * (refresh rather than miss it).
 */
export function hasDatesWith(userId: string, calendar = getNodeValue('calendar')): boolean {
  return calendar ? calendar.events.some((event) => event.inviterId === userId || event.inviteeId === userId) : true
}

/**
 * Someone left your connections: their conversation closes if it is open, their unread count goes, and
 * the dates with them are gone (the backend deletes them with the match).
 */
function forgetConnection(userId: string): void {
  if (getNodeValue('activeChatUserId') === userId) closeChat()
  clearUnread(userId)
  refreshConnections()
  if (hasDatesWith(userId)) void refresh('calendar')
}

/**
 * A like or pass from an opened profile: the deck's requests, without its bookkeeping. `likes` is the
 * reload of "likes you" it starts (liking back or passing on someone who liked you takes them off it).
 */
async function swipeUser(userId: string, action: DeckAction): Promise<{ outcome: SwipeOutcome; likes: Promise<void> }> {
  const id = pathId(userId, 'user id')
  const wasLikingMe = likesMe(id)
  const outcome = await sendSwipe(id, action, wasLikingMe && getNodeValue('likesReceived') != null)
  hideFromDeck(id)
  if (outcome.matched) refreshConnections()
  return { outcome, likes: outcome.matched || wasLikingMe ? refresh('likesReceived') : Promise.resolve() }
}

/** Likes or passes on someone from their opened profile. */
async function likeUser(userId: string, action: DeckAction): Promise<SwipeOutcome> {
  return (await swipeUser(userId, action)).outcome
}

/**
 * Takes a like back (`DELETE /profile/{userId}/like`). Between connected users it disconnects them:
 * the backend deletes the chat, an open conversation with them closes, and they are back in "likes
 * you" (their like stays).
 */
async function unlikeUser(userId: string): Promise<void> {
  const id = pathId(userId, 'user id')
  const change = beginOwnChange('unmatch', id)
  try {
    await run('unlike', id)
  } finally {
    change.end()
  }
  if (change.echoed || isConnection(id)) {
    forgetConnection(id)
    void refresh('likesReceived')
  }
  for (let i = swipeHistory.length - 1; i >= 0; i--) {
    if (swipeHistory[i].card.userId === id) swipeHistory.splice(i, 1)
  }
}

/** Blocks a user (`POST /profile/{userId}/block`): mutual, ends a connection, they leave every list. */
async function blockUser(userId: string): Promise<void> {
  const id = pathId(userId, 'user id')
  const change = beginOwnChange('unmatch', id)
  const lists = { connected: isConnection(id), likesMe: likesMe(id) }
  try {
    await run('blockUser', id)
  } finally {
    change.end()
  }
  hideFromDeck(id)
  if (change.echoed || lists.connected) forgetConnection(id)
  if (lists.likesMe) void refresh('likesReceived')
  // the backend deletes the views between the two in both directions: they leave "Viewed you" and
  // "You visited" (refetched when next shown; nothing is sent for a list nobody asked for)
  markStale('myViewers')
  markStale('visitedProfiles')
  void refresh('blockedUsers')
  // the backend leaves blocked people out of search results
  if (getNodeValue('searchResults')?.some((card) => card.userId === id)) void refresh('searchResults')
}

/**
 * Lifts a block (`DELETE /profile/{userId}/block`); resolves once `blockedUsers` no longer has them.
 * They can show up again in the deck and the search; a former connection is not restored.
 */
async function unblockUser(userId: string): Promise<void> {
  const id = pathId(userId, 'user id')
  await run('unblockUser', id)
  unhideFromDeck(id)
  await refresh('blockedUsers')
}

/** Reports a user as a fake account (`POST /profile/{userId}/report`). Idempotent. */
async function reportUser(userId: string): Promise<void> {
  await run('reportUser', pathId(userId, 'user id'))
}

/**
 * Answers someone who liked you (activity page): a like back connects you. Resolves once
 * `likesReceived` has reloaded without them.
 */
async function answerLike(userId: string, action: DeckAction): Promise<SwipeOutcome> {
  const { outcome, likes } = await swipeUser(userId, action)
  await likes
  return outcome
}

// ---------------------------------------------------------------- search

/**
 * Changes some search criteria (`GET /profile/search`): the name (`q`, a case-insensitive substring
 * of the username, first name, last name or "first last", 50 characters at most), the deck's
 * filters, each null for "no limit", and genders / preferences (any of them; empty for any). One request however many criteria changed; a sort-only change
 * sends nothing (`visibleSearch` sorts in the browser); the same criteria again refetch in place (a
 * retry). Resolves with the results once `searchResults` holds them. Rejects with the backend's error
 * (403 without a location) or INVALID when nothing would be sent or a value is out of range.
 */
async function search(changes: Partial<SearchCriteria>): Promise<DeckCard[]> {
  const current = currentSearch()
  const pick = <Key extends keyof SearchCriteria>(key: Key): SearchCriteria[Key] =>
    changes[key] !== undefined ? (changes[key] as SearchCriteria[Key]) : current[key]
  const next: SearchCriteria = {
    q: changes.q !== undefined ? normaliseQuery(changes.q) : current.q,
    ageMin: pick('ageMin'),
    ageMax: pick('ageMax'),
    distance: pick('distance'),
    fameMin: pick('fameMin'),
    tags: changes.tags !== undefined ? normaliseTags(changes.tags) : current.tags,
    genders: changes.genders !== undefined ? pickKnown(changes.genders, GENDERS) : current.genders,
    preferences: changes.preferences !== undefined ? pickKnown(changes.preferences, SEXUAL_PREFERENCES) : current.preferences,
    sort: pick('sort'),
  }
  const problem = searchProblem(next)
  if (problem) invalid(problem)
  const outcome = await awaitLoad('searchResults', () => writeSearch(next))
  if (outcome.error) throw outcome.error
  return getNodeValue('searchResults') ?? []
}

/** Ends the search: every criterion is dropped, `searchResults` resets and a request still on its way is dropped (DROPPED). */
function clearSearch(): void {
  if (hasSearchCriteria(currentSearch()) || getNodeValue('searchActive') != null) writeSearch(EMPTY_SEARCH)
}

// ---------------------------------------------------------------- matches and chat

/** The chat id of the conversation with `userId`, from the chat list; null before its first message. */
function chatIdOf(userId: string): string | null {
  return getNodeValue('chatList')?.chats.find((chat) => chat.userId === userId)?.chatId ?? null
}

function clearUnread(userId: string): void {
  const unread = getNodeValue('unreadByUser') ?? {}
  if (!unread[userId]) return
  const next = { ...unread }
  delete next[userId]
  setNode('unreadByUser', next)
}

/** Another message from `userId` arrived while their conversation was not open. */
export function countUnread(userId: string): void {
  const unread = getNodeValue('unreadByUser') ?? {}
  setNode('unreadByUser', { ...unread, [userId]: (unread[userId] ?? 0) + 1 })
}

/**
 * Marks the other person's messages in the chat read (`POST /chat/{chatId}/seen`); they
 * are told over the socket. Best effort: a failure is only logged (not when the store stopped first).
 */
export function markChatSeen(chatId: string): void {
  run('chatSeen', chatId).catch((error: unknown) => {
    if (toApiError(error).code !== LOCAL_ERROR.NOT_SENT) console.warn('Could not mark the conversation read', error)
  })
}

/**
 * How far back a delta reaches before the newest message held. A message is stamped when it is
 * inserted but seen once committed, so one stamped just before the newest held one may not have been
 * visible yet; the overlap fetches it anyway (the merge drops the copies).
 */
const DELTA_OVERLAP_MS = 2000

/**
 * The open thread's fetch for what it is missing: `?after=` its newest message when it is loaded, the
 * whole history otherwise. Writing the cursor is what sends the request.
 */
function fetchNewer(): void {
  const messages = getNodeValue('chatThread')?.messages
  const newest = messages && messages.length > 0 ? messages[messages.length - 1].timestamp : null
  writeNode('chatAfter', newest === null ? null : Math.max(0, newest - DELTA_OVERLAP_MS))
}

/** Opens conversation `chatId` with `userId` from its whole history (sends the request). */
function showChat(chatId: string, userId: string): void {
  resetChatCursor()
  setNode('activeChatId', chatId)
  setNode('activeChatUserId', userId)
}

/**
 * Brings the conversation with `userId` up to date if it is the open one: only the messages it does
 * not have yet (`?after=`); its chat id may have just appeared (first message), then it loads whole.
 * Resolves with that chat id, or null when it is not open or still has no message.
 */
export async function reloadOpenChat(userId: string): Promise<string | null> {
  if (getNodeValue('activeChatUserId') !== userId) return null
  const chatId = chatIdOf(userId)
  if (!chatId) return null
  const write = getNodeValue('activeChatId') === chatId ? fetchNewer : () => showChat(chatId, userId)
  const { error } = await awaitLoad('chatHistory', write)
  if (error) throw error
  return chatId
}

/**
 * The other person read conversation `chatId` (`chat-seen`): if it is the open one, my messages in it
 * turn read, as the backend marked them. No request.
 */
export function markThreadRead(chatId: string): void {
  if (getNodeValue('activeChatId') !== chatId) return
  const me = getNodeValue('sessionUserId')
  const thread = getNodeValue('chatThread')
  if (!me || !thread || !thread.messages.some((message) => message.userId === me && message.status !== 'read')) return
  writeNode('chatThread', {
    messages: thread.messages.map((message) => (message.userId === me ? { ...message, status: 'read' as const } : message)),
  })
}

/** Reloads the connections and their conversations; resolves once both lists are in. */
async function refreshMatches(): Promise<void> {
  await Promise.all([refresh('connections'), refresh('chatList')])
}

/**
 * Opens the conversation with a connection (`userId`): finds its chat id in a fresh chat list, loads
 * the whole history (`chatMessages`) and marks it read. A connection nobody has written to yet has no
 * chat: it opens empty. Calling it for the open conversation refetches it whole, in place. Rejects with
 * DROPPED when another conversation opened, or this one closed, meanwhile.
 */
async function openChat(userId: string): Promise<Message[]> {
  pathId(userId, 'user id')
  chatTicket += 1
  const ticket = chatTicket
  await refresh('chatList')
  if (ticket !== chatTicket) throw apiError(0, 'The conversation was closed.', LOCAL_ERROR.DROPPED)
  clearUnread(userId)
  const chatId = chatIdOf(userId)
  if (!chatId) {
    setNode('activeChatId', null)
    setNode('activeChatUserId', userId)
    return []
  }
  pathId(chatId, 'chat id')
  const open = getNodeValue('activeChatUserId') === userId && getNodeValue('activeChatId') === chatId
  // the whole history: a write of the cursor refetches the open one in place
  const outcome = await awaitLoad('chatHistory', () => (open ? writeNode('chatAfter', null) : showChat(chatId, userId)))
  if (outcome.error) throw outcome.error
  // overtaken while it loaded: what the thread shows now is another conversation's
  if (ticket !== chatTicket) throw apiError(0, 'The conversation was closed.', LOCAL_ERROR.DROPPED)
  markChatSeen(chatId)
  return getNodeValue('chatMessages') ?? []
}

/**
 * Sends a message (1-1000 characters) to a connection; resolves once the chat list and, when it is
 * the open conversation, its thread show it.
 */
async function sendMessage(userId: string, text: string): Promise<void> {
  pathId(userId, 'user id')
  const content = text.trim()
  if (!content) invalid('The message is empty.')
  if (content.length > MAX_MESSAGE_LENGTH) invalid(`A message is ${MAX_MESSAGE_LENGTH} characters at most.`)
  await run('chatSend', { toUserId: userId, content })
  await refresh('chatList')
  await reloadOpenChat(userId)
}

// ---------------------------------------------------------------- calendar

/** A date to propose to a connection. */
export interface DatePlan {
  /** The connection invited. */
  inviteeId: string
  /** One line, 1-100 characters once trimmed. */
  title: string
  /** Up to 500 characters; blank sends none. */
  description?: string
  /** Epoch milliseconds or a Date; in the future. */
  startsAt: number | Date
  /** After `startsAt`. */
  endsAt: number | Date
  /** Where to meet; null or absent for no place. */
  place?: Coordinates | null
}

function timeOf(value: number | Date): number {
  return value instanceof Date ? value.getTime() : value
}

/** The request body for `plan`, or INVALID (nothing is sent) when the backend would refuse it. */
function eventBody(plan: DatePlan): CreateEventPayload {
  if (typeof plan.inviteeId !== 'string' || !URL_SAFE.test(plan.inviteeId)) invalid('Pick who the date is with.')
  const title = (plan.title ?? '').replace(/\s+/g, ' ').trim()
  if (!title) invalid('Give the date a title.')
  if (title.length > MAX_EVENT_TITLE_LENGTH) invalid(`A title is ${MAX_EVENT_TITLE_LENGTH} characters at most.`)
  const description = (plan.description ?? '').trim()
  if (description.length > MAX_EVENT_DESCRIPTION_LENGTH) {
    invalid(`A description is ${MAX_EVENT_DESCRIPTION_LENGTH} characters at most.`)
  }
  const startsAt = timeOf(plan.startsAt)
  const endsAt = timeOf(plan.endsAt)
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) invalid('Pick a day and a time.')
  if (startsAt <= Date.now()) invalid('A date cannot start in the past.')
  if (endsAt <= startsAt) invalid('A date has to end after it starts.')
  const body: CreateEventPayload = {
    inviteeId: plan.inviteeId,
    title,
    // UTC with its 'Z': the backend wants an explicit offset
    startTime: new Date(startsAt).toISOString(),
    endTime: new Date(endsAt).toISOString(),
  }
  if (description) body.description = description
  if (plan.place) {
    const { latitude, longitude } = plan.place
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) invalid('Latitude must be between -90 and 90')
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) invalid('Longitude must be between -180 and 180')
    body.latitude = latitude
    body.longitude = longitude
  }
  return body
}

/**
 * Invites a connection on a date (`POST /profile/calendar/event`); they are told over the socket.
 * Rejects INVALID without a request for what the backend would refuse (no title, an overlong text,
 * a start in the past, an end before the start, a place off the globe), and with the backend's 403
 * when they are not a connection. Resolves with the stored event once `calendar` (and `dates`) have it.
 */
async function planDate(plan: DatePlan): Promise<CalendarEvent> {
  const event = await run('eventCreate', eventBody(plan))
  await refresh('calendar')
  return event
}

/** How one side answers a date: the invitee accepts or declines it, either side cancels it. */
export type DateAnswer = Extract<CalendarAction, 'accept' | 'decline' | 'cancel'>

const ANSWER_COMMAND = { accept: 'eventAccept', decline: 'eventDecline', cancel: 'eventCancel' } as const

/**
 * Answers a date (`POST /profile/calendar/event/{eventId}/accept | decline | cancel`); the other side is
 * told over the socket. The backend answers 404 when the move is not yours to make (an invite only the
 * invitee answers, a pending invite is declined rather than cancelled) and 400 once the date has
 * started. Resolves once `calendar` reflects it (a cancelled date leaves it, so does a declined one for
 * the invitee).
 */
async function answerDate(eventId: string, answer: DateAnswer): Promise<void> {
  const command = ANSWER_COMMAND[answer]
  if (!command) invalid('Unknown answer.')
  await run(command, pathId(eventId, 'date id'))
  await refresh('calendar')
}

export const actions = {
  bootSession,
  login,
  logout,
  register,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changeEmail,
  startGithubLogin,
  updateProfile,
  setLocation,
  uploadPicture,
  deletePicture,
  setMainPicture,
  showApiProfile,
  setFilters,
  swipe,
  rewind,
  reloadDeck,
  likeUser,
  unlikeUser,
  blockUser,
  unblockUser,
  reportUser,
  search,
  clearSearch,
  answerLike,
  closeProfile,
  refreshMatches,
  openChat,
  closeChat,
  sendMessage,
  planDate,
  answerDate,
} as const

export type Actions = typeof actions
