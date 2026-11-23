/**
 * Client-side copies of the backend's auth validation (docs/API_CONTRACT.md §2.1), so a form can say
 * what is wrong before sending. The server stays the authority: its answers are mapped onto the same
 * fields by `errors.ts`.
 *
 * Every check returns a message (worded in the current language, see src/i18n), or null when the value passes.
 */
import { LANGUAGES, type Language } from '@/api/types'
import { t } from '@/i18n'

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const EMAIL_MAX = 100
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const NAME_MAX = 50

const USERNAME_PATTERN = /^[a-z0-9_.]+$/
/**
 * profiles_*_name_format_check (backend/infra/db/migrations/002_profiles.sql): letters from any alphabet,
 * with single spaces, hyphens or apostrophes between parts ("Jean-Luc", "O'Brien", "José", "Anne Marie").
 */
const NAME_PATTERN = /^\p{L}+(?:[ '’-]\p{L}+)*$/u
/** What the name fields accept, in words. A function, not a constant: it follows the language. */
export const nameRule = (): string => t('rule.nameChars')

/**
 * How long a verification or reset code works: the backend's EMAIL_VERIFICATION_EXPIRATION_MS and
 * FORGOT_PASSWORD_EXPIRATION_MS defaults (900000 ms), also printed in the emails themselves.
 */
export const codeLifetime = (): string => t('common.codeLifetime')
/** `Matches(/^(?!\s*$).+$/)`: not whitespace-only, and `.` never matches a line break. */
const PASSWORD_PATTERN = /^(?!\s*$).+$/
/** Close to validator.js `isEmail` for ordinary addresses. */
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i

/**
 * The technical entries of backend/infra/security/policies/reserved-usernames.txt. The file also lists
 * offensive words, which are not reproduced here: the server's RESERVED_USERNAME answer covers them.
 */
const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'root', 'superuser', 'system', 'internal', 'api', 'auth', 'matcha', 'support', 'help',
  'contact', 'info', 'mail', 'webmaster', 'postmaster', 'hostmaster', 'null', 'undefined', 'none',
])

/**
 * The entries of backend/infra/security/policies/common-password.txt that are long enough to reach the
 * list check (shorter ones already fail the length rule). Exact, case-sensitive match, like the backend.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password', '12345678', '123456789', 'p@ssword', 'football', 'iloveyou', 'sunshine', 'baseball', 'qwertyuiop',
  '1234567890', 'trustno1', 'princess', 'superman', 'swimming', 'basketball', 'computer', 'password123', 'nicholas',
  'christopher', 'elizabeth', 'patricia', 'jennifer', 'margaret', 'kathleen', 'fernando', 'alejandro', 'christian',
  'emmanuel',
])

/** What the backend stores: trimmed and lowercased. */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Verification and reset tokens are lowercase hex; tolerate pasted spaces and capitals. */
export function normaliseCode(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase()
}

export function checkUsername(raw: string): string | null {
  const value = normaliseUsername(raw)
  if (!value) return t('rule.pickUsername')
  if (value.length < USERNAME_MIN) return t('rule.atLeast', { n: USERNAME_MIN })
  if (value.length > USERNAME_MAX) return t('rule.atMost', { n: USERNAME_MAX })
  if (!USERNAME_PATTERN.test(value)) return t('rule.usernameChars')
  if (RESERVED_USERNAMES.has(value)) return t('rule.usernameReserved')
  return null
}

export function checkEmail(raw: string): string | null {
  const value = normaliseEmail(raw)
  if (!value) return t('rule.enterEmail')
  if (value.length > EMAIL_MAX) return t('rule.atMost', { n: EMAIL_MAX })
  if (!EMAIL_PATTERN.test(value)) return t('rule.emailInvalid')
  return null
}

/** Registration and reset rules: 8–128 characters, not only spaces, no line breaks, not a common password. */
export function checkNewPassword(password: string): string | null {
  if (!password) return t('rule.choosePassword')
  if (password.length < PASSWORD_MIN) return t('rule.atLeast', { n: PASSWORD_MIN })
  if (password.length > PASSWORD_MAX) return t('rule.atMost', { n: PASSWORD_MAX })
  if (!PASSWORD_PATTERN.test(password)) return /[\r\n]/.test(password) ? t('rule.noLineBreaks') : t('rule.onlySpaces')
  if (COMMON_PASSWORDS.has(password)) return t('rule.passwordCommon')
  return null
}

export function checkName(raw: string, what: 'first' | 'last'): string | null {
  const value = raw.trim()
  if (!value) return what === 'first' ? t('rule.enterFirstName') : t('rule.enterLastName')
  if (value.length > NAME_MAX) return t('rule.atMost', { n: NAME_MAX })
  if (!NAME_PATTERN.test(value)) return nameRule()
  return null
}

/** The profile service's bounds (backend/apps/profile/src/utils/dateOfBirth.ts). */
export const MIN_AGE = 18
export const MAX_AGE = 120
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Today at midnight UTC: the backend counts age in UTC, so the client agrees with it near midnight. */
function todayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `date` moved by whole years; Feb 29 lands on Feb 28 in a common year instead of rolling into March. */
function shiftYears(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years
  const month = date.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)))
}

/** 'YYYY-MM-DD' as a UTC date, or null when it is malformed or not on the calendar (2023-02-30). */
function parseDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? date : null
}

/** Whole years between `birth` and `today`, as the profile service counts them. */
function ageOn(birth: Date, today: Date): number {
  const age = today.getUTCFullYear() - birth.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth()
  const dayDiff = today.getUTCDate() - birth.getUTCDate()
  return monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age
}

/** `min` / `max` for the date picker: someone who is exactly MAX_AGE today, and exactly MIN_AGE today. */
export function dateOfBirthBounds(): { min: string; max: string } {
  const today = todayUtc()
  const oldest = shiftYears(today, -(MAX_AGE + 1))
  oldest.setUTCDate(oldest.getUTCDate() + 1)
  return { min: isoDate(oldest), max: isoDate(shiftYears(today, -MIN_AGE)) }
}

/** Required, 'YYYY-MM-DD', a real date, not in the future, and an age of MIN_AGE to MAX_AGE. */
export function checkDateOfBirth(raw: string): string | null {
  const value = raw.trim()
  if (!value) return t('rule.enterBirth')
  if (!DATE_PATTERN.test(value)) return t('rule.birthFormat')
  const birth = parseDate(value)
  if (!birth) return t('rule.birthMissing')
  const today = todayUtc()
  if (birth > today) return t('rule.birthFuture')
  const age = ageOn(birth, today)
  if (age < MIN_AGE) return t('rule.birthTooYoung', { n: MIN_AGE })
  if (age > MAX_AGE) return t('rule.birthTooOld')
  return null
}

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value)
}

/** Login only requires non-empty strings (seeded accounts have 4-character passwords). */
export function checkRequired(value: string, message: string): string | null {
  return value.trim() ? null : message
}

export function checkCode(raw: string): string | null {
  return normaliseCode(raw) ? null : t('rule.enterCode')
}
