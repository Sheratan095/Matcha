import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, Profile, SwipeResult } from '@/api/types'
import { installMockBackend, uninstallMockBackend } from './index'
import { call } from './testkit'

const realDefault = axios.defaults.adapter
let network: ReturnType<typeof vi.fn<AxiosAdapter>>

/** Who the real auth would report. */
const VIEWER = '3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963'
const viewer = () => VIEWER
/** A request the mock refuses with a Nest validation 400. */
const INVALID = '/__mock/social/discover?ageMin=12&sort=random'
const INVALID_BODY = {
  message: ['ageMin must not be less than 18', 'sort must be one of the following values: best, distance, fame, age'],
  error: 'Bad Request',
  statusCode: 400,
}

function networkAnswer(config: InternalAxiosRequestConfig, status: number, body: unknown): AxiosResponse {
  return { data: JSON.stringify(body), status, statusText: 'OK', headers: new AxiosHeaders(), config, request: {} }
}

beforeEach(() => {
  localStorage.clear()
  network = vi.fn<AxiosAdapter>(async (config) => networkAnswer(config, 200, { from: 'network', url: config.url }))
  axios.defaults.adapter = network
  installMockBackend({ getViewerId: viewer, latency: 0 })
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
      const response = await axios.get<string[]>('/__mock/social/tags')
      expect(response.status).toBe(200)
      expect(response.statusText).toBe('OK')
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.data).toContain('vegan')
      expect(network).not.toHaveBeenCalled()

      const failure = await axios.get(INVALID).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(AxiosError)
      const axiosError = failure as AxiosError
      expect(axiosError.code).toBe(AxiosError.ERR_BAD_REQUEST)
      expect(axiosError.response?.status).toBe(400)
      expect(axiosError.response?.data).toEqual(INVALID_BODY)
      expect(axiosError.config?.url).toBe(INVALID)
      expect(seen).toEqual([200, 400])
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
      const response = await axios.get('/__mock/social/tags')
      expect(response.config).toBe(received[0])
      expect((response.config as { bookkeeping?: unknown }).bookkeeping).toEqual({ id: 42 })
      const error = (await axios.get(INVALID).catch((caught: unknown) => caught)) as AxiosError
      expect(error.config).toBe(received[1])
      expect(error.response?.config).toBe(received[1])
      expect((error.config as { bookkeeping?: unknown }).bookkeeping).toEqual({ id: 42 })
    } finally {
      axios.interceptors.request.eject(tag)
      axios.defaults.adapter = ours
    }
  })

  it('honours validateStatus', async () => {
    const response = await axios.get(INVALID, { validateStatus: () => true })
    expect(response.status).toBe(400)
    const strict = await axios.get('/__mock/social/tags', { validateStatus: (status) => status === 204 }).catch((error: unknown) => error)
    expect(axios.isAxiosError(strict) && strict.response?.status).toBe(200)
  })

  it('accepts already-stringified JSON, urlencoded bodies, baseURL and params', async () => {
    const deck = await axios.get<Card[]>('/__mock/social/discover?sort=fame', { params: { ageMin: 30, ageMax: 40, distance: 50, tags: undefined } })
    expect(deck.data.length).toBeGreaterThan(1)
    expect(deck.data.every((card) => card.age >= 30 && card.age <= 40)).toBe(true)
    const [first, second] = deck.data as [Card, Card]

    const json = await axios.post<SwipeResult>('/__mock/social/swipes', JSON.stringify({ targetId: first.userId, action: 'pass' }), {
      headers: { 'Content-Type': 'application/json' },
      transformRequest: [(data: unknown) => data],
    })
    expect(json.status).toBe(200)
    const encoded = await axios.post<SwipeResult>('/social/swipes', `targetId=${second.userId}&action=pass`, {
      baseURL: '/__mock',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    expect(encoded.status).toBe(200)
    const after = await axios.get<Card[]>('/__mock/social/discover?sort=fame', { params: { ageMin: 30, ageMax: 40, distance: 50 } })
    expect(after.data.some((card) => card.userId === first.userId || card.userId === second.userId)).toBe(false)
  })

  it('is harmless to install twice and restores the original adapter on uninstall', async () => {
    installMockBackend({ getViewerId: viewer, latency: 0 })
    installMockBackend({ getViewerId: viewer, latency: 0 })
    await axios.get('http://example.test/')
    expect(network).toHaveBeenCalledTimes(1)
    expect((await call('GET', '/__mock/social/tags')).status).toBe(200)
    uninstallMockBackend()
    expect(axios.defaults.adapter).toBe(network)
  })

  it('waits 120-450 ms by default, and honours abort signals', async () => {
    vi.useFakeTimers()
    installMockBackend({ getViewerId: viewer })
    let done = false
    const pending = axios.get('/__mock/social/tags').then(() => (done = true))
    await vi.advanceTimersByTimeAsync(100)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(400)
    await pending
    expect(done).toBe(true)

    const controller = new AbortController()
    const aborted = axios.get('/__mock/social/tags', { signal: controller.signal }).catch((error: unknown) => error)
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
    localStorage.setItem(`matcha.mock.v1.social.${VIEWER}`, '{not json')
    installMockBackend({ getViewerId: viewer, latency: 0 })
    expect((await call<unknown[]>('GET', '/__mock/social/matches')).data.length).toBeGreaterThanOrEqual(3)

    uninstallMockBackend()
    localStorage.setItem(`matcha.mock.v1.social.${VIEWER}`, JSON.stringify({ v: 1, viewerId: 'someone else' }))
    installMockBackend({ getViewerId: viewer, latency: 0 })
    expect((await call<unknown[]>('GET', '/__mock/social/matches')).data.length).toBeGreaterThanOrEqual(3)
  })
})

describe('the viewer', () => {
  it('is learnt from the real GET /profile response, read-only', async () => {
    const profile: Profile = {
      userId: VIEWER,
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
    const real = await axios.get<Profile>('http://localhost:3000/profile')
    expect(real.data).toEqual(profile)
    const deck = (await call<Card[]>('GET', '/__mock/social/discover?ageMin=18&ageMax=99&distance=1000&sort=best')).data
    expect(deck.every((card) => card.gender === 'female' && card.sexualPreference !== 'female')).toBe(true)
    expect(deck.some((card) => card.commonTags.includes('cooking'))).toBe(true)
  })
})
