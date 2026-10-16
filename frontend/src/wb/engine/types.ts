import type { BehaviorSubject } from 'rxjs'
import type { FunctionDef, NodeDef, ServiceDef } from '../types'

/** Everything the engine needs to run the graph. */
export interface EngineConfig {
  nodes: NodeDef[]
  services: Record<string, ServiceDef>
  functions: FunctionDef[]
}

/** The running node graph (docs/ARCHITECTURE.md §4.1). */
export interface StoreEngine {
  /** Resolves true when the graph is live, false when it could not start. Never rejects. */
  readonly ready: Promise<boolean>
  /** A BehaviorSubject-like: subscribe / getValue / next. Throws on an unknown name. */
  getNode(name: string): BehaviorSubject<unknown>
  /** Why `ready` resolved false; null while healthy. */
  readonly failure: string | null
  destroy(): void
}
