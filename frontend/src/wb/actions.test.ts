import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ERROR } from '@/api/http'
import type { RealtimeEvent } from '@/api/types'
import { API_URL } from '@/config'
import { actions, reloadOpenChat } from './actions'
import { load, REVISIT_MS } from './demand'
import { DEFAULT_DISCOVER_FILTERS } from './filters'
import { realtime$, startRealtime } from './realtime'
import { getNodeStatus, getNodeValue, setNode } from './store'
import { connect, deckCard, incoming, ME, person } from './testing/fakeBackend'
import { nestError, reply } from './testing/fakeServer'
import { flush, startTestStore, type TestStore } from './testing/harness'

let store: TestStore
const server = () => store.backend.server

beforeEach(async () => {
  store = await startTestStore()
  await actions.bootSession()
})

afterEach(() => {
  store.stop()
})

async function signIn(): Promise<void> {
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
}

const COMPLETE = { gender: 'female', sexualPreference: 'both', biography: 'Hello', interests: ['#Tea', 'tea', ' Hiking '] } as const

describe('session', () => {
  it('rejects bad credentials with the backend error and stays anonymous', async () => {
    await expect(actions.login({ username: 'testuser', password: 'nope' })).rejects.toMatchObject({
      status: 403,
      message: 'Invalid credentials',
    })
    expect(getNodeValue('authStatus')).toBe('anonymous')
  })

  it('login re-probes and resolves once sessionUserId is set', async () => {
    const result = await actions.login({ username: 'testuser', password: '1234' })
    expect(result.userId).toBe(ME)
    expect(getNodeValue('sessionUserId')).toBe(ME)
    expect(getNodeValue('authStatus')).toBe('authenticated')
    await flush(30)
    expect(getNodeValue('myProfile')?.userId).toBe(ME)
    expect(getNodeValue('profileComplete')).toBe(false)
  })

  it('login rejects with NO_SESSION when the probe finds no session afterwards', async () => {
    server().on('GET', `${API_URL}/auth/validate`, () => ({ valid: false, userId: null }))
    await expect(actions.login({ username: 'testuser', password: '1234' })).rejects.toMatchObject({ code: LOCAL_ERROR.NO_SESSION })
  })

  it('logout resets the authenticated reads and the per-user selection state', async () => {
    await signIn()
    await actions.setFilters({ ageMax: 60, tags: ['art'] })
    setNode('activeChatUserId', 'ann')
    setNode('unreadByUser', { ann: 2 })
    setNode('swipedIds', ['bea'])
    await actions.logout()
    expect(getNodeValue('sessionUserId')).toBeNull()
    expect(getNodeValue('myProfile')).toBeNull()
    expect(getNodeValue('discoverDeck')).toBeNull()
    expect(getNodeValue('activeChatUserId')).toBeNull()
    expect(getNodeValue('unreadByUser')).toEqual({})
    expect(getNodeValue('swipedIds')).toEqual([])
    expect(getNodeValue('filterAgeMax')).toBe(DEFAULT_DISCOVER_FILTERS.ageMax)
    expect(getNodeValue('filterTags')).toBeNull()
    await flush(30)
    // Nothing authenticated was requested after the session ended.
    const last = server().requests.at(-1)
    expect(`${last?.method} ${last?.url}`).toBe(`GET ${API_URL}/auth/validate`)
  })

  it('logout still signs out when the backend answers 401 (the session was already gone)', async () => {
    await signIn()
    // e.g. the access cookie expired and a sign-in elsewhere replaced the refresh token (one per user)
    server().on('POST', `${API_URL}/auth/logout`, () => {
      store.backend.state.session = null
      return nestError(401, 'Missing or invalid access token', 'Unauthorized')
    })
    await expect(actions.logout()).resolves.toBeUndefined()
    expect(getNodeValue('sessionUserId')).toBeNull()
    expect(getNodeValue('authStatus')).toBe('anonymous')
  })

  it('logout still rejects on other failures', async () => {
    await signIn()
    server().on('POST', `${API_URL}/auth/logout`, () => nestError(500, 'Internal server error', 'Internal Server Error'))
    await expect(actions.logout()).rejects.toMatchObject({ status: 500 })
  })

  it('a failed profile only reports the error: nothing is sent to repair it', async () => {
    server().on('GET', `${API_URL}/profile`, () => nestError(500, 'Failed to fetch profile', 'Internal Server Error'))
    await signIn()
    await flush(50)
    expect(server().requests.some((request) => request.method === 'POST' && request.url === `${API_URL}/profile`)).toBe(false)
    expect(getNodeStatus('myProfile')).toMatchObject({ status: 'error', error: { status: 500 } })
  })
})

describe('own profile', () => {
  it('updateProfile resolves once myProfile and profileComplete reflect the change', async () => {
    await signIn()
    expect(getNodeValue('profileComplete')).toBe(false)
    const saved = await actions.updateProfile({ ...COMPLETE, interests: [...COMPLETE.interests] })
    expect(server().sent('PATCH', `${API_URL}/profile`)[0].body).toEqual({
      gender: 'female',
      sexualPreference: 'both',
      biography: 'Hello',
      interests: ['tea', 'hiking'],
    })
    expect(saved.biography).toBe('Hello')
    expect(getNodeValue('myProfile')?.biography).toBe('Hello')
    // still no location: discover would answer 403
    expect(getNodeValue('profileComplete')).toBe(false)
  })

  it('setLocation stores the position and completes the profile once myProfile has it', async () => {
    await signIn()
    await actions.updateProfile({ ...COMPLETE, interests: [...COMPLETE.interests] })
    await actions.setLocation({ latitude: 41.8905, longitude: 12.5127 })
    expect(server().sent('PUT', `${API_URL}/profile/location`)[0].body).toEqual({ latitude: 41.8905, longitude: 12.5127 })
    expect(getNodeValue('myProfile')).toMatchObject({ latitude: 41.8905, longitude: 12.5127 })
    expect(getNodeValue('profileComplete')).toBe(true)
  })

  it('setLocation refuses impossible coordinates without a request', async () => {
    await signIn()
    await expect(actions.setLocation({ latitude: 91, longitude: 0 })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    await expect(actions.setLocation({ latitude: 0, longitude: Number.NaN })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    expect(server().sent('PUT', `${API_URL}/profile/location`)).toHaveLength(0)
  })

  it('uploads a picture as multipart field "file" and validates it first', async () => {
    await signIn()
    await expect(actions.uploadPicture(new Blob(['x'], { type: 'image/gif' }))).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    const result = await actions.uploadPicture(new File(['png'], 'me.png', { type: 'image/png' }))
    expect(result.pictures).toHaveLength(1)
    expect(getNodeValue('myProfile')?.pictures).toHaveLength(1)
    expect(server().sent('POST', `${API_URL}/profile/pictures`)[0].body).toBeInstanceOf(FormData)
    expect(getNodeValue('pictureUploadPayload')).toBeNull()
  })

  it('refuses ids that would change the URL shape', async () => {
    await signIn()
    await expect(actions.deletePicture('../profile')).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    expect(server().requests.some((request) => request.method === 'DELETE')).toBe(false)
  })
})

describe('discover', () => {
  const DISCOVER = `${API_URL}/profile/discover`
  const ids = () => getNodeValue('visibleDeck')?.map((card) => card.userId)

  /** Signs in and opens /discover: the deck loads on demand. */
  async function openDeck(): Promise<void> {
    await signIn()
    await load('discoverDeck')
  }

  it('the deck waits for /discover: nothing is sent for it at sign-in, one request when it is asked for', async () => {
    await signIn()
    expect(server().sent('GET', DISCOVER)).toHaveLength(0)
    expect(getNodeValue('visibleDeck')).toBeNull()
    // a profile change elsewhere does not fetch a deck nobody asked for
    await actions.updateProfile({ gender: 'female' })
    expect(server().sent('GET', DISCOVER)).toHaveLength(0)
    // StrictMode mounts the page twice: the second ask joins the first load
    await Promise.all([load('discoverDeck'), load('discoverDeck')])
    expect(server().sent('GET', DISCOVER)).toHaveLength(1)
    expect(ids()).toEqual(['ann', 'bea', 'cid'])
    // coming back to the page: the deck is kept (swipes, filters and "reload" refetch it)
    await load('discoverDeck')
    expect(server().sent('GET', DISCOVER)).toHaveLength(1)
  })

  it('setFilters sends the backend filters with one deck request; the sort is applied locally', async () => {
    await openDeck()
    const before = server().sent('GET', DISCOVER).length
    await actions.setFilters({ ageMin: 21, ageMax: 30, fameMin: 40, sort: 'fame', tags: ['#Art', 'music'] })
    const sent = server().sent('GET', DISCOVER)
    expect(sent.length - before).toBe(1)
    expect(sent.at(-1)?.params).toEqual({ minAge: 21, maxAge: 30, maxDistanceKm: 50, minFame: 40, tags: 'art,music' })
    expect(getNodeValue('discoverDeck')).not.toBeNull()
    await expect(actions.setFilters({ ageMin: 40, ageMax: 30 })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    await expect(actions.setFilters({ distance: 500 })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
  })

  it('changing only the sort reorders the deck without a request', async () => {
    await openDeck()
    store.backend.state.deck[1].fameRating = 90
    store.backend.state.deck[2].age = 20
    await actions.reloadDeck()
    const before = server().sent('GET', DISCOVER).length
    await actions.setFilters({ sort: 'fame' })
    expect(ids()).toEqual(['bea', 'ann', 'cid'])
    await actions.setFilters({ sort: 'age' })
    expect(ids()).toEqual(['cid', 'ann', 'bea'])
    await actions.setFilters({ sort: 'best' })
    expect(ids()).toEqual(['ann', 'bea', 'cid'])
    expect(server().sent('GET', DISCOVER).length).toBe(before)
  })

  it('a like that completes a match says so, and the card leaves visibleDeck', async () => {
    await openDeck()
    const ann = getNodeValue('visibleDeck')?.find((card) => card.userId === 'ann')
    expect(ann).toBeDefined()
    const result = await actions.swipe(ann!, 'like')
    expect(result.matched).toBe(true)
    expect(server().sent('POST', `${API_URL}/profile/ann/like`)).toHaveLength(1)
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'ann')).toBe(false)
    // the new connection shows up in the matches
    await flush(30)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['ann'])
  })

  it('a pass posts to /pass and is not a match', async () => {
    await openDeck()
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    expect(await actions.swipe(bea, 'pass')).toEqual({ matched: false })
    expect(server().sent('POST', `${API_URL}/profile/bea/pass`)).toHaveLength(1)
  })

  it('a failed swipe puts the card back', async () => {
    await openDeck()
    server().on('POST', `${API_URL}/profile/:id/pass`, () => nestError(500, 'down', 'Internal Server Error'))
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    const pending = actions.swipe(bea, 'pass')
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'bea')).toBe(false)
    await expect(pending).rejects.toMatchObject({ status: 500 })
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'bea')).toBe(true)
  })

  it('rewind brings a pass back on top, and takes a like back with DELETE', async () => {
    await openDeck()
    const [, bea, cid] = getNodeValue('visibleDeck')!
    await actions.swipe(bea, 'pass')
    await actions.swipe(cid, 'like')
    const undoLike = await actions.rewind()
    expect(undoLike.restored?.userId).toBe('cid')
    expect(server().sent('DELETE', `${API_URL}/profile/cid/like`)).toHaveLength(1)
    expect(ids()?.[0]).toBe('cid')
    const undoPass = await actions.rewind()
    expect(undoPass.restored?.userId).toBe('bea')
    expect(ids()?.[0]).toBe('bea')
    expect(await actions.rewind()).toEqual({ restored: null, matched: false })
  })

  it('a like that made a match is not rewound', async () => {
    await openDeck()
    await actions.swipe(getNodeValue('visibleDeck')![0], 'like')
    expect(await actions.rewind()).toEqual({ restored: null, matched: true })
    expect(server().sent('DELETE', `${API_URL}/profile/ann/like`)).toHaveLength(0)
  })

  it('asks for more once the last card is swiped, but the passes of this session stay hidden until reloadDeck', async () => {
    await openDeck()
    const before = server().sent('GET', DISCOVER).length
    for (const card of [...getNodeValue('visibleDeck')!]) await actions.swipe(card, 'pass')
    expect(server().sent('GET', DISCOVER).length).toBe(before + 1)
    // the server ranks the passes last but still sends them: the deck stays empty ("that's everyone")
    expect(ids()).toEqual([])
    // the last pass can still be rewound
    expect((await actions.rewind()).restored?.userId).toBe('cid')
    await actions.reloadDeck()
    expect(ids()).toEqual(['ann', 'bea', 'cid'])
  })

  it('reloads once, after the last swipe in flight, and never shows a card whose like is still on its way', async () => {
    await openDeck()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    server().on('POST', `${API_URL}/profile/:id/like`, async ({ route }) => {
      if (route.id === 'bea') await gate
      store.backend.state.liked.add(route.id)
      return { liked: true, matched: false }
    })
    const [ann, bea, cid] = getNodeValue('visibleDeck')!
    const slow = actions.swipe(bea, 'like')
    await actions.swipe(ann, 'pass')
    // an explicit reload while bea's like is unanswered: bea stays hidden
    await actions.reloadDeck()
    expect(ids()).toEqual(['cid', 'ann'])
    const before = server().sent('GET', DISCOVER).length
    await actions.swipe(cid, 'pass')
    await actions.swipe(getNodeValue('visibleDeck')![0], 'pass')
    expect(server().sent('GET', DISCOVER).length).toBe(before) // bea still in flight: no reload yet
    release()
    await slow
    expect(server().sent('GET', DISCOVER).length).toBe(before + 1)
    expect(ids()).toEqual([])
  })

  it('can like the same person again after a rewind (the same payload is sent again)', async () => {
    await openDeck()
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    await actions.swipe(bea, 'like')
    await actions.rewind()
    await actions.swipe(bea, 'like')
    expect(server().sent('POST', `${API_URL}/profile/bea/like`)).toHaveLength(2)
    expect(ids()?.includes('bea')).toBe(false)
  })

  it('tagCatalogue lists the interest names in use, once a picker asks for them', async () => {
    await openDeck()
    expect(getNodeValue('tagCatalogue')).toBeNull()
    expect(server().sent('GET', `${API_URL}/profile/interests`)).toHaveLength(0)
    await load('interestCatalogue')
    expect(getNodeValue('tagCatalogue')).toEqual(['art', 'music'])
  })
})

describe('likes received', () => {
  it('lists who liked you; liking back connects you and takes them off the list', async () => {
    await signIn()
    await flush(30)
    expect(getNodeValue('likesReceived')?.likes.map((liker) => liker.userId)).toEqual(['ann'])
    const likesBefore = server().sent('GET', `${API_URL}/profile/likes`).length
    await expect(actions.answerLike('ann', 'like')).resolves.toEqual({ matched: true })
    expect(getNodeValue('likesReceived')?.likes).toEqual([])
    await flush(30)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['ann'])
    // one reload of the list, not one for the like and another for the answer
    expect(server().sent('GET', `${API_URL}/profile/likes`).length - likesBefore).toBe(1)
  })

  it('passing on them takes them off the list without connecting', async () => {
    await signIn()
    await flush(30)
    await expect(actions.answerLike('ann', 'pass')).resolves.toEqual({ matched: false })
    expect(server().sent('POST', `${API_URL}/profile/ann/pass`)).toHaveLength(1)
    expect(getNodeValue('likesReceived')?.likes).toEqual([])
  })
})

describe('own connection changes and their echo', () => {
  const MATCHES = `${API_URL}/profile/matches`
  const CHATS = `${API_URL}/chat`

  /** Signed in, with realtime fed by the returned subject. */
  async function live(): Promise<{ source: Subject<RealtimeEvent>; stop: () => void }> {
    await signIn()
    await flush(30)
    const source = new Subject<RealtimeEvent>()
    return { source, stop: startRealtime({ events$: source, socket: false }) }
  }

  it('a like that makes a match refreshes the connections once, though the liker gets `match` too', async () => {
    const { source, stop } = await live()
    // the real backend pushes `match` to both people before it answers, and answers an empty body
    server().on('POST', `${API_URL}/profile/:id/like`, ({ route }) => {
      connect(store.backend, route.id)
      source.next({ type: 'match', person: person(route.id) })
      return reply(200, '')
    })
    const before = { matches: server().sent('GET', MATCHES).length, chats: server().sent('GET', CHATS).length }
    // the echo tells of the match the answer does not carry
    await expect(actions.likeUser('ann', 'like')).resolves.toEqual({ matched: true })
    await flush(40)
    expect(server().sent('GET', MATCHES).length - before.matches).toBe(1)
    expect(server().sent('GET', CHATS).length - before.chats).toBe(1)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['ann'])
    stop()
  })

  it('a `match` that is not the echo of a change made here still refreshes', async () => {
    const { source, stop } = await live()
    const before = server().sent('GET', MATCHES).length
    connect(store.backend, 'bea')
    source.next({ type: 'match', person: person('bea') })
    await flush(40)
    expect(server().sent('GET', MATCHES).length - before).toBe(1)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['bea'])
    stop()
  })

  it('unmatching refreshes the connections once, though the unliker gets `unmatch` too', async () => {
    connect(store.backend, 'ann')
    const { source, stop } = await live()
    server().on('DELETE', `${API_URL}/profile/:id/like`, ({ route }) => {
      store.backend.state.connections = []
      source.next({ type: 'unmatch', person: person(route.id) })
      return reply(200, '')
    })
    const before = server().sent('GET', MATCHES).length
    await actions.unlikeUser('ann')
    await flush(40)
    expect(server().sent('GET', MATCHES).length - before).toBe(1)
    expect(getNodeValue('matches')).toEqual([])
    stop()
  })

  it('a `match` replayed at sign-in, while the first loads are on their way, sends nothing more', async () => {
    // what happened while we were offline: ann connected with us
    connect(store.backend, 'ann')
    const source = new Subject<RealtimeEvent>()
    const stop = startRealtime({ events$: source, socket: false })
    await actions.login({ username: 'testuser', password: '1234' })
    // the backend replays it as soon as the socket connects: the sign-in reads are still loading
    source.next({ type: 'match', person: person('ann') })
    await flush(60)
    expect(server().sent('GET', MATCHES)).toHaveLength(1)
    expect(server().sent('GET', CHATS)).toHaveLength(1)
    expect(server().sent('GET', `${API_URL}/profile/likes`)).toHaveLength(1)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['ann'])
    stop()
  })

  it('a replay of changes already overtaken costs at most one reload per list', async () => {
    await signIn()
    await flush(30)
    await load('myViewers')
    const VIEWERS = `${API_URL}/profile/viewers`
    const before = { viewers: server().sent('GET', VIEWERS).length, matches: server().sent('GET', MATCHES).length }
    // queued while we were offline: three visits, and bea connected then left again
    const source = new Subject<RealtimeEvent>()
    const stop = startRealtime({ events$: source, socket: false })
    for (const who of ['ann', 'bea', 'cid']) source.next({ type: 'view', person: person(who) })
    source.next({ type: 'match', person: person('bea') })
    await flush(5)
    source.next({ type: 'unmatch', person: person('bea') })
    source.next({ type: 'view', person: person('dan') })
    await flush(60)
    expect(server().sent('GET', VIEWERS).length - before.viewers).toBe(1)
    expect(server().sent('GET', MATCHES).length - before.matches).toBe(1)
    stop()
  })

  it('being liked back (`profile-like` then `match`) reloads each list once', async () => {
    const { source, stop } = await live()
    const before = { matches: server().sent('GET', MATCHES).length, likes: server().sent('GET', `${API_URL}/profile/likes`).length }
    connect(store.backend, 'cid')
    source.next({ type: 'like', person: person('cid') })
    source.next({ type: 'match', person: person('cid') })
    await flush(60)
    expect(server().sent('GET', MATCHES).length - before.matches).toBe(1)
    expect(server().sent('GET', `${API_URL}/profile/likes`).length - before.likes).toBe(1)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['cid'])
    stop()
  })

  it('without the socket, a like on someone who liked you first is a match though the answer is empty', async () => {
    await signIn()
    await flush(30)
    // the real backend's empty answer; ann had liked us, so liking her connects us
    server().on('POST', `${API_URL}/profile/:id/like`, ({ route }) => {
      if (route.id === 'ann') connect(store.backend, 'ann')
      return reply(200, '')
    })
    const before = server().sent('GET', MATCHES).length
    // ann is in "likes you"
    await expect(actions.likeUser('ann', 'like')).resolves.toEqual({ matched: true })
    // bea is not: liking her makes no match
    await expect(actions.likeUser('bea', 'like')).resolves.toEqual({ matched: false })
    await flush(30)
    expect(server().sent('GET', MATCHES).length - before).toBe(1)
    expect(getNodeValue('matches')?.map((match) => match.userId)).toContain('ann')
  })

  it('blocking someone who is not a connection leaves the connection lists alone', async () => {
    await signIn()
    await flush(30)
    const before = { matches: server().sent('GET', MATCHES).length, likes: server().sent('GET', `${API_URL}/profile/likes`).length }
    await actions.blockUser('bea')
    await flush(30)
    expect(server().sent('GET', MATCHES).length).toBe(before.matches)
    expect(server().sent('GET', `${API_URL}/profile/likes`).length).toBe(before.likes)
  })
})

describe('profiles, visits and blocks', () => {
  it('a sheet StrictMode closes and reopens at once sends one GET /profile/{id}; a real close drops it', async () => {
    await signIn()
    await flush(30)
    const first = actions.showApiProfile('bea')
    actions.closeProfile()
    const second = actions.showApiProfile('bea')
    await expect(first).resolves.toMatchObject({ userId: 'bea' })
    await expect(second).resolves.toMatchObject({ userId: 'bea' })
    await flush(10)
    expect(server().sent('GET', `${API_URL}/profile/bea`)).toHaveLength(1)
    expect(getNodeValue('apiProfileId')).toBe('bea')
    actions.closeProfile()
    await flush(10)
    expect(getNodeValue('apiProfileId')).toBeNull()
    expect(getNodeValue('apiProfile')).toBeNull()
  })

  it('the visit history loads on demand and is refetched after a profile was opened', async () => {
    await signIn()
    await flush(30)
    const VISITED = `${API_URL}/profile/visited`
    expect(server().sent('GET', VISITED)).toHaveLength(0)
    await load('visitedProfiles', REVISIT_MS)
    expect(getNodeValue('visitedProfiles')).toEqual({ visited: [] })
    // young: a second visit of the tab sends nothing
    await load('visitedProfiles', REVISIT_MS)
    expect(server().sent('GET', VISITED)).toHaveLength(1)
    // opening a profile records a visit: the list is stale, whatever its age
    await actions.showApiProfile('cid')
    await load('visitedProfiles', REVISIT_MS)
    expect(server().sent('GET', VISITED)).toHaveLength(2)
    expect(getNodeValue('visitedProfiles')?.visited.map((entry) => entry.userId)).toEqual(['cid'])
  })

  it('blocked people are listed on demand; unblocking takes them off, a block while it is shown adds them', async () => {
    await signIn()
    await flush(30)
    const BLOCKS = `${API_URL}/profile/blocks`
    await actions.blockUser('bea')
    // nobody asked for the list yet
    expect(server().sent('GET', BLOCKS)).toHaveLength(0)
    await load('blockedUsers')
    expect(getNodeValue('blockedUsers')?.blocks.map((entry) => entry.userId)).toEqual(['bea'])
    await actions.unblockUser('bea')
    expect(server().sent('DELETE', `${API_URL}/profile/bea/block`)).toHaveLength(1)
    expect(getNodeValue('blockedUsers')).toEqual({ blocks: [] })
    await actions.blockUser('cid')
    await flush(30)
    expect(getNodeValue('blockedUsers')?.blocks.map((entry) => entry.userId)).toEqual(['cid'])
    await expect(actions.unblockUser('../x')).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
  })
})

describe('matches and chat', () => {
  async function connected(): Promise<void> {
    connect(store.backend, 'ann')
    await signIn()
    await flush(30)
  }

  it('a connection without a message opens empty, without asking for a history', async () => {
    await connected()
    expect(getNodeValue('matches')).toEqual([
      { userId: 'ann', username: 'ann', profilePictureUrl: 'http://img.test/ann.webp', chatId: null, lastMessage: null, unread: 0 },
    ])
    await expect(actions.openChat('ann')).resolves.toEqual([])
    expect(getNodeValue('activeChatUserId')).toBe('ann')
    expect(getNodeValue('activeChatId')).toBeNull()
    expect(server().requests.some((request) => request.url.startsWith(`${API_URL}/chat/`))).toBe(false)
  })

  it('the first message gives the conversation its chat id and its thread', async () => {
    await connected()
    await actions.openChat('ann')
    await actions.sendMessage('ann', '  hello there  ')
    expect(server().sent('POST', `${API_URL}/chat/message`)[0].body).toEqual({ toUserId: 'ann', content: 'hello there' })
    const chatId = store.backend.state.chats.get('ann')?.chatId
    expect(getNodeValue('activeChatId')).toBe(chatId)
    expect(getNodeValue('chatMessages')?.map((message) => [message.senderId, message.text])).toEqual([[ME, 'hello there']])
    expect(getNodeValue('matches')?.[0]).toMatchObject({ chatId, lastMessage: { text: 'hello there', senderId: ME } })
    await expect(actions.sendMessage('ann', '   ')).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
  })

  it('openChat loads the history and marks it read', async () => {
    await connected()
    const chatId = store.backend.state.chats.get('ann')!.chatId
    incoming(store.backend, 'ann', 'hi')
    await expect(actions.openChat('ann')).resolves.toMatchObject([{ senderId: 'ann', text: 'hi', status: 'sent' }])
    await flush(30)
    expect(server().sent('POST', `${API_URL}/chat/${chatId}/seen`)).toHaveLength(1)

    actions.closeChat()
    expect(getNodeValue('chatMessages')).toBeNull()
  })

  it('a message from someone whose chat is closed counts as unread until it is opened', async () => {
    await connected()
    const source = new Subject<RealtimeEvent>()
    const stop = startRealtime({ events$: source, socket: false })
    const seen: RealtimeEvent[] = []
    const subscription = realtime$.subscribe((event) => seen.push(event))

    const message = incoming(store.backend, 'ann', 'ping')
    const event: RealtimeEvent = {
      type: 'message',
      from: person('ann'),
      message: { id: message.messageId, senderId: 'ann', text: 'ping', sentAt: message.timestamp, status: 'sent' },
    }
    source.next(event)
    expect(getNodeValue('unreadCount')).toBe(1)
    await flush(40)
    expect(seen).toEqual([event])
    expect(getNodeValue('matches')?.[0].lastMessage?.text).toBe('ping')

    await actions.openChat('ann')
    expect(getNodeValue('unreadCount')).toBe(0)
    subscription.unsubscribe()
    stop()
  })

  it('a message for the open conversation reloads its thread and marks it read', async () => {
    await connected()
    incoming(store.backend, 'ann', 'hi')
    await actions.openChat('ann')
    const chatId = store.backend.state.chats.get('ann')!.chatId
    const source = new Subject<RealtimeEvent>()
    const stop = startRealtime({ events$: source, socket: false })

    const message = incoming(store.backend, 'ann', 'again')
    source.next({
      type: 'message',
      from: person('ann'),
      message: { id: message.messageId, senderId: 'ann', text: 'again', sentAt: message.timestamp, status: 'sent' },
    })
    await flush(40)
    expect(getNodeValue('chatMessages')?.map((entry) => entry.text)).toEqual(['hi', 'again'])
    expect(getNodeValue('unreadCount')).toBe(0)
    expect(server().sent('POST', `${API_URL}/chat/${chatId}/seen`).length).toBeGreaterThanOrEqual(2)
    stop()
  })

  it('an open thread is fetched whole once, then only what is new (?after=), merged in', async () => {
    await connected()
    const hi = incoming(store.backend, 'ann', 'hi')
    await actions.openChat('ann')
    const chatId = store.backend.state.chats.get('ann')!.chatId
    const history = () => server().sent('GET', `${API_URL}/chat/${chatId}`).map((request) => request.params)
    expect(history()).toEqual([{}])

    incoming(store.backend, 'ann', 'again')
    await expect(reloadOpenChat('ann')).resolves.toBe(chatId)
    // from a little before the newest message held: the overlap is merged away
    expect(history()).toEqual([{}, { after: hi.timestamp - 2000 }])
    expect(getNodeValue('chatMessages')?.map((entry) => entry.text)).toEqual(['hi', 'again'])

    await actions.sendMessage('ann', 'and me')
    expect(history().at(-1)).toHaveProperty('after')
    expect(getNodeValue('chatMessages')?.map((entry) => entry.text)).toEqual(['hi', 'again', 'and me'])

    // opening it again (or another one) starts from the whole history
    await actions.openChat('ann')
    expect(history().at(-1)).toEqual({})
    expect(getNodeValue('chatMessages')?.map((entry) => entry.text)).toEqual(['hi', 'again', 'and me'])
  })

  it('chat-seen turns my messages in the open thread read, without a request', async () => {
    await connected()
    await actions.openChat('ann')
    await actions.sendMessage('ann', 'hello')
    const chatId = getNodeValue('activeChatId')!
    const source = new Subject<RealtimeEvent>()
    const stop = startRealtime({ events$: source, socket: false })
    const before = server().requests.length
    source.next({ type: 'seen', chatId, userId: 'ann' })
    expect(getNodeValue('chatMessages')?.map((entry) => [entry.text, entry.status])).toEqual([['hello', 'read']])
    await flush(30)
    expect(server().requests.length).toBe(before)
    stop()
  })

  it('unmatching takes the like back, closes the open conversation and refreshes the matches', async () => {
    await connected()
    await actions.openChat('ann')
    await actions.unlikeUser('ann')
    expect(server().sent('DELETE', `${API_URL}/profile/ann/like`)).toHaveLength(1)
    expect(getNodeValue('activeChatUserId')).toBeNull()
    await flush(30)
    expect(getNodeValue('matches')).toEqual([])
  })

  it('blocking a connection closes the open conversation and refreshes the matches', async () => {
    await connected()
    await actions.openChat('ann')
    await actions.blockUser('ann')
    expect(server().sent('POST', `${API_URL}/profile/ann/block`)).toHaveLength(1)
    expect(getNodeValue('activeChatUserId')).toBeNull()
    await flush(30)
    expect(getNodeValue('matches')).toEqual([])
  })
})

describe('search', () => {
  const SEARCH = `${API_URL}/profile/search`
  const HERE = { latitude: 45.07, longitude: 7.69 }
  const sent = () => server().sent('GET', SEARCH)
  const ids = (cards: { userId: string }[] | null | undefined) => (cards ?? []).map((entry) => entry.userId)

  async function ready(): Promise<void> {
    await signIn()
    await actions.setLocation(HERE)
    store.backend.state.deck = [
      deckCard('ann', { age: 24, fameRating: 50 }),
      deckCard('bea', { age: 35, distanceKm: 40, fameRating: 70 }),
      deckCard('cid', { age: 52, fameRating: 80 }),
    ]
  }

  it('rejects a blank search, an overlong name or an inverted age range without sending anything', async () => {
    await signIn()
    await expect(actions.search({ q: '   ' })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    await expect(actions.search({ q: 'a'.repeat(51) })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    await expect(actions.search({ ageMin: 40, ageMax: 30 })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    expect(sent()).toHaveLength(0)
    expect(getNodeValue('searchActive') ?? null).toBeNull()
  })

  it('rejects with the backend error when the viewer has no location', async () => {
    await signIn()
    await expect(actions.search({ q: 'ann' })).rejects.toMatchObject({ status: 403 })
    expect(getNodeValue('searchResults')).toBeNull()
    expect(getNodeStatus('searchResults')).toMatchObject({ status: 'error', error: { status: 403 } })
  })

  it('sends q trimmed and resolves once searchResults holds the cards', async () => {
    await ready()
    const found = await actions.search({ q: '  Ann ' })
    expect(sent().at(-1)?.params).toEqual({ q: 'Ann' })
    expect(ids(found)).toEqual(['ann'])
    expect(found[0]).not.toHaveProperty('likesYou')
    expect(getNodeValue('searchResults')).toBe(found)
    expect(getNodeStatus('searchResults').status).toBe('success')
  })

  it('sends the filters as the discover parameters, in one request however many changed', async () => {
    await ready()
    const found = await actions.search({ ageMin: 30, ageMax: 60, distance: 50, fameMin: 60, tags: ['#Art', 'tea', 'art'] })
    expect(sent()).toHaveLength(1)
    expect(sent()[0].params).toEqual({ minAge: 30, maxAge: 60, maxDistanceKm: 50, minFame: 60, tags: 'art,tea' })
    expect(ids(found)).toEqual(['bea', 'cid'])
    // a name narrows the same search further
    await actions.search({ q: 'ci' })
    expect(sent()).toHaveLength(2)
    expect(sent()[1].params).toEqual({ q: 'ci', minAge: 30, maxAge: 60, maxDistanceKm: 50, minFame: 60, tags: 'art,tea' })
    // a null limit is not sent
    await actions.search({ fameMin: null, tags: [] })
    expect(sent()[2].params).toEqual({ q: 'ci', minAge: 30, maxAge: 60, maxDistanceKm: 50 })
  })

  it('sends genders and preferences as comma lists in a fixed order, unknown values dropped', async () => {
    await ready()
    await actions.search({ genders: ['other', 'female', 'female'], preferences: ['both'] })
    expect(sent()).toHaveLength(1)
    expect(sent()[0].params).toEqual({ genders: 'female,other', preferences: 'both' })
    // the same people in another order: the same criteria, refetched in place
    await actions.search({ genders: ['female', 'other', 'nope' as 'other'] })
    expect(sent()[1].params).toEqual({ genders: 'female,other', preferences: 'both' })
    // none of either: not sent
    await actions.search({ q: 'a', genders: [], preferences: [] })
    expect(sent()[2].params).toEqual({ q: 'a' })
    expect(getNodeValue('searchGenders')).toBeNull()
  })

  it('a sort-only change reorders visibleSearch in the browser without a request', async () => {
    await ready()
    await actions.search({ q: 'a' })
    expect(ids(getNodeValue('visibleSearch'))).toEqual(['ann', 'bea'])
    await actions.search({ sort: 'fame' })
    expect(sent()).toHaveLength(1)
    expect(ids(getNodeValue('visibleSearch'))).toEqual(['bea', 'ann'])
    expect(ids(getNodeValue('searchResults'))).toEqual(['ann', 'bea'])
  })

  it('the same criteria again refetch in place; dropping every criterion is refused, clearSearch ends it', async () => {
    await ready()
    await actions.search({ q: 'ann' })
    await actions.search({ q: 'ann' })
    expect(sent()).toHaveLength(2)
    await expect(actions.search({ q: null })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    expect(getNodeValue('searchQuery')).toBe('ann')
    actions.clearSearch()
    expect(getNodeValue('searchActive')).toBeNull()
    expect(getNodeValue('searchQuery')).toBeNull()
    expect(getNodeValue('searchResults')).toBeNull()
    expect(getNodeValue('visibleSearch')).toBeNull()
    await flush(30)
    expect(sent()).toHaveLength(2)
  })

  it('a sign-out clears the search, filters included', async () => {
    await ready()
    await actions.search({ q: 'ann', distance: 20, sort: 'age' })
    await actions.logout()
    expect(getNodeValue('searchActive')).toBeNull()
    expect(getNodeValue('searchQuery')).toBeNull()
    expect(getNodeValue('searchDistance')).toBeNull()
    expect(getNodeValue('searchSort')).toBe('best')
    expect(getNodeValue('searchResults')).toBeNull()
  })

  it('blocking someone refetches the open search', async () => {
    await ready()
    await actions.search({ q: 'ann' })
    server().on('POST', `${API_URL}/profile/:id/block`, () => reply(200, ''))
    await actions.blockUser('ann')
    await flush(30)
    expect(sent()).toHaveLength(2)
  })
})
