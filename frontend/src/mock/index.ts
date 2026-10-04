/**
 * The in-browser mock backend (docs/ARCHITECTURE.md §5).
 *
 * `installMockBackend` wraps `axios.defaults.adapter`: requests under MOCK_PREFIX (`/__mock`) are
 * answered here, everything else goes to the network untouched. It always serves the social service
 * (`/__mock/social/*`); with `auth: true` (demo mode) it also stands in for the real auth, profile and
 * notification services and offers the dev inbox. Calling it again only updates the options.
 *
 * `mockEvents$` carries what the realtime channel would: typing, messages, new matches, new likes.
 */
import type { Observable } from 'rxjs'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { RealtimeEvent } from '@/api/types'
import { installAdapter, uninstallAdapter } from './adapter'
import { dispatch } from './routes'
import { events, releaseTimers, runtime } from './runtime'
import { forgetActivity } from './social'
import { forget, STORAGE_PREFIX } from './storage'
import { forgetHints, rememberProfile } from './viewer'

export interface MockBackendOptions {
  /** true in demo mode: also serve /auth/*, /profile/*, /notification/* under /__mock. */
  auth: boolean
  /** Who is logged in when auth is real (the mock cannot read HttpOnly cookies). */
  getViewerId: () => string | null
  /**
   * Simulated latency in ms, a fixed value or an inclusive `[min, max]` range. Default `[120, 450]`.
   * Tests pass 0: responses then arrive on the next microtask, without timers.
   */
  latency?: number | readonly [number, number]
}

const DEFAULT_LATENCY: readonly [number, number] = [120, 450]

function latencyRange(option: MockBackendOptions['latency']): readonly [number, number] {
  if (typeof option === 'number') return [Math.max(0, option), Math.max(0, option)]
  if (Array.isArray(option) && option.length === 2) {
    const [a, b] = option as readonly [number, number]
    return [Math.max(0, Math.min(a, b)), Math.max(0, a, b)]
  }
  return DEFAULT_LATENCY
}

function latency(): number {
  const [min, max] = runtime.options.latency
  return Math.round(min + Math.random() * (max - min))
}

/**
 * Real mode only: learn the viewer's orientation and interests from the real profile responses
 * (`GET` / `PATCH {API_URL}/profile`), read-only, so discovery can filter and find common tags.
 */
function observe(config: InternalAxiosRequestConfig, response: AxiosResponse): void {
  if (runtime.options.auth) return
  const method = (config.method ?? 'get').toLowerCase()
  if (method !== 'get' && method !== 'patch') return
  const path = (config.url ?? '').split(/[?#]/)[0] ?? ''
  if (!/\/profile\/?$/.test(path) || response.status < 200 || response.status >= 300) return
  const data: unknown = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  rememberProfile(data)
}

function onStorage(event: StorageEvent): void {
  // another tab changed the demo data: drop the memory copy, the next read takes theirs
  if (event.key === null) forget()
  else if (event.key.startsWith(STORAGE_PREFIX)) forget(event.key)
}

const REGISTRY = Symbol.for('matcha.mock.installed')
type Registry = { [REGISTRY]?: { uninstall: () => void } }

let listening = false

export function installMockBackend(options: MockBackendOptions): void {
  const registry = globalThis as typeof globalThis & Registry
  // An older copy of this module (Vite HMR) owns timers and listeners: let it clean up first.
  const previous = registry[REGISTRY]
  if (previous && previous.uninstall !== uninstallMockBackend) previous.uninstall()

  runtime.options = { auth: options.auth, getViewerId: options.getViewerId, latency: latencyRange(options.latency) }
  installAdapter({ handle: (request) => dispatch(request, runtime.options.auth), latency, observe })
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    listening = true
  }
  registry[REGISTRY] = { uninstall: uninstallMockBackend }
}

/** Restores the original adapter, stops every timer and drops in-memory caches (storage is kept). */
export function uninstallMockBackend(): void {
  uninstallAdapter()
  releaseTimers()
  forget()
  forgetHints()
  forgetActivity()
  if (listening && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  listening = false
  const registry = globalThis as typeof globalThis & Registry
  if (registry[REGISTRY]?.uninstall === uninstallMockBackend) delete registry[REGISTRY]
}

export const mockEvents$: Observable<RealtimeEvent> = events.asObservable()
