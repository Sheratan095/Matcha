/**
 * The mock's seat in axios: a wrapper around `axios.defaults.adapter`.
 *
 * - A URL that does not start with MOCK_PREFIX goes to the original adapter untouched: same config,
 *   same promise. (An optional observer may read the successful response; it cannot change it.)
 * - A mock URL is answered in the browser after a simulated latency, with a genuine axios response:
 *   a JSON string body that axios' own `transformResponse` parses, AxiosHeaders, `validateStatus`
 *   honoured, failures as real `AxiosError`s carrying `response.status` / `response.data`, abort
 *   signals, cancel tokens and timeouts respected. Interceptors cannot tell it from the network.
 * - Installing again replaces the previous wrapper instead of stacking (HMR, StrictMode).
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { MOCK_PREFIX } from '@/config'
import { HttpError, internalError, STATUS_TEXT, type MockRequest, type MockResponse } from './nest'

export interface AdapterHooks {
  handle: (request: MockRequest) => Promise<MockResponse>
  /** Milliseconds to wait before answering; 0 answers on the next microtask (fake-timer friendly). */
  latency: () => number
  /** Sees each successful response of a non-mock request. Must not modify it. */
  observe?: (config: InternalAxiosRequestConfig, response: AxiosResponse) => void
}

type AdapterSetting = InternalAxiosRequestConfig['adapter']

const MARK = Symbol.for('matcha.mock.adapter')
type MarkedAdapter = AxiosAdapter & { [MARK]?: { original: AdapterSetting } }

/** What `axios.defaults.adapter` was before any mock wrapper. */
function unwrap(setting: AdapterSetting): AdapterSetting {
  const marked = setting as MarkedAdapter | undefined
  return typeof marked === 'function' && marked[MARK] ? marked[MARK].original : setting
}

// axios 1.x passes the config to getAdapter (the fetch adapter reads `config.env`); the typings omit it.
const resolveAdapter = axios.getAdapter as (adapters: AdapterSetting, config?: InternalAxiosRequestConfig) => AxiosAdapter

// ---------------------------------------------------------------- request

/** baseURL + url, as axios' buildFullPath does. */
function fullPath(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? ''
  const absolute = /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)
  if (config.baseURL && (!absolute || config.allowAbsoluteUrls === false)) {
    return url ? `${config.baseURL.replace(/\/?\/$/, '')}/${url.replace(/^\/+/, '')}` : config.baseURL
  }
  return url
}

export function isMockUrl(url: string): boolean {
  return url === MOCK_PREFIX || url.startsWith(`${MOCK_PREFIX}/`) || url.startsWith(`${MOCK_PREFIX}?`)
}

function paramValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(paramValue).join(',')
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function queryOf(url: string, params: unknown): { path: string; query: Record<string, string> } {
  const bare = url.split('#')[0] as string
  const cut = bare.indexOf('?')
  const path = (cut === -1 ? bare : bare.slice(0, cut)).slice(MOCK_PREFIX.length) || '/'
  const query: Record<string, string> = {}
  if (cut !== -1) new URLSearchParams(bare.slice(cut + 1)).forEach((value, key) => (query[key] = value))
  if (params instanceof URLSearchParams) params.forEach((value, key) => (query[key] = value))
  else if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      // axios drops null and undefined params
      if (value !== null && value !== undefined) query[key] = paramValue(value)
    }
  }
  return { path, query }
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

function isBinary(value: unknown): boolean {
  return (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value)))
  )
}

/**
 * By the time an adapter runs, axios has already transformed the body: objects arrive as JSON
 * strings, FormData as itself. An empty FormData or `{}` is what body-less POSTs carry.
 */
function bodyOf(data: unknown, contentType: string): { body: unknown; form: FormData | null } {
  if (data === undefined || data === null || data === '') return { body: undefined, form: null }
  if (isFormData(data)) {
    const fields: Record<string, string> = {}
    let entries = 0
    data.forEach((value, key) => {
      entries++
      if (typeof value === 'string') fields[key] = value
    })
    return entries === 0 ? { body: {}, form: null } : { body: fields, form: data }
  }
  if (data instanceof URLSearchParams) return { body: Object.fromEntries(data), form: null }
  if (typeof data === 'string') {
    try {
      return { body: JSON.parse(data) as unknown, form: null }
    } catch {
      if (/x-www-form-urlencoded/i.test(contentType) && data.includes('=')) {
        return { body: Object.fromEntries(new URLSearchParams(data)), form: null }
      }
      return { body: data, form: null }
    }
  }
  if (isBinary(data)) return { body: undefined, form: null }
  try {
    // a plain object when transformRequest was disabled: copy it, handlers must not alias caller data
    return { body: JSON.parse(JSON.stringify(data)) as unknown, form: null }
  } catch {
    return { body: undefined, form: null }
  }
}

function toMockRequest(config: InternalAxiosRequestConfig, url: string): MockRequest {
  const { path, query } = queryOf(url, config.params)
  const contentType = String(config.headers?.getContentType?.() ?? '')
  return { method: (config.method ?? 'get').toUpperCase(), path, query, ...bodyOf(config.data, contentType) }
}

// ---------------------------------------------------------------- latency, cancellation, timeout

interface FakeRequest {
  mock: true
  responseURL: string
  status?: number
}

function wait(ms: number, config: InternalAxiosRequestConfig, request: FakeRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const signal = config.signal as AbortSignal | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(new CanceledError(undefined, config, request))
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener?.('abort', onAbort)
    config.cancelToken?.promise.then((reason) => finish(reason ?? new CanceledError(undefined, config, request)))
    const timeout = config.timeout ?? 0
    if (timeout > 0 && ms >= timeout) {
      timer = setTimeout(() => {
        const code = config.transitional?.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED
        finish(new AxiosError(config.timeoutErrorMessage || `timeout of ${timeout}ms exceeded`, code, config, request))
      }, timeout)
      return
    }
    // a promise job, not queueMicrotask / setTimeout: fake timers never hold it back
    if (ms <= 0) void Promise.resolve().then(() => finish())
    else timer = setTimeout(() => finish(), ms)
  })
}

// ---------------------------------------------------------------- response

function toAxiosResponse(config: InternalAxiosRequestConfig, result: MockResponse, request: FakeRequest): AxiosResponse {
  const contentType = result.contentType ?? 'application/json; charset=utf-8'
  const payload =
    typeof result.body === 'string' && contentType.startsWith('text/')
      ? result.body
      : result.body === undefined
        ? ''
        : JSON.stringify(result.body)
  let data: unknown = payload
  if (config.responseType === 'arraybuffer') data = new TextEncoder().encode(payload).buffer
  else if (config.responseType === 'blob' && typeof Blob !== 'undefined') data = new Blob([payload], { type: contentType })
  request.status = result.status
  return {
    data,
    status: result.status,
    statusText: STATUS_TEXT[result.status] ?? '',
    headers: new AxiosHeaders({
      'content-type': contentType,
      'content-length': String(new TextEncoder().encode(payload).length),
      'x-powered-by': 'matcha-mock',
    }),
    config,
    request,
  }
}

/** axios' settle(): resolve, or reject with the AxiosError the network adapters produce. */
function settle(config: InternalAxiosRequestConfig, response: AxiosResponse, request: FakeRequest): AxiosResponse {
  const validateStatus = config.validateStatus
  if (!response.status || !validateStatus || validateStatus(response.status)) return response
  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    response.status >= 400 && response.status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
    config,
    request,
    response,
  )
}

async function answer(config: InternalAxiosRequestConfig, url: string, hooks: AdapterHooks): Promise<AxiosResponse> {
  const request: FakeRequest = { mock: true, responseURL: url }
  await wait(hooks.latency(), config, request)
  const mockRequest = toMockRequest(config, url)
  let result: MockResponse
  try {
    result = await hooks.handle(mockRequest)
  } catch (error) {
    if (error instanceof HttpError) result = error.response
    else {
      console.error(`[mock] ${mockRequest.method} ${mockRequest.path} crashed`, error)
      result = internalError()
    }
  }
  return settle(config, toAxiosResponse(config, result, request), request)
}

// ---------------------------------------------------------------- install

export function installAdapter(hooks: AdapterHooks): void {
  const original = unwrap(axios.defaults.adapter)
  const wrapper: MarkedAdapter = (config) => {
    const url = fullPath(config)
    if (isMockUrl(url)) return answer(config, url, hooks)
    const pending = resolveAdapter(original ?? ['xhr', 'http', 'fetch'], config)(config)
    const observe = hooks.observe
    if (observe) {
      pending.then(
        (response) => {
          try {
            observe(config, response)
          } catch {
            // observing is best effort
          }
        },
        () => undefined,
      )
    }
    return pending
  }
  wrapper[MARK] = { original }
  axios.defaults.adapter = wrapper
}

export function uninstallAdapter(): void {
  axios.defaults.adapter = unwrap(axios.defaults.adapter)
}
