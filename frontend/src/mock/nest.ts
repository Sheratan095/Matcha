/**
 * What a mock handler receives and returns, and errors shaped like NestJS 10's defaults
 * (docs/API_CONTRACT.md §2.0): `{ message: string | string[], error, statusCode }`.
 */

export interface MockRequest {
  method: string
  /** Path below MOCK_PREFIX, without query string, e.g. `/social/matches/<id>/messages`. */
  path: string
  /** Query string merged with `config.params`; null / undefined params are dropped (as axios does). */
  query: Record<string, string>
  /** Parsed body: JSON value, urlencoded fields, or the text fields of a multipart form. */
  body: unknown
  /** The multipart body as sent, when it was a non-empty FormData. */
  form: FormData | null
}

export interface MockResponse {
  status: number
  body: unknown
  /** Default `application/json; charset=utf-8`. Text bodies are sent as-is. */
  contentType?: string
}

export type RouteParams = Readonly<Record<string, string>>
export type Handler = (request: MockRequest, params: RouteParams) => MockResponse | Promise<MockResponse>

export const STATUS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  500: 'Internal Server Error',
}

/** Thrown by handlers; the adapter turns it into the response. */
export class HttpError extends Error {
  readonly response: MockResponse

  constructor(response: MockResponse) {
    super(`HTTP ${response.status}`)
    this.name = 'HttpError'
    this.response = response
  }
}

/**
 * A Nest `HttpException`: `message` as given, `error` = the description (machine codes such as
 * EMAIL_NOT_VERIFIED live there) or the status text.
 */
export function nestError(status: number, message: string | string[], error?: string): HttpError {
  return new HttpError({
    status,
    body: { message, error: error ?? STATUS_TEXT[status] ?? 'Error', statusCode: status },
  })
}

/** What Nest answers for an exception it does not know. */
export function internalError(): MockResponse {
  return { status: 500, body: { statusCode: 500, message: 'Internal server error' } }
}

export function ok(body: unknown, status = 200): MockResponse {
  return { status, body }
}

/** The guard of every authenticated endpoint. */
export function unauthorized(): HttpError {
  return nestError(401, 'Missing or invalid access token')
}

export function notFoundRoute(method: string, path: string): HttpError {
  return nestError(404, `Cannot ${method} ${path}`)
}

/** The body as a plain record (validation then reports each missing field). */
export function record(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}
