/** The route table of the mock backend and the dispatch of one request to its handler. */
import { authRoutes, devRoutes } from './accounts'
import { notFoundRoute, type Handler, type MockRequest, type MockResponse } from './nest'
import { profileRoutes } from './profiles'
import { socialRoutes } from './social'

interface RouteSpec {
  method: string
  pattern: string
  handler: Handler
}

interface CompiledRoute extends RouteSpec {
  /** Demo mode only (the real backend serves these otherwise). */
  demoOnly: boolean
  regex: RegExp
  names: string[]
}

function compile(route: RouteSpec, demoOnly: boolean): CompiledRoute {
  const names: string[] = []
  const source = route.pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      names.push(segment.slice(1))
      return '([^/]+)'
    })
    .join('/')
  // Express routing is not strict: a trailing slash matches too.
  return { ...route, demoOnly, regex: new RegExp(`^${source}/?$`), names }
}

const ROUTES: readonly CompiledRoute[] = [
  ...authRoutes.map((route) => compile(route, true)),
  ...profileRoutes.map((route) => compile(route, true)),
  ...devRoutes.map((route) => compile(route, false)),
  ...socialRoutes.map((route) => compile(route, false)),
]

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Nest reports the path the microservice saw: the gateway strips the service prefix. */
function servicePath(path: string): string {
  const stripped = /^\/(auth|profile|notification)(\/.*)?$/.exec(path)
  return stripped ? (stripped[2] ?? '/') : path
}

/** Runs the handler of `request` (handlers throw HttpError for error responses). */
export async function dispatch(request: MockRequest, demo: boolean): Promise<MockResponse> {
  for (const route of ROUTES) {
    if ((route.demoOnly && !demo) || route.method !== request.method) continue
    const found = route.regex.exec(request.path)
    if (!found) continue
    const params: Record<string, string> = {}
    route.names.forEach((name, index) => {
      params[name] = decode(found[index + 1] ?? '')
    })
    return route.handler(request, params)
  }
  throw notFoundRoute(request.method, servicePath(request.path))
}
