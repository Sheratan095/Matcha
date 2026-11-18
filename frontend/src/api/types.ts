/**
 * Wire types shared by the node graph and the UI. They mirror backend/packages/shared-types and the
 * response DTOs as they appear on the wire (docs/API_CONTRACT.md); `Message` and `Match` are the
 * shapes the chat screens draw, derived from them in src/wb/functions.ts.
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
  username?: string
  /** Computed by the database from the date of birth; null when it is not set. */
  age?: number | null
  /** Public 0-100 popularity score. */
  fameRating?: number
  /** ISO date of the last connection, null when unknown. */
  lastSeen?: string | null
}

/** GET /profile/:userId for someone else: what only another user's profile carries. */
export interface ProfileRelation {
  /** You liked them. */
  liked: boolean
  /** They liked you. */
  likesYou: boolean
  /** Both: you are connected and can chat. */
  matched: boolean
}

export interface OtherProfile extends Profile {
  /** Absent on your own profile. */
  isOnline?: boolean
  relation?: ProfileRelation
  /** Whole kilometres (at least 1), from a ~1 km-snapped position; null when either has no location. */
  distanceKm?: number | null
}

/**
 * One card of GET /profile/discover and GET /profile/search: a light summary. The full profile (bio,
 * pictures, tags) comes from GET /profile/:userId when the card is opened, which records a profile view.
 */
export interface DeckCard {
  userId: string
  username: string
  firstName: string | null
  age: number
  /** Whole kilometres, at least 1; null when YOU have no location. */
  distanceKm: number | null
  /** 0-100. */
  fameRating: number
  /** Interest tags shared with you. */
  commonTagCount: number
  /** They already liked you: liking back is a match. Discover only: search results omit it. */
  likesYou?: boolean
  profilePictureUrl: string
}

/** Swipes the backend knows: POST /profile/:userId/like and POST /profile/:userId/pass. */
export type DeckAction = 'like' | 'pass'

/** POST /profile/:userId/like. */
export interface LikeResult {
  liked: true
  /** This like completed a match. */
  matched: boolean
}

/**
 * How the deck is ordered. The backend filters and ranks ('best'); every other order is applied in
 * the browser to the whole list (subject IV.3: sortable by age, location, fame and common tags).
 */
export type DiscoverSort = 'best' | 'distance' | 'age' | 'fame' | 'tags'

/** `q` of GET /profile/search (a substring of the username, first name, last name or "first last"): 1 to 50 characters. */
export const MAX_SEARCH_QUERY_LENGTH = 50

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

/**
 * One connection (mutual like) on GET /profile/matches/map. The position is snapped to a ~1 km grid
 * by the backend (neighbourhood accuracy); both null when they have no location.
 */
export interface MapMatch {
  userId: string
  username: string
  profilePictureUrl: string | null
  latitude: number | null
  longitude: number | null
}

/** GET /profile/matches/map. */
export interface MatchesMapResult {
  matches: MapMatch[]
}

/** GET /profile/viewers: who opened your profile. StdPayload entries (`userId`), whatever the Swagger DTO says. */
export interface ViewersResult {
  viewers: UserSummary[]
}

/** GET /profile/visited: the profiles you opened, most recent visit first (StdPayload entries). */
export interface VisitedResult {
  visited: UserSummary[]
}

/** GET /profile/blocks: the people you blocked (StdPayload entries). */
export interface BlocksResult {
  blocks: UserSummary[]
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

// ---------------------------------------------------------------- connections, likes, chat

/** Someone in a list or a socket event (the backend's StdPayload). */
export interface UserSummary {
  userId: string
  username: string
  profilePictureUrl: string | null
}

/** GET /profile/matches: the people you are connected to (mutual like). */
export interface ConnectionsResult {
  matches: UserSummary[]
}

/**
 * GET /profile/likes: people who liked you and whom you have not liked back. Each entry is a
 * StdPayload (`userId`), whatever the Swagger DTO (`likerId`) says.
 */
export interface LikersResult {
  likes: UserSummary[]
}

export type MessageStatus = 'sent' | 'delivered' | 'read'

/** One message as GET /chat/:chatId and the `message` socket event carry it. */
export interface ChatMessage {
  messageId: string
  content: string
  /** Epoch milliseconds. */
  timestamp: number
  /** The sender. */
  userId: string
  username: string
  status: MessageStatus
  profilePictureUrl: string | null
}

/** GET /chat/:chatId: oldest first. */
export interface ChatHistoryResult {
  messages: ChatMessage[]
}

/** One conversation of GET /chat (only chats that have at least one message). */
export interface ChatListItem {
  chatId: string
  /** The other participant. */
  userId: string
  username: string
  profilePictureUrl: string | null
  lastMessage: string
  /** Epoch milliseconds of the last message. */
  timestamp: number
  lastSenderId: string
}

/** GET /chat: newest activity first. */
export interface ChatListResult {
  chats: ChatListItem[]
}

/** POST /chat/message. Only to someone you are connected to (403 otherwise). */
export interface SendMessagePayload {
  toUserId: string
  content: string
}
export interface SendMessageResult {
  /** The recipient had a live socket. */
  delivered: boolean
}

/** POST /chat/:chatId/seen. */
export interface ChatSeenResult {
  seen: boolean
}

/** A message as the chat screen draws it. */
export interface Message {
  id: string
  senderId: string
  text: string
  /** Epoch milliseconds. */
  sentAt: number
  status: MessageStatus
}

/** A connection with its conversation, as the matches list and the chat screen show it. */
export interface Match extends UserSummary {
  /** null until the first message: the backend only lists chats that have one. */
  chatId: string | null
  lastMessage: { text: string; sentAt: number; senderId: string } | null
  /**
   * Messages from them that arrived over the socket since the conversation was last opened in this
   * tab. The backend keeps no unread count, so it starts at 0 on every load.
   */
  unread: number
}

// ---------------------------------------------------------------- calendar

export const MAX_EVENT_TITLE_LENGTH = 100
export const MAX_EVENT_DESCRIPTION_LENGTH = 500

/**
 * Where a date stands. `pending` until the invitee answers (`accepted` / `declined`); either side can
 * call it off (`cancelled`): the inviter at any time, the invitee once they accepted. Nothing changes
 * once it has started.
 */
export type CalendarStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

/** One date of GET /profile/calendar and POST /profile/calendar/event (the backend's CalendarEvent). */
export interface CalendarEvent {
  eventId: string
  /** Who sent the invite. */
  inviterId: string
  inviteeId: string
  title: string
  description: string | null
  /** ISO 8601. */
  startTime: string
  endTime: string
  status: CalendarStatus
  /** Decimal degrees, full precision; both null when no place was set. */
  latitude: number | null
  longitude: number | null
  /** ISO 8601: when the invite was sent. Left out by a backend older than the chat's date notes. */
  createdAt?: string | null
}

/**
 * GET /profile/calendar: earliest first, past ones included. Cancelled dates are never listed;
 * declined ones only to the inviter (so they learn the answer).
 */
export interface CalendarResult {
  events: CalendarEvent[]
}

/**
 * POST /profile/calendar/event: only with a connection (403 otherwise), starting in the future and
 * ending after it starts (400). Times carry an offset; latitude and longitude go together.
 */
export interface CreateEventPayload {
  inviteeId: string
  title: string
  description?: string
  startTime: string
  endTime: string
  latitude?: number
  longitude?: number
}

/** POST /profile/calendar/event/:eventId/accept | decline | cancel. 404 when not allowed. */
export interface EventAnswerResult {
  success: boolean
}

/** A pinned spot (decimal degrees). */
export interface Coordinates {
  latitude: number
  longitude: number
}

/** A date as the calendar draws it: the event, its times parsed, and the other person. */
export interface PlannedDate {
  id: string
  title: string
  description: string | null
  /** Epoch milliseconds. */
  startsAt: number
  endsAt: number
  /** Epoch milliseconds the invite was sent; null when the backend did not say. */
  plannedAt: number | null
  status: CalendarStatus
  /** The signed-in user sent the invite. */
  mine: boolean
  /** The other side, from the connections (an empty username while they are not listed there). */
  person: UserSummary
  place: Coordinates | null
}

/**
 * What a calendar notification tells of: socket `event-invite`, `event-accept`, `event-decline`,
 * `event-cancel`, `event-start`. An invite reaches the invitee, an accept or a decline the inviter, a
 * cancel the side that did not cancel; the start of an accepted date reaches both sides (live only:
 * the backend does not queue it), each told about the other.
 */
export type CalendarAction = 'invite' | 'accept' | 'decline' | 'cancel' | 'start'

/** A date planned with a connection, as its notifications carry it. */
export interface CalendarEventSummary {
  id: string
  title: string
  /** Epoch milliseconds; null when the payload's `startTime` is not a date. */
  startsAt: number | null
}

/** Pushed over the gateway's socket.io connection (`/notification` namespace). */
export type RealtimeEvent =
  | { type: 'message'; from: UserSummary; message: Message }
  | { type: 'match'; person: UserSummary }
  | { type: 'unmatch'; person: UserSummary }
  | { type: 'like'; person: UserSummary }
  | { type: 'view'; person: UserSummary }
  /** `userId` read the chat: your messages there are now read. */
  | { type: 'seen'; chatId: string; userId: string }
  /** `person` invited you to `event`, or accepted, declined or cancelled it; or your date with them started. */
  | { type: 'calendar'; action: CalendarAction; person: UserSummary; event: CalendarEventSummary }
