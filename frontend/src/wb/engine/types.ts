import type { BehaviorSubject, Observable } from 'rxjs'
import type { FunctionDef, NodeDef, ServiceDef } from '../types'

export type EngineKind = 'wavebinder' | 'preview'

/** Everything an engine needs: the same three inputs `new WaveBinder(license, ...)` takes. */
export interface EngineConfig {
  nodes: NodeDef[]
  services: Record<string, ServiceDef>
  functions: FunctionDef[]
}

/**
 * The two interchangeable stores (docs/ARCHITECTURE.md §4.1): the real WaveBinder instance, or the
 * preview interpreter of the same node definitions used while no license file is installed.
 */
export interface StoreEngine {
  readonly kind: EngineKind
  /** Resolves true when the graph is live, false when it could not start. Never rejects. */
  readonly ready: Promise<boolean>
  /** A BehaviorSubject-like: subscribe / getValue / next. Throws on an unknown name. */
  getNode(name: string): BehaviorSubject<unknown>
  /** Emits once if the engine dies after being ready (license heartbeat failure). Replays to late subscribers. */
  readonly dead$: Observable<void>
  /** Why `ready` resolved false or `dead$` fired; null while healthy. */
  readonly failure: string | null
  destroy(): void
}
