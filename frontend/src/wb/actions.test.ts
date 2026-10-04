import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ERROR } from '@/api/http'
import type { RealtimeEvent } from '@/api/types'
import { API_URL, MOCK_PREFIX, SOCIAL_URL } from '@/config'
import { actions } from './actions'
import { refresh } from './commands'
import { DEFAULT_DISCOVER_FILTERS } from './filters'
import { realtime$, startRealtime } from './realtime'
import { getNodeStatus, getNodeValue, setNode } from './store'
import { incoming, ME } from './testing/fakeBackend'
import { nestError } from './testing/fakeServer'
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

  it('creates the missing profile row of a GitHub user once, then loads the profile', async () => {
    let hasRow = false
    server().on('GET', `${API_URL}/profile`, () =>
      hasRow ? { ...store.backend.state.profile } : nestError(500, 'Failed to fetch profile', 'Internal Server Error'),
    )
    server().on('POST', `${API_URL}/profile`, ({ body }) => {
      hasRow = true
      return { message: 'Profile created', userId: (body as { userId: string }).userId }
    })
    await signIn()
    await flush(50)
    expect(server().sent('POST', `${API_URL}/profile`)).toHaveLength(1)
    expect(server().sent('POST', `${API_URL}/profile`)[0].body).toEqual({ userId: ME })
    expect(getNodeValue('myProfile')?.userId).toBe(ME)
    expect(getNodeStatus('myProfile').status).toBe('success')
  })
})

describe('demo inbox', () => {
  it('loads only when asked, from the mock prefix, and the action is refused with the real backend', async () => {
    server().on('GET', `${MOCK_PREFIX}/dev/inbox`, () => [
      { to: 'a@b.c', kind: 'verify-email', token: 'abc', link: '/verify-email?token=abc', sentAt: 'x' },
    ])
    expect(server().sent('GET', `${MOCK_PREFIX}/dev/inbox`)).toHaveLength(0)
    await refresh('devInbox')
    expect(getNodeValue('devInbox')?.[0].token).toBe('abc')
    // The tests run with the real-backend .env.
    await expect(actions.loadDevInbox()).rejects.toMatchObject({ code: LOCAL_ERROR.UNAVAILABLE })
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
    expect(getNodeValue('profileComplete')).toBe(true)
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
  it('setFilters changes several filters with one deck request', async () => {
    await signIn()
    const before = server().sent('GET', `${SOCIAL_URL}/discover`).length
    await actions.setFilters({ ageMin: 21, ageMax: 30, sort: 'fame', tags: ['#Art', 'music'] })
    const sent = server().sent('GET', `${SOCIAL_URL}/discover`)
    expect(sent.length - before).toBe(1)
    expect(sent.at(-1)?.params).toEqual({ ageMin: 21, ageMax: 30, distance: 50, sort: 'fame', tags: 'art,music' })
    expect(getNodeValue('discoverDeck')).not.toBeNull()
    await expect(actions.setFilters({ ageMin: 40, ageMax: 30 })).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
  })

  it('a matching swipe refreshes matches and likes, and the card leaves visibleDeck', async () => {
    await signIn()
    const ann = getNodeValue('visibleDeck')?.find((card) => card.userId === 'ann')
    expect(ann).toBeDefined()
    const result = await actions.swipe(ann!, 'like')
    expect(result.match?.id).toBe('m-ann')
    expect(getNodeValue('matches')?.map((match) => match.id)).toEqual(['m-ann'])
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'ann')).toBe(false)
    expect(server().sent('GET', `${SOCIAL_URL}/likes`).length).toBeGreaterThan(1)
  })

  it('a failed swipe puts the card back', async () => {
    await signIn()
    server().on('POST', `${SOCIAL_URL}/swipes`, () => nestError(500, 'down', 'Internal Server Error'))
    const bea = getNodeValue('visibleDeck')!.find((card) => card.userId === 'bea')!
    const pending = actions.swipe(bea, 'pass')
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'bea')).toBe(false)
    await expect(pending).rejects.toMatchObject({ status: 500 })
    expect(getNodeValue('visibleDeck')?.some((card) => card.userId === 'bea')).toBe(true)
  })

  it('fetches the next deck once the last card is swiped', async () => {
    await signIn()
    const before = server().sent('GET', `${SOCIAL_URL}/discover`).length
    for (const card of [...getNodeValue('visibleDeck')!]) await actions.swipe(card, 'pass')
    expect(server().sent('GET', `${SOCIAL_URL}/discover`).length).toBe(before + 1)
    expect(getNodeValue('visibleDeck')).toEqual([])
  })
})

describe('matches and chat', () => {
  async function matched(): Promise<void> {
    await signIn()
    await actions.swipe(getNodeValue('visibleDeck')!.find((card) => card.userId === 'ann')!, 'like')
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

  it('resetDemoData posts the reset and reloads the social nodes', async () => {
    await matched()
    await actions.resetDemoData()
    expect(server().sent('POST', `${SOCIAL_URL}/reset`)).toHaveLength(1)
    expect(getNodeValue('matches')).toEqual([])
    expect(getNodeValue('swipedIds')).toEqual([])
    expect(getNodeValue('visibleDeck')?.map((card) => card.userId)).toEqual(['ann', 'bea', 'cid'])
  })
})
