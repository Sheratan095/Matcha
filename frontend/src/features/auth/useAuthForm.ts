/**
 * Field errors for the auth forms, two sources:
 * - client rules (rules.ts): shown for a field once it was left with something in it, and for every
 *   field after a submit attempt; they follow the value live from then on;
 * - server answers (errors.ts): pinned to a field until that field changes, or the language does (they are
   worded in the language that was current when they came in).
 * After a failed attempt the first invalid control gets the focus.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { useLocaleState } from '@/i18n'
import type { FieldErrors } from './errors'

export interface AuthForm<Field extends string> {
  /** The message to print under a field, if any. */
  errorOf(field: Field): string | undefined
  /** onBlur: start showing the client rule for a field the user typed into. */
  blur(field: Field, value: string): void
  /** onChange: a server error on this field no longer applies. */
  changed(field: Field): void
  /** Shows every client error; true when the form may be sent. */
  validateAll(): boolean
  /** Pins server errors on fields (and moves the focus to the first one). */
  fail(errors: FieldErrors<Field>): void
  /** Drops every server error (before a new attempt). */
  clearServer(): void
}

export function useAuthForm<Field extends string>(
  fields: readonly Field[],
  check: (field: Field) => string | null,
  formRef: RefObject<HTMLFormElement | null>,
): AuthForm<Field> {
  const [shown, setShown] = useState<ReadonlySet<Field>>(() => new Set())
  const [server, setServer] = useLocaleState<FieldErrors<Field>>({})
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (attempt === 0) return
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [attempt, formRef])

  const blur = useCallback((field: Field, value: string) => {
    if (!value) return
    setShown((previous) => (previous.has(field) ? previous : new Set(previous).add(field)))
  }, [])

  const changed = useCallback(
    (field: Field) => {
      setServer((previous) => {
        if (!(field in previous)) return previous
        const next = { ...previous }
        delete next[field]
        return next
      })
    },
    [setServer],
  )

  return {
    errorOf: (field) => server[field] ?? (shown.has(field) ? (check(field) ?? undefined) : undefined),
    blur,
    changed,
    validateAll() {
      setShown(new Set(fields))
      const ok = fields.every((field) => !check(field))
      if (!ok) setAttempt((n) => n + 1)
      return ok
    },
    fail(errors) {
      setServer(errors)
      if (Object.values(errors).some(Boolean)) setAttempt((n) => n + 1)
    },
    clearServer: () => setServer({}),
  }
}
