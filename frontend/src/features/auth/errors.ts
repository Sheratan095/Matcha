/**
 * Turning an `ApiError` (docs/API_CONTRACT.md §2.0: Nest bodies, validation arrays, machine codes) into
 * what a form shows: messages attached to fields, and whatever is left for the form-level banner.
 */
import type { ApiError } from '@/api/types'
import { API_URL } from '@/config'
import { t } from '@/i18n'
import { LOCAL_ERROR, toApiError } from '@/wb'
import { nameRule } from './rules'

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
  if (/should not be empty$/.test(message)) return t('error.required')
  const longer = /must be longer than or equal to (\d+)/.exec(message)
  if (longer) return t('rule.atLeast', { n: longer[1] })
  const shorter = /must be shorter than or equal to (\d+)/.exec(message)
  if (shorter) return t('rule.atMost', { n: shorter[1] })
  if (/must be an email$/.test(message)) return t('rule.emailInvalid')
  if (/must be one of the following values/.test(message)) return t('error.pickListed')
  if (/must be a date in YYYY-MM-DD format$/.test(message)) return t('rule.birthFormat')
  if (/must match .* regular expression$/.test(message)) {
    if (property === 'username') return t('rule.usernameChars')
    if (property === 'firstName' || property === 'lastName') return nameRule()
    if (property === 'password') return t('error.passwordShape')
  }
  return message
}

/** The banner for an error no field can hold: no answer, a server failure, or anything else. */
export function bannerFor(error: ApiError): Banner {
  if (error.code === LOCAL_ERROR.NETWORK) {
    return {
      title: t('error.networkTitle'),
      detail: t('error.networkDetail', { url: API_URL }),
      retry: true,
    }
  }
  if (error.code === LOCAL_ERROR.TIMEOUT) {
    return {
      title: t('error.timeoutTitle'),
      detail: t('error.timeoutDetail'),
      retry: true,
    }
  }
  if (error.code === LOCAL_ERROR.NOT_SENT) {
    return { title: t('error.noStore'), detail: error.message, retry: false }
  }
  if (error.code === LOCAL_ERROR.NO_SESSION) {
    return { title: t('error.noSession'), detail: error.message, retry: true }
  }
  if (error.status >= 500) {
    return {
      title: error.message && error.message !== 'Internal server error' ? error.message : t('error.serverTitle'),
      detail: t('error.serverDetail'),
      retry: true,
    }
  }
  if (error.messages.length > 1) {
    return { title: t('error.fixFollowing'), detail: error.messages.join(' · '), retry: false }
  }
  return { title: error.message || t('error.generic'), retry: false }
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
        : { title: t('error.fixFollowing'), detail: rest.join(' · '), retry: false }
  return { fields, banner }
}

/** Normalises anything a rejected action produced. */
export function asApiError(error: unknown): ApiError {
  return toApiError(error)
}

export function hasFieldErrors<Field extends string>(fields: FieldErrors<Field>): boolean {
  return Object.values(fields).some(Boolean)
}
