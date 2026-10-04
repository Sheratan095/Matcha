/** Hashing, deterministic UUIDs, random tokens and a small seeded PRNG for the mock backend. */

/** 32-bit FNV-1a. */
export function fnv(text: string, seed = 2166136261): number {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: a tiny, good-enough seeded generator in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates with a seeded generator; returns a new array. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

/** Deterministic pick: the same key always gives the same item. */
export function pickBy<T>(key: string, items: readonly T[]): T {
  return items[fnv(key) % items.length] as T
}

/** Deterministic coin: true for `percent`% of keys. */
export function chance(key: string, percent: number): boolean {
  return fnv(key) % 100 < percent
}

const hex8 = (value: number) => value.toString(16).padStart(8, '0')

function formatUuid(hex: string): string {
  // version 4 layout, so class-validator's IsUUID (and any v4 check) accepts it
  const variant = '89ab'[parseInt(hex[16] ?? '0', 16) % 4] as string
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** A stable UUID derived from a name: the same text always gives the same id. */
export function uuidFrom(text: string): string {
  const hex = hex8(fnv(text)) + hex8(fnv(text, 0x9e3779b9)) + hex8(fnv(text, 0x85ebca6b)) + hex8(fnv(text, 0xc2b2ae35))
  return formatUuid(hex)
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count)
  const crypto = globalThis.crypto as Crypto | undefined
  if (crypto && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < count; i++) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

/** `count` random bytes as lowercase hex (the backend's token format). */
export function randomHex(count: number): string {
  return Array.from(randomBytes(count), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function randomUuid(): string {
  return formatUuid(randomHex(16))
}

/** class-validator's `IsUUID()` (version "all"). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}
