/**
 * Turning an `ApiError` (docs/API_CONTRACT.md §2.0: Nest bodies, validation arrays, machine codes) into
 * what a form shows: messages attached to fields, and whatever is left for the form-level banner.
 */
import type { ApiError } from '@/api/types'
import { API_URL } from '@/config'
import { LOCAL_ERROR, storeInfo, toApiError } from '@/wb'

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

/** What the form-level banner prints: a bold line and, optionally, the detail under it. */
export interface Banner {
  title: string
  detail?: string
  /** Worth offering "Try again" (the request never got an answer, or the server failed). */
  retry: boolean
}

export interface Mapped<Field extends string> {
  fields: FieldErrors<Field>
  banner: Banner | null
}

/** class-validator messages start with the property name: "username must be longer than…". */
function propertyOf(message: string): string | null {
  const match = /^(?:each value in )?([A-Za-z]+) /.exec(message)
  return match ? match[1] : null
}

/** Readable wording for the class-validator messages the auth DTOs produce. */
function friendly(property: string, message: string): string {
  if (/should not be empty$/.test(message)) return 'Required.'
  const longer = /must be longer than or equal to (\d+)/.exec(message)
  if (longer) return `At least ${longer[1]} characters.`
  const shorter = /must be shorter than or equal to (\d+)/.exec(message)
  if (shorter) return `At most ${shorter[1]} characters.`
  if (/must be an email$/.test(message)) return "That doesn't look like an email address."
  if (/must be one of the following values/.test(message)) return 'Pick one of the listed options.'
  if (/must match .* regular expression$/.test(message)) {
    if (property === 'username') return 'Letters, digits, dots and underscores only.'
    if (property === 'firstName' || property === 'lastName') {
      return 'Letters A–Z only: no spaces, hyphens, apostrophes or accents.'
    }
    if (property === 'password') return "Can't be only spaces or contain line breaks."
  }
  return message
}

/** The banner for an error no field can hold: no answer, a server failure, or anything else. */
export function bannerFor(error: ApiError): Banner {
  if (error.code === LOCAL_ERROR.NETWORK) {
    return {
      title: "Can't reach the server",
      detail:
        storeInfo.backend === 'real'
          ? `Nothing answered at ${API_URL}. Check that the Matcha backend is running, or start the all-in-browser demo with npm run dev:demo.`
          : "The demo backend in this browser didn't answer. Reload the page and try again.",
      retry: true,
    }
  }
  if (error.code === LOCAL_ERROR.TIMEOUT) {
    return {
      title: 'The server took too long to answer',
      detail: 'A backend service may be down or restarting. Try again in a moment.',
      retry: true,
    }
  }
  if (error.code === LOCAL_ERROR.NOT_SENT) {
    return { title: "The app's store isn't running", detail: error.message, retry: false }
  }
  if (error.code === LOCAL_ERROR.NO_SESSION) {
    return { title: 'Signed in, but no session was kept', detail: error.message, retry: true }
  }
  if (error.status >= 500) {
    return {
      title: error.message && error.message !== 'Internal server error' ? error.message : 'Something broke on the server',
      detail: 'The server hit a problem with this request. Try again in a moment.',
      retry: true,
    }
  }
  if (error.messages.length > 1) {
    return { title: 'Please fix the following', detail: error.messages.join(' · '), retry: false }
  }
  return { title: error.message || 'Something went wrong', retry: false }
}

/**
 * Splits a 400 validation array onto the form's fields (`property` → field), keeping the first message
 * per field; anything unclaimed ends up in the banner.
 */
export function mapValidation<Field extends string>(
  error: ApiError,
  fieldOf: (property: string) => Field | null,
): Mapped<Field> {
  const fields: FieldErrors<Field> = {}
  const rest: string[] = []
  for (const message of error.messages) {
    const property = propertyOf(message)
    const field = property ? fieldOf(property) : null
    if (field && property) {
      fields[field] ??= friendly(property, message)
    } else {
      rest.push(message)
    }
  }
  const banner =
    rest.length === 0
      ? null
      : rest.length === 1
        ? { title: rest[0], retry: false }
        : { title: 'Please fix the following', detail: rest.join(' · '), retry: false }
  return { fields, banner }
}

/** Normalises anything a rejected action produced. */
export function asApiError(error: unknown): ApiError {
  return toApiError(error)
}

export function hasFieldErrors<Field extends string>(fields: FieldErrors<Field>): boolean {
  return Object.values(fields).some(Boolean)
}
