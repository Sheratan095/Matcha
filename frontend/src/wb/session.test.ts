/**
 * How the session survives the access cookie: it lasts 15 minutes and the browser drops it then, while the
 * refresh cookie lasts 7 days. Against the fake backend, `state.session` is the access cookie and
 * `state.refreshToken` the refresh one: `session = null` with a live `refreshToken` is "expired".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { API_URL } from '@/config'
import { actions } from './actions'
import { refresh } from './commands'
import { startRealtime } from './realtime'
import { getNodeValue, node$ } from './store'
import { ME } from './testing/fakeBackend'
import { flush, startTestStore, type TestStore } from './testing/harness'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))

let store: TestStore
const state = () => store.backend.state
const sent = () => store.backend.server.requests.map((request) => `${request.method} ${request.url.replace(API_URL, '')}`)
const times = (request: string) => sent().filter((entry) => entry === request).length

beforeEach(async () => {
  vi.mocked(io).mockReset()
  store = await startTestStore()
})

afterEach(() => {
  store.stop()
})

async function signIn(): Promise<void> {
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
}

describe('booting', () => {
  it('signs a returning user back in from the refresh token, without the guards ever seeing them as anonymous', async () => {
    state().refreshToken = ME // the access cookie is gone: they come back after a break
    const seen: unknown[] = []
    const subscription = node$('authStatus').subscribe((status) => seen.push(status))

    await expect(actions.bootSession()).resolves.toBe('authenticated')
    subscription.unsubscribe()

    // Renewed BEFORE the probe, so `authStatus` stays at 'checking' until the answer is the right one.
    expect(sent().slice(0, 2)).toEqual(['POST /auth/refresh', 'GET /auth/validate'])
    expect(seen).not.toContain('anonymous')
    expect(seen.at(-1)).toBe('authenticated')
    expect(getNodeValue('sessionUserId')).toBe(ME)
    await flush(30)
    expect(getNodeValue('myProfile')?.userId).toBe(ME)
  })

  it('boots a visitor as anonymous after one refused refresh, and loads nothing that needs a session', async () => {
    await expect(actions.bootSession()).resolves.toBe('anonymous')
    await flush(30)
    expect(sent()).toEqual(['POST /auth/refresh', 'GET /auth/validate'])
    expect(getNodeValue('sessionUserId')).toBeNull()
  })

  it('boots from the access cookie when the refresh token was replaced by a sign-in elsewhere', async () => {
    state().session = ME
    state().refreshToken = null // the refresh is refused (403), the access cookie is still good
    await expect(actions.bootSession()).resolves.toBe('authenticated')
    expect(getNodeValue('sessionUserId')).toBe(ME)
  })
})

describe('a request refused for lack of the access cookie', () => {
  it('renews the session and repeats the request, once, without anyone noticing', async () => {
    await signIn()
    state().session = null // expired while the tab sat open
    const before = sent().length

    await refresh('myProfile')

    expect(sent().slice(before)).toEqual(['GET /profile', 'POST /auth/refresh', 'GET /profile'])
    expect(getNodeValue('myProfile')?.userId).toBe(ME)
    expect(getNodeValue('authStatus')).toBe('authenticated')
  })

  it('shares one refresh between the requests that fail together', async () => {
    await signIn()
    state().session = null
    const before = times('POST /auth/refresh')

    await Promise.all([refresh('myProfile'), refresh('connections')])

    expect(times('POST /auth/refresh') - before).toBe(1)
    expect(getNodeValue('myProfile')?.userId).toBe(ME)
    expect(getNodeValue('connections')).not.toBeNull()
  })

  it('ends the session when the refresh token is gone too', async () => {
    await signIn()
    state().session = null
    state().refreshToken = null

    await refresh('myProfile')
    await flush(30)

    expect(getNodeValue('authStatus')).toBe('anonymous')
    expect(getNodeValue('sessionUserId')).toBeNull()
  })
})

/** The few members of a socket.io client that `keepSocket` uses. */
class FakeSocket {
  connected = false
  active = true
  private readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    return this
  })
  onAny = vi.fn()
  connect = vi.fn(() => {
    this.active = true
    return this
  })
  disconnect = vi.fn(() => {
    this.connected = false
    return this
  })

  fire(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((handler) => handler(...args))
  }
}

describe('the realtime socket', () => {
  /** `POST /auth/refresh` already sent when the socket connected (boot renews too): renewals count from there. */
  let refreshesAtConnect = 0
  const renewals = () => times('POST /auth/refresh') - refreshesAtConnect

  async function openSocket(): Promise<FakeSocket> {
    await signIn()
    const socket = new FakeSocket()
    vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>)
    startRealtime({ socket: true })
    await flush(30) // the socket.io client is imported lazily
    expect(io).toHaveBeenCalledTimes(1)
    socket.connected = true
    socket.fire('connect')
    refreshesAtConnect = times('POST /auth/refresh')
    return socket
  }

  /** The socket lost its connection, the access cookie expired meanwhile, and it is refused on every attempt. */
  function refused(socket: FakeSocket, { gaveUp }: { gaveUp: boolean }): void {
    socket.connected = false
    socket.active = !gaveUp
    state().session = null
    socket.fire('connect_error', new Error('websocket error'))
  }

  it('renews the session when the gateway turns it away, then reconnects a socket that had given up', async () => {
    const socket = await openSocket()
    refused(socket, { gaveUp: true })
    await flush(30)

    expect(renewals()).toBe(1)
    expect(state().session).toBe(ME)
    expect(socket.connect).toHaveBeenCalledTimes(1)
  })

  it('leaves the reconnecting to socket.io while it is still trying', async () => {
    const socket = await openSocket()
    refused(socket, { gaveUp: false })
    await flush(30)

    expect(renewals()).toBe(1) // the next attempt carries the new cookie by itself
    expect(socket.connect).not.toHaveBeenCalled()
  })

  it('renews once per outage, however many attempts are refused', async () => {
    const socket = await openSocket()
    refused(socket, { gaveUp: false })
    socket.fire('connect_error', new Error('websocket error'))
    socket.fire('connect_error', new Error('websocket error'))
    await flush(30)
    socket.fire('connect_error', new Error('websocket error')) // the renewal did not help: not the cookie
    await flush(30)

    expect(renewals()).toBe(1)
  })

  it('renews again for the next outage, after a connection', async () => {
    const socket = await openSocket()
    refused(socket, { gaveUp: true })
    await flush(30)
    socket.connected = true
    socket.fire('connect')

    refused(socket, { gaveUp: true })
    await flush(30)

    expect(renewals()).toBe(2)
    expect(socket.connect).toHaveBeenCalledTimes(2)
  })

  it('probes the session when there is no refresh token to renew it with, which signs the user out and closes the socket', async () => {
    const socket = await openSocket()
    const validations = times('GET /auth/validate')
    state().refreshToken = null
    refused(socket, { gaveUp: true })
    await flush(50)

    expect(times('GET /auth/validate')).toBe(validations + 1)
    expect(getNodeValue('authStatus')).toBe('anonymous')
    expect(socket.connect).not.toHaveBeenCalled()
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('does not renew for a socket that was already closed', async () => {
    const socket = await openSocket()
    await actions.logout()
    await flush(30)
    const refreshes = times('POST /auth/refresh')

    socket.fire('connect_error', new Error('websocket error'))
    await flush(30)

    expect(times('POST /auth/refresh')).toBe(refreshes)
    expect(socket.connect).not.toHaveBeenCalled()
  })
})
