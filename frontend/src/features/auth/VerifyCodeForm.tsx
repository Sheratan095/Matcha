/**
 * Manual entry of the verification code (the email carries the same token as its link). Used after
 * registering, after an unverified login, and on /verify-email without a token.
 */
import { useRef, useState } from 'react'
import type { VerifyEmailResult } from '@/api/types'
import { useLocaleState, useT } from '@/i18n'
import { Button, IconCheck, TextField } from '@/ui'
import { actions } from '@/wb'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { FormBanner } from './parts'
import { checkCode, codeLifetime, normaliseCode } from './rules'
import a from './auth.module.css'

export interface VerifyCodeFormProps {
  onVerified: (result: VerifyEmailResult) => void
  submitLabel?: string
  autoFocus?: boolean
}

export function VerifyCodeForm({ onVerified, submitLabel, autoFocus }: VerifyCodeFormProps) {
  const t = useT()
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useLocaleState<string | null>(null)
  const [banner, setBanner] = useLocaleState<Banner | null>(null)
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
        setFieldError(t('code.expired', { time: codeLifetime() }))
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
        label={t('code.label')}
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
        placeholder={t('code.placeholder')}
        hint={t('code.hint')}
        error={fieldError ?? undefined}
        autoFocus={autoFocus}
      />
      <FormBanner banner={banner} onRetry={() => void submit(code)} retrying={busy} />
      <Button type="submit" size="lg" block loading={busy} icon={<IconCheck size={20} strokeWidth={3.5} />}>
        {submitLabel ?? t('code.submit')}
      </Button>
    </form>
  )
}
