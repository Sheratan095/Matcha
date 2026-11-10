/**
 * Test-only: a small stateful backend behind the fake adapter, enough for the flows the actions run.
 * Independent of src/mock on purpose: these tests check the state layer, not the mock backend.
 */
import type { Card, Match, Message, OwnProfile, Profile } from '@/api/types'
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

export interface FakeBackend {
  server: FakeServer
  state: {
    session: string | null
    profile: OwnProfile
    deck: Card[]
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
    deck: [card('ann', { likedYou: true }), card('bea'), card('cid')],
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
    .on('GET', `${SOCIAL_URL}/discover`, () =>
      state.session ? state.deck.filter((person) => !state.swiped.has(person.userId)) : unauthorized(),
    )
    .on('POST', `${SOCIAL_URL}/swipes`, ({ body }) => {
      const { targetId, action } = body as { targetId: string; action: string }
      state.swiped.add(targetId)
      const person = state.deck.find((entry) => entry.userId === targetId)
      if (!person || action === 'pass' || !person.likedYou) return { match: null }
      const match: Match = { id: `m-${targetId}`, profile: person, matchedAt: new Date().toISOString(), lastMessage: null, unread: 0 }
      state.matches = [match, ...state.matches]
      state.likes = state.likes.filter((entry) => entry.userId !== targetId)
      return { match }
    })
    .on('POST', `${SOCIAL_URL}/swipes/rewind`, () => ({ restored: null }))
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
    .on('GET', `${SOCIAL_URL}/tags`, () => ['art', 'music'])
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
