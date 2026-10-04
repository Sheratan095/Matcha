import axios, { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, FakeServer, nestError, reply } from '@/wb/testing/fakeServer'
import {
  dropPendingRequests,
  httpEvents$,
  installHttp,
  LOCAL_ERROR,
  toApiError,
  type HttpEvent,
  type HttpOptions,
} from './http'

const API = 'http://gateway.test'
const SOCIAL = '/__mock/social'

let server: FakeServer
let uninstallAdapter: () => void
let uninstallHttp: (() => void) | null = null
let events: HttpEvent[]
let subscription: { unsubscribe(): void }

function install(options: Partial<HttpOptions> = {}): void {
  uninstallHttp = installHttp({ apiUrl: API, ...options })
}

beforeEach(() => {
  server = new FakeServer()
  uninstallAdapter = server.install()
  events = []
  subscription = httpEvents$.subscribe((event) => events.push(event))
})

afterEach(() => {
  subscription.unsubscribe()
  uninstallHttp?.()
  uninstallHttp = null
  uninstallAdapter()
})

describe('toApiError', () => {
  const failed = (status: number, data: unknown) =>
    new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, {}, { data, status, statusText: 'S', headers: {}, config: {} as never })

  it('normalises the Nest error body, validation arrays and machine codes included', () => {
    expect(toApiError(failed(400, { message: ['a is bad', 'b is bad'], error: 'Bad Request', statusCode: 400 }))).toEqual({
      status: 400,
      code: null,
      message: 'a is bad',
      messages: ['a is bad', 'b is bad'],
    })
    expect(toApiError(failed(403, { message: 'Email not verified', error: 'EMAIL_NOT_VERIFIED', statusCode: 403 }))).toMatchObject({
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email not verified',
    })
    expect(toApiError(failed(401, 'Unauthorized'))).toMatchObject({ status: 401, message: 'Unauthorized', code: null })
  })

  it('tells network failures and timeouts apart, and passes ApiErrors through', () => {
    expect(toApiError(new AxiosError('Network Error', 'ERR_NETWORK'))).toMatchObject({ status: 0, code: LOCAL_ERROR.NETWORK })
    expect(toApiError(new AxiosError('timeout', 'ECONNABORTED'))).toMatchObject({ status: 0, code: LOCAL_ERROR.TIMEOUT })
    const error = toApiError(new Error('boom'))
    expect(error).toMatchObject({ status: 0, message: 'boom' })
    expect(toApiError(error)).toBe(error)
  })
})

describe('installHttp', () => {
  it('sets cookie credentials and a timeout, and restores the defaults when uninstalled', () => {
    const before = { withCredentials: axios.defaults.withCredentials, timeout: axios.defaults.timeout }
    install({ timeoutMs: 1234 })
    expect(axios.defaults.withCredentials).toBe(true)
    expect(axios.defaults.timeout).toBe(1234)
    uninstallHttp?.()
    uninstallHttp = null
    expect({ withCredentials: axios.defaults.withCredentials, timeout: axios.defaults.timeout }).toEqual(before)
  })

  it('publishes start synchronously, then success with status and data; the url has no query', async () => {
    install()
    server.on('GET', `${API}/thing`, () => ({ ok: 1 }))
    const pending = axios.get(`${API}/thing`, { params: { a: 1 } })
    expect(events).toEqual([expect.objectContaining({ phase: 'start', method: 'GET', url: `${API}/thing`, status: null })])
    await pending
    expect(events[1]).toMatchObject({ phase: 'success', id: events[0].id, status: 200, data: { ok: 1 }, error: null })
  })

  it('publishes errors with the normalised ApiError', async () => {
    install()
    server.on('POST', `${API}/auth/login`, () => nestError(403, 'Invalid credentials', 'Forbidden'))
    await expect(axios.post(`${API}/auth/login`, {})).rejects.toBeInstanceOf(AxiosError)
    expect(events[1]).toMatchObject({ phase: 'error', status: 403, error: { status: 403, message: 'Invalid credentials' } })
  })
})

describe('401 handling', () => {
  it('refreshes once for concurrent 401s, retries each request once, and keeps one id per logical request', async () => {
    let session = false
    const refreshSession = vi.fn(async () => {
      await axios.post(`${API}/auth/refresh`)
      session = true
    })
    install({ refreshSession })
    server.on('POST', `${API}/auth/refresh`, () => ({ message: 'Tokens refreshed' }))
    server.on('GET', `${API}/profile`, () => (session ? { me: true } : nestError(401, 'Missing or invalid access token', 'Unauthorized')))
    server.on('GET', `${API}/profile/viewers`, () => (session ? { viewers: [] } : nestError(401, 'Missing', 'Unauthorized')))

    const [profile, viewers] = await Promise.all([axios.get(`${API}/profile`), axios.get(`${API}/profile/viewers`)])
    expect(profile.data).toEqual({ me: true })
    expect(viewers.data).toEqual({ viewers: [] })
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(server.sent('GET', `${API}/profile`)).toHaveLength(2)

    const profileEvents = events.filter((event) => event.url === `${API}/profile`)
    expect(profileEvents.map((event) => event.phase)).toEqual(['start', 'success'])
    expect(profileEvents[0].id).toBe(profileEvents[1].id)
  })

  it('treats /auth/change-email as guarded', async () => {
    let session = false
    install({ refreshSession: async () => void (session = true) })
    server.on('POST', `${API}/auth/change-email`, () => (session ? { message: 'ok' } : nestError(401, 'Missing', 'Unauthorized')))
    await expect(axios.post(`${API}/auth/change-email`, { newEmail: 'a@b.c' })).resolves.toMatchObject({ data: { message: 'ok' } })
  })

  it('reports the session as lost when the refresh fails, and delivers the original 401', async () => {
    const onSessionLost = vi.fn()
    install({ refreshSession: () => Promise.reject(new Error('403')), onSessionLost })
    server.on('GET', `${API}/profile`, () => nestError(401, 'Missing or invalid access token', 'Unauthorized'))
    await expect(axios.get(`${API}/profile`)).rejects.toMatchObject({ response: { status: 401 } })
    await expect(axios.get(`${API}/profile`)).rejects.toMatchObject({ response: { status: 401 } })
    expect(onSessionLost).toHaveBeenCalledTimes(1) // throttled
    expect(events.filter((event) => event.phase === 'error')).toHaveLength(2)
  })

  it('reports the session as lost when the retry is refused as well', async () => {
    const onSessionLost = vi.fn()
    install({ refreshSession: async () => undefined, onSessionLost })
    server.on('GET', `${API}/profile`, () => nestError(401, 'Missing', 'Unauthorized'))
    await expect(axios.get(`${API}/profile`)).rejects.toBeInstanceOf(AxiosError)
    expect(server.sent('GET', `${API}/profile`)).toHaveLength(2)
    expect(onSessionLost).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for services outside the gateway, nor for the refresh call itself', async () => {
    const refreshSession = vi.fn(async () => undefined)
    install({ refreshSession })
    server.on('GET', `${SOCIAL}/matches`, () => nestError(401, 'No viewer', 'Unauthorized'))
    server.on('POST', `${API}/auth/refresh`, () => nestError(401, 'odd', 'Unauthorized'))
    await expect(axios.get(`${SOCIAL}/matches`)).rejects.toBeInstanceOf(AxiosError)
    await expect(axios.post(`${API}/auth/refresh`)).rejects.toBeInstanceOf(AxiosError)
    expect(refreshSession).not.toHaveBeenCalled()
  })
})

describe('superseded GETs', () => {
  it('lets the newest GET of a group win: an older one settles with the newer outcome', async () => {
    install({ supersedeKey: (_method, url) => (url.startsWith(`${API}/users/`) ? 'user' : null) })
    const slow = deferred()
    server.on('GET', `${API}/users/:id`, async (request) => {
      if (request.route.id === '1') await slow.promise
      return { id: request.route.id }
    })
    const older = axios.get(`${API}/users/1`)
    const newer = axios.get(`${API}/users/2`)
    expect((await newer).data).toEqual({ id: '2' })
    slow.resolve()
    expect((await older).data).toEqual({ id: '2' })
    const olderEvents = events.filter((event) => event.id === events[0].id)
    expect(olderEvents.map((event) => event.phase)).toEqual(['start', 'success'])
    expect(olderEvents[1].data).toEqual({ id: '2' })
  })

  it('fails dropped in-flight GETs of a group, whatever the server answers, and only those', async () => {
    install({ supersedeKey: (_method, url) => (url.startsWith(`${API}/users/`) ? 'user' : null) })
    const slow = deferred()
    server.on('GET', `${API}/users/:id`, async (request) => {
      if (request.route.id === '1') await slow.promise
      return { id: request.route.id }
    })
    const stale = axios.get(`${API}/users/1`)
    expect(dropPendingRequests('user')).toBe(1)
    expect(dropPendingRequests('other')).toBe(0)
    slow.resolve()
    await expect(stale).rejects.toMatchObject({ code: LOCAL_ERROR.DROPPED, status: 0 })
    expect(events.at(-1)).toMatchObject({ phase: 'error', error: { code: LOCAL_ERROR.DROPPED } })
    await expect(axios.get(`${API}/users/2`)).resolves.toMatchObject({ data: { id: '2' } })
  })

  it('leaves requests outside any group alone', async () => {
    install({ supersedeKey: () => null })
    server.on('GET', `${API}/a/:id`, (request) => ({ id: request.route.id }))
    const [one, two] = await Promise.all([axios.get(`${API}/a/1`), axios.get(`${API}/a/2`)])
    expect([one.data, two.data]).toEqual([{ id: '1' }, { id: '2' }])
  })

  it('propagates a newer failure to the older request', async () => {
    install({ supersedeKey: () => 'g' })
    const slow = deferred()
    server.on('GET', `${API}/b/:id`, async (request) => {
      if (request.route.id === '1') {
        await slow.promise
        return { id: '1' }
      }
      return reply(500, { message: 'down', error: 'Internal Server Error', statusCode: 500 })
    })
    const older = axios.get(`${API}/b/1`)
    await expect(axios.get(`${API}/b/2`)).rejects.toBeInstanceOf(AxiosError)
    slow.resolve()
    await expect(older).rejects.toBeInstanceOf(AxiosError)
  })
})
