import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, LoginResult, Profile } from '@/api/types'
import { installMockBackend, uninstallMockBackend } from './index'
import { call } from './testkit'

const realDefault = axios.defaults.adapter
let network: ReturnType<typeof vi.fn<AxiosAdapter>>

function networkAnswer(config: InternalAxiosRequestConfig, status: number, body: unknown): AxiosResponse {
  return { data: JSON.stringify(body), status, statusText: 'OK', headers: new AxiosHeaders(), config, request: {} }
}

beforeEach(() => {
  localStorage.clear()
  network = vi.fn<AxiosAdapter>(async (config) => networkAnswer(config, 200, { from: 'network', url: config.url }))
  axios.defaults.adapter = network
  installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
})

afterEach(() => {
  uninstallMockBackend()
  axios.defaults.adapter = realDefault
  vi.useRealTimers()
})

describe('adapter fidelity', () => {
  it('passes non-mock requests to the original adapter untouched', async () => {
    const response = await axios.get('http://localhost:3000/profile', { params: { a: 1 } })
    expect(network).toHaveBeenCalledTimes(1)
    expect(network.mock.calls[0]?.[0]).toMatchObject({ url: 'http://localhost:3000/profile', params: { a: 1 } })
    expect(response.data).toEqual({ from: 'network', url: 'http://localhost:3000/profile' })
    // a path that merely contains the prefix is not the mock
    await axios.get('/api/__mock/social/tags')
    expect(network).toHaveBeenCalledTimes(2)
  })

  it('answers mock URLs with genuine responses that interceptors see like any other', async () => {
    const seen: number[] = []
    const id = axios.interceptors.response.use(
      (response) => (seen.push(response.status), response),
      (error: unknown) => {
        if (axios.isAxiosError(error)) seen.push(error.response?.status ?? 0)
        return Promise.reject(error)
      },
    )
    try {
      const response = await axios.get<{ valid: boolean }>('/__mock/auth/validate')
      expect(response.status).toBe(200)
      expect(response.statusText).toBe('OK')
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.data).toEqual({ valid: false, userId: null })
      expect(network).not.toHaveBeenCalled()

      const failure = await axios.get('/__mock/profile').catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(AxiosError)
      const axiosError = failure as AxiosError
      expect(axiosError.code).toBe(AxiosError.ERR_BAD_REQUEST)
      expect(axiosError.response?.status).toBe(401)
      expect(axiosError.response?.data).toEqual({ message: 'Missing or invalid access token', error: 'Unauthorized', statusCode: 401 })
      expect(axiosError.config?.url).toBe('/__mock/profile')
      expect(seen).toEqual([200, 401])
    } finally {
      axios.interceptors.response.eject(id)
    }
  })

  it('keeps the very config object it received on responses and errors (request bookkeeping travels on it)', async () => {
    const ours = axios.defaults.adapter as AxiosAdapter
    const received: InternalAxiosRequestConfig[] = []
    axios.defaults.adapter = (config) => {
      received.push(config)
      return ours(config)
    }
    const tag = axios.interceptors.request.use((config) => Object.assign(config, { bookkeeping: { id: 42 } }), null, { synchronous: true })
    try {
      const response = await axios.get('/__mock/auth/validate')
      expect(response.config).toBe(received[0])
      expect((response.config as { bookkeeping?: unknown }).bookkeeping).toEqual({ id: 42 })
      const error = (await axios.get('/__mock/profile').catch((caught: unknown) => caught)) as AxiosError
      expect(error.config).toBe(received[1])
      expect(error.response?.config).toBe(received[1])
      expect((error.config as { bookkeeping?: unknown }).bookkeeping).toEqual({ id: 42 })
    } finally {
      axios.interceptors.request.eject(tag)
      axios.defaults.adapter = ours
    }
  })

  it('honours validateStatus', async () => {
    const response = await axios.get('/__mock/profile', { validateStatus: () => true })
    expect(response.status).toBe(401)
    const strict = await axios.get('/__mock/auth/validate', { validateStatus: (status) => status === 204 }).catch((error: unknown) => error)
    expect(axios.isAxiosError(strict) && strict.response?.status).toBe(200)
  })

  it('accepts already-stringified JSON, urlencoded bodies, baseURL and params', async () => {
    const login = await axios.post<LoginResult>('/__mock/auth/login', JSON.stringify({ username: 'alice', password: '1234' }), {
      headers: { 'Content-Type': 'application/json' },
      transformRequest: [(data: unknown) => data],
    })
    expect(login.data.message).toBe('Login successful')
    const encoded = await axios.post<LoginResult>('/auth/login', 'username=testuser&password=1234', {
      baseURL: '/__mock',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    expect(encoded.data.message).toBe('Login successful')
    const deck = await axios.get<Card[]>('/__mock/social/discover?sort=fame', { params: { ageMin: 30, ageMax: 40, distance: 50, tags: undefined } })
    expect(deck.data.length).toBeGreaterThan(0)
    expect(deck.data.every((card) => card.age >= 30 && card.age <= 40)).toBe(true)
  })

  it('is harmless to install twice and restores the original adapter on uninstall', async () => {
    installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
    installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
    await axios.get('http://example.test/')
    expect(network).toHaveBeenCalledTimes(1)
    expect((await call('GET', '/__mock/auth/validate')).status).toBe(200)
    uninstallMockBackend()
    expect(axios.defaults.adapter).toBe(network)
  })

  it('waits 120-450 ms by default, and honours abort signals', async () => {
    vi.useFakeTimers()
    installMockBackend({ auth: true, getViewerId: () => null })
    let done = false
    const pending = axios.get('/__mock/auth/validate').then(() => (done = true))
    await vi.advanceTimersByTimeAsync(100)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(400)
    await pending
    expect(done).toBe(true)

    const controller = new AbortController()
    const aborted = axios.get('/__mock/auth/validate', { signal: controller.signal }).catch((error: unknown) => error)
    controller.abort()
    await vi.advanceTimersByTimeAsync(500)
    expect(axios.isCancel(await aborted)).toBe(true)
  })

  it('answers unknown mock routes with a Nest 404', async () => {
    expect(await call('GET', '/__mock/social/nothing-here')).toEqual({
      status: 404,
      data: { message: 'Cannot GET /social/nothing-here', error: 'Not Found', statusCode: 404 },
    })
  })
})

describe('storage robustness', () => {
  it('survives corrupt or foreign data in localStorage', async () => {
    uninstallMockBackend()
    localStorage.setItem('matcha.mock.v1.auth', '{not json')
    localStorage.setItem('matcha.mock.v1.session', '"just a string"')
    installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
    const login = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })
    expect(login.status).toBe(200)

    uninstallMockBackend()
    localStorage.setItem(`matcha.mock.v1.social.${login.data.userId}`, JSON.stringify({ v: 1, viewerId: 'someone else' }))
    installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
    expect((await call<unknown[]>('GET', '/__mock/social/matches')).data.length).toBeGreaterThanOrEqual(3)
  })
})

describe('real-backend mode', () => {
  it('learns the viewer from the real GET /profile response, read-only', async () => {
    const userId = '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963'
    const profile: Profile = {
      userId,
      firstName: 'Real',
      lastName: 'Person',
      gender: 'male',
      sexualPreference: 'female',
      biography: 'hi',
      interests: [{ id: 'x', name: 'cooking' }],
      pictures: [],
      createdAt: '2026-09-30T08:45:31.644Z',
      updatedAt: '2026-09-30T08:45:31.644Z',
    }
    network.mockImplementation(async (config) => networkAnswer(config, 200, profile))
    installMockBackend({ auth: false, getViewerId: () => userId, latency: 0 })
    const real = await axios.get<Profile>('http://localhost:3000/profile')
    expect(real.data).toEqual(profile)
    const deck = (await call<Card[]>('GET', '/__mock/social/discover?ageMin=18&ageMax=99&distance=1000&sort=best')).data
    expect(deck.every((card) => card.gender === 'female' && card.sexualPreference !== 'female')).toBe(true)
    expect(deck.some((card) => card.commonTags.includes('cooking'))).toBe(true)
  })
})
