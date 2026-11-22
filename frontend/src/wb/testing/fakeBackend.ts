/**
 * Test-only: a small stateful backend behind the fake adapter, enough for the flows the actions run.
 * It answers the gateway's routes with the shapes the real services send.
 */
import type { CalendarEvent, CalendarStatus, ChatMessage, CreateEventPayload, DeckCard, OwnProfile, Profile, UserSummary } from '@/api/types'
import { API_URL } from '@/config'
import { FakeServer, nestError, reply } from './fakeServer'

export const ME = '11111111-1111-4111-8111-111111111111'

function profile(userId: string, patch: Partial<Profile> = {}): Profile {
  return {
    userId,
    firstName: 'Test',
    lastName: 'User',
    gender: null,
    sexualPreference: null,
    biography: null,
    interests: [],
    pictures: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

export function deckCard(userId: string, patch: Partial<DeckCard> = {}): DeckCard {
  return {
    userId,
    username: userId,
    firstName: userId,
    age: 30,
    distanceKm: 3,
    fameRating: 50,
    commonTagCount: 0,
    likesYou: false,
    profilePictureUrl: `http://img.test/${userId}.webp`,
    ...patch,
  }
}

export function person(userId: string): UserSummary {
  return { userId, username: userId, profilePictureUrl: `http://img.test/${userId}.webp` }
}

/** A chat between ME and `userId`; it exists from the moment they connect, like the backend's. */
export interface FakeChat {
  chatId: string
  userId: string
  messages: ChatMessage[]
}

export interface FakeBackend {
  server: FakeServer
  state: {
    /** Whose ACCESS cookie the browser holds (null once it expired: the browser drops it after 15 minutes). */
    session: string | null
    /** Whose REFRESH cookie it holds (null when none, or when a sign-in elsewhere replaced it). */
    refreshToken: string | null
    profile: OwnProfile
    /** GET /profile/discover, best first. */
    deck: DeckCard[]
    liked: Set<string>
    passed: Set<string>
    /** GET /profile/likes: people who liked ME and whom ME has not liked back. */
    likers: UserSummary[]
    /** GET /profile/matches. */
    connections: UserSummary[]
    /** Per connection (user id). */
    chats: Map<string, FakeChat>
    /** GET /profile/blocks. */
    blocked: UserSummary[]
    /** GET /profile/visited, most recent first: GET /profile/{id} records a visit. */
    visited: UserSummary[]
    /** Every calendar event, cancelled ones included (GET /profile/calendar filters them). */
    events: CalendarEvent[]
  }
}

export function createFakeBackend(): FakeBackend {
  const server = new FakeServer()
  const state: FakeBackend['state'] = {
    session: null,
    refreshToken: null,
    profile: { ...profile(ME), latitude: null, longitude: null, dateOfBirth: '1996-03-14' },
    deck: [deckCard('ann', { likesYou: true }), deckCard('bea'), deckCard('cid')],
    liked: new Set(),
    passed: new Set(),
    likers: [person('ann')],
    connections: [],
    chats: new Map(),
    blocked: [],
    visited: [],
    events: [],
  }
  const unauthorized = () => nestError(401, 'Missing or invalid access token', 'Unauthorized')
  let counter = 0

  // Like the backend: the pair's events hang off their chat and go with it.
  const disconnect = (userId: string) => {
    state.connections = state.connections.filter((entry) => entry.userId !== userId)
    state.chats.delete(userId)
    state.events = state.events.filter((event) => event.inviterId !== userId && event.inviteeId !== userId)
  }
  const chatById = (chatId: string) => [...state.chats.values()].find((chat) => chat.chatId === chatId)

  /**
   * accept / decline: the invitee, from pending. cancel: never twice; the inviter always, the invitee
   * once accepted. Anything else is a 404, as the backend's UPDATE ... WHERE makes it.
   */
  const moveEvent = (eventId: string, status: Exclude<CalendarStatus, 'pending'>) => {
    if (!state.session) return unauthorized()
    const event = state.events.find((candidate) => candidate.eventId === eventId)
    const me = state.session
    const allowed =
      event !== undefined &&
      (status === 'cancelled'
        ? event.status !== 'cancelled' && (event.inviterId === me || (event.inviteeId === me && event.status === 'accepted'))
        : event.inviteeId === me && event.status === 'pending')
    if (!event || !allowed) return nestError(404, `Event not found or it can't be ${status} by you`, 'Not Found')
    if (Date.parse(event.startTime) <= Date.now()) return nestError(400, 'An event that has already started cannot be modified', 'Bad Request')
    event.status = status
    return { success: true }
  }

  server
    // First, so every more specific /profile/... route (registered after it) wins over it.
    .on('GET', `${API_URL}/profile/:id`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.visited = [person(route.id), ...state.visited.filter((entry) => entry.userId !== route.id)]
      return {
        ...profile(route.id),
        username: route.id,
        age: 30,
        distanceKm: 3,
        fameRating: 50,
        lastSeen: null,
        isOnline: false,
        relation: { liked: state.liked.has(route.id), likesYou: false, matched: false },
      }
    })
    .on('GET', `${API_URL}/auth/validate`, () => ({ valid: state.session !== null, userId: state.session }))
    .on('POST', `${API_URL}/auth/login`, ({ body }) => {
      const { username, password } = body as { username: string; password: string }
      if (username !== 'testuser' || password !== '1234') return nestError(403, 'Invalid credentials', 'Forbidden')
      state.session = ME
      state.refreshToken = ME
      return { message: 'Login successful', userId: ME, isProfileComplete: false }
    })
    .on('POST', `${API_URL}/auth/logout`, () => {
      state.session = null
      state.refreshToken = null
      return { message: 'Logged out successfully' }
    })
    // Like the backend: a live refresh cookie re-issues both, no cookie (or a replaced one) is a 403.
    .on('POST', `${API_URL}/auth/refresh`, () => {
      if (!state.refreshToken) return nestError(403, 'Invalid refresh token', 'Forbidden')
      state.session = state.refreshToken
      return { message: 'Tokens refreshed', userId: state.refreshToken }
    })
    .on('GET', `${API_URL}/profile`, () => (state.session ? state.profile : unauthorized()))
    .on('PATCH', `${API_URL}/profile`, ({ body }) => {
      if (!state.session) return unauthorized()
      const changes = body as Omit<Partial<Profile>, 'interests'> & { interests?: string[] }
      const { interests, ...rest } = changes
      state.profile = {
        ...state.profile,
        ...rest,
        ...(interests ? { interests: interests.map((name) => ({ id: name, name })) } : {}),
        updatedAt: new Date().toISOString(),
      }
      return state.profile
    })
    .on('PUT', `${API_URL}/profile/location`, ({ body }) => {
      if (!state.session) return unauthorized()
      const { latitude, longitude } = body as { latitude: number; longitude: number }
      state.profile = { ...state.profile, latitude, longitude, updatedAt: new Date().toISOString() }
      return { updated: true }
    })
    .on('POST', `${API_URL}/profile/pictures`, ({ body }) => {
      if (!state.session) return unauthorized()
      if (!(body instanceof FormData) || !body.get('file')) return nestError(400, 'Missing "file" field', 'Bad Request')
      const id = `pic${++counter}`
      const pictures = [...state.profile.pictures, { id, url: `http://img.test/${id}.webp`, isProfile: state.profile.pictures.length === 0 }]
      state.profile = { ...state.profile, pictures }
      return { pictures }
    })
    .on('GET', `${API_URL}/profile/viewers`, () => (state.session ? { viewers: [] } : unauthorized()))
    .on('GET', `${API_URL}/notification/online`, () => 1)
    // Liked people leave the list; passed ones sink to the bottom.
    .on('GET', `${API_URL}/profile/discover`, () => {
      if (!state.session) return unauthorized()
      const left = state.deck.filter((entry) => !state.liked.has(entry.userId))
      return [...left.filter((entry) => !state.passed.has(entry.userId)), ...left.filter((entry) => state.passed.has(entry.userId))]
    })
    // Search: a substring of the username or first name, within the age / distance / fame limits
    // (tags are accepted, not applied). Needs a location; liked people stay.
    .on('GET', `${API_URL}/profile/search`, ({ params }) => {
      if (!state.session) return unauthorized()
      if (Object.keys(params).length === 0) return nestError(400, 'At least one search criterion is required', 'Bad Request')
      if (state.profile.latitude == null) return nestError(403, 'You must have a location to search other users', 'Forbidden')
      const q = typeof params.q === 'string' ? params.q.toLowerCase() : null
      const limit = (key: string): number | null => (params[key] === undefined ? null : Number(params[key]))
      const minAge = limit('minAge')
      const maxAge = limit('maxAge')
      const maxKm = limit('maxDistanceKm')
      const minFame = limit('minFame')
      return state.deck
        .filter((entry) => q === null || entry.username.toLowerCase().includes(q) || (entry.firstName ?? '').toLowerCase().includes(q))
        .filter((entry) => (minAge === null || entry.age >= minAge) && (maxAge === null || entry.age <= maxAge))
        .filter((entry) => maxKm === null || (entry.distanceKm !== null && entry.distanceKm <= maxKm))
        .filter((entry) => minFame === null || entry.fameRating >= minFame)
        .map((entry) => {
          const result = { ...entry }
          delete result.likesYou
          return result
        })
    })
    // A like back to someone who liked ME connects us (and opens our chat).
    .on('POST', `${API_URL}/profile/:id/like`, ({ route }) => {
      if (!state.session) return unauthorized()
      const card = state.deck.find((entry) => entry.userId === route.id)
      if (!card) return nestError(404, 'User not found', 'Not Found')
      const created = !state.liked.has(route.id)
      state.liked.add(route.id)
      const matched = created && card.likesYou === true
      if (matched) connect({ server, state }, route.id)
      return { liked: true, matched }
    })
    .on('DELETE', `${API_URL}/profile/:id/like`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.liked.delete(route.id)
      disconnect(route.id)
      return reply(200, '')
    })
    .on('POST', `${API_URL}/profile/:id/pass`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.passed.add(route.id)
      state.likers = state.likers.filter((entry) => entry.userId !== route.id)
      return reply(200, '')
    })
    .on('POST', `${API_URL}/profile/:id/block`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.liked.delete(route.id)
      state.likers = state.likers.filter((entry) => entry.userId !== route.id)
      disconnect(route.id)
      if (!state.blocked.some((entry) => entry.userId === route.id)) state.blocked = [...state.blocked, person(route.id)]
      return reply(200, '')
    })
    .on('DELETE', `${API_URL}/profile/:id/block`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.blocked = state.blocked.filter((entry) => entry.userId !== route.id)
      return reply(200, '')
    })
    .on('GET', `${API_URL}/profile/blocks`, () => (state.session ? { blocks: state.blocked } : unauthorized()))
    .on('GET', `${API_URL}/profile/visited`, () => (state.session ? { visited: state.visited } : unauthorized()))
    .on('GET', `${API_URL}/profile/matches`, () => (state.session ? { matches: state.connections } : unauthorized()))
    .on('GET', `${API_URL}/profile/likes`, () =>
      state.session
        ? { likes: state.likers }
        : unauthorized(),
    )
    .on('GET', `${API_URL}/profile/matches/map`, () => (state.session ? { matches: [] } : unauthorized()))
    .on('GET', `${API_URL}/profile/interests`, () =>
      state.session ? { interests: [{ id: 't1', name: 'music' }, { id: 't2', name: 'art' }] } : unauthorized(),
    )
    // Only chats with a message are listed, newest first, as the backend's INNER JOIN does.
    .on('GET', `${API_URL}/chat`, () => {
      if (!state.session) return unauthorized()
      const chats = [...state.chats.values()]
        .filter((chat) => chat.messages.length > 0)
        .map((chat) => {
          const last = chat.messages[chat.messages.length - 1]
          return {
            chatId: chat.chatId,
            userId: chat.userId,
            username: chat.userId,
            profilePictureUrl: null,
            lastMessage: last.content,
            timestamp: last.timestamp,
            lastSenderId: last.userId,
          }
        })
        .sort((a, b) => b.timestamp - a.timestamp)
      return { chats }
    })
    // `?after=<epoch ms>`: only the newer messages.
    .on('GET', `${API_URL}/chat/:id`, ({ route, params }) => {
      if (!state.session) return unauthorized()
      const chat = chatById(route.id)
      if (!chat) return nestError(403, 'You are not a participant of this chat', 'Forbidden')
      const after = params.after === undefined ? null : Number(params.after)
      // copies, as a real answer would be: later messages must not show up in what the client holds
      const messages = chat.messages.map((message) => ({ ...message }))
      return { messages: after === null ? messages : messages.filter((message) => message.timestamp > after) }
    })
    .on('POST', `${API_URL}/chat/message`, ({ body }) => {
      if (!state.session) return unauthorized()
      const { toUserId, content } = body as { toUserId: string; content: string }
      const chat = state.chats.get(toUserId)
      if (!chat) return nestError(403, 'You can only message your matches', 'Forbidden')
      chat.messages.push({
        messageId: `msg${++counter}`,
        content,
        timestamp: Date.now(),
        userId: ME,
        username: 'testuser',
        status: 'sent',
        profilePictureUrl: null,
      })
      return { delivered: false }
    })
    // Cancelled events for nobody, declined ones only for the inviter; earliest first.
    .on('GET', `${API_URL}/profile/calendar`, () => {
      if (!state.session) return unauthorized()
      const me = state.session
      const events = state.events
        .filter((event) => event.status !== 'cancelled')
        .filter((event) => event.inviterId === me || (event.inviteeId === me && event.status !== 'declined'))
        .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
        .map((event) => ({ ...event }))
      return { events }
    })
    .on('POST', `${API_URL}/profile/calendar/event`, ({ body }) => {
      if (!state.session) return unauthorized()
      const plan = body as CreateEventPayload
      if (plan.inviteeId === state.session) return nestError(400, 'You cannot add an event for yourself', 'Bad Request')
      if (!state.chats.has(plan.inviteeId)) return nestError(403, 'You can only add events for your matches', 'Forbidden')
      if (Date.parse(plan.startTime) <= Date.now()) return nestError(400, 'An event cannot start in the past', 'Bad Request')
      if (Date.parse(plan.startTime) >= Date.parse(plan.endTime)) {
        return nestError(400, 'Event start time must be before its end time', 'Bad Request')
      }
      const event: CalendarEvent = {
        eventId: `00000000-0000-4000-9000-${String(++counter).padStart(12, '0')}`,
        inviterId: state.session,
        inviteeId: plan.inviteeId,
        title: plan.title,
        description: plan.description ?? null,
        startTime: new Date(plan.startTime).toISOString(),
        endTime: new Date(plan.endTime).toISOString(),
        status: 'pending',
        latitude: plan.latitude ?? null,
        longitude: plan.longitude ?? null,
        createdAt: new Date().toISOString(),
      }
      state.events.push(event)
      return { ...event }
    })
    .on('POST', `${API_URL}/profile/calendar/event/:id/accept`, ({ route }) => moveEvent(route.id, 'accepted'))
    .on('POST', `${API_URL}/profile/calendar/event/:id/decline`, ({ route }) => moveEvent(route.id, 'declined'))
    .on('POST', `${API_URL}/profile/calendar/event/:id/cancel`, ({ route }) => moveEvent(route.id, 'cancelled'))
    .on('POST', `${API_URL}/chat/:id/seen`, ({ route }) => {
      if (!state.session) return unauthorized()
      const chat = chatById(route.id)
      if (!chat) return nestError(403, 'You are not a participant of this chat', 'Forbidden')
      chat.messages = chat.messages.map((message) => (message.userId === ME ? message : { ...message, status: 'read' }))
      return { seen: true }
    })

  return { server, state }
}

/** ME and `userId` are now connected (mutual like): they appear in /profile/matches with an empty chat. */
export function connect(backend: FakeBackend, userId: string): FakeChat {
  const { state } = backend
  if (!state.connections.some((entry) => entry.userId === userId)) state.connections = [...state.connections, person(userId)]
  state.likers = state.likers.filter((entry) => entry.userId !== userId)
  let chat = state.chats.get(userId)
  if (!chat) {
    chat = { chatId: `00000000-0000-4000-8000-${String(state.chats.size + 1).padStart(12, '0')}`, userId, messages: [] }
    state.chats.set(userId, chat)
  }
  return chat
}

let invites = 0

/** `userId`, connected with ME, invites ME on a date tomorrow; returns the stored event. */
export function invitedBy(backend: FakeBackend, userId: string, patch: Partial<CalendarEvent> = {}): CalendarEvent {
  connect(backend, userId)
  invites += 1
  const start = Date.now() + 24 * 60 * 60 * 1000
  const event: CalendarEvent = {
    eventId: `00000000-0000-4000-a000-${String(invites).padStart(12, '0')}`,
    inviterId: userId,
    inviteeId: ME,
    title: 'Drinks',
    description: null,
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + 2 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    latitude: null,
    longitude: null,
    createdAt: new Date().toISOString(),
    ...patch,
  }
  backend.state.events.push(event)
  return event
}

let inbound = 0

/** A message from `userId` to ME, stored as the backend would; returns it as the socket carries it. */
export function incoming(backend: FakeBackend, userId: string, text: string): ChatMessage {
  const chat = connect(backend, userId)
  inbound += 1
  const message: ChatMessage = {
    messageId: `in-${inbound}`,
    content: text,
    timestamp: Date.now(),
    userId,
    username: userId,
    status: 'sent',
    profilePictureUrl: null,
  }
  chat.messages.push(message)
  return message
}
