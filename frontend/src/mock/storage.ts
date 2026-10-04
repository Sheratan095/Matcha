/**
 * Persistence for the mock backend: JSON documents in `localStorage` under versioned keys
 * (`matcha.mock.v1.<scope>`), with an in-memory copy.
 *
 * Tolerant by design: a missing, unparsable or wrongly shaped document reads as "absent" (the caller
 * reseeds), a storage that throws (private mode, disabled, jsdom without storage) degrades to memory
 * only, and a full storage is reported to the caller instead of throwing.
 */

export const STORAGE_PREFIX = 'matcha.mock.v1'

const memory = new Map<string, unknown>()
let warnedUnavailable = false

export function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}.${scope}`
}

function storage(): Storage | null {
  try {
    const candidate = globalThis.localStorage
    return candidate ?? null
  } catch {
    return null
  }
}

/**
 * The document stored under `scope`, or null. `accept` checks the parsed value and may repair it;
 * returning null discards it.
 */
export function load<T>(scope: string, accept: (raw: unknown) => T | null): T | null {
  const key = storageKey(scope)
  if (memory.has(key)) return memory.get(key) as T
  let raw: unknown = null
  try {
    const text = storage()?.getItem(key)
    raw = text ? (JSON.parse(text) as unknown) : null
  } catch {
    raw = null
  }
  let value: T | null = null
  try {
    value = raw === null ? null : accept(raw)
  } catch {
    value = null
  }
  if (value !== null) memory.set(key, value)
  return value
}

/** Writes the document. Returns false when the storage refused it (quota); the memory copy is kept either way. */
export function save(scope: string, value: unknown): boolean {
  const key = storageKey(scope)
  memory.set(key, value)
  const target = storage()
  if (!target) {
    if (!warnedUnavailable) {
      warnedUnavailable = true
      console.warn('[mock] localStorage is unavailable: demo data will not survive a reload.')
    }
    return true
  }
  try {
    target.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function remove(scope: string): void {
  const key = storageKey(scope)
  memory.delete(key)
  try {
    storage()?.removeItem(key)
  } catch {
    // nothing to do: the memory copy is gone
  }
}

/** Drops the memory copy of one key (another tab wrote it) or of everything. */
export function forget(key?: string | null): void {
  if (key) memory.delete(key)
  else memory.clear()
}

// ---------------------------------------------------------------- shape helpers for `accept`

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The array, keeping only the items that pass `keep`; [] for anything else. */
export function arrayOf<T>(value: unknown, keep: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(keep) : []
}

export const isString = (value: unknown): value is string => typeof value === 'string'
export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
