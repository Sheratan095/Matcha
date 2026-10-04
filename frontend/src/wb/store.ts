/**
 * The running store: one engine (docs/ARCHITECTURE.md §4.1) behind typed node accessors.
 *
 * - `startStore()` picks the engine: the real WaveBinder when `src/wb/license.json` exists, otherwise
 *   the preview interpreter. It is idempotent; tests may pass their own engine.
 * - Node accessors throw until the engine has been ready once. After the engine dies (license heartbeat
 *   failure) reads keep returning the last values so a mounted screen can finish rendering, while
 *   `isStoreLive()` turns false and `run` / `refresh` refuse to send.
 */
import { NEVER, ReplaySubject, type BehaviorSubject, type Observable } from 'rxjs'
import { httpEvents$ } from '@/api/http'
import { BACKEND, WAVEBINDER_LICENSE_SERVER_URL } from '@/config'
import { createPreviewEngine } from './engine/preview'
import type { EngineConfig, EngineKind, StoreEngine } from './engine/types'
import { createWaveBinderEngine } from './engine/wavebinder'
import { FUNCTIONS } from './functions'
import { HAS_LICENSE, readLicense } from './license'
import { NODES, type HttpNodeName, type NodeName, type NodeValue, type NodeValues, type WritableNodeName } from './nodes'
import { validateGraph } from './nodes/validate'
import { createRegistry } from './registry'
import { SERVICES } from './services'
import { dropStaleLoads } from './stale'
import { createStatusTracker, type NodeStatus, type StatusSource, type StatusTracker } from './status'

/** The three inputs of `new WaveBinder(license, ...)`, shared by both engines. */
export const GRAPH: EngineConfig = { nodes: NODES, services: SERVICES, functions: FUNCTIONS }

/** Request -> node attribution, built once from the graph. */
export const registry = createRegistry(NODES, SERVICES)

export interface StoreInfo {
  /** Which engine runs the graph; the UI shows a "PREVIEW STORE" marker for `preview`. */
  readonly engine: EngineKind
  /** `real`: auth and profile hit the gateway; `mock`: everything is served in the browser. */
  readonly backend: 'real' | 'mock'
}

export const storeInfo: StoreInfo = Object.freeze({
  engine: HAS_LICENSE ? 'wavebinder' : 'preview',
  backend: BACKEND,
})

/** What `main.tsx` needs to drive the boot screens. */
export interface StoreHandle {
  readonly kind: EngineKind
  /** true once the graph is live; false when the engine could not start. Never rejects. */
  readonly ready: Promise<boolean>
  /** Emits once if the engine dies after being ready. Replays. */
  readonly dead$: Observable<void>
  /** Why the engine could not start or died; null while healthy. */
  readonly failure: string | null
}

interface ActiveStore {
  readonly engine: StoreEngine
  readonly tracker: StatusTracker
  readonly handle: StoreHandle
  /** Became ready at least once: nodes may be read. */
  started: boolean
  /** Ready and not dead: nodes may be written and requests sent. */
  live: boolean
  readonly cleanups: (() => void)[]
  readonly once: Set<string>
}

let active: ActiveStore | null = null

/** An engine that never started, so a construction error reaches the failure screen like any other. */
function failedEngine(kind: EngineKind, failure: string): StoreEngine {
  return {
    kind,
    ready: Promise.resolve(false),
    dead$: NEVER,
    failure,
    getNode(name) {
      throw new Error(`Store node "${name}" not found: the store did not start`)
    },
    destroy() {},
  }
}

function createEngine(): StoreEngine {
  const kind: EngineKind = HAS_LICENSE ? 'wavebinder' : 'preview'
  const problems = validateGraph(GRAPH)
  if (problems.length > 0) return failedEngine(kind, `The node graph is invalid:\n- ${problems.join('\n- ')}`)
  if (!HAS_LICENSE) {
    try {
      return createPreviewEngine(GRAPH)
    } catch (error) {
      return failedEngine(kind, error instanceof Error ? error.message : String(error))
    }
  }
  const license = readLicense()
  if (!license.ok) return failedEngine(kind, license.reason)
  return createWaveBinderEngine(license.license, GRAPH, { licenseServerUrl: WAVEBINDER_LICENSE_SERVER_URL })
}

export interface StartOptions {
  /** Use this engine instead of choosing one (tests). */
  engine?: StoreEngine
}

/** Creates the engine (once) and returns the handle the boot sequence waits on. */
export function startStore(options: StartOptions = {}): StoreHandle {
  if (active) return active.handle
  const engine = options.engine ?? createEngine()
  const tracker = createStatusTracker(registry, httpEvents$, NODES)
  const dead = new ReplaySubject<void>(1)
  let ownFailure: string | null = null

  const store: ActiveStore = {
    engine,
    tracker,
    started: false,
    live: false,
    cleanups: [],
    once: new Set(),
    handle: {
      kind: engine.kind,
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
      dead$: dead.asObservable(),
      get failure() {
        return ownFailure ?? engine.failure
      },
    },
  }
  active = store

  const deathWatch = engine.dead$.subscribe(() => {
    if (active !== store) return
    store.live = false
    dead.next()
  })
  store.cleanups.push(() => deathWatch.unsubscribe())
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

/** The status subject of an HTTP node. Internal (hooks). */
export function statusSource(name: HttpNodeName): StatusSource {
  return started().tracker.source(name)
}

// A hot update of the state layer must not leave a second store (and, with a license, a second
// heartbeating WaveBinder instance) behind: stop this one and reload the page.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stopStore())
  import.meta.hot.accept(() => window.location.reload())
}
