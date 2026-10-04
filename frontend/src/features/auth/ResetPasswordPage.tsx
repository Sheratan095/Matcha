/**
 * /reset-password?token= (the link in the reset email). New password twice; the backend refuses a
 * common password (COMMON_PASSWORD), the previous one (PASSWORD_REUSE) and a used or expired token
 * (403). Success does not sign in.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout, Button, ButtonLink, IconArrowRight, Notice, PasswordField, Stamp, Text } from '@/ui'
import { actions, useNodeValue } from '@/wb'
import { DemoInbox } from './DemoInbox'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { readFlag } from './navState'
import { FormBanner } from './parts'
import { checkNewPassword, PASSWORD_MAX } from './rules'
import { useAuthForm } from './useAuthForm'
import a from './auth.module.css'

type Field = 'password' | 'confirm'
const FIELDS: readonly Field[] = ['password', 'confirm']

const POSTER = {
  lines: ['New', 'key', 'cut'],
  tone: 'yolk' as const,
  sticker: (
    <>
      Fresh
      <br />
      start
    </>
  ),
  marquee: ['A fresh key in one email', 'Eight characters or more', 'No reruns'],
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() || null
  const location = useLocation()
  const navigate = useNavigate()
  const done = readFlag(location.state, 'reset')
  const signedIn = useNodeValue('authStatus') === 'authenticated'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  /** The token the backend refused, with why. */
  const [dead, setDead] = useState<{ token: string; message: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const form = useAuthForm<Field>(
    FIELDS,
    (field) =>
      field === 'password'
        ? checkNewPassword(password)
        : !confirm
          ? 'Type the new password again.'
          : confirm !== password
            ? "The two passwords don't match."
            : null,
    formRef,
  )

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [done, dead])

  async function submit() {
    if (!token || !form.validateAll()) return
    setBusy(true)
    setBanner(null)
    form.clearServer()
    try {
      await actions.resetPassword({ token, password })
      setPassword('')
      setConfirm('')
      navigate(location.pathname, { replace: true, state: { reset: true } })
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.code === 'PASSWORD_REUSE') {
        form.fail({ password: 'That is your current password. Pick a new one.' })
      } else if (error.code === 'COMMON_PASSWORD') {
        form.fail({ password: 'This password is too common. Pick something harder to guess.' })
      } else if (error.status === 403) {
        setDead({ token, message: error.message })
      } else if (error.status === 400) {
        const mapped = mapValidation<Field>(error, (property) => (property === 'password' ? 'password' : null))
        if (error.messages.some((message) => message.startsWith('token'))) {
          setDead({ token, message: 'The link is missing its token.' })
        } else {
          form.fail(mapped.fields)
          setBanner(mapped.banner)
        }
      } else {
        setBanner(bannerFor(error))
      }
    } finally {
      setBusy(false)
    }
  }

  const inbox = <DemoInbox kind="reset-password" />
  const backLink = (
    <p className={a.links}>
      {signedIn ? <Link to="/me">Back to your profile</Link> : <Link to="/login">Back to sign in</Link>}
    </p>
  )

  if (done) {
    return (
      <>
        <title>Password changed · Matcha</title>
        <AuthLayout
          title="Password changed"
          kicker="New key cut"
          intro="Your new password is set. Use it next time you sign in."
          poster={POSTER}
        >
          <div className={a.result}>
            <Stamp tone="yolk" variant="solid" size="xl" rotate={-7} thunk sub="Key Nº 2" className={a.resultStamp}>
              Fresh key
            </Stamp>
            <div className={a.actions}>
              {signedIn ? (
                <ButtonLink to="/" size="lg" block iconRight={<IconArrowRight size={20} strokeWidth={3} />}>
                  Back to Matcha
                </ButtonLink>
              ) : (
                <Button
                  size="lg"
                  block
                  iconRight={<IconArrowRight size={20} strokeWidth={3} />}
                  onClick={() => navigate('/login', { state: { reset: true } })}
                >
                  Sign in
                </Button>
              )}
            </div>
          </div>
        </AuthLayout>
      </>
    )
  }

  if (!token || dead?.token === token) {
    const expired = Boolean(token)
    return (
      <>
        <title>Reset your password · Matcha</title>
        <AuthLayout
          title={expired ? 'Link expired' : 'Reset your password'}
          kicker={expired ? 'Out of date' : 'Key cutting'}
          intro={
            expired
              ? undefined
              : 'This page opens from the link in a password reset email. Ask for one and follow it here.'
          }
          poster={POSTER}
          footer={
            <div className={a.below}>
              {inbox}
              {backLink}
            </div>
          }
        >
          {expired ? (
            <Notice tone="warning" title="This reset link no longer works">
              {dead?.message && dead.message !== 'Invalid or expired reset token' ? `${dead.message}. ` : ''}A link
              works once and lasts one hour, and asking again replaces it.
            </Notice>
          ) : null}
          <ButtonLink to="/forgot-password" size="lg" block>
            {expired ? 'Send me a new link' : 'Send me a link'}
          </ButtonLink>
        </AuthLayout>
      </>
    )
  }

  return (
    <>
      <title>Choose a new password · Matcha</title>
      <AuthLayout
        title="Choose a new password"
        kicker="Key cutting"
        intro="It must differ from your current one."
        poster={POSTER}
        footer={
          <div className={a.below}>
            {inbox}
            {backLink}
          </div>
        }
      >
        <form
          ref={formRef}
          className={a.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <PasswordField
            label="New password"
            name="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              form.changed('password')
            }}
            onBlur={(event) => form.blur('password', event.target.value)}
            error={form.errorOf('password')}
            hint="At least 8 characters. Common passwords are refused."
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            autoFocus
          />
          <PasswordField
            label="Confirm new password"
            name="confirm-password"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value)
              form.changed('confirm')
            }}
            onBlur={(event) => form.blur('confirm', event.target.value)}
            error={form.errorOf('confirm')}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
          />
          <FormBanner banner={banner} onRetry={() => void submit()} retrying={busy} />
          <Button type="submit" size="lg" block loading={busy}>
            Save new password
          </Button>
          <Text size="xs" muted>
            Changing your password does not sign you in: you'll sign in with the new one right after.
          </Text>
        </form>
      </AuthLayout>
    </>
  )
}
