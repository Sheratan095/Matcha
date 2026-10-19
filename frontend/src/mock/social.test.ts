import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subscription } from 'rxjs'
import type { Card, LoginResult, Match, Message, RealtimeEvent, RewindResult, SwipeResult } from '@/api/types'
import { installMockBackend, mockEvents$, uninstallMockBackend } from './index'
import { call } from './testkit'

const DECK = '/__mock/social/discover?ageMin=18&ageMax=45&distance=50&sort=best'

let events: RealtimeEvent[] = []
let subscription: Subscription | null = null

async function login(username: string): Promise<string> {
  const answer = await call<LoginResult>('POST', '/__mock/auth/login', { username, password: '1234' })
  return answer.data.userId
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') })
  installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
  events = []
  subscription = mockEvents$.subscribe((event) => events.push(event))
})

afterEach(() => {
  subscription?.unsubscribe()
  uninstallMockBackend()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a new viewer', () => {
  it('starts with matches (some unread), 4-6 likes and a deck where many liked them', async () => {
    await login('alice')
    const matches = (await call<Match[]>('GET', '/__mock/social/matches')).data
    expect(matches.length).toBeGreaterThanOrEqual(3)
    expect(matches.length).toBeLessThanOrEqual(4)
    expect(matches.some((match) => match.unread > 0)).toBe(true)
    // the fourth starter match (open-minded viewers only) is fresh: nobody wrote yet
    expect(matches.some((match) => match.lastMessage === null)).toBe(matches.length === 4)
    const activity = matches.map((match) => Date.parse(match.lastMessage?.sentAt ?? match.matchedAt))
    expect(activity).toEqual([...activity].sort((a, b) => b - a))

    const likes = (await call<Card[]>('GET', '/__mock/social/likes')).data
    expect(likes.length).toBeGreaterThanOrEqual(4)
    expect(likes.length).toBeLessThanOrEqual(6)
    expect(likes.every((card) => card.likedYou)).toBe(true)

    const deck = (await call<Card[]>('GET', DECK)).data
    expect(deck.length).toBeGreaterThan(10)
    expect(deck.length).toBeLessThanOrEqual(20)
    const matchedIds = new Set(matches.map((match) => match.profile.userId))
    expect(deck.some((card) => matchedIds.has(card.userId))).toBe(false)
    // alice is a woman open to everyone: everyone in her deck is open to women
    expect(deck.every((card) => card.sexualPreference !== 'male')).toBe(true)
    expect(deck.filter((card) => card.likedYou).length).toBe(likes.length)
    // alice likes travel and reading
    expect(deck.some((card) => card.commonTags.includes('travel') || card.commonTags.includes('reading'))).toBe(true)
    for (const card of deck) {
      expect(card.pictures.length).toBeGreaterThanOrEqual(2)
      expect(card.pictures.length).toBeLessThanOrEqual(4)
      // lastSeen is null exactly when online
      expect(card.lastSeen === null).toBe(card.online)
      if (card.lastSeen) expect(Date.parse(card.lastSeen)).toBeLessThanOrEqual(Date.now())
    }
    expect(deck.some((card) => card.online)).toBe(true)
    expect(deck.some((card) => !card.online)).toBe(true)
  })

  it('is the same world for the same viewer, and a different one for another viewer', async () => {
    await login('alice')
    const first = (await call<Match[]>('GET', '/__mock/social/matches')).data.map((match) => match.profile.userId)
    localStorage.clear()
    uninstallMockBackend()
    installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
    await login('alice')
    const again = (await call<Match[]>('GET', '/__mock/social/matches')).data.map((match) => match.profile.userId)
    expect(again.sort()).toEqual(first.slice().sort())
  })

  it('needs a viewer', async () => {
    expect(await call('GET', DECK)).toEqual({
      status: 401,
      data: { message: 'Missing or invalid access token', error: 'Unauthorized', statusCode: 401 },
    })
  })
})

describe('every orientation', () => {
  const cases = [
    ['male', 'female'],
    ['female', 'male'],
    ['male', 'male'],
    ['female', 'female'],
    ['other', 'both'],
    ['female', 'both'],
  ] as const

  it.each(cases)('a %s viewer into %s gets compatible matches, 4-6 likes and a usable deck', async (gender, preference) => {
    const username = `u_${gender}_${preference}`
    await call('POST', '/__mock/auth/register', {
      username,
      email: `${username}@example.com`,
      password: 'long enough password',
      firstName: 'Demo',
      lastName: 'Viewer',
    })
    const mail = (await call<{ token: string }[]>('GET', '/__mock/dev/inbox')).data[0]!
    await call('POST', '/__mock/auth/verify-email', { token: mail.token })
    await call('POST', '/__mock/auth/login', { username, password: 'long enough password' })
    // the starter world is seeded before onboarding (no orientation yet)...
    await call('GET', '/__mock/social/matches')
    await call('PATCH', '/__mock/profile', { gender, sexualPreference: preference, biography: 'Hi.', interests: ['music'] })
    // ...and reseeded for the orientation, since the viewer has not done anything yet
    const matches = (await call<Match[]>('GET', '/__mock/social/matches')).data
    const likes = (await call<Card[]>('GET', '/__mock/social/likes')).data
    const deck = (await call<Card[]>('GET', DECK)).data
    const fits = (card: Card) =>
      (preference === 'both' || card.gender === preference) &&
      (card.sexualPreference === 'both' || card.sexualPreference === 'other' || card.sexualPreference === gender)
    expect(matches.length).toBeGreaterThanOrEqual(3)
    expect(matches.every((match) => fits(match.profile))).toBe(true)
    expect(likes.length).toBeGreaterThanOrEqual(4)
    expect(likes.length).toBeLessThanOrEqual(6)
    expect(deck.every(fits)).toBe(true)
    // same-gender viewers have the smallest pool (10 of 36 people fit both ways)
    expect(deck.length).toBeGreaterThanOrEqual(6)
    console.info(`${gender}/${preference}: ${matches.length} matches, ${likes.length} likes, deck ${deck.length} (${Math.round((100 * deck.filter((c) => c.likedYou).length) / deck.length)}% liked you)`)
  })
})

describe('discover', () => {
  it('filters by age, distance and tags, and sorts', async () => {
    await login('testuser')
    const young = (await call<Card[]>('GET', '/__mock/social/discover', undefined, { params: { ageMin: 20, ageMax: 26, distance: 50, sort: 'age', tags: null } })).data
    expect(young.length).toBeGreaterThan(0)
    expect(young.every((card) => card.age >= 20 && card.age <= 26 && card.distanceKm <= 50)).toBe(true)
    expect(young.map((card) => card.age)).toEqual(young.map((card) => card.age).sort((a, b) => a - b))
    // testuser is other/other: only people open to everyone
    expect(young.every((card) => card.sexualPreference === 'both' || card.sexualPreference === 'other')).toBe(true)

    const far = (await call<Card[]>('GET', '/__mock/social/discover', undefined, { params: { ageMin: 18, ageMax: 99, distance: 1000, sort: 'distance' } })).data
    expect(far.map((card) => card.distanceKm)).toEqual(far.map((card) => card.distanceKm).sort((a, b) => a - b))
    expect(far.some((card) => card.distanceKm > 50)).toBe(true)

    const tagged = (await call<Card[]>('GET', '/__mock/social/discover', undefined, { params: { ageMin: 18, ageMax: 99, distance: 1000, sort: 'fame', tags: '#Coffee, vinyl' } })).data
    expect(tagged.length).toBeGreaterThan(0)
    expect(tagged.every((card) => card.interests.some((tag) => tag.name === 'coffee' || tag.name === 'vinyl'))).toBe(true)
    expect(tagged.map((card) => card.fame)).toEqual(tagged.map((card) => card.fame).sort((a, b) => b - a))

    expect(await call('GET', '/__mock/social/discover?ageMin=12&sort=random')).toEqual({
      status: 400,
      data: {
        message: ['ageMin must not be less than 18', 'sort must be one of the following values: best, distance, fame, age'],
        error: 'Bad Request',
        statusCode: 400,
      },
    })
  })

  it('answers [] once the deck is exhausted', async () => {
    await login('testuser')
    for (;;) {
      const deck = (await call<Card[]>('GET', DECK)).data
      if (deck.length === 0) break
      for (const card of deck) await call('POST', '/__mock/social/swipes', { targetId: card.userId, action: 'pass' })
    }
    expect((await call<Card[]>('GET', DECK)).data).toEqual([])
  })
})

describe('the social journey', () => {
  it('like someone who liked you -> match -> message -> typing and reply -> unmatch / block -> reset', async () => {
    const aliceId = await login('alice')
    const seeded = (await call<Match[]>('GET', '/__mock/social/matches')).data
    const deck = (await call<Card[]>(`GET`, DECK)).data
    const admirer = deck.find((card) => card.likedYou) as Card
    expect(admirer).toBeDefined()

    const swiped = await call<SwipeResult>('POST', '/__mock/social/swipes', { targetId: admirer.userId, action: 'like' })
    expect(swiped.status).toBe(200)
    const match = swiped.data.match as Match
    expect(match).toMatchObject({ profile: { userId: admirer.userId }, lastMessage: null, unread: 0 })
    expect((await call<Match[]>('GET', '/__mock/social/matches')).data.map((m) => m.id)).toContain(match.id)
    expect((await call<Card[]>('GET', '/__mock/social/likes')).data.some((card) => card.userId === admirer.userId)).toBe(false)
    expect((await call<Card[]>('GET', DECK)).data.some((card) => card.userId === admirer.userId)).toBe(false)
    expect(await call('POST', '/__mock/social/swipes', { targetId: admirer.userId, action: 'like' })).toEqual({
      status: 409,
      data: { message: 'Already swiped', error: 'Conflict', statusCode: 409 },
    })

    const sent = await call<Message>('POST', '/__mock/social/messages', { matchId: match.id, text: '  Hi! How are you?  ' })
    expect(sent.data).toMatchObject({ matchId: match.id, senderId: aliceId, text: 'Hi! How are you?' })
    await vi.advanceTimersByTimeAsync(5_100)
    const typing = events.findIndex((event) => event.type === 'typing' && event.matchId === match.id && event.userId === admirer.userId)
    const reply = events.findIndex((event) => event.type === 'message' && event.matchId === match.id)
    expect(typing).toBeGreaterThanOrEqual(0)
    expect(reply).toBeGreaterThan(typing)
    const replyEvent = events[reply] as Extract<RealtimeEvent, { type: 'message' }>
    expect(replyEvent.message.senderId).toBe(admirer.userId)
    expect(replyEvent.message.text.length).toBeGreaterThan(0)

    // persisted before it was pushed: the refetch sees it, unread until the conversation is read
    const listed = (await call<Match[]>('GET', '/__mock/social/matches')).data.find((m) => m.id === match.id) as Match
    expect(listed.unread).toBeGreaterThanOrEqual(1)
    expect(listed.lastMessage?.senderId).toBe(admirer.userId)
    expect(listed.profile.online).toBe(true)
    const conversation = (await call<Message[]>('GET', `/__mock/social/matches/${match.id}/messages`)).data
    expect(conversation[0]?.text).toBe('Hi! How are you?')
    expect(conversation.some((message) => message.id === replyEvent.message.id)).toBe(true)
    expect((await call<Match[]>('GET', '/__mock/social/matches')).data.find((m) => m.id === match.id)?.unread).toBe(0)

    expect(await call('POST', '/__mock/social/messages', { matchId: match.id, text: '   ' })).toEqual({
      status: 400,
      data: {
        message: ['text must be longer than or equal to 1 characters', 'text should not be empty'],
        error: 'Bad Request',
        statusCode: 400,
      },
    })

    // unmatch: the conversation is gone, the person does not come back
    expect(await call('DELETE', `/__mock/social/matches/${match.id}`)).toEqual({ status: 200, data: { ok: true } })
    expect(await call('GET', `/__mock/social/matches/${match.id}/messages`)).toEqual({
      status: 404,
      data: { message: 'Match not found', error: 'Not Found', statusCode: 404 },
    })

    // block a seeded match: match removed, person hidden everywhere
    const victim = seeded[0] as Match
    expect(await call('POST', '/__mock/social/blocks', { userId: victim.profile.userId, reason: 'spam' })).toEqual({ status: 200, data: { ok: true } })
    expect((await call<Match[]>('GET', '/__mock/social/matches')).data.some((m) => m.id === victim.id)).toBe(false)
    expect((await call('GET', `/__mock/social/profiles/${victim.profile.userId}`)).status).toBe(404)

    // reset restores the starter world
    expect(await call('POST', '/__mock/social/reset', {})).toEqual({ status: 200, data: { ok: true } })
    const restored = (await call<Match[]>('GET', '/__mock/social/matches')).data
    expect(restored.map((m) => m.profile.userId).sort()).toEqual(seeded.map((m) => m.profile.userId).sort())
    expect((await call<Card>('GET', `/__mock/social/profiles/${victim.profile.userId}`)).status).toBe(200)
    // swipes are cleared too: the admirer is back in the deck, still liking alice
    const again = (await call<Card[]>('GET', DECK)).data.find((card) => card.userId === admirer.userId)
    expect(again?.likedYou).toBe(true)
  })

  it('rewinds a pass but not a match', async () => {
    await login('alice')
    const deck = (await call<Card[]>('GET', DECK)).data
    const other = deck.find((card) => !card.likedYou) as Card
    const admirer = deck.find((card) => card.likedYou) as Card
    expect((await call<RewindResult>('POST', '/__mock/social/swipes/rewind', {})).data).toEqual({ restored: null })

    await call('POST', '/__mock/social/swipes', { targetId: other.userId, action: 'pass' })
    const rewound = await call<RewindResult>('POST', '/__mock/social/swipes/rewind', new FormData())
    expect(rewound.data.restored?.userId).toBe(other.userId)
    expect((await call<Card[]>('GET', DECK)).data.some((card) => card.userId === other.userId)).toBe(true)

    await call('POST', '/__mock/social/swipes', { targetId: admirer.userId, action: 'superlike' })
    expect((await call<RewindResult>('POST', '/__mock/social/swipes/rewind', {})).data).toEqual({ restored: null })
  })

  it('stops talking when the viewer leaves (no timer leaks across viewers)', async () => {
    await login('alice')
    const match = (await call<Match[]>('GET', '/__mock/social/matches')).data[0] as Match
    await call('POST', '/__mock/social/messages', { matchId: match.id, text: 'Hello?' })
    await call('POST', '/__mock/auth/logout', {})
    await login('testuser')
    await call('GET', '/__mock/social/matches')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(events.some((event) => event.type === 'message' && event.matchId === match.id)).toBe(false)
    expect(events.some((event) => event.type === 'typing' && event.matchId === match.id)).toBe(false)

    // back as alice: the pending reply was persisted and is delivered then
    await call('POST', '/__mock/auth/logout', {})
    await login('alice')
    await call('GET', '/__mock/social/matches')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(events.some((event) => event.type === 'message' && event.matchId === match.id)).toBe(true)
  })

  it('reset cancels pending replies', async () => {
    await login('alice')
    const match = (await call<Match[]>('GET', '/__mock/social/matches')).data[0] as Match
    await call('POST', '/__mock/social/messages', { matchId: match.id, text: 'Are you there?' })
    await call('POST', '/__mock/social/reset', {})
    await vi.advanceTimersByTimeAsync(10_000)
    expect(events.some((event) => event.type === 'message' || event.type === 'typing')).toBe(false)
  })

  it('sends a like now and then while the viewer is active, and only then', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    await login('alice')
    const before = (await call<Card[]>('GET', '/__mock/social/likes')).data.length
    await vi.advanceTimersByTimeAsync(70_000)
    const like = events.find((event) => event.type === 'like')
    expect(like).toBeDefined()
    const likes = (await call<Card[]>('GET', '/__mock/social/likes')).data
    expect(likes).toHaveLength(before + 1)
    expect(likes[0]?.userId).toBe(like?.type === 'like' ? like.from.userId : null)

    // idle for a long time: nothing more
    events = []
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(events.filter((event) => event.type === 'like').length).toBeLessThanOrEqual(1)
  })
})

describe('real-backend mode', () => {
  it('serves the social endpoints to getViewerId() with defaults', async () => {
    let viewer: string | null = null
    installMockBackend({ auth: false, getViewerId: () => viewer, latency: 0 })
    expect((await call('GET', DECK)).status).toBe(401)
    viewer = '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963'
    const deck = (await call<Card[]>('GET', DECK)).data
    expect(deck.length).toBe(20)
    expect(deck.every((card) => card.commonTags.length === 0)).toBe(true)
    expect((await call<string[]>('GET', '/__mock/social/tags')).data).toContain('vegan')
  })
})
