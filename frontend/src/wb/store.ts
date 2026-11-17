/**
 * The running store: the node-graph engine (docs/ARCHITECTURE.md §4.1) behind typed node accessors.
 *
 * - `startStore()` creates the engine. It is idempotent; tests may pass their own engine.
 * - Node accessors throw until the engine has been ready once. After `stopStore()` reads are refused
 *   and `isStoreLive()` is false, so `run` / `refresh` refuse to send.
 */
import type { BehaviorSubject, Observable } from 'rxjs'
import { httpEvents$ } from '@/api/http'
import { createGraphEngine } from './engine/graph'
import type { EngineConfig, StoreEngine } from './engine/types'
import { FUNCTIONS } from './functions'
import { NODES, type HttpNodeName, type NodeName, type NodeValue, type NodeValues, type WritableNodeName } from './nodes'
import { validateGraph } from './nodes/validate'
import { createRegistry } from './registry'
import { SERVICES } from './services'
import { dropStaleLoads } from './stale'
import { createStatusTracker, type NodeStatus, type StatusSource, type StatusTracker } from './status'

/** The nodes, services and functions the engine runs. */
export const GRAPH: EngineConfig = { nodes: NODES, services: SERVICES, functions: FUNCTIONS }

/** Request -> node attribution, built once from the graph. */
export const registry = createRegistry(NODES, SERVICES)

/** What `main.tsx` needs to drive the boot screens. */
export interface StoreHandle {
  /** true once the graph is live; false when the engine could not start. Never rejects. */
  readonly ready: Promise<boolean>
  /** Why the engine could not start; null while healthy. */
  readonly failure: string | null
}

interface ActiveStore {
  readonly engine: StoreEngine
  readonly tracker: StatusTracker
  readonly handle: StoreHandle
  /** Became ready at least once: nodes may be read. */
  started: boolean
  /** Ready and not stopped: nodes may be written and requests sent. */
  live: boolean
  readonly cleanups: (() => void)[]
  readonly once: Set<string>
}

let active: ActiveStore | null = null

/** An engine that never started, so a construction error reaches the failure screen like any other. */
function failedEngine(failure: string): StoreEngine {
  return {
    ready: Promise.resolve(false),
    failure,
    getNode(name) {
      throw new Error(`Store node "${name}" not found: the store did not start`)
    },
    destroy() {},
  }
}

function createEngine(): StoreEngine {
  const problems = validateGraph(GRAPH)
  if (problems.length > 0) return failedEngine(`The node graph is invalid:\n- ${problems.join('\n- ')}`)
  try {
    return createGraphEngine(GRAPH)
  } catch (error) {
    return failedEngine(error instanceof Error ? error.message : String(error))
  }
}

export interface StartOptions {
  /** Use this engine instead of creating one (tests). */
  engine?: StoreEngine
}

/** Creates the engine (once) and returns the handle the boot sequence waits on. */
export function startStore(options: StartOptions = {}): StoreHandle {
  if (active) return active.handle
  const engine = options.engine ?? createEngine()
  const tracker = createStatusTracker(registry, httpEvents$, NODES)
  let ownFailure: string | null = null

  const store: ActiveStore = {
    engine,
    tracker,
    started: false,
    live: false,
    cleanups: [],
    once: new Set(),
    handle: {
      // Resolved after the store's own wiring, so whoever awaits it can use nodes at once.
      ready: engine.ready.then(
        (ok) => {
          if (active !== store || !ok) return false
          try {
            tracker.attach((name) => engine.getNode(name))
            const stale = dropStaleLoads(registry, httpEvents$, (name) => engine.getNode(name))
            store.cleanups.push(() => stale.unsubscribe())
          } catch (error) {
            ownFailure = error instanceof Error ? error.message : String(error)
            return false
          }
          store.started = true
          store.live = true
          return true
        },
        (error: unknown) => {
          ownFailure = error instanceof Error ? error.message : String(error)
          return false
        },
      ),
      get failure() {
        return ownFailure ?? engine.failure
      },
    },
  }
  active = store
  return store.handle
}

/** Tears the store down: engine destroyed, watchers stopped. For tests and hot reload. */
export function stopStore(): void {
  const store = active
  if (!store) return
  active = null
  store.live = false
  for (const cleanup of store.cleanups.splice(0).reverse()) {
    try {
      cleanup()
    } catch (error) {
      console.error('Store cleanup failed', error)
    }
  }
  store.tracker.dispose()
  store.engine.destroy()
}

/** The graph has been live at least once: nodes can be read. */
export function isStoreStarted(): boolean {
  return active?.started ?? false
}

/** The graph is live right now: nodes can be written and requests sent. */
export function isStoreLive(): boolean {
  return active?.live ?? false
}

/** Registers teardown work for the current store (watchers started after boot). */
export function onStoreStop(cleanup: () => void): void {
  if (!active) throw new Error('No store is running')
  active.cleanups.push(cleanup)
}

/** true the first time it is called with `key` for the current store. */
export function firstTimeForStore(key: string): boolean {
  if (!active) throw new Error('No store is running')
  if (active.once.has(key)) return false
  active.once.add(key)
  return true
}

function started(): ActiveStore {
  if (!active?.started) {
    throw new Error(
      'The store is not running yet: nodes can only be used after startStore() and its `ready` resolved true',
    )
  }
  return active
}

// ---------------------------------------------------------------- typed node access

/** The node object itself (a BehaviorSubject). Internal: screens use the typed helpers below. */
export function nodeSubject(name: NodeName): BehaviorSubject<unknown> {
  return started().engine.getNode(name)
}

/** Writes any node, payload and trigger nodes included. Internal to the state layer. */
export function writeNode(name: NodeName, value: unknown): void {
  nodeSubject(name).next(value)
}

/** Current value: the loaded value, `null` (loading / reset / failed) or `undefined` (never loaded). */
export function getNodeValue<N extends NodeName>(name: N): NodeValue<N> {
  return nodeSubject(name).getValue() as NodeValue<N>
}

/**
 * Writes a selection node screens own (filters, the open chat, ...). Command payloads go through `run`,
 * refresh nonces through `refresh`.
 */
export function setNode<N extends WritableNodeName>(name: N, value: NodeValues[N] | null): void {
  writeNode(name, value)
}

/** The node as an Observable: emits the current value at once, then every change. */
export function node$<N extends NodeName>(name: N): Observable<NodeValue<N>> {
  return nodeSubject(name).asObservable() as Observable<NodeValue<N>>
}

/** Request status of an HTTP node. */
export function getNodeStatus(name: HttpNodeName): NodeStatus {
  return started().tracker.get(name)
}

export function nodeStatus$(name: HttpNodeName): Observable<NodeStatus> {
  return started().tracker.status$(name)
}

/** When the value an HTTP node holds arrived (`Date.now()`); null unless its status is `success`. Internal. */
export function getLoadedAt(name: HttpNodeName): number | null {
  return started().tracker.loadedAt(name)
}

/**
 * Request ids grow with time: `getRequestId(node) > mark`, with `mark = getLastRequestId()` taken at
 * some moment, means the node has a request that started after that moment. Internal (realtime).
 */
export function getRequestId(name: HttpNodeName): number {
  return started().tracker.requestId(name)
}

export function getLastRequestId(): number {
  return started().tracker.lastRequestId()
}

/** The status subject of an HTTP node. Internal (hooks). */
export function statusSource(name: HttpNodeName): StatusSource {
  return started().tracker.source(name)
}

// A hot update of the state layer must not leave a second store behind: stop this one and reload the page.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stopStore())
  import.meta.hot.accept(() => window.location.reload())
}
