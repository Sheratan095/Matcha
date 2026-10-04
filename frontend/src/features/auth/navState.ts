/**
 * What the auth screens hand each other through `location.state`. History state can hold anything
 * (it survives reloads and can be crafted), so every read is checked.
 */

export interface LoginState {
  /** Where to go once signed in (set by RequireAuth). */
  from?: string
  /** Just verified an email: say so and prefill the username. */
  verified?: boolean
  /** Just changed the password. */
  reset?: boolean
  username?: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** An in-app path only: "/x", never "//host" or "https://…" (no open redirect). */
export function safeFrom(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (value === '/login' || value.startsWith('/login?')) return null
  return value
}

export function readLoginState(state: unknown): LoginState {
  const raw = record(state)
  return {
    from: safeFrom(raw.from) ?? undefined,
    verified: raw.verified === true,
    reset: raw.reset === true,
    username: typeof raw.username === 'string' ? raw.username.slice(0, 40) : undefined,
  }
}

export function readFlag(state: unknown, key: string): boolean {
  return record(state)[key] === true
}
