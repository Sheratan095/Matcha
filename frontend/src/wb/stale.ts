/**
 * Keeps late answers out of reset nodes.
 *
 * The engine applies responses in arrival order and cancels nothing. A newer request of the same node
 * is handled by the supersede rule of src/api/http.ts, but a node can also be reset with no newer
 * request at all: sign-out (`sessionUserId` -> null), a closed conversation (`activeMatchId` -> null).
 * A GET still in flight at that moment would land afterwards and put stale data (possibly the previous
 * user's) into a node that should be `null`.
 *
 * So: when an HTTP read node turns `null` while it has requests in flight, and no new request of it
 * starts in the same turn (an `onUpdate` flash is followed synchronously by the new request), its
 * in-flight requests are dropped: they fail when they settle and the node stays `null`.
 *
 * Relies on the supersede groups being node names (`installStoreHttp`).
 */
import type { Observable, Subscription } from 'rxjs'
import { dropPendingRequests, type HttpEvent } from '@/api/http'
import type { NodeRegistry } from './registry'

export function dropStaleLoads(
  registry: NodeRegistry,
  events$: Observable<HttpEvent>,
  getNode: (name: string) => Observable<unknown>,
): Subscription {
  /** Per GET node: ids of its requests in flight. */
  const inFlight = new Map<string, Set<number>>()
  const subscription = events$.subscribe((event) => {
    const name = registry.match(event.method, event.url)
    if (!name || event.method !== 'GET') return
    let ids = inFlight.get(name)
    if (!ids) inFlight.set(name, (ids = new Set()))
    if (event.phase === 'start') ids.add(event.id)
    else ids.delete(event.id)
  })

  for (const info of registry.httpNodes) {
    if (info.method !== 'GET') continue
    subscription.add(
      getNode(info.name).subscribe((value) => {
        if (value != null) return
        const ids = inFlight.get(info.name)
        if (!ids || ids.size === 0) return
        const newestBefore = Math.max(...ids)
        queueMicrotask(() => {
          const now = inFlight.get(info.name)
          if (!now || now.size === 0) return
          // A new request started since the reset: the supersede rule already takes care of the old ones.
          if (Math.max(...now) > newestBefore) return
          dropPendingRequests(info.name)
        })
      }),
    )
  }
  return subscription
}
