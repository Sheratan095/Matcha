/**
 * How the user's position is kept, per user and per browser (the backend stores only coordinates):
 * - `auto`: refreshed from the device at each visit while the permission is granted (the default);
 * - `manual`: a spot picked on the map or by search, never overwritten.
 */
import type { SpotSource } from './geo'

export type LocationMode = 'auto' | 'manual'

const KEY = 'matcha.location.mode'

function key(userId: string): string {
  return `${KEY}.${userId}`
}

export function locationMode(userId: string): LocationMode {
  try {
    return localStorage.getItem(key(userId)) === 'manual' ? 'manual' : 'auto'
  } catch {
    return 'auto'
  }
}

export function setLocationMode(userId: string, mode: LocationMode): void {
  try {
    if (mode === 'auto') localStorage.removeItem(key(userId))
    else localStorage.setItem(key(userId), mode)
  } catch {
    // storage blocked: the default (auto) applies next time
  }
}

/** Saving a spot from the device or the connection keeps it automatic; picking one by hand pins it. */
export function modeAfterSaving(source: SpotSource, current: LocationMode): LocationMode {
  if (source === 'device' || source === 'network') return 'auto'
  if (source === 'map' || source === 'search') return 'manual'
  return current
}
