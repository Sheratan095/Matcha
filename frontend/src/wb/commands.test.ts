import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ERROR } from '@/api/http'
import { API_URL, SOCIAL_URL } from '@/config'
import { actions } from './actions'
import { refresh, run } from './commands'
import { getNodeStatus, getNodeValue, node$, stopStore } from './store'
import { ME } from './testing/fakeBackend'
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
  it('sends nothing while tangling, and only the probe while anonymous', async () => {
    expect(server().requests).toHaveLength(0)
    await expect(actions.bootSession()).resolves.toBe('anonymous')
    await flush()
    expect(server().requests.map((request) => `${request.method} ${request.url}`)).toEqual([`GET ${API_URL}/auth/validate`])
    expect(getNodeValue('sessionUserId')).toBeNull()
    expect(getNodeValue('myProfile')).toBeNull()
  })

  it('loads each authenticated read once when the session appears', async () => {
    await signIn()
    await flush(30)
    expect(server().sent('GET', `${API_URL}/profile`)).toHaveLength(1)
    expect(server().sent('GET', `${SOCIAL_URL}/discover`)).toHaveLength(1)
    expect(server().sent('GET', `${SOCIAL_URL}/matches`)).toHaveLength(1)
    expect(server().sent('GET', `${API_URL}/auth/validate`)).toHaveLength(2)
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
    const before = getNodeValue('matches')
    expect(before).toEqual([])
    store.backend.state.matches = [
      { id: 'm1', profile: store.backend.state.deck[0], matchedAt: 'x', lastMessage: null, unread: 2 },
    ]
    const seen: unknown[] = []
    const subscription = node$('matches').subscribe((value) => seen.push(value))
    await refresh('matches')
    subscription.unsubscribe()
    expect(seen).toEqual([before, store.backend.state.matches])
    expect(getNodeValue('unreadCount')).toBe(2)
  })

  it('never rejects: a failure leaves the node null and the error on its status', async () => {
    await signIn()
    await flush(30)
    server().on('GET', `${SOCIAL_URL}/matches`, () => nestError(500, 'down', 'Internal Server Error'))
    await expect(refresh('matches')).resolves.toBeUndefined()
    expect(getNodeValue('matches')).toBeNull()
    expect(getNodeStatus('matches')).toMatchObject({ status: 'error', error: { status: 500, message: 'down' } })
  })

  it('sends nothing for an authenticated read while anonymous', async () => {
    await actions.bootSession()
    await refresh('matches')
    expect(server().sent('GET', `${SOCIAL_URL}/matches`)).toHaveLength(0)
  })
})

describe('late answers', () => {
  it('a read still loading at sign-out does not land in the reset node', async () => {
    await actions.bootSession()
    const gate = deferred()
    const original = { ...store.backend.state }
    server().on('GET', `${SOCIAL_URL}/matches`, async () => {
      await gate.promise
      return [{ id: 'm-old', profile: original.deck[0], matchedAt: 'x', lastMessage: null, unread: 0 }]
    })
    await actions.login({ username: 'testuser', password: '1234' })
    expect(getNodeStatus('matches').status).toBe('loading')
    await actions.logout()
    gate.resolve()
    await flush(30)
    expect(getNodeValue('matches')).toBeNull()
    expect(getNodeStatus('matches').status).toBe('idle')
  })

  it('a conversation closed while loading stays empty', async () => {
    await signIn()
    await flush(30)
    const gate = deferred()
    server().on('GET', `${SOCIAL_URL}/matches/:id/messages`, async () => {
      await gate.promise
      return [{ id: 'x', matchId: 'm1', senderId: 'ann', text: 'late', sentAt: 'x' }]
    })
    const opening = actions.openChat('m1')
    actions.closeChat()
    gate.resolve()
    await expect(opening).rejects.toMatchObject({ code: LOCAL_ERROR.DROPPED })
    expect(getNodeValue('chatMessages')).toBeNull()
  })

  it('a newer request still wins over an older one of the same node', async () => {
    await signIn()
    await flush(30)
    const gate = deferred()
    server().on('GET', `${SOCIAL_URL}/matches/:id/messages`, async ({ route }) => {
      if (route.id === 'm1') await gate.promise
      return [{ id: route.id, matchId: route.id, senderId: 'ann', text: route.id, sentAt: 'x' }]
    })
    const first = actions.openChat('m1')
    await actions.openChat('m2')
    gate.resolve()
    await first
    expect(getNodeValue('chatMessages')?.[0].text).toBe('m2')
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
    server().on('GET', `${API_URL}/profile/:id`, () => nestError(500, 'Failed to fetch profile', 'Internal Server Error'))
    server().on('GET', `${API_URL}/profile/viewers`, () => ({ viewers: ['v'] }))
    await expect(actions.showApiProfile('22222222-2222-4222-8222-222222222222')).rejects.toMatchObject({ status: 500 })
    await refresh('myViewers')
    expect(getNodeStatus('apiProfile').status).toBe('error')
    expect(getNodeStatus('myViewers').status).toBe('success')
    expect(getNodeValue('myViewers')).toEqual({ viewers: ['v'] })
  })
})
