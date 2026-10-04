/**
 * The real engine: a `WaveBinder` instance built from the app's node definitions and the license
 * file (docs/ARCHITECTURE.md §4.1, docs/WAVEBINDER.md §5).
 *
 * NOT EXECUTED during development: wave-binder 0.0.2 destroys every node unless it is given a valid
 * license, and none was available. This file is written from the package's typings and source and
 * deliberately does nothing clever: construct, tangle, wait, look nodes up.
 *
 * `wave-binder` is imported dynamically because evaluating the module already runs license code
 * (`crypto.randomUUID()` at the top level, which throws outside secure contexts).
 */
import { ReplaySubject, type BehaviorSubject } from 'rxjs'
import type {
  NodeDef,
  WbFunctionInstance,
  WbInstance,
  WbLicense,
  WbProtoNode,
  WbServiceMap,
} from '../types'
import type { EngineConfig, StoreEngine } from './types'

export interface WaveBinderEngineOptions {
  /** Overrides the library's default license heartbeat server (plain http, see docs/WAVEBINDER.md §7.3). */
  licenseServerUrl?: string
}

/** The shape of the file downloaded from wavebinder.it: `{ payload, payloadRaw, signature }`. */
export function isLicenseFile(value: unknown): value is WbLicense {
  if (!value || typeof value !== 'object') return false
  const file = value as Record<string, unknown>
  return typeof file.payloadRaw === 'string' && typeof file.signature === 'string'
}

/**
 * The library mutates the proto objects it is given (it assigns `la.service`), so it gets its own
 * copy and the app's definitions stay pristine for the registry and for a possible second instance.
 */
function cloneDefinitions(nodes: NodeDef[]): NodeDef[] {
  return structuredClone(nodes)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createWaveBinderEngine(
  license: unknown,
  config: EngineConfig,
  options: WaveBinderEngineOptions = {},
): StoreEngine {
  const dead = new ReplaySubject<void>(1)
  const nodes = new Map<string, BehaviorSubject<unknown>>()
  let instance: WbInstance | null = null
  let failure: string | null = null
  let destroyed = false

  async function start(): Promise<boolean> {
    if (!isLicenseFile(license)) {
      failure = 'src/wb/license.json is not a WaveBinder license file (expected { payload, payloadRaw, signature }).'
      return false
    }
    try {
      if (options.licenseServerUrl) {
        // Read by the library on every license check, so it must be set before the instance exists.
        ;(globalThis as { WAVEBINDER_LICENSE_SERVER_URL?: string }).WAVEBINDER_LICENSE_SERVER_URL =
          options.licenseServerUrl
      }
      const { WaveBinder } = await import('wave-binder')
      if (destroyed) return false

      const wb = new WaveBinder(
        license,
        cloneDefinitions(config.nodes) as unknown as WbProtoNode[],
        // The service objects are held by reference and read at request time.
        new Map(Object.entries(config.services)) as unknown as WbServiceMap,
        config.functions.map((fn) => ({ name: fn.name, implementation: fn.implementation })) as WbFunctionInstance[],
      )
      instance = wb
      // Deferred by the library until the license check passes; a silent no-op if it fails.
      wb.tangleNodes()
      // Never rejects, whatever the outcome: isReady() is the verdict.
      await wb.waitUntilReady()
      if (destroyed) return false
      if (!wb.isReady()) {
        instance = null
        failure =
          'WaveBinder rejected the license (invalid signature, expired, too many open instances, or the license server could not be reached).'
        return false
      }

      for (const def of config.nodes) {
        // Typed non-null by the library, but null for an unknown name or after a nuke.
        const node = wb.getNodeByName(def.name) as BehaviorSubject<unknown> | null
        if (!node) throw new Error(`WaveBinder did not create node "${def.name}"`)
        nodes.set(def.name, node)
      }

      // One failed heartbeat (every 5 s) makes the library complete() and drop every node. There is no
      // event for it, so watch one node's completion.
      const sentinel = nodes.values().next().value
      sentinel?.subscribe({
        complete: () => {
          if (destroyed) return
          failure = 'WaveBinder shut the store down: a license heartbeat failed.'
          instance = null
          dead.next()
        },
      })
      return true
    } catch (error) {
      instance = null
      const insecure = (globalThis as { isSecureContext?: boolean }).isSecureContext === false
      failure =
        `WaveBinder could not start: ${describe(error)}` +
        // The module calls crypto.randomUUID() when it is evaluated; browsers only expose it on https or localhost.
        (insecure ? ' (this page is not a secure context: open it on http://localhost:4000, not a LAN address)' : '')
      return false
    }
  }

  return {
    kind: 'wavebinder',
    ready: start(),
    dead$: dead.asObservable(),
    get failure() {
      return failure
    },
    getNode(name) {
      // Top-level SINGLE nodes are never replaced, so the references taken at start stay valid; after
      // the library's shutdown they are completed subjects (readable, writes are ignored).
      const node = nodes.get(name)
      if (!node) throw new Error(`Store node "${name}" not found`)
      return node
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      // Stops the heartbeat interval and completes every node. The instance cannot be reused.
      instance?.nukeNodes()
      instance = null
    },
  }
}
