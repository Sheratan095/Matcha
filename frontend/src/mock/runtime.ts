/**
 * Process-wide state of the mock backend: the install options, the realtime stream, and the timers
 * of the "live" world (typing, replies, incoming likes).
 *
 * Timers belong to one viewer. Switching viewer, resetting or uninstalling cancels them, and a timer
 * that fires for a viewer who is no longer the owner does nothing, so nothing leaks across accounts.
 */
import { Subject } from 'rxjs'
import type { RealtimeEvent } from '@/api/types'

export interface RuntimeOptions {
  getViewerId: () => string | null
  /** Inclusive latency range in ms. */
  latency: readonly [number, number]
}

export const runtime: { options: RuntimeOptions } = {
  options: { getViewerId: () => null, latency: [120, 450] },
}

export const events = new Subject<RealtimeEvent>()

export function emit(event: RealtimeEvent): void {
  events.next(event)
}

// ---------------------------------------------------------------- viewer-scoped timers

let owner: string | null = null
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** The viewer the running timers belong to. */
export function timerOwner(): string | null {
  return owner
}

/** Makes `viewerId` the owner; a different viewer (or null) cancels every pending timer. */
export function claimTimers(viewerId: string | null): void {
  if (owner === viewerId) return
  cancelTimers()
  owner = viewerId
}

/** Schedules `run` for the current owner. A timer with the same key is replaced. */
export function later(key: string, delayMs: number, run: () => void): void {
  const scheduledFor = owner
  if (scheduledFor === null) return
  cancelTimer(key)
  const handle = setTimeout(
    () => {
      if (timers.get(key) === handle) timers.delete(key)
      if (owner !== scheduledFor) return
      try {
        run()
      } catch (error) {
        console.error('[mock] scheduled task failed', error)
      }
    },
    Math.max(0, delayMs),
  )
  timers.set(key, handle)
}

export function hasTimer(key: string): boolean {
  return timers.has(key)
}

export function cancelTimer(key: string): void {
  const handle = timers.get(key)
  if (handle !== undefined) clearTimeout(handle)
  timers.delete(key)
}

/** Cancels every timer, or those whose key starts with `prefix`. */
export function cancelTimers(prefix?: string): void {
  for (const [key, handle] of [...timers]) {
    if (prefix !== undefined && !key.startsWith(prefix)) continue
    clearTimeout(handle)
    timers.delete(key)
  }
}

/** Uninstall: no owner, no timers. */
export function releaseTimers(): void {
  cancelTimers()
  owner = null
}
