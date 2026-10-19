/**
 * HTTP plumbing shared by every request the app makes (docs/ARCHITECTURE.md §4.4).
 *
 * The node-graph engine sends its requests on the default axios instance and exposes neither the status nor the
 * error of a call (a failed node is just `null`). Everything the app knows about a request therefore
 * comes from the interceptors installed here:
 *
 * - `httpEvents$` publishes `start` / `success` / `error` for every request;
 * - errors are normalised to `ApiError`;
 * - a 401 from a guarded gateway endpoint triggers one single-flight session refresh and one retry;
 * - an older GET never overwrites a newer GET of the same group (the engine applies responses in
 *   arrival order with no cancellation), and a group's in-flight GETs can be dropped when their
 *   result is no longer wanted (`dropPendingRequests`).
 */
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { Subject, type Observable } from 'rxjs'
import type { ApiError } from '@/api/types'
import { API_URL } from '@/config'

// ---------------------------------------------------------------- errors

/** `code` of an `ApiError` that was produced in the browser rather than by the backend. */
export const LOCAL_ERROR = {
  /** No response: connection refused, CORS, offline. */
  NETWORK: 'NETWORK',
  /** No response within the timeout (the gateway hangs when a microservice is down). */
  TIMEOUT: 'TIMEOUT',
  /** The store did not send the request (missing input, or the store is not running). */
  NOT_SENT: 'NOT_SENT',
  /** Input rejected before any request was made. */
  INVALID: 'INVALID',
  /** The backend accepted the credentials but the follow-up session probe found no session (cookie not kept). */
  NO_SESSION: 'NO_SESSION',
  /** The feature does not exist in this mode (e.g. GitHub sign-in with the mock backend). */
  UNAVAILABLE: 'UNAVAILABLE',
  /** A GET whose result was no longer wanted when it arrived (see `dropPendingRequests`). */
  DROPPED: 'DROPPED',
} as const

export function apiError(status: number, message: string, code: string | null = null, messages?: string[]): ApiError {
  return { status, code, message, messages: messages ?? [message] }
}

export function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ApiError>
  return (
    typeof candidate.status === 'number' &&
    typeof candidate.message === 'string' &&
    Array.isArray(candidate.messages) &&
    (candidate.code === null || typeof candidate.code === 'string')
  )
}

const MACHINE_CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/

/**
 * Normalises anything thrown by axios. The backend body is the Nest default
 * `{ message: string | string[], error: string, statusCode: number }`; the only machine-readable
 * discriminators live in `error` (EMAIL_NOT_VERIFIED, COMMON_PASSWORD, ...).
 */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error
  if (!axios.isAxiosError(error)) {
    return apiError(0, error instanceof Error ? error.message : 'Unexpected error', null)
  }
  const response = error.response
  if (!response) {
    const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
    return timedOut
      ? apiError(0, 'The server took too long to answer.', LOCAL_ERROR.TIMEOUT)
      : apiError(0, 'Could not reach the server.', LOCAL_ERROR.NETWORK)
  }
  const body: unknown = response.data
  const fallback = response.statusText || `Request failed (${response.status})`
  if (!body || typeof body !== 'object') {
    return apiError(response.status, typeof body === 'string' && body.trim() ? body.trim() : fallback)
  }
  const { message, error: label } = body as { message?: unknown; error?: unknown }
  const messages = (Array.isArray(message) ? message : [message]).filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  )
  if (messages.length === 0) messages.push(typeof label === 'string' && label ? label : fallback)
  const code = typeof label === 'string' && MACHINE_CODE.test(label) ? label : null
  return apiError(response.status, messages[0], code, messages)
}

// ---------------------------------------------------------------- events

export interface HttpEvent {
  phase: 'start' | 'success' | 'error'
  /** One id per logical request: the retry that follows a session refresh keeps it. */
  id: number
  /** Upper-case method. */
  method: string
  /** The URL as requested, without query string or fragment. */
  url: string
  /** HTTP status; 0 when there was no response; null while in flight. */
  status: number | null
  /** Response body (`success` only). */
  data: unknown
  /** `error` only. */
  error: ApiError | null
}

const events = new Subject<HttpEvent>()

/** Every request made through the default axios instance, the node-graph engine's included. */
export const httpEvents$: Observable<HttpEvent> = events.asObservable()

// ---------------------------------------------------------------- install

export interface HttpOptions {
  /**
   * Origin of the guarded service. A 401 from a URL under it (other than `/auth/refresh` itself) means
   * the access cookie is gone. Defaults to `API_URL`. `/auth/change-email` is guarded too, so `/auth/*`
   * is not excluded as a whole.
   */
  apiUrl?: string
  /**
   * Renews the session (`POST /auth/refresh`). When given, a 401 from a guarded endpoint triggers one
   * single-flight refresh followed by one retry of the request. Without it the 401 goes straight to
   * `onSessionLost`.
   */
  refreshSession?: () => Promise<unknown>
  /** The session could not be recovered: the app should re-probe it. Throttled. */
  onSessionLost?: () => void
  /**
   * Groups GET requests that feed the same piece of state (same node). Within a group the
   * most recently started request wins: an older one resolves with the newer one's outcome.
   */
  supersedeKey?: (method: string, url: string) => string | null
  /** Default 15 s. */
  timeoutMs?: number
  /** Timeout for multipart uploads. Default 60 s. */
  uploadTimeoutMs?: number
}

interface RequestMeta {
  id: number
  method: string
  url: string
  /** Supersede group, if any. */
  key: string | null
  /** true on the single retry that follows a refresh. */
  retried: boolean
}

let dropGroup: ((key: string) => number) | null = null

/**
 * Fails every in-flight GET of a supersede group when it settles, whatever the server answered, so
 * the engine leaves its node `null` instead of applying a result nobody wants any more (the node was
 * reset with no newer request to supersede the old one: sign-out, a closed conversation). The error is
 * an `ApiError` with code DROPPED. Returns how many requests were dropped.
 */
export function dropPendingRequests(key: string): number {
  return dropGroup?.(key) ?? 0
}

function droppedError(): ApiError {
  return apiError(0, 'The result of this request was no longer wanted.', LOCAL_ERROR.DROPPED)
}

interface Deferred {
  id: number
  promise: Promise<AxiosResponse>
  resolve: (value: AxiosResponse | Promise<AxiosResponse>) => void
  reject: (reason: unknown) => void
}

type Outcome = { ok: true; response: AxiosResponse } | { ok: false; error: unknown }

type ConfigWithMeta = InternalAxiosRequestConfig & { matchaRequest?: RequestMeta }

const SESSION_LOST_THROTTLE_MS = 3000

let sequence = 0
let uninstallCurrent: (() => void) | null = null

function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

function requestUrl(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? ''
  const absolute = /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)
  const full = config.baseURL && !absolute ? `${config.baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}` : url
  return stripQuery(full)
}

function defer(id: number): Deferred {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<AxiosResponse>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Nobody may be following this request: its rejection is delivered through the axios promise.
  promise.catch(() => undefined)
  return { id, promise, resolve, reject }
}

/**
 * Installs the interceptors and axios defaults on the default axios instance. Calling it again
 * replaces the previous installation. Returns the uninstaller.
 */
export function installHttp(options: HttpOptions = {}): () => void {
  uninstallCurrent?.()

  const apiUrl = (options.apiUrl ?? API_URL).replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? 15_000
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 60_000

  /** Per supersede group: the most recently started request (kept after it settles). */
  const newest = new Map<string, Deferred>()
  /** Requests of a supersede group that have not settled yet. */
  const pending = new Map<number, Deferred>()
  /** Their group. */
  const pendingGroup = new Map<number, string>()
  /** Those `dropPendingRequests` marked: they fail when they settle. */
  const dropped = new Set<number>()
  let refreshing: Promise<void> | null = null
  let sessionLostAt = Number.NEGATIVE_INFINITY

  const previousDefaults = { withCredentials: axios.defaults.withCredentials, timeout: axios.defaults.timeout }
  // Cookie-only auth: the gateway's HttpOnly cookies must travel with every request.
  axios.defaults.withCredentials = true
  axios.defaults.timeout = timeoutMs

  /**
   * A guarded endpoint: under the api origin, except the refresh call itself (which answers 403, never
   * 401, but must not be able to start a refresh loop). Only guarded endpoints answer 401 at all
   * (`/auth/change-email` and the profile service), so nothing else needs excluding.
   */
  function isGuarded(url: string): boolean {
    if (url !== apiUrl && !url.startsWith(`${apiUrl}/`)) return false
    return url.slice(apiUrl.length) !== '/auth/refresh'
  }

  function sessionLost(): void {
    const now = Date.now()
    // A backend that says "valid" on probe and 401 on reads must not turn into a request loop.
    if (now - sessionLostAt < SESSION_LOST_THROTTLE_MS) return
    sessionLostAt = now
    options.onSessionLost?.()
  }

  function emitOutcome(meta: RequestMeta, outcome: Outcome): void {
    if (outcome.ok) {
      const { status, data } = outcome.response
      events.next({ phase: 'success', id: meta.id, method: meta.method, url: meta.url, status, data, error: null })
    } else {
      const error = toApiError(outcome.error)
      events.next({
        phase: 'error',
        id: meta.id,
        method: meta.method,
        url: meta.url,
        status: error.status,
        data: undefined,
        error,
      })
    }
  }

  /** The logical request is over: publish it, unless a newer request of its group supersedes it. */
  function finish(meta: RequestMeta, outcome: Outcome): AxiosResponse | Promise<AxiosResponse> {
    if (meta.key !== null) {
      const own = pending.get(meta.id)
      pending.delete(meta.id)
      pendingGroup.delete(meta.id)
      if (dropped.delete(meta.id)) {
        // Unwanted: fail it, so the engine sets its node to null rather than to this result.
        const error = droppedError()
        own?.reject(error)
        emitOutcome(meta, { ok: false, error })
        return Promise.reject(error)
      }
      const latest = newest.get(meta.key)
      if (own && latest && latest.id !== meta.id) {
        // Whoever was following this request now follows the newer one too.
        own.resolve(latest.promise)
        return latest.promise.then(
          (response) => {
            emitOutcome(meta, { ok: true, response })
            return response
          },
          (error: unknown) => {
            emitOutcome(meta, { ok: false, error })
            throw error
          },
        )
      }
      if (own) {
        if (outcome.ok) own.resolve(outcome.response)
        else own.reject(outcome.error)
      }
    }
    emitOutcome(meta, outcome)
    return outcome.ok ? outcome.response : Promise.reject(outcome.error)
  }

  const requestInterceptor = axios.interceptors.request.use(
    (config) => {
      const tagged = config as ConfigWithMeta
      // The retry after a refresh carries the meta of the request it repeats: no second `start`.
      if (tagged.matchaRequest) return config

      const method = (config.method ?? 'get').toUpperCase()
      const url = requestUrl(config)
      const meta: RequestMeta = { id: ++sequence, method, url, key: null, retried: false }
      if (method === 'GET' && options.supersedeKey) {
        meta.key = options.supersedeKey(method, url)
        if (meta.key !== null) {
          const deferred = defer(meta.id)
          newest.set(meta.key, deferred)
          pending.set(meta.id, deferred)
          pendingGroup.set(meta.id, meta.key)
        }
      }
      tagged.matchaRequest = meta
      if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.timeout === timeoutMs) {
        config.timeout = uploadTimeoutMs
      }
      events.next({ phase: 'start', id: meta.id, method, url, status: null, data: undefined, error: null })
      return config
    },
    null,
    // Synchronous, so `start` is published inside the node write that causes the request: a node is
    // never observed as "null and not loading" in between.
    { synchronous: true },
  )

  const responseInterceptor = axios.interceptors.response.use(
    (response) => {
      const meta = (response.config as ConfigWithMeta).matchaRequest
      return meta ? finish(meta, { ok: true, response }) : response
    },
    (error: unknown) => {
      const config = axios.isAxiosError(error) ? (error.config as ConfigWithMeta | undefined) : undefined
      const meta = config?.matchaRequest
      if (!config || !meta) return Promise.reject(error)

      const unauthorized = axios.isAxiosError(error) && error.response?.status === 401 && isGuarded(meta.url)
      if (!unauthorized) return finish(meta, { ok: false, error })

      const refreshSession = options.refreshSession
      if (!refreshSession || meta.retried) {
        // No way to renew, or the renewed session was refused as well: either way the session is gone.
        sessionLost()
        return finish(meta, { ok: false, error })
      }

      // Refresh tokens rotate and two concurrent refreshes race (the loser gets 403), so every 401
      // that arrives while one is in flight waits for that same refresh.
      refreshing ??= Promise.resolve()
        .then(refreshSession)
        .then(() => undefined)
        .finally(() => {
          refreshing = null
        })
      return refreshing.then(
        () => axios.request({ ...config, matchaRequest: { ...meta, retried: true } } as ConfigWithMeta),
        () => {
          sessionLost()
          return finish(meta, { ok: false, error })
        },
      )
    },
  )

  const drop = (key: string): number => {
    let count = 0
    for (const [id, group] of pendingGroup) {
      if (group === key && !dropped.has(id)) {
        dropped.add(id)
        count++
      }
    }
    return count
  }

  const uninstall = (): void => {
    if (uninstallCurrent !== uninstall) return
    uninstallCurrent = null
    if (dropGroup === drop) dropGroup = null
    axios.interceptors.request.eject(requestInterceptor)
    axios.interceptors.response.eject(responseInterceptor)
    axios.defaults.withCredentials = previousDefaults.withCredentials
    axios.defaults.timeout = previousDefaults.timeout
  }
  uninstallCurrent = uninstall
  dropGroup = drop
  return uninstall
}
