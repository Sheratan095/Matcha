/**
 * /register. Client rules mirror the backend's RegisterDto (rules.ts); server answers are mapped back
 * onto the fields (RESERVED_USERNAME, COMMON_PASSWORD, 409 username taken / email in use, validation
 * arrays). Success does not sign in: the email must be verified first, so the page turns into
 * "check your inbox" with the code form (and the demo inbox in demo mode).
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LANGUAGES, type Language } from '@/api/types'
import { AuthLayout, Button, PasswordField, Segmented, Text, TextField } from '@/ui'
import { actions } from '@/wb'
import { DemoInbox } from './DemoInbox'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { FormBanner, GithubButton, OrRule } from './parts'
import {
  checkEmail,
  checkName,
  checkNewPassword,
  checkUsername,
  EMAIL_MAX,
  NAME_MAX,
  normaliseEmail,
  normaliseUsername,
  PASSWORD_MAX,
  USERNAME_MAX,
} from './rules'
import { useAuthForm } from './useAuthForm'
import { VerifyCodeForm } from './VerifyCodeForm'
import a from './auth.module.css'

type Field = 'username' | 'email' | 'password' | 'firstName' | 'lastName' | 'language'
const FIELDS: readonly Field[] = ['username', 'email', 'password', 'firstName', 'lastName', 'language']

const LANGUAGE_LABEL: Record<Language, string> = { en: 'English', fr: 'Français', es: 'Español' }
/** Short codes on the chips (three equal chips fit a 360px phone); the full name for assistive tech. */
const LANGUAGE_OPTIONS = LANGUAGES.map((value) => ({
  value,
  label: (
    <>
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{LANGUAGE_LABEL[value]}</span>
    </>
  ),
}))

function isField(property: string): property is Field {
  return (FIELDS as readonly string[]).includes(property)
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [language, setLanguage] = useState<Language>('en')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ email: string; username: string } | null>(null)
  const [prefill, setPrefill] = useState<{ code: string; n: number }>({ code: '', n: 0 })
  const formRef = useRef<HTMLFormElement>(null)

  const form = useAuthForm<Field>(
    FIELDS,
    (field) => {
      switch (field) {
        case 'username':
          return checkUsername(username)
        case 'email':
          return checkEmail(email)
        case 'password':
          return checkNewPassword(password)
        case 'firstName':
          return checkName(firstName, 'first')
        case 'lastName':
          return checkName(lastName, 'last')
        case 'language':
          return null
      }
    },
    formRef,
  )

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [sent])

  async function submit() {
    if (!form.validateAll()) return
    setBusy(true)
    setBanner(null)
    form.clearServer()
    try {
      await actions.register({
        username: normaliseUsername(username),
        email: normaliseEmail(email),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        language,
      })
      setSent({ email: normaliseEmail(email), username: normaliseUsername(username) })
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.code === 'RESERVED_USERNAME') {
        form.fail({ username: "This username isn't available. Pick another one." })
      } else if (error.code === 'COMMON_PASSWORD') {
        form.fail({ password: 'This password is too common. Pick something harder to guess.' })
      } else if (error.status === 409) {
        if (/email/i.test(error.message)) {
          form.fail({ email: 'An account already uses this email. Sign in, or reset its password.' })
        } else {
          form.fail({ username: 'That username is taken. Try another one.' })
        }
      } else if (error.status === 400) {
        const mapped = mapValidation<Field>(error, (property) => (isField(property) ? property : null))
        form.fail(mapped.fields)
        setBanner(mapped.banner)
      } else {
        setBanner(bannerFor(error))
      }
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <>
        <title>Check your inbox · Matcha</title>
        <AuthLayout
          title="Check your inbox"
          kicker="Almost in"
          intro={
            <>
              We sent a verification link to <strong>{sent.email}</strong>. Open it, or enter the code from the email
              below. It works for one hour.
            </>
          }
          poster={{
            lines: ['One', 'more', 'step'],
            tone: 'blue',
            sticker: (
              <>
                You've
                <br />
                got mail
              </>
            ),
            marquee: ['Signed, sealed, delivered', 'Verify to start swiping', 'Valid for one hour'],
          }}
          footer={
            <div className={a.below}>
              <DemoInbox kind="verify-email" to={sent.email} onUseCode={(code) => setPrefill((p) => ({ code, n: p.n + 1 }))} />
              <p className={a.links}>
                Already verified? <Link to="/login" state={{ username: sent.username }}>Sign in</Link>
              </p>
            </div>
          }
        >
          <VerifyCodeForm
            key={prefill.n}
            initialCode={prefill.code}
            autoSubmit={prefill.n > 0}
            onVerified={() => navigate('/login', { state: { verified: true, username: sent.username } })}
          />
        </AuthLayout>
      </>
    )
  }

  const lowered = username.trim() !== username.trim().toLowerCase() && !form.errorOf('username')

  return (
    <>
      <title>Create an account · Matcha</title>
      <AuthLayout
        title="Join the press"
        kicker="New member"
        intro="Two minutes, five fields. We'll email you a code to confirm it's you."
        poster={{
          lines: ['Fresh', 'off the', 'press'],
          tone: 'strawberry',
          sticker: (
            <>
              Free
              <br />
              to join
            </>
          ),
          marquee: ['Ceremonial grade romance', 'No sugar added', 'Fresh matches daily', 'Stone-ground in Paris'],
        }}
        footer={
          <p className={a.links}>
            Already a member? <Link to="/login">Sign in</Link>
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
            label="Username"
            name="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              form.changed('username')
            }}
            onBlur={(event) => form.blur('username', event.target.value)}
            error={form.errorOf('username')}
            hint={lowered ? `Saved in lowercase: ${normaliseUsername(username)}` : '3–20 characters: letters, digits, dots and underscores.'}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={USERNAME_MAX + 10}
            placeholder="alice_w"
            autoFocus
          />
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
            hint="We send the verification code here."
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={EMAIL_MAX + 10}
            placeholder="alice@example.com"
          />
          <PasswordField
            label="Password"
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
          />
          <div className={a.pair}>
            <TextField
              label="First name"
              name="given-name"
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value)
                form.changed('firstName')
              }}
              onBlur={(event) => form.blur('firstName', event.target.value)}
              error={form.errorOf('firstName')}
              autoComplete="given-name"
              maxLength={NAME_MAX + 10}
              placeholder="Alice"
            />
            <TextField
              label="Last name"
              name="family-name"
              value={lastName}
              onChange={(event) => {
                setLastName(event.target.value)
                form.changed('lastName')
              }}
              onBlur={(event) => form.blur('lastName', event.target.value)}
              error={form.errorOf('lastName')}
              autoComplete="family-name"
              maxLength={NAME_MAX + 10}
              placeholder="Liddell"
            />
          </div>
          <Text size="xs" muted>
            Names use the letters A–Z only, without spaces or accents.
          </Text>
          <Segmented<Language>
            label="Email language"
            name="language"
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={(value) => {
              setLanguage(value)
              form.changed('language')
            }}
            error={form.errorOf('language')}
            hint={`Our emails will be in ${LANGUAGE_LABEL[language]}.`}
            block
          />
          <FormBanner banner={banner} onRetry={() => void submit()} retrying={busy} />
          <Button type="submit" size="lg" block loading={busy}>
            Create account
          </Button>
          <OrRule />
          <GithubButton label="Sign up with GitHub" />
        </form>
      </AuthLayout>
    </>
  )
}
