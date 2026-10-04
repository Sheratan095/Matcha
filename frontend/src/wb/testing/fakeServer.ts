/**
 * Test-only: a fake axios adapter with route handlers, installed on the default axios instance (the one
 * both engines and the interceptors use). Responses and errors are shaped like axios' own, so the
 * interceptors of src/api/http.ts cannot tell the difference.
 */
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

export interface FakeRequest {
  method: string
  /** As requested, without query string. */
  url: string
  params: Record<string, unknown>
  /** JSON bodies parsed; FormData as is. */
  body: unknown
  /** `:name` segments of the matched route. */
  route: Record<string, string>
}

/** A handler returns a body (status 200) or a `reply(...)`. It may be async. */
export type Handler = (request: FakeRequest) => unknown

export interface Reply {
  readonly __reply: true
  status: number
  data: unknown
}

export function reply(status: number, data?: unknown): Reply {
  return { __reply: true, status, data }
}

/** The Nest error body. */
export function nestError(status: number, message: string | string[], error = 'Error'): Reply {
  return reply(status, { message, error, statusCode: status })
}

function isReply(value: unknown): value is Reply {
  return typeof value === 'object' && value !== null && (value as Reply).__reply === true
}

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

export interface Deferred<T = void> {
  promise: Promise<T>
  resolve(value: T): void
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export class FakeServer {
  readonly requests: FakeRequest[] = []
  private readonly routes: Route[] = []
  /** Milliseconds before each answer (a macrotask, like a real network). */
  latency = 0

  on(method: string, url: string, handler: Handler): this {
    this.routes.unshift({ method: method.toUpperCase(), segments: url.split('/'), handler })
    return this
  }

  /** Requests sent so far for `METHOD url` (url without query). */
  sent(method: string, url: string): FakeRequest[] {
    return this.requests.filter((request) => request.method === method.toUpperCase() && request.url === url)
  }

  install(): () => void {
    const previous = axios.defaults.adapter
    axios.defaults.adapter = this.adapter
    return () => {
      axios.defaults.adapter = previous
    }
  }

  private readonly adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = (config.url ?? '').split('?')[0]
    const segments = url.split('/')
    let body: unknown = config.data
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        // not JSON: keep the string
      }
    }
    const params = { ...((config.params as Record<string, unknown> | undefined) ?? {}) }
    for (const key of Object.keys(params)) if (params[key] === null || params[key] === undefined) delete params[key]

    const route = this.routes.find(
      (candidate) =>
        candidate.method === method &&
        candidate.segments.length === segments.length &&
        candidate.segments.every((segment, index) => segment.startsWith(':') || segment === segments[index]),
    )
    const captured: Record<string, string> = {}
    route?.segments.forEach((segment, index) => {
      if (segment.startsWith(':')) captured[segment.slice(1)] = segments[index]
    })
    const request: FakeRequest = { method, url, params, body, route: captured }
    this.requests.push(request)

    await new Promise((resolve) => setTimeout(resolve, this.latency))
    const answer: unknown = route ? await route.handler(request) : nestError(404, `Cannot ${method} ${url}`, 'Not Found')
    const { status, data } = isReply(answer) ? answer : { status: 200, data: answer }
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: new AxiosHeaders(),
      config,
      request: {},
    }
    if (status >= 200 && status < 300) return response
    throw new AxiosError(
      `Request failed with status code ${status}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      response,
    )
  }
}
