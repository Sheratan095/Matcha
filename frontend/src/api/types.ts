/**
 * Wire types shared by the node graph, the mock backend and the UI.
 * The "real" section mirrors backend/packages/shared-types as it appears on the wire
 * (docs/API_CONTRACT.md); the "social" section is the contract of the mocked endpoints.
 */

// ---------------------------------------------------------------- real backend

export type Gender = 'male' | 'female' | 'other'
export type SexualPreference = 'male' | 'female' | 'both' | 'other'
export type Language = 'en' | 'fr' | 'es'

export const GENDERS: readonly Gender[] = ['male', 'female', 'other']
export const SEXUAL_PREFERENCES: readonly SexualPreference[] = ['male', 'female', 'both', 'other']
export const LANGUAGES: readonly Language[] = ['en', 'fr', 'es']
export const MAX_USER_PICTURES = 5
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024
export const PICTURE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_BIOGRAPHY_LENGTH = 500
export const MAX_INTEREST_LENGTH = 50

export interface InterestTag {
  id: string
  /** Stored lowercase, without the leading '#'. */
  name: string
}

export interface UserPicture {
  id: string
  /** Absolute URL, usable directly as <img src>. */
  url: string
  isProfile: boolean
}

/** GET /profile, GET /profile/:userId, PATCH /profile. */
export interface Profile {
  userId: string
  firstName: string | null
  lastName: string | null
  gender: Gender | null
  sexualPreference: SexualPreference | null
  biography: string | null
  interests: InterestTag[]
  pictures: UserPicture[]
  createdAt: string
  updatedAt: string
}

/** GET /auth/validate. Always 200. */
export interface SessionCheck {
  valid: boolean
  userId: string | null
}

export interface LoginPayload {
  username: string
  password: string
}
export interface LoginResult {
  message: string
  userId: string
  isProfileComplete: boolean
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
  firstName: string
  lastName: string
  /** 'YYYY-MM-DD'. The profile service requires a real date and an age of 18 to 120. */
  dateOfBirth: string
  language?: Language
}
export interface RegisterResult {
  message: string
  date: string
  userId: string
}

export interface VerifyEmailPayload {
  token: string
}
export interface VerifyEmailResult {
  message: string
  userId: string
}

export interface ForgotPasswordPayload {
  email: string
}
export interface ResetPasswordPayload {
  token: string
  password: string
}
export interface ChangeEmailPayload {
  newEmail: string
}
export interface MessageResult {
  message: string
}
/** POST /auth/refresh: re-issues both cookies. */
export interface RefreshResult {
  message: string
  userId: string
}

/**
 * GET /profile and PATCH /profile: the signed-in user's own profile, with what nobody else gets.
 * Others only ever see a distance, computed from a position snapped to ~1 km.
 */
export interface OwnProfile extends Profile {
  /** Decimal degrees, full precision; both null until a location is set. */
  latitude: number | null
  longitude: number | null
}

/** PUT /profile/location. Latitude in [-90, 90], longitude in [-180, 180]. */
export interface LocationPayload {
  latitude: number
  longitude: number
}
export interface LocationResult {
  updated: boolean
}

/** PATCH /profile: only the provided fields are applied; `interests` is a full replacement. */
export interface ProfileUpdatePayload {
  firstName?: string
  lastName?: string
  gender?: Gender
  sexualPreference?: SexualPreference
  biography?: string
  interests?: string[]
}

/** POST/DELETE/PATCH on /profile/pictures all return the full list. */
export interface PicturesResult {
  pictures: UserPicture[]
}

/** One entry of GET /profile/viewers: the viewer plus their username and profile picture. */
export interface ProfileViewer {
  viewerId: string
  username: string
  profilePictureUrl: string | null
}

/** GET /profile/viewers. */
export interface ViewersResult {
  viewers: ProfileViewer[]
}

/** POST /profile (workaround for OAuth users that have no profile row). */
export interface ProfileCreatePayload {
  userId: string
  firstName?: string
  lastName?: string
}
export interface ProfileCreateResult {
  message: string
  userId: string
}

/**
 * Normalised form of the Nest error body `{ message: string | string[], error, statusCode }`.
 * `status` is 0 when the request never got a response (network error, timeout).
 */
export interface ApiError {
  status: number
  /** Machine code when the backend provides one: EMAIL_NOT_VERIFIED, COMMON_PASSWORD, PASSWORD_REUSE, RESERVED_USERNAME. */
  code: string | null
  /** First human-readable message. */
  message: string
  /** Every message (validation errors come as an array). */
  messages: string[]
}

// ---------------------------------------------------------------- social (mocked)

/** A profile as shown on a swipe card: the real profile shape plus what the backend lacks. */
export interface Card extends Profile {
  age: number
  city: string
  distanceKm: number
  /** 0-100. */
  fame: number
  online: boolean
  /** ISO date, null when online. */
  lastSeen: string | null
  /** They already liked the viewer: liking back is a match. */
  likedYou: boolean
  /** Interest names shared with the viewer. */
  commonTags: string[]
}

export type SwipeAction = 'like' | 'pass' | 'superlike'
export type DiscoverSort = 'best' | 'distance' | 'fame' | 'age'

export interface SwipePayload {
  targetId: string
  action: SwipeAction
}
export interface SwipeResult {
  match: Match | null
}
export interface RewindResult {
  /** The card whose swipe was undone, null when there was nothing to undo. */
  restored: Card | null
}

export interface Message {
  id: string
  matchId: string
  senderId: string
  text: string
  sentAt: string
}

export interface Match {
  id: string
  profile: Card
  matchedAt: string
  lastMessage: Message | null
  /** Messages from the other person the viewer has not opened yet. */
  unread: number
}

export interface SendMessagePayload {
  matchId: string
  text: string
}
export interface BlockPayload {
  userId: string
  reason?: string
}
export interface OkResult {
  ok: true
}

/** Pushed by the realtime channel (mocked today; the real socket carries no events yet). */
export type RealtimeEvent =
  | { type: 'message'; matchId: string; message: Message }
  | { type: 'typing'; matchId: string; userId: string }
  | { type: 'match'; match: Match }
  | { type: 'like'; from: Card }
