/**
 * The subset of class-validator the backend DTOs use, with the same messages, so a 400 from the mock
 * reads like one from Nest's `ValidationPipe({ whitelist: true, transform: true })`:
 * - unknown properties are dropped;
 * - every failing constraint of every property is reported (no stop at first error);
 * - per property, list the checks in the order class-validator reports them, which is the reverse of
 *   the decorator order in the DTO (decorators apply bottom-up).
 *
 * One deliberate difference: the backend's `value.trim()` transforms throw on a non-string and answer
 * 500. The intended behaviour is a validation error, so transforms only run on strings here.
 */
import { UUID_PATTERN } from './ids'
import { nestError } from './nest'

export type Check = (value: unknown, property: string) => string | null

function lengthOf(value: unknown): number | undefined {
  return typeof value === 'string' || Array.isArray(value) ? value.length : undefined
}

// Close to validator.js isEmail for ordinary addresses.
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i

export const is = {
  string: (): Check => (value, p) => (typeof value === 'string' ? null : `${p} must be a string`),

  notEmpty: (): Check => (value, p) =>
    value === '' || value === null || value === undefined ? `${p} should not be empty` : null,

  /** `@Length(min, max)` and its three messages. */
  length:
    (min: number, max: number): Check =>
    (value, p) => {
      if (typeof value === 'string' && value.length >= min && value.length <= max) return null
      const length = lengthOf(value)
      if (!value || (length !== undefined && length < min)) return `${p} must be longer than or equal to ${min} characters`
      if (length !== undefined && length > max) return `${p} must be shorter than or equal to ${max} characters`
      return `${p} must be longer than or equal to ${min} and shorter than or equal to ${max} characters`
    },

  maxLength:
    (max: number): Check =>
    (value, p) =>
      typeof value === 'string' && value.length <= max ? null : `${p} must be shorter than or equal to ${max} characters`,

  /** `@Matches(pattern)`, or `@Matches(pattern, { message })` when the DTO gives its own message. */
  matches:
    (pattern: RegExp, message?: string): Check =>
    (value, p) =>
      typeof value === 'string' && pattern.test(value)
        ? null
        : (message ?? `${p} must match ${String(pattern)} regular expression`),

  email: (): Check => (value, p) => (typeof value === 'string' && EMAIL.test(value) ? null : `${p} must be an email`),

  uuid: (): Check => (value, p) => (typeof value === 'string' && UUID_PATTERN.test(value) ? null : `${p} must be a UUID`),

  /** `@IsIn` and `@IsEnum` share this message. */
  oneOf:
    (values: readonly string[]): Check =>
    (value, p) =>
      typeof value === 'string' && values.includes(value) ? null : `${p} must be one of the following values: ${values.join(', ')}`,

  array: (): Check => (value, p) => (Array.isArray(value) ? null : `${p} must be an array`),

  int: (): Check => (value, p) => (Number.isInteger(value) ? null : `${p} must be an integer number`),

  min:
    (min: number): Check =>
    (value, p) =>
      typeof value === 'number' && value >= min ? null : `${p} must not be less than ${min}`,

  max:
    (max: number): Check =>
    (value, p) =>
      typeof value === 'number' && value <= max ? null : `${p} must not be greater than ${max}`,

  each: {
    string: (): Check => (value, p) =>
      Array.isArray(value) && value.some((item) => typeof item !== 'string') ? `each value in ${p} must be a string` : null,

    maxLength:
      (max: number): Check =>
      (value, p) =>
        Array.isArray(value) && value.some((item) => typeof item !== 'string' || item.length > max)
          ? `each value in ${p} must be shorter than or equal to ${max} characters`
          : null,
  },
}

export interface Field {
  /** `@IsOptional()`: null / undefined skip every check (an explicit null is kept). */
  optional?: boolean
  /** `@Transform`, applied to strings only. */
  transform?: (value: string) => string
  checks: readonly Check[]
}

export const trim = (value: string) => value.trim()

/** Validates and whitelists `input`; throws the Nest 400 with every message. */
export function validate<Shape extends object>(
  input: Record<string, unknown>,
  fields: Readonly<Record<string, Field>>,
): Shape {
  const out: Record<string, unknown> = {}
  const messages: string[] = []
  for (const [name, field] of Object.entries(fields)) {
    const present = Object.prototype.hasOwnProperty.call(input, name)
    let value = present ? input[name] : undefined
    if (typeof value === 'string' && field.transform) value = field.transform(value)
    if (present) out[name] = value
    if (field.optional && (value === null || value === undefined)) continue
    for (const check of field.checks) {
      const message = check(value, name)
      if (message) messages.push(message)
    }
  }
  if (messages.length > 0) throw nestError(400, messages)
  return out as Shape
}
