/**
 * Maps a request back to the HTTP node that sent it (docs/ARCHITECTURE.md §4.4).
 *
 * WaveBinder does not tell which node issued a request, so the node is recovered from the method and
 * the URL: each HTTP node contributes the pattern `service target + addr`, where a `{placeholder}`
 * matches exactly one path segment. When several patterns match, the most specific wins, comparing
 * segments left to right with a literal beating a placeholder: `/profile/viewers` resolves to the
 * viewers node, never to `/profile/{userId}`.
 */
import { serviceBase } from './engine/request'
import { isHttpMethod, type NodeDef, type ServiceDef } from './types'

export interface HttpNodeInfo {
  name: string
  method: string
  /** Full URL pattern, placeholders included. */
  pattern: string
  /** One entry per `/`-separated segment; null for a placeholder. */
  segments: (string | null)[]
}

export interface NodeRegistry {
  /** The node that sends `method url`, or null when the request does not come from a node. */
  match(method: string, url: string): string | null
  readonly httpNodes: readonly HttpNodeInfo[]
}

const PLACEHOLDER = /^\{[^{}]+\}$/

function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

function toSegments(pattern: string): (string | null)[] {
  return pattern.split('/').map((segment) => (PLACEHOLDER.test(segment) ? null : segment))
}

/** Negative when `a` is more specific than `b`; 0 when they accept exactly the same URLs. */
function bySpecificity(a: HttpNodeInfo, b: HttpNodeInfo): number {
  for (let index = 0; index < a.segments.length; index++) {
    const left = a.segments[index]
    const right = b.segments[index]
    if (left === right) continue
    if (left === null) return 1
    if (right === null) return -1
    // Two different literals: the patterns cannot match the same URL, any stable order will do.
    return left < right ? -1 : 1
  }
  return 0
}

export function createRegistry(nodes: NodeDef[], services: Record<string, ServiceDef>): NodeRegistry {
  const httpNodes: HttpNodeInfo[] = []
  for (const def of nodes) {
    if (!isHttpMethod(def.la.type)) continue
    const service = def.la.serviceName ? services[def.la.serviceName] : undefined
    const pattern = serviceBase(service) + (def.la.addr ?? '')
    httpNodes.push({ name: def.name, method: def.la.type, pattern, segments: toSegments(pattern) })
  }

  /** Per "METHOD segmentCount", most specific first. */
  const buckets = new Map<string, HttpNodeInfo[]>()
  for (const info of httpNodes) {
    const key = `${info.method} ${info.segments.length}`
    const bucket = buckets.get(key) ?? []
    for (const other of bucket) {
      if (bySpecificity(info, other) === 0) {
        throw new Error(
          `Nodes "${other.name}" and "${info.name}" both send ${info.method} ${info.pattern}: a request could not be attributed to one of them`,
        )
      }
    }
    bucket.push(info)
    bucket.sort(bySpecificity)
    buckets.set(key, bucket)
  }

  return {
    httpNodes,
    match(method, url) {
      const segments = withoutQuery(url).split('/')
      const bucket = buckets.get(`${method.toUpperCase()} ${segments.length}`)
      if (!bucket) return null
      const found = bucket.find((info) =>
        info.segments.every((segment, index) => (segment === null ? segments[index] !== '' : segment === segments[index])),
      )
      return found?.name ?? null
    },
  }
}
