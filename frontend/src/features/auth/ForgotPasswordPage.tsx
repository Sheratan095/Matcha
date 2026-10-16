/**
 * /forgot-password. The backend answers the same thing whether or not the address has an account,
 * so the page always ends on the same generic confirmation.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout, Button, ButtonLink, IconArrowLeft, Stamp, TextField } from '@/ui'
import { actions } from '@/wb'
import { DemoInbox } from './DemoInbox'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { FormBanner } from './parts'
import { checkEmail, EMAIL_MAX, normaliseEmail } from './rules'
import { useAuthForm } from './useAuthForm'
import a from './auth.module.css'

type Field = 'email'
const FIELDS: readonly Field[] = ['email']

const POSTER = {
  lines: ['Lost', 'the', 'key?'],
  tone: 'yolk' as const,
  sticker: (
    <>
      No
      <br />
      stress
    </>
  ),
  marquee: ['Happens to the best of us', 'A fresh key in one email', 'Valid for one hour'],
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const form = useAuthForm<Field>(FIELDS, () => checkEmail(email), formRef)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [sentTo])

  async function submit() {
    if (!form.validateAll()) return
    setBusy(true)
    setBanner(null)
    form.clearServer()
    const address = normaliseEmail(email)
    try {
      await actions.forgotPassword(address)
      setSentTo(address)
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.status === 400) {
        const mapped = mapValidation<Field>(error, (property) => (property === 'email' ? 'email' : null))
        form.fail(mapped.fields)
        setBanner(mapped.banner)
      } else {
        setBanner(bannerFor(error))
      }
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <>
        <title>Check your inbox · Matcha</title>
        <AuthLayout
          title="Check your inbox"
          kicker="Request received"
          intro={
            <>
              If an account uses <strong>{sentTo}</strong>, a reset link is on its way. It works for one hour; asking
              again replaces it.
            </>
          }
          poster={POSTER}
          footer={
            <div className={a.below}>
              <DemoInbox kind="reset-password" to={sentTo} />
              <p className={a.links}>
                Remembered it? <Link to="/login">Sign in</Link>
              </p>
            </div>
          }
        >
          <div className={a.result}>
            <Stamp tone="blue" variant="rubber" size="lg" rotate={-6} thunk sub="Reset request" className={a.resultStamp}>
              Posted
            </Stamp>
            <div className={a.actions}>
              <ButtonLink to="/login" size="lg" block variant="paper" icon={<IconArrowLeft size={20} strokeWidth={3} />}>
                Back to sign in
              </ButtonLink>
              <Button variant="ghost" onClick={() => setSentTo(null)}>
                Use another address
              </Button>
            </div>
          </div>
        </AuthLayout>
      </>
    )
  }

  return (
    <>
      <title>Forgot your password · Matcha</title>
      <AuthLayout
        title="Forgot your password?"
        kicker="Key cutting"
        intro="Tell us the email on your account and we'll send you a link to choose a new password."
        poster={POSTER}
        footer={
          <p className={a.links}>
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
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
          <TextField
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              form.changed('email')
            }}
            onBlur={(event) => form.blur('email', event.target.value)}
            error={form.errorOf('email')}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={EMAIL_MAX + 10}
            placeholder="alice@example.com"
            autoFocus
          />
          <FormBanner banner={banner} onRetry={() => void submit()} retrying={busy} />
          <Button type="submit" size="lg" block loading={busy}>
            Send reset link
          </Button>
        </form>
      </AuthLayout>
    </>
  )
}
