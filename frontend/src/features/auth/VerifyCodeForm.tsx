/**
 * Manual entry of the verification code (the email carries the same token as its link). Used after
 * registering, after an unverified login, and on /verify-email without a token.
 */
import { useRef, useState } from 'react'
import type { VerifyEmailResult } from '@/api/types'
import { Button, IconCheck, TextField } from '@/ui'
import { actions } from '@/wb'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { FormBanner } from './parts'
import { checkCode, CODE_LIFETIME, normaliseCode } from './rules'
import a from './auth.module.css'

export interface VerifyCodeFormProps {
  onVerified: (result: VerifyEmailResult) => void
  submitLabel?: string
  autoFocus?: boolean
}

const EXPIRED = `This code is invalid or has expired. A code works once and lasts ${CODE_LIFETIME}; signing in with your password sends a fresh one.`

export function VerifyCodeForm({ onVerified, submitLabel = 'Verify email', autoFocus }: VerifyCodeFormProps) {
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(raw: string) {
    const problem = checkCode(raw)
    if (problem) {
      setFieldError(problem)
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    setFieldError(null)
    setBanner(null)
    try {
      const result = await actions.verifyEmail(normaliseCode(raw))
      onVerified(result)
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.status === 403) {
        setFieldError(EXPIRED)
        inputRef.current?.focus()
      } else if (error.status === 400) {
        const mapped = mapValidation(error, (property) => (property === 'token' ? 'code' : null))
        setFieldError(mapped.fields.code ?? null)
        setBanner(mapped.banner)
      } else {
        setBanner(bannerFor(error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={a.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit(code)
      }}
    >
      <TextField
        ref={inputRef}
        label="Verification code"
        name="code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value)
          setFieldError(null)
        }}
        className={a.code}
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        maxLength={80}
        placeholder="e.g. 3f9a0c12b47e5d68"
        hint="16 characters, from the email we sent you."
        error={fieldError ?? undefined}
        autoFocus={autoFocus}
      />
      <FormBanner banner={banner} onRetry={() => void submit(code)} retrying={busy} />
      <Button type="submit" size="lg" block loading={busy} icon={<IconCheck size={20} strokeWidth={3.5} />}>
        {submitLabel}
      </Button>
    </form>
  )
}
