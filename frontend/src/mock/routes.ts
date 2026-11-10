/** The route table of the mock backend and the dispatch of one request to its handler. */
import { notFoundRoute, type Handler, type MockRequest, type MockResponse } from './nest'
import { socialRoutes } from './social'

interface RouteSpec {
  method: string
  pattern: string
  handler: Handler
}

interface CompiledRoute extends RouteSpec {
  regex: RegExp
  names: string[]
}

function compile(route: RouteSpec): CompiledRoute {
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
  return { ...route, regex: new RegExp(`^${source}/?$`), names }
}

const ROUTES: readonly CompiledRoute[] = socialRoutes.map(compile)

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Runs the handler of `request` (handlers throw HttpError for error responses). */
export async function dispatch(request: MockRequest): Promise<MockResponse> {
  for (const route of ROUTES) {
    if (route.method !== request.method) continue
    const found = route.regex.exec(request.path)
    if (!found) continue
    const params: Record<string, string> = {}
    route.names.forEach((name, index) => {
      params[name] = decode(found[index + 1] ?? '')
    })
    return route.handler(request, params)
  }
  throw notFoundRoute(request.method, request.path)
}
