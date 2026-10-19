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
  type LoginPayload,
  type LoginResult,
  type Message,
  type MockEmail,
  type MessageResult,
  type PicturesResult,
  type Profile,
  type ProfileUpdatePayload,
  type RegisterPayload,
  type RegisterResult,
  type ResetPasswordPayload,
  type RewindResult,
  type SwipeAction,
  type SwipeResult,
  type VerifyEmailResult,
} from '@/api/types'
import { API_URL, IS_MOCK_BACKEND } from '@/config'
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
import { firstTimeForStore, getNodeValue, node$, nodeStatus$, onStoreStop, setNode, writeNode } from './store'

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
 * Installed by `bootSession`, once per store:
 * - selection state is reset when the signed-in user changes or signs out;
 * - GitHub-created users have no profile row, so `GET /profile` answers 500 (API_CONTRACT §9.3):
 *   the first such failure for a user creates the row and reloads the profile.
 */
function watchSession(): void {
  if (!firstTimeForStore('session-watch')) return
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
  const healed = new Set<string>()
  const profiles = nodeStatus$('myProfile').subscribe(({ status, error }) => {
    const userId = getNodeValue('sessionUserId')
    if (status !== 'error' || error?.status !== 500 || !userId || healed.has(userId)) return
    healed.add(userId)
    void createMissingProfile().catch(() => undefined)
  })
  onStoreStop(() => {
    users.unsubscribe()
    profiles.unsubscribe()
  })
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

/** Signs out, then re-probes: resolves once the session is gone (authenticated nodes reset to null). */
async function logout(): Promise<void> {
  await run('logout')
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
 * with the session cookies set, and the boot-time probe picks the session up. Throws an UNAVAILABLE
 * `ApiError` with the mock backend: check `storeInfo.backend === 'real'` before offering it.
 */
function startGithubLogin(): void {
  if (IS_MOCK_BACKEND) {
    throw apiError(0, 'GitHub sign-in needs the real backend; it is not available in demo mode.', LOCAL_ERROR.UNAVAILABLE)
  }
  window.location.assign(`${API_URL}/auth/github`)
}

/**
 * Demo mode: the emails the mock backend "sent" (verification and reset links), newest first. Rejects
 * with UNAVAILABLE with the real backend, where real emails are sent.
 */
async function loadDevInbox(): Promise<MockEmail[]> {
  if (!IS_MOCK_BACKEND) {
    throw apiError(0, 'The demo inbox only exists with the mock backend; check your real mailbox.', LOCAL_ERROR.UNAVAILABLE)
  }
  const error = await reload('devInbox')
  if (error) throw error
  return getNodeValue('devInbox') ?? []
}

// ---------------------------------------------------------------- own profile

/** Applies the given fields; resolves once `myProfile` (and `profileComplete`) reflect them. */
async function updateProfile(changes: ProfileUpdatePayload): Promise<Profile> {
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
 * Gives a GitHub-created user the profile row the backend forgot (API_CONTRACT §9.3) and reloads
 * `myProfile`. Also done automatically the first time `myProfile` fails with 500 for a user.
 */
async function createMissingProfile(): Promise<Profile | null> {
  const userId = getNodeValue('sessionUserId')
  if (!userId) throw apiError(401, 'Sign in first.')
  try {
    await run('profileCreate', { userId })
  } catch (error) {
    // 409: the row exists, the profile failed for another reason; reload it anyway.
    if (toApiError(error).status !== 409) throw error
  }
  const failed = await reload('myProfile')
  if (failed) throw failed
  return getNodeValue('myProfile') ?? null
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
async function showApiProfile(userId: string): Promise<Profile> {
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

/** Changes some filters; one deck request for the lot. Resolves once `discoverDeck` reloaded. */
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

/**
 * Swipes a card. It leaves `visibleDeck` at once and comes back if the request fails. On a match,
 * resolves after `matches` reloaded. When the deck runs out, the next page is fetched.
 */
async function swipe(card: Card, action: SwipeAction): Promise<SwipeResult> {
  const userId = card.userId
  hideFromDeck(userId)
  let result: SwipeResult
  try {
    result = await run('swipe', { targetId: userId, action })
  } catch (error) {
    unhideFromDeck(userId)
    throw error
  }
  const follow: Promise<void>[] = []
  if (result.match) follow.push(refresh('matches'))
  if (result.match || card.likedYou) follow.push(refresh('likesReceived'))
  if (getNodeValue('visibleDeck')?.length === 0) follow.push(refresh('discoverDeck'))
  await Promise.all(follow)
  return result
}

/** Undoes the last swipe (not one that matched). The restored card is back on top of `visibleDeck`. */
async function rewind(): Promise<RewindResult> {
  const result = await run('rewind')
  const restored = result.restored
  if (restored) {
    unhideFromDeck(restored.userId)
    const follow: Promise<void>[] = []
    // Still in the loaded deck (hidden by `swipedIds`): it reappears where it was, i.e. on top.
    if (!getNodeValue('discoverDeck')?.some((card) => card.userId === restored.userId)) follow.push(refresh('discoverDeck'))
    if (restored.likedYou) follow.push(refresh('likesReceived'))
    await Promise.all(follow)
  }
  return result
}

/** Fetches the deck again with the current filters. */
async function reloadDeck(): Promise<void> {
  const error = await reload('discoverDeck')
  if (error) throw error
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

/** Restores the viewer's demo data (`POST /__mock/social/reset`) and reloads every social node. */
async function resetDemoData(): Promise<void> {
  await run('demoReset')
  closeChat()
  closeProfile()
  setNode('swipedIds', [])
  await Promise.all([refresh('matches'), refresh('discoverDeck'), refresh('likesReceived')])
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
  loadDevInbox,
  updateProfile,
  createMissingProfile,
  uploadPicture,
  deletePicture,
  setMainPicture,
  showApiProfile,
  setFilters,
  swipe,
  rewind,
  reloadDeck,
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
