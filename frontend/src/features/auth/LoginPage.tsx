/**
 * /login. Username + password; the redirect afterwards is AnonymousOnly's job (it sends the user
 * back to `from`, or into the app), so a successful sign-in simply unmounts this page.
 * A correct password on an unverified account (403 EMAIL_NOT_VERIFIED) makes the backend mail a
 * fresh code: the page switches to "check your inbox", verifies, then comes back to the form.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthLayout, Button, IconArrowLeft, Label, Notice, PasswordField, TextField } from '@/ui'
import { actions, refresh, storeInfo, useNodeStatus } from '@/wb'
import { DemoInbox } from './DemoInbox'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { readLoginState } from './navState'
import { FormBanner, GithubButton, OrRule } from './parts'
import { checkRequired } from './rules'
import { useAuthForm } from './useAuthForm'
import { VerifyCodeForm } from './VerifyCodeForm'
import a from './auth.module.css'

type Field = 'username' | 'password'
const FIELDS: readonly Field[] = ['username', 'password']
const DEMO_ACCOUNTS = ['testuser', 'alice'] as const
const PASSWORD_ID = 'login-password'

type Phase = 'form' | 'unverified'
type Flash = 'verified' | 'reset' | null

export default function LoginPage() {
  const location = useLocation()
  const arrived = readLoginState(location.state)
  const [username, setUsername] = useState(arrived.username ?? '')
  const [password, setPassword] = useState('')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [flash, setFlash] = useState<Flash>(arrived.verified ? 'verified' : arrived.reset ? 'reset' : null)
  /** Bumped each time the backend re-sent a code: reloads the demo inbox. */
  const [mailCount, setMailCount] = useState(0)
  const [prefill, setPrefill] = useState<{ code: string; n: number }>({ code: '', n: 0 })
  const formRef = useRef<HTMLFormElement>(null)
  const sessionCheck = useNodeStatus('sessionCheck')

  const values: Record<Field, string> = { username, password }
  const form = useAuthForm(
    FIELDS,
    (field) => (field === 'username' ? checkRequired(username, 'Enter your username.') : checkRequired(password, 'Enter your password.')),
    formRef,
  )

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phase])

  async function submit() {
    if (!form.validateAll()) return
    setBusy(true)
    setBanner(null)
    setFlash(null)
    form.clearServer()
    try {
      await actions.login({ username: username.trim(), password })
      // Signed in: AnonymousOnly redirects (to `from`, or into the app).
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        setMailCount((n) => n + 1)
        setPrefill({ code: '', n: 0 })
        setPhase('unverified')
      } else if (error.status === 403) {
        setBanner({
          title: 'Wrong username or password',
          detail: 'Check both and try again. Usernames are not case-sensitive; passwords are.',
          retry: false,
        })
        const input = document.getElementById(PASSWORD_ID)
        if (input instanceof HTMLInputElement) {
          input.focus()
          input.select()
        }
      } else if (error.status === 400) {
        const mapped = mapValidation<Field>(error, (property) => (property === 'username' || property === 'password' ? property : null))
        form.fail(mapped.fields)
        setBanner(mapped.banner)
      } else {
        setBanner(bannerFor(error))
      }
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'unverified') {
    return (
      <>
        <title>Verify your email · Matcha</title>
        <AuthLayout
          title="Check your inbox"
          kicker="One step left"
          intro={
            <>
              The email of <strong>{username.trim().toLowerCase()}</strong> isn't verified yet. We've just sent a fresh
              code to it; earlier codes no longer work. Enter it below, then sign in.
            </>
          }
          poster={{
            lines: ['Check', 'your', 'mail'],
            tone: 'blue',
            sticker: (
              <>
                1 new
                <br />
                letter
              </>
            ),
            marquee: ['Signed, sealed, delivered', 'One code per sign-in', 'Valid for one hour'],
          }}
          footer={
            <div className={a.below}>
              <DemoInbox kind="verify-email" refreshKey={mailCount} onUseCode={(code) => setPrefill((p) => ({ code, n: p.n + 1 }))} />
              <p className={a.links}>
                Not your account?{' '}
                <button type="button" className={a.inlineButton} onClick={() => setPhase('form')}>
                  Use another one
                </button>
              </p>
            </div>
          }
        >
          <VerifyCodeForm
            key={prefill.n}
            initialCode={prefill.code}
            autoSubmit={prefill.n > 0}
            submitLabel="Verify and continue"
            onVerified={() => {
              setFlash('verified')
              setBanner(null)
              setPhase('form')
            }}
          />
          <Button variant="ghost" icon={<IconArrowLeft size={18} strokeWidth={3} />} onClick={() => setPhase('form')}>
            Back to sign in
          </Button>
        </AuthLayout>
      </>
    )
  }

  const serverDown =
    sessionCheck.status === 'error' && (sessionCheck.error?.code === 'NETWORK' || sessionCheck.error?.code === 'TIMEOUT')

  return (
    <>
      <title>Sign in · Matcha</title>
      <AuthLayout
        title="Sign in"
        intro={
          arrived.from
            ? 'Sign in to pick up where you left off.'
            : 'Welcome back. Your matches have been steeping.'
        }
        footer={
          <p className={a.links}>
            No account yet? <Link to="/register">Create one</Link>
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
          {flash === 'verified' ? (
            <Notice tone="success" title="Email verified" onDismiss={() => setFlash(null)}>
              {password ? 'Press Sign in to step inside.' : 'Sign in with your username and password.'}
            </Notice>
          ) : flash === 'reset' ? (
            <Notice tone="success" title="Password changed" onDismiss={() => setFlash(null)}>
              Sign in with your new password.
            </Notice>
          ) : null}
          {serverDown ? (
            <Notice
              tone="warning"
              title="The server isn't answering"
              action={
                <Button size="sm" variant="paper" onClick={() => void refresh('sessionCheck')}>
                  Check again
                </Button>
              }
            >
              {storeInfo.backend === 'real'
                ? 'Signing in will fail until the Matcha backend is up.'
                : 'The demo backend did not answer. Reload the page.'}
            </Notice>
          ) : null}

          <TextField
            label="Username"
            name="username"
            value={values.username}
            onChange={(event) => {
              setUsername(event.target.value)
              form.changed('username')
            }}
            onBlur={(event) => form.blur('username', event.target.value)}
            error={form.errorOf('username')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="alice"
            autoFocus={!arrived.username}
          />
          <PasswordField
            id={PASSWORD_ID}
            label="Password"
            name="password"
            value={values.password}
            onChange={(event) => {
              setPassword(event.target.value)
              form.changed('password')
            }}
            onBlur={(event) => form.blur('password', event.target.value)}
            error={form.errorOf('password')}
            autoComplete="current-password"
            aside={<Link to="/forgot-password">Forgot it?</Link>}
            autoFocus={Boolean(arrived.username)}
          />
          <FormBanner banner={banner} onRetry={() => void submit()} retrying={busy} />
          <Button type="submit" size="lg" block loading={busy}>
            Sign in
          </Button>
          <OrRule />
          <GithubButton />
          {storeInfo.backend === 'mock' ? (
            <div className={a.demo}>
              <Label size="sm">Demo accounts · password 1234</Label>
              <div className={a.demoButtons}>
                {DEMO_ACCOUNTS.map((name) => (
                  <Button
                    key={name}
                    size="sm"
                    variant="paper"
                    aria-label={`Fill in the demo account ${name}`}
                    onClick={() => {
                      setUsername(name)
                      setPassword('1234')
                      form.changed('username')
                      form.changed('password')
                      setBanner(null)
                    }}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </form>
      </AuthLayout>
    </>
  )
}
