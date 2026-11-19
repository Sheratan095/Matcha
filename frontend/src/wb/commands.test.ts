import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ERROR } from '@/api/http'
import { API_URL } from '@/config'
import { actions } from './actions'
import { refresh, run } from './commands'
import { load } from './demand'
import { getNodeStatus, getNodeValue, node$, stopStore } from './store'
import { incoming, ME, person } from './testing/fakeBackend'
import { deferred, nestError } from './testing/fakeServer'
import { flush, startTestStore, type TestStore } from './testing/harness'

let store: TestStore

beforeEach(async () => {
  store = await startTestStore()
})

afterEach(() => {
  store.stop()
})

const server = () => store.backend.server

async function signIn(): Promise<void> {
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
}

describe('the graph at rest', () => {
  it('sends nothing while tangling, and only the renewal and the probe while anonymous', async () => {
    expect(server().requests).toHaveLength(0)
    await expect(actions.bootSession()).resolves.toBe('anonymous')
    await flush()
    // the renewal (refused: a visitor has no refresh token) comes first, so a returning user is not taken for one
    expect(server().requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${API_URL}/auth/refresh`,
      `GET ${API_URL}/auth/validate`,
    ])
    expect(getNodeValue('sessionUserId')).toBeNull()
    expect(getNodeValue('myProfile')).toBeNull()
  })

  it('loads what the shell shows once when the session appears, and nothing a single page asks for', async () => {
    await signIn()
    await flush(30)
    const sent = server().requests.map((request) => `${request.method} ${request.url.replace(API_URL, '')}`)
    expect(sent.sort()).toEqual(
      [
        'POST /auth/refresh',
        'GET /auth/validate',
        'POST /auth/login',
        'GET /auth/validate',
        // the guards and the avatar
        'GET /profile',
        // the Matches, Calendar and Activity badges
        'GET /profile/matches',
        'GET /chat',
        'GET /profile/calendar',
        'GET /profile/likes',
      ].sort(),
    )
  })

  it('loads a read on demand once, however many screens ask for it at once', async () => {
    await signIn()
    await flush(30)
    await Promise.all([load('myViewers'), load('myViewers'), load('matchesMap')])
    expect(server().sent('GET', `${API_URL}/profile/viewers`)).toHaveLength(1)
    expect(server().sent('GET', `${API_URL}/profile/matches/map`)).toHaveLength(1)
    // young enough: nothing sent; marked stale or too old: refetched in place
    await load('myViewers', 60_000)
    expect(server().sent('GET', `${API_URL}/profile/viewers`)).toHaveLength(1)
    await load('myViewers', 0)
    expect(server().sent('GET', `${API_URL}/profile/viewers`)).toHaveLength(2)
    expect(getNodeValue('myViewers')).toEqual({ viewers: [] })
  })

  it('closes every gate at sign-out: the next user loads only what they open', async () => {
    await signIn()
    await load('myViewers')
    await actions.logout()
    await signIn()
    await flush(30)
    expect(server().sent('GET', `${API_URL}/profile/viewers`)).toHaveLength(1)
  })
})

describe('run', () => {
  it('resolves with the response body once the result node holds it', async () => {
    server().on('POST', `${API_URL}/auth/forgot-password`, () => ({ message: 'sent' }))
    const seen: unknown[] = []
    const subscription = node$('forgotPasswordResult').subscribe((value) => seen.push(value))
    const pending = run('forgotPassword', { email: 'a@b.c' })
    // The payload is written once the command's queue lets it through (a microtask later).
    for (let tick = 0; tick < 3; tick++) await Promise.resolve()
    expect(getNodeStatus('forgotPasswordResult').status).toBe('loading')
    const result = await pending
    subscription.unsubscribe()
    expect(result).toEqual({ message: 'sent' })
    expect(getNodeValue('forgotPasswordResult')).toBe(result)
    expect(seen.at(-1)).toBe(result)
    expect(getNodeStatus('forgotPasswordResult')).toEqual({ status: 'success', error: null })
    expect(server().sent('POST', `${API_URL}/auth/forgot-password`)[0].body).toEqual({ email: 'a@b.c' })
  })

  it('rejects with the ApiError of its own request', async () => {
    server().on('POST', `${API_URL}/auth/verify-email`, () => nestError(403, 'Invalid or expired verification token', 'Forbidden'))
    await expect(run('verifyEmail', { token: 'nope' })).rejects.toEqual({
      status: 403,
      code: null,
      message: 'Invalid or expired verification token',
      messages: ['Invalid or expired verification token'],
    })
    expect(getNodeValue('verifyEmailResult')).toBeNull()
    expect(getNodeStatus('verifyEmailResult')).toMatchObject({ status: 'error', error: { status: 403 } })
  })

  it('serialises calls to one command: the second request waits for the first to settle', async () => {
    const gate = deferred()
    server().on('POST', `${API_URL}/auth/forgot-password`, async ({ body }) => {
      const { email } = body as { email: string }
      if (email === 'first@x.y') await gate.promise
      return { message: email }
    })
    const first = run('forgotPassword', { email: 'first@x.y' })
    const second = run('forgotPassword', { email: 'second@x.y' })
    await flush()
    expect(server().sent('POST', `${API_URL}/auth/forgot-password`)).toHaveLength(1)
    gate.resolve()
    await expect(first).resolves.toEqual({ message: 'first@x.y' })
    await expect(second).resolves.toEqual({ message: 'second@x.y' })
  })

  it('does not cross wires between commands answered out of order', async () => {
    const gate = deferred()
    server().on('POST', `${API_URL}/auth/forgot-password`, async () => {
      await gate.promise
      return { message: 'forgot' }
    })
    server().on('POST', `${API_URL}/auth/verify-email`, () => ({ message: 'verified', userId: ME }))
    const slow = run('forgotPassword', { email: 'a@b.c' })
    const fast = run('verifyEmail', { token: 't' })
    await expect(fast).resolves.toEqual({ message: 'verified', userId: ME })
    gate.resolve()
    await expect(slow).resolves.toEqual({ message: 'forgot' })
  })

  it('keeps going after a failed call', async () => {
    let calls = 0
    server().on('POST', `${API_URL}/auth/forgot-password`, () => (++calls === 1 ? nestError(400, ['email must be an email'], 'Bad Request') : { message: 'ok' }))
    const failing = run('forgotPassword', { email: 'x' })
    const next = run('forgotPassword', { email: 'a@b.c' })
    await expect(failing).rejects.toMatchObject({ status: 400, message: 'email must be an email' })
    await expect(next).resolves.toEqual({ message: 'ok' })
  })

  it('fires payload-less commands with a fresh nonce each time and sends {}', async () => {
    await run('logout')
    await run('logout')
    const sent = server().sent('POST', `${API_URL}/auth/logout`)
    expect(sent).toHaveLength(2)
    expect(sent[0].body).toEqual({})
  })

  it('clears credential payloads once settled', async () => {
    await actions.bootSession()
    await run('login', { username: 'testuser', password: '1234' })
    expect(getNodeValue('loginPayload')).toBeNull()
  })

  it('refuses a missing payload and a stopped store without sending', async () => {
    await expect(run('verifyEmail', null as never)).rejects.toMatchObject({ code: LOCAL_ERROR.INVALID })
    stopStore()
    await expect(run('logout')).rejects.toMatchObject({ code: LOCAL_ERROR.NOT_SENT })
    expect(server().requests).toHaveLength(0)
  })
})

describe('refresh', () => {
  it('refetches in place without flashing to null, and resolves once the node has the new value', async () => {
    await signIn()
    await flush(30)
    const before = getNodeValue('connections')
    expect(before).toEqual({ matches: [] })
    store.backend.state.connections = [person('ann')]
    const seen: unknown[] = []
    const subscription = node$('connections').subscribe((value) => seen.push(value))
    await refresh('connections')
    subscription.unsubscribe()
    expect(seen).toEqual([before, { matches: [person('ann')] }])
    expect(getNodeValue('matches')?.map((match) => match.userId)).toEqual(['ann'])
  })

  it('never rejects: a failure leaves the node null and the error on its status', async () => {
    await signIn()
    await flush(30)
    server().on('GET', `${API_URL}/profile/matches`, () => nestError(500, 'down', 'Internal Server Error'))
    await expect(refresh('connections')).resolves.toBeUndefined()
    expect(getNodeValue('connections')).toBeNull()
    expect(getNodeValue('matches')).toBeNull()
    expect(getNodeStatus('connections')).toMatchObject({ status: 'error', error: { status: 500, message: 'down' } })
  })

  it('sends nothing for an authenticated read while anonymous', async () => {
    await actions.bootSession()
    await refresh('connections')
    expect(server().sent('GET', `${API_URL}/profile/matches`)).toHaveLength(0)
  })
})

describe('late answers', () => {
  it('a read still loading at sign-out does not land in the reset node', async () => {
    await actions.bootSession()
    const gate = deferred()
    server().on('GET', `${API_URL}/profile/matches`, async () => {
      await gate.promise
      return { matches: [person('old')] }
    })
    await actions.login({ username: 'testuser', password: '1234' })
    expect(getNodeStatus('connections').status).toBe('loading')
    await actions.logout()
    gate.resolve()
    await flush(30)
    expect(getNodeValue('connections')).toBeNull()
    expect(getNodeStatus('connections').status).toBe('idle')
  })

  it('a conversation closed while loading stays empty', async () => {
    incoming(store.backend, 'ann', 'hi')
    const chatId = store.backend.state.chats.get('ann')!.chatId
    await signIn()
    await flush(30)
    const gate = deferred()
    server().on('GET', `${API_URL}/chat/:id`, async () => {
      await gate.promise
      return { messages: [] }
    })
    const opening = actions.openChat('ann')
    await flush(20)
    expect(server().sent('GET', `${API_URL}/chat/${chatId}`)).toHaveLength(1)
    actions.closeChat()
    gate.resolve()
    await expect(opening).rejects.toMatchObject({ code: LOCAL_ERROR.DROPPED })
    expect(getNodeValue('chatMessages')).toBeNull()
  })

  it('a newer request still wins over an older one of the same node', async () => {
    incoming(store.backend, 'ann', 'from ann')
    incoming(store.backend, 'bea', 'from bea')
    const annChat = store.backend.state.chats.get('ann')!.chatId
    await signIn()
    await flush(30)
    const gate = deferred()
    server().on('GET', `${API_URL}/chat/:id`, async ({ route }) => {
      if (route.id === annChat) await gate.promise
      const chat = [...store.backend.state.chats.values()].find((entry) => entry.chatId === route.id)
      return { messages: chat?.messages ?? [] }
    })
    const first = actions.openChat('ann')
    await flush(20)
    expect(server().sent('GET', `${API_URL}/chat/${annChat}`)).toHaveLength(1)
    await actions.openChat('bea')
    gate.resolve()
    // overtaken: it does not mark ann's conversation read
    await expect(first).rejects.toMatchObject({ code: LOCAL_ERROR.DROPPED })
    expect(getNodeValue('chatMessages')?.[0].text).toBe('from bea')
    await flush(30)
    expect(server().sent('POST', `${API_URL}/chat/${annChat}/seen`)).toHaveLength(0)
  })
})

describe('status', () => {
  it('goes idle -> loading -> success, and back to idle when the session ends', async () => {
    expect(getNodeStatus('myProfile').status).toBe('idle')
    await signIn()
    expect(getNodeStatus('myProfile').status).toBe('loading')
    await flush(30)
    expect(getNodeStatus('myProfile').status).toBe('success')
    await actions.logout()
    expect(getNodeStatus('myProfile').status).toBe('idle')
    expect(getNodeValue('myProfile')).toBeNull()
  })

  it('attributes /profile/viewers and /profile/{id} to their own nodes', async () => {
    await signIn()
    await flush(30)
    // that id only: a `/profile/:id` route would also answer /profile/likes, which the same trigger reloads
    server().on('GET', `${API_URL}/profile/22222222-2222-4222-8222-222222222222`, () =>
      nestError(500, 'Failed to fetch profile', 'Internal Server Error'),
    )
    server().on('GET', `${API_URL}/profile/viewers`, () => ({ viewers: ['v'] }))
    await expect(actions.showApiProfile('22222222-2222-4222-8222-222222222222')).rejects.toMatchObject({ status: 500 })
    await load('myViewers')
    expect(getNodeStatus('apiProfile').status).toBe('error')
    expect(getNodeStatus('myViewers').status).toBe('success')
    expect(getNodeValue('myViewers')).toEqual({ viewers: ['v'] })
  })
})
