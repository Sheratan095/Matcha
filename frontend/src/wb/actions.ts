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
import { apiError, LOCAL_ERROR, toApiError } from '@/api/http'
import {
  MAX_PICTURE_BYTES,
  MAX_USER_PICTURES,
  PICTURE_MIME_TYPES,
  type BlockPayload,
  type Card,
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
  type SwipeResult,
  type VerifyEmailResult,
} from '@/api/types'
import { API_URL } from '@/config'
import { awaitLoad, nextNonce, refresh, reload, run } from './commands'
import {
  currentFilters,
  DEFAULT_DISCOVER_FILTERS,
  filtersProblem,
  normaliseTags,
  writeFilters,
  type DiscoverFilters,
} from './filters'
import type { AuthStatus } from './functions'
import { firstTimeForStore, getNodeValue, node$, onStoreStop, setNode, writeNode } from './store'

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

function closeChat(): void {
  setNode('activeMatchId', null)
}

function closeProfile(): void {
  setNode('socialProfileId', null)
  setNode('apiProfileId', null)
}

/** Selection state belongs to one signed-in user: clear it when the user changes or signs out. */
function resetSessionState(): void {
  closeChat()
  closeProfile()
  setNode('swipedIds', [])
  swipeHistory.length = 0
  writeFilters({ ...DEFAULT_DISCOVER_FILTERS, tags: [] })
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

// ---------------------------------------------------------------- session

/**
 * Probes the session (`GET /auth/validate`) and resolves with the resulting status. Called once at
 * boot; also picks up a session created by the GitHub OAuth redirect.
 */
async function bootSession(): Promise<AuthStatus> {
  watchSession()
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

/** Opens a real user's profile (`GET /profile/{id}`; records a profile view). Resolves with it. */
async function showApiProfile(userId: string): Promise<OtherProfile> {
  pathId(userId, 'user id')
  const loaded = getNodeValue('apiProfile')
  if (getNodeValue('apiProfileId') === userId && loaded?.userId === userId) return loaded
  const outcome = await awaitLoad('apiProfile', () => setNode('apiProfileId', userId))
  if (outcome.error) throw outcome.error
  const profile = getNodeValue('apiProfile')
  if (!profile) throw apiError(0, 'The profile could not be loaded.', LOCAL_ERROR.NOT_SENT)
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

async function sendSwipe(userId: string, action: DeckAction): Promise<SwipeOutcome> {
  if (action === 'like') return { matched: (await run('like', userId))?.matched === true }
  await run('pass', userId)
  return { matched: false }
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
    outcome = await sendSwipe(userId, action)
  } catch (error) {
    unhideFromDeck(userId)
    throw error
  } finally {
    swipesInFlight.delete(userId)
  }
  swipeHistory.push({ card, action, matched: outcome.matched })
  if (swipeHistory.length > MAX_SWIPE_HISTORY) swipeHistory.shift()
  if (outcome.matched) void refresh('matchesMap')
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

/** Likes or passes on someone from their opened profile: the deck's requests, without its bookkeeping. */
async function likeUser(userId: string, action: DeckAction): Promise<SwipeOutcome> {
  const outcome = await sendSwipe(pathId(userId, 'user id'), action)
  hideFromDeck(userId)
  if (outcome.matched) void refresh('matchesMap')
  return outcome
}

/** Takes a like back (`DELETE /profile/{userId}/like`): disconnects a match, the chat closes. */
async function unlikeUser(userId: string): Promise<void> {
  await run('unlike', pathId(userId, 'user id'))
  void refresh('matchesMap')
  for (let i = swipeHistory.length - 1; i >= 0; i--) {
    if (swipeHistory[i].card.userId === userId) swipeHistory.splice(i, 1)
  }
}

/** Blocks a real user (`POST /profile/{userId}/block`): they leave the deck and every list. */
async function blockUser(userId: string): Promise<void> {
  await run('blockUser', pathId(userId, 'user id'))
  hideFromDeck(userId)
  void refresh('matchesMap')
}

/** Reports a real user as a fake account (`POST /profile/{userId}/report`). Idempotent. */
async function reportUser(userId: string): Promise<void> {
  await run('reportUser', pathId(userId, 'user id'))
}

/**
 * Answers a like received on the activity page (mocked social service, `POST /swipes`). Resolves
 * once `likesReceived` (and, on a match, `matches`) reloaded.
 */
async function answerLike(card: Card, action: DeckAction): Promise<SwipeResult> {
  const result = await run('answerLike', { targetId: card.userId, action })
  await Promise.all([refresh('likesReceived'), result.match ? refresh('matches') : Promise.resolve()])
  return result
}

/** Opens a mock person's card (`GET /profiles/{id}`). Resolves with it. */
async function showSocialProfile(userId: string): Promise<Card> {
  pathId(userId, 'user id')
  const loaded = getNodeValue('socialProfile')
  if (getNodeValue('socialProfileId') === userId && loaded?.userId === userId) return loaded
  const outcome = await awaitLoad('socialProfile', () => setNode('socialProfileId', userId))
  if (outcome.error) throw outcome.error
  const card = getNodeValue('socialProfile')
  if (!card) throw apiError(0, 'The profile could not be loaded.', LOCAL_ERROR.NOT_SENT)
  return card
}

// ---------------------------------------------------------------- matches and chat

/**
 * Opens a conversation: loads `chatMessages` (which marks them read), then reloads `matches` so the
 * unread counts are right. Calling it for the open conversation refetches it in place.
 */
async function openChat(matchId: string): Promise<Message[]> {
  pathId(matchId, 'match id')
  const write =
    getNodeValue('activeMatchId') === matchId
      ? () => writeNode('chatRefresh', nextNonce())
      : () => setNode('activeMatchId', matchId)
  const outcome = await awaitLoad('chatMessages', write)
  if (outcome.error) throw outcome.error
  await refresh('matches')
  return getNodeValue('chatMessages') ?? []
}

/** Sends a message (1-1000 characters); resolves once the open conversation and `matches` show it. */
async function sendMessage(matchId: string, text: string): Promise<Message> {
  const body = text.trim()
  if (!body) invalid('The message is empty.')
  if (body.length > MAX_MESSAGE_LENGTH) invalid(`A message is ${MAX_MESSAGE_LENGTH} characters at most.`)
  const message = await run('sendMessage', { matchId, text: body })
  if (getNodeValue('activeMatchId') === matchId) await refresh('chatMessages')
  await refresh('matches')
  return message
}

async function unmatch(matchId: string): Promise<void> {
  await run('unmatch', pathId(matchId, 'match id'))
  if (getNodeValue('activeMatchId') === matchId) closeChat()
  await refresh('matches')
}

/** Blocks a person: removes the match, hides them everywhere. */
async function block(userId: string, reason?: string): Promise<void> {
  const payload: BlockPayload = { userId }
  if (reason?.trim()) payload.reason = reason.trim()
  await run('block', payload)
  hideFromDeck(userId)
  const activeId = getNodeValue('activeMatchId')
  if (activeId && getNodeValue('matches')?.some((match) => match.id === activeId && match.profile.userId === userId)) {
    closeChat()
  }
  if (getNodeValue('socialProfileId') === userId) setNode('socialProfileId', null)
  await Promise.all([refresh('matches'), refresh('likesReceived')])
}

/** Restores the viewer's mocked matches, chat and likes (`POST /__mock/social/reset`) and reloads them. */
async function resetDemoData(): Promise<void> {
  await run('demoReset')
  closeChat()
  closeProfile()
  await Promise.all([refresh('matches'), refresh('likesReceived')])
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
  reportUser,
  answerLike,
  showSocialProfile,
  closeProfile,
  openChat,
  closeChat,
  sendMessage,
  unmatch,
  block,
  resetDemoData,
} as const

export type Actions = typeof actions
