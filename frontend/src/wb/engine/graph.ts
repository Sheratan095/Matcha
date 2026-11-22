/**
 * The graph engine: an interpreter of the app's `NodeDef[]` on plain RxJS BehaviorSubjects
 * (docs/ARCHITECTURE.md §4.1).
 *
 * It implements the subset the app uses: top-level SINGLE nodes with USER_SELECTION / CUSTOM_FUNCTION /
 * HTTP loading actions. Anything outside that subset is rejected at construction instead of being
 * approximated.
 */
import axios from 'axios'
import { BehaviorSubject, type Subscription } from 'rxjs'
import { isHttpMethod, type FunctionDef, type NodeDef } from '../types'
import { buildRequest } from './request'
import type { EngineConfig, StoreEngine } from './types'

type AnyFunction = (...args: unknown[]) => unknown

class GraphNode extends BehaviorSubject<unknown> {
  readonly def: NodeDef
  /** Last value received per dependency node name. */
  readonly depValues = new Map<string, unknown>()
  readonly subscriptions: Subscription[] = []

  constructor(def: NodeDef) {
    super(undefined)
    this.def = def
  }
}

function assertSupported(def: NodeDef): void {
  const unsupported =
    def.type !== 'SINGLE'
      ? `node type ${def.type}`
      : def.proto || def.protos
        ? 'proto / protos'
        : def.dep.some((dep) => dep.namingResolvingRule)
          ? 'namingResolvingRule'
          : null
  if (unsupported) {
    throw new Error(`Store: node "${def.name}" uses ${unsupported}, which the graph engine does not implement`)
  }
}

/** Parameter names as read from the first parenthesised group of `fn.toString()`. */
function parameterNames(fn: AnyFunction): string[] {
  const match = fn.toString().match(/\(([^)]*)\)/)
  const list = match?.[1].trim()
  if (!list) return []
  return list
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

function isContextName(name: string): boolean {
  const lower = name.trim().toLowerCase()
  return lower === 'snapshot' || lower === 'context' || lower === 'ctx'
}

function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  Object.freeze(value)
  for (const key of Object.getOwnPropertyNames(value)) {
    const child = (value as Record<string, unknown>)[key]
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child)
  }
  return value
}

function snapshotOf(node: GraphNode): unknown {
  const depValues: Record<string, unknown> = {}
  const depValuesByParameter: Record<string, unknown> = {}
  for (const dep of node.def.dep) {
    const value = cloneValue(node.depValues.get(dep.nodeName))
    depValues[dep.nodeName] = value
    depValuesByParameter[dep.parameterName] = value
  }
  return deepFreeze({
    timestamp: new Date().toISOString(),
    node: {
      name: node.def.name,
      type: node.def.type,
      path: node.def.path,
      value: cloneValue(node.getValue()),
      iteration: [],
    },
    depValues,
    depValuesByParameter,
  })
}

/**
 * Argument mapping of a custom function: by name when every parameter name is a dependency
 * `parameterName`, otherwise in `dep` order; a frozen snapshot is appended when the last parameter is
 * called snapshot / context / ctx or when the function declares more parameters than dependencies.
 */
function callFunction(node: GraphNode, fn: AnyFunction | undefined): unknown {
  if (!fn) return null
  const deps = node.def.dep
  const byParameter = new Map(deps.map((dep) => [dep.parameterName, dep]))
  const names = parameterNames(fn)
  const last = names[names.length - 1]
  const mapByName =
    names.length > 0 &&
    names.every((name, index) => byParameter.has(name) || (index === names.length - 1 && isContextName(name)))

  const args: unknown[] = []
  if (mapByName) {
    for (const name of names) {
      if (isContextName(name)) continue
      const dep = byParameter.get(name)
      args.push(dep ? node.depValues.get(dep.nodeName) : undefined)
    }
  } else {
    for (const dep of deps) args.push(node.depValues.get(dep.nodeName))
  }
  if ((last !== undefined && isContextName(last)) || fn.length > deps.length) args.push(snapshotOf(node))
  return fn(...args)
}

/**
 * Logs a request of node `name` that failed. An HTTP answer (4xx / 5xx) is expected traffic: the app
 * reads it from the request status (src/api/http.ts, `useNodeStatus`) and the browser already lists the
 * response, so it is only a debug line, and a request dropped on purpose (code DROPPED, src/wb/stale.ts)
 * is not logged at all. Anything else (no answer, an exception while building the request) is a warning.
 */
function reportFailure(name: string, error: unknown): void {
  if (axios.isAxiosError(error) && error.response) {
    console.debug(`Request of node "${name}" answered ${error.response.status}`)
    return
  }
  if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'DROPPED') return
  console.warn('Backend call failed for node', name, error)
}

export function createGraphEngine(config: EngineConfig): StoreEngine {
  config.nodes.forEach(assertSupported)

  const functions = new Map<string, FunctionDef['implementation']>(
    config.functions.map((fn) => [fn.name, fn.implementation]),
  )
  const nodes = config.nodes.map((def) => new GraphNode(def))
  const byName = new Map<string, GraphNode>()
  // First match wins.
  for (const node of nodes) if (!byName.has(node.def.name)) byName.set(node.def.name, node)
  let destroyed = false

  function dependenciesResolved(node: GraphNode): boolean {
    return node.def.dep.every((dep) => dep.isOptional || node.depValues.get(dep.nodeName) != null)
  }

  /** Re-runs the node's loading action, `from` being the dependency that emitted. */
  function reload(node: GraphNode, from?: string): void {
    const { la, dep, name } = node.def
    if (la.type === 'USER_SELECTION') {
      // Reset, waiting for the user: this is why a selection node must not have dependencies.
      node.next(null)
      return
    }
    if (from !== undefined && node.depValues.has(from) && dep.find((d) => d.nodeName === from)?.onUpdate) {
      node.next(null)
    }
    if (!dependenciesResolved(node)) return

    if (la.type === 'CUSTOM_FUNCTION') {
      try {
        const fn = la.functionName ? functions.get(la.functionName) : undefined
        node.next(callFunction(node, fn as AnyFunction | undefined))
      } catch (error) {
        console.error('Custom function execution failed for node', name, error)
        node.next(null)
      }
      return
    }

    if (isHttpMethod(la.type)) {
      // The request is issued synchronously, on the default axios instance, with no cancellation:
      // responses are applied in arrival order (src/api/http.ts makes the newest GET win).
      let pending: Promise<unknown>
      try {
        const service = la.serviceName ? config.services[la.serviceName] : undefined
        pending = axios(buildRequest(node.def, node.depValues, service)).then((response) => response.data)
      } catch (error) {
        pending = Promise.reject(error)
      }
      // No error channel: a failed call is `null`; status and body are only visible to the axios
      // interceptors.
      pending
        .then((data) => node.next(data))
        .catch((error: unknown) => {
          reportFailure(name, error)
          node.next(null)
        })
    }
  }

  /** Wires a node to its dependencies and runs its first load. */
  function tangle(node: GraphNode): void {
    if (node.def.dep.length === 0) {
      reload(node)
    } else {
      for (const dep of node.def.dep) {
        const source = byName.get(dep.nodeName)
        // An unknown dependency is ignored silently: the node then never loads.
        if (!source) continue
        node.subscriptions.push(
          // BehaviorSubject: fires immediately, so each dependency triggers one reload while tangling.
          // The stored value is the source's current value, not the emitted one (they differ only
          // when a re-entrant write happened during the fan-out).
          source.subscribe(() => {
            node.depValues.set(dep.nodeName, source.getValue())
            reload(node, dep.nodeName)
          }),
        )
      }
    }
    const { defaultValue } = node.def
    if (defaultValue !== undefined && defaultValue !== null && node.getValue() == null) node.next(defaultValue)
  }

  // The graph comes alive asynchronously: a value written before `ready` resolves is overwritten
  // when the node is tangled.
  const ready = Promise.resolve().then(() => {
    if (destroyed) return false
    for (const node of nodes) tangle(node)
    return true
  })

  return {
    ready,
    failure: null,
    getNode(name) {
      const node = byName.get(name)
      if (!node) throw new Error(`Store node "${name}" not found`)
      return node
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const node of nodes) {
        node.subscriptions.forEach((subscription) => subscription.unsubscribe())
        node.subscriptions.length = 0
        node.complete()
      }
    },
  }
}
