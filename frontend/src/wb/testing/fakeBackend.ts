/**
 * Test-only: a small stateful backend behind the fake adapter, enough for the flows the actions run.
 * Independent of src/mock on purpose: these tests check the state layer, not the mock backend.
 */
import type { Card, DeckCard, Match, Message, OwnProfile, Profile } from '@/api/types'
import { API_URL, SOCIAL_URL } from '@/config'
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

export function card(userId: string, patch: Partial<Card> = {}): Card {
  return {
    ...profile(userId, { firstName: userId }),
    age: 30,
    city: 'Paris',
    distanceKm: 3,
    fame: 50,
    online: true,
    lastSeen: null,
    likedYou: false,
    commonTags: [],
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

export interface FakeBackend {
  server: FakeServer
  state: {
    session: string | null
    profile: OwnProfile
    /** GET /profile/discover, best first. */
    deck: DeckCard[]
    liked: Set<string>
    passed: Set<string>
    /** People of the mocked social service (likes received, matches, chat). */
    people: Card[]
    swiped: Set<string>
    matches: Match[]
    messages: Map<string, Message[]>
    likes: Card[]
  }
}

export function createFakeBackend(): FakeBackend {
  const server = new FakeServer()
  const state: FakeBackend['state'] = {
    session: null,
    profile: { ...profile(ME), latitude: null, longitude: null },
    deck: [deckCard('ann', { likesYou: true }), deckCard('bea'), deckCard('cid')],
    liked: new Set(),
    passed: new Set(),
    people: [card('ann', { likedYou: true }), card('bea'), card('cid')],
    swiped: new Set(),
    matches: [],
    messages: new Map(),
    likes: [],
  }
  const unauthorized = () => nestError(401, 'Missing or invalid access token', 'Unauthorized')
  let counter = 0

  server
    .on('GET', `${API_URL}/auth/validate`, () => ({ valid: state.session !== null, userId: state.session }))
    .on('POST', `${API_URL}/auth/login`, ({ body }) => {
      const { username, password } = body as { username: string; password: string }
      if (username !== 'testuser' || password !== '1234') return nestError(403, 'Invalid credentials', 'Forbidden')
      state.session = ME
      return { message: 'Login successful', userId: ME, isProfileComplete: false }
    })
    .on('POST', `${API_URL}/auth/logout`, () => {
      state.session = null
      return { message: 'Logged out successfully' }
    })
    .on('POST', `${API_URL}/auth/refresh`, () => nestError(403, 'Invalid refresh token', 'Forbidden'))
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
      const left = state.deck.filter((person) => !state.liked.has(person.userId))
      return [...left.filter((person) => !state.passed.has(person.userId)), ...left.filter((person) => state.passed.has(person.userId))]
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
        .filter((person) => q === null || person.username.toLowerCase().includes(q) || (person.firstName ?? '').toLowerCase().includes(q))
        .filter((person) => (minAge === null || person.age >= minAge) && (maxAge === null || person.age <= maxAge))
        .filter((person) => maxKm === null || (person.distanceKm !== null && person.distanceKm <= maxKm))
        .filter((person) => minFame === null || person.fameRating >= minFame)
        .map((person) => {
          const result = { ...person }
          delete result.likesYou
          return result
        })
    })
    .on('POST', `${API_URL}/profile/:id/like`, ({ route }) => {
      if (!state.session) return unauthorized()
      const person = state.deck.find((entry) => entry.userId === route.id)
      if (!person) return nestError(404, 'User not found', 'Not Found')
      const created = !state.liked.has(route.id)
      state.liked.add(route.id)
      return { liked: true, matched: created && person.likesYou === true }
    })
    .on('DELETE', `${API_URL}/profile/:id/like`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.liked.delete(route.id)
      return reply(200, '')
    })
    .on('POST', `${API_URL}/profile/:id/pass`, ({ route }) => {
      if (!state.session) return unauthorized()
      state.passed.add(route.id)
      return reply(200, '')
    })
    .on('GET', `${API_URL}/profile/matches/map`, () => (state.session ? { matches: [] } : unauthorized()))
    .on('GET', `${API_URL}/profile/interests`, () =>
      state.session ? { interests: [{ id: 't1', name: 'music' }, { id: 't2', name: 'art' }] } : unauthorized(),
    )
    .on('POST', `${SOCIAL_URL}/swipes`, ({ body }) => {
      const { targetId, action } = body as { targetId: string; action: string }
      state.swiped.add(targetId)
      const person = state.people.find((entry) => entry.userId === targetId)
      if (!person || action === 'pass' || !person.likedYou) return { match: null }
      const match: Match = { id: `m-${targetId}`, profile: person, matchedAt: new Date().toISOString(), lastMessage: null, unread: 0 }
      state.matches = [match, ...state.matches]
      state.likes = state.likes.filter((entry) => entry.userId !== targetId)
      return { match }
    })
    .on('GET', `${SOCIAL_URL}/matches`, () => (state.session ? state.matches : unauthorized()))
    .on('GET', `${SOCIAL_URL}/matches/:id/messages`, ({ route }) => {
      const list = state.messages.get(route.id) ?? []
      state.matches = state.matches.map((match) => (match.id === route.id ? { ...match, unread: 0 } : match))
      return list
    })
    .on('POST', `${SOCIAL_URL}/messages`, ({ body }) => {
      const { matchId, text } = body as { matchId: string; text: string }
      const message: Message = { id: `msg${++counter}`, matchId, senderId: ME, text, sentAt: new Date().toISOString() }
      state.messages.set(matchId, [...(state.messages.get(matchId) ?? []), message])
      state.matches = state.matches.map((match) => (match.id === matchId ? { ...match, lastMessage: message } : match))
      return message
    })
    .on('GET', `${SOCIAL_URL}/likes`, () => (state.session ? state.likes : unauthorized()))
    .on('POST', `${SOCIAL_URL}/reset`, () => {
      state.swiped.clear()
      state.matches = []
      return reply(200, { ok: true })
    })

  return { server, state }
}

/** Inbound message from the other person, as the mock would create it. */
export function incoming(backend: FakeBackend, matchId: string, text: string): Message {
  const message: Message = { id: `in-${text}`, matchId, senderId: 'ann', text, sentAt: new Date().toISOString() }
  backend.state.messages.set(matchId, [...(backend.state.messages.get(matchId) ?? []), message])
  backend.state.matches = backend.state.matches.map((match) =>
    match.id === matchId ? { ...match, lastMessage: message, unread: match.unread + 1 } : match,
  )
  return message
}
