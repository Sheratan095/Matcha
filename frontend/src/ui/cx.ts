/** Joins class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = ''
  for (const p of parts) {
    if (p) out = out ? `${out} ${p}` : p
  }
  return out
}

/** Small deterministic string hash (FNV-1a), used for stable pseudo-random ornaments. */
export function hash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
