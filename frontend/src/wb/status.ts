/**
 * Request status per HTTP node (docs/ARCHITECTURE.md §4.4).
 *
 * The engine has no loading flag and no error channel (a node is just `null` while loading, after a
 * reset and after a failure), so the status comes from the HTTP event stream, attributed to a node by
 * the registry. Rules:
 * - a request start makes the node `loading`; only the most recently started request of a node may
 *   then settle it (`success` / `error`), older ones are ignored;
 * - `success` drops back to `idle` when the node is reset to `null` without a request (logout, a
 *   cleared path variable), so `success` always means "the value is there";
 * - when the signed-in user changes, nodes that depend on `sessionUserId` forget their outcome;
 * - a request dropped because its node was reset (src/wb/stale.ts) ends in `idle`, not `error`.
 */
import { BehaviorSubject, type Observable, type Subscription } from 'rxjs'
import { LOCAL_ERROR, type HttpEvent } from '@/api/http'
import type { ApiError } from '@/api/types'
import type { NodeRegistry } from './registry'
import type { NodeDef } from './types'

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

export interface NodeStatus {
  readonly status: RequestStatus
  /** The normalised error of the last request; null unless `status` is `error`. */
  readonly error: ApiError | null
}

export const IDLE: NodeStatus = Object.freeze({ status: 'idle', error: null })
const LOADING: NodeStatus = Object.freeze({ status: 'loading', error: null })
const SUCCESS: NodeStatus = Object.freeze({ status: 'success', error: null })

/** Readable side of a status subject. */
export interface StatusSource extends Observable<NodeStatus> {
  getValue(): NodeStatus
}

export interface StatusTracker {
  /** Current status and changes; throws for a node that sends no request. */
  status$(name: string): Observable<NodeStatus>
  get(name: string): NodeStatus
  /** The status subject itself, for `useSyncExternalStore` (stable per node). */
  source(name: string): StatusSource
  /** Starts following node values; called once the graph is live. */
  attach(getNode: (name: string) => Observable<unknown>): void
  dispose(): void
}

export function createStatusTracker(
  registry: NodeRegistry,
  events$: Observable<HttpEvent>,
  nodes: readonly NodeDef[],
): StatusTracker {
  const subjects = new Map<string, BehaviorSubject<NodeStatus>>()
  for (const info of registry.httpNodes) subjects.set(info.name, new BehaviorSubject<NodeStatus>(IDLE))
  const sessionScoped = nodes
    .filter((def) => subjects.has(def.name) && def.dep.some((dep) => dep.nodeName === 'sessionUserId'))
    .map((def) => def.name)

  /** Id of the most recent request per node. */
  const latest = new Map<string, number>()
  const subscriptions: Subscription[] = []

  function subject(name: string): BehaviorSubject<NodeStatus> {
    const found = subjects.get(name)
    if (!found) throw new Error(`"${name}" is not an HTTP node: it has no request status`)
    return found
  }

  function set(name: string, status: NodeStatus): void {
    const target = subject(name)
    if (target.getValue() !== status) target.next(status)
  }

  subscriptions.push(
    events$.subscribe((event) => {
      const name = registry.match(event.method, event.url)
      if (!name) return
      if (event.phase === 'start') {
        latest.set(name, event.id)
        set(name, LOADING)
        return
      }
      if (latest.get(name) !== event.id) return
      if (event.phase === 'success') set(name, SUCCESS)
      // A dropped request was not wanted any more (its node was reset): not a failure.
      else if (event.error?.code === LOCAL_ERROR.DROPPED) set(name, IDLE)
      else set(name, Object.freeze({ status: 'error', error: event.error }))
    }),
  )

  return {
    status$: (name) => subject(name).asObservable(),
    get: (name) => subject(name).getValue(),
    source: (name) => subject(name),
    attach(getNode) {
      for (const name of subjects.keys()) {
        subscriptions.push(
          getNode(name).subscribe((value) => {
            if (value == null && subject(name).getValue() === SUCCESS) set(name, IDLE)
          }),
        )
      }
      let user: unknown
      let first = true
      subscriptions.push(
        getNode('sessionUserId').subscribe((value) => {
          const changed = !first && value !== user
          first = false
          user = value
          if (!changed) return
          for (const name of sessionScoped) if (subject(name).getValue() !== LOADING) set(name, IDLE)
        }),
      )
    },
    dispose() {
      subscriptions.forEach((subscription) => subscription.unsubscribe())
      subscriptions.length = 0
    },
  }
}
