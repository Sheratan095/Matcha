import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ERROR } from '@/api/http'
import type { RealtimeEvent } from '@/api/types'
import { API_URL, SOCIAL_URL } from '@/config'
import { actions } from './actions'
import { refresh } from './commands'
import { DEFAULT_DISCOVER_FILTERS } from './filters'
import { realtime$, startRealtime } from './realtime'
import { getNodeStatus, getNodeValue, setNode } from './store'
import { card, deckCard, incoming, ME } from './testing/fakeBackend'
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
    setNode('activeMatchId', 'm-x')
    setNode('swipedIds', ['bea'])
    await actions.logout()
    expect(getNodeValue('sessionUserId')).toBeNull()
    expect(getNodeValue('myProfile')).toBeNull()
    expect(getNodeValue('discoverDeck')).toBeNull()
    expect(getNodeValue('activeMatchId')).toBeNull()
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

  it('setFilters sends the backend filters with one deck request; the sort is applied locally', async () => {
    await signIn()
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
    await signIn()
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
    await signIn()
    const ann = getNodeValue('visibleDeck')?.find((card) => card.userId === 'ann')
    expect(ann).toBeDefined()
    const result = await actions.swipe(ann!, 'like')
    expect(result.matched).toBe(true)
    expect(server().sent('POST', `${API_URL}/profile/ann/like`)).toHaveLength(1)
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'ann')).toBe(false)
  })

  it('a pass posts to /pass and is not a match', async () => {
    await signIn()
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    expect(await actions.swipe(bea, 'pass')).toEqual({ matched: false })
    expect(server().sent('POST', `${API_URL}/profile/bea/pass`)).toHaveLength(1)
  })

  it('a failed swipe puts the card back', async () => {
    await signIn()
    server().on('POST', `${API_URL}/profile/:id/pass`, () => nestError(500, 'down', 'Internal Server Error'))
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    const pending = actions.swipe(bea, 'pass')
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'bea')).toBe(false)
    await expect(pending).rejects.toMatchObject({ status: 500 })
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'bea')).toBe(true)
  })

  it('rewind brings a pass back on top, and takes a like back with DELETE', async () => {
    await signIn()
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
    await signIn()
    await actions.swipe(getNodeValue('visibleDeck')![0], 'like')
    expect(await actions.rewind()).toEqual({ restored: null, matched: true })
    expect(server().sent('DELETE', `${API_URL}/profile/ann/like`)).toHaveLength(0)
  })

  it('asks for more once the last card is swiped, but the passes of this session stay hidden until reloadDeck', async () => {
    await signIn()
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
    await signIn()
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
    await signIn()
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    await actions.swipe(bea, 'like')
    await actions.rewind()
    await actions.swipe(bea, 'like')
    expect(server().sent('POST', `${API_URL}/profile/bea/like`)).toHaveLength(2)
    expect(ids()?.includes('bea')).toBe(false)
  })

  it('tagCatalogue lists the interest names in use', async () => {
    await signIn()
    expect(getNodeValue('tagCatalogue')).toEqual(['art', 'music'])
  })
})

describe('matches and chat', () => {
  async function matched(): Promise<void> {
    await signIn()
    await actions.answerLike(card('ann', { likedYou: true }), 'like')
  }

  it('openChat loads the conversation and then the unread counts; sendMessage shows the message', async () => {
    await matched()
    incoming(store.backend, 'm-ann', 'hi')
    await refresh('matches')
    expect(getNodeValue('unreadCount')).toBe(1)
    await expect(actions.openChat('m-ann')).resolves.toHaveLength(1)
    expect(getNodeValue('activeMatchId')).toBe('m-ann')
    expect(getNodeValue('unreadCount')).toBe(0)

    const sent = await actions.sendMessage('m-ann', '  hello there  ')
    expect(sent.text).toBe('hello there')
    expect(getNodeValue('chatMessages')?.map((message) => message.text)).toEqual(['hi', 'hello there'])
    expect(getNodeValue('matches')?.[0].lastMessage?.text).toBe('hello there')
    await expect(actions.sendMessage('m-ann', '   ')).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })

    actions.closeChat()
    expect(getNodeValue('chatMessages')).toBeNull()
  })

  it('realtime events are republished and refresh the open chat and the matches', async () => {
    await matched()
    await actions.openChat('m-ann')
    const source = new Subject<RealtimeEvent>()
    const stop = startRealtime({ events$: source, socket: false })
    const seen: RealtimeEvent[] = []
    const subscription = realtime$.subscribe((event) => seen.push(event))

    const message = incoming(store.backend, 'm-ann', 'ping')
    source.next({ type: 'message', matchId: 'm-ann', message })
    await flush(40)
    expect(seen).toEqual([{ type: 'message', matchId: 'm-ann', message }])
    expect(getNodeValue('chatMessages')?.map((entry) => entry.text)).toEqual(['ping'])
    expect(getNodeValue('matches')?.[0].lastMessage?.text).toBe('ping')
    expect(getNodeValue('unreadCount')).toBe(0)
    subscription.unsubscribe()
    stop()
  })

  it('unmatch closes the open conversation and refreshes the matches', async () => {
    await matched()
    await actions.openChat('m-ann')
    server().on('DELETE', `${SOCIAL_URL}/matches/:id`, ({ route }) => {
      store.backend.state.matches = store.backend.state.matches.filter((match) => match.id !== route.id)
      return { ok: true }
    })
    await actions.unmatch('m-ann')
    expect(getNodeValue('activeMatchId')).toBeNull()
    expect(getNodeValue('matches')).toEqual([])
  })

  it('resetDemoData posts the reset and reloads the mocked social nodes', async () => {
    await matched()
    await actions.resetDemoData()
    expect(server().sent('POST', `${SOCIAL_URL}/reset`)).toHaveLength(1)
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
