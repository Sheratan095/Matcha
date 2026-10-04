/**
 * /verify-email?token= (the link in the verification email; also the end of an email change).
 * A token in the URL is sent at once; without one, the code can be typed in. Success replaces the
 * URL (a token works once, a reload would only fail) and leads to sign-in, or back to the profile
 * when a session exists (email change).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout, Button, ButtonLink, IconArrowRight, Loader, Notice, Stamp, Text } from '@/ui'
import { actions, useNodeValue } from '@/wb'
import { DemoInbox } from './DemoInbox'
import { asApiError, bannerFor, type Banner } from './errors'
import { readFlag } from './navState'
import { FormBanner, OrRule } from './parts'
import { VerifyCodeForm } from './VerifyCodeForm'
import a from './auth.module.css'

type Outcome = { token: string; kind: 'expired' } | { token: string; kind: 'error'; banner: Banner }

const POSTER = {
  lines: ['Check', 'your', 'mail'],
  tone: 'blue' as const,
  sticker: (
    <>
      1 new
      <br />
      letter
    </>
  ),
  marquee: ['Signed, sealed, delivered', 'One code per account', 'Valid for one hour'],
}

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() || null
  const location = useLocation()
  const navigate = useNavigate()
  const done = readFlag(location.state, 'verified')
  const signedIn = useNodeValue('authStatus') === 'authenticated'
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [prefill, setPrefill] = useState<{ code: string; n: number }>({ code: '', n: 0 })
  const started = useRef<string | null>(null)

  const succeed = useCallback(() => {
    navigate('/verify-email', { replace: true, state: { verified: true } })
  }, [navigate])

  const verify = useCallback(
    async (value: string) => {
      setOutcome(null)
      try {
        await actions.verifyEmail(value)
        succeed()
      } catch (thrown) {
        const error = asApiError(thrown)
        setOutcome(
          error.status === 403 || error.status === 400
            ? { token: value, kind: 'expired' }
            : { token: value, kind: 'error', banner: bannerFor(error) },
        )
      }
    },
    [succeed],
  )

  useEffect(() => {
    // A ref, not a cleanup flag: StrictMode replays effects, and a token must be sent once.
    if (!token || done || started.current === token) return
    started.current = token
    void verify(token)
  }, [token, done, verify])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [done, outcome?.kind])

  const fillCode = (code: string) => setPrefill((p) => ({ code, n: p.n + 1 }))
  const inbox = <DemoInbox kind="verify-email" onUseCode={fillCode} />

  if (done) {
    return (
      <>
        <title>Email verified · Matcha</title>
        <AuthLayout
          title="You're verified"
          kicker="Stamped and approved"
          intro={signedIn ? 'Your new email address is confirmed.' : 'Your email is confirmed. Welcome to the press.'}
          poster={{
            lines: ['Signed', 'sealed', 'yours'],
            tone: 'matcha',
            sticker: (
              <>
                All
                <br />
                set
              </>
            ),
            marquee: ['Welcome to the press', 'Fresh matches daily', 'Ceremonial grade romance'],
          }}
        >
          <div className={a.result}>
            <Stamp tone="matcha" variant="rubber" size="xl" rotate={-8} thunk sub="Email · OK" className={a.resultStamp}>
              Verified
            </Stamp>
            <div className={a.actions}>
              {signedIn ? (
                <ButtonLink to="/me" size="lg" block iconRight={<IconArrowRight size={20} strokeWidth={3} />}>
                  Back to your profile
                </ButtonLink>
              ) : (
                <Button
                  size="lg"
                  block
                  iconRight={<IconArrowRight size={20} strokeWidth={3} />}
                  onClick={() => navigate('/login', { state: { verified: true } })}
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

  const footer = (
    <div className={a.below}>
      {inbox}
      <p className={a.links}>
        {signedIn ? <Link to="/me">Back to your profile</Link> : <Link to="/login">Back to sign in</Link>}
      </p>
    </div>
  )

  if (token && outcome?.token !== token) {
    return (
      <>
        <title>Checking your link · Matcha</title>
        <AuthLayout title="Checking your link" kicker="Hold the line" poster={POSTER}>
          <Loader className={a.checking}>Reading the stamp</Loader>
        </AuthLayout>
      </>
    )
  }

  if (token && outcome?.kind === 'error') {
    return (
      <>
        <title>Verify your email · Matcha</title>
        <AuthLayout title="Couldn't check the link" kicker="Misprint" poster={POSTER} footer={footer}>
          <FormBanner
            banner={outcome.banner}
            retrying={retrying}
            onRetry={() => {
              setRetrying(true)
              void verify(token).finally(() => setRetrying(false))
            }}
          />
          {!outcome.banner.retry ? (
            <Button size="lg" block onClick={() => void verify(token)}>
              Try again
            </Button>
          ) : null}
        </AuthLayout>
      </>
    )
  }

  const expired = token !== null && outcome?.kind === 'expired'
  return (
    <>
      <title>Verify your email · Matcha</title>
      <AuthLayout
        title={expired ? 'Link expired' : 'Verify your email'}
        kicker={expired ? 'Out of date' : 'One step left'}
        intro={
          expired
            ? undefined
            : 'Enter the code from the verification email, or simply open the link in it.'
        }
        poster={POSTER}
        footer={footer}
      >
        {expired ? (
          <>
            <Notice tone="warning" title="This link is invalid or has expired">
              A code works once and lasts one hour, and each new code replaces the last.
            </Notice>
            {signedIn ? (
              <Text size="sm">Start the email change again from your profile to get a new code.</Text>
            ) : (
              <>
                <Text size="sm">
                  Sign in with your username and password: if your email still needs verifying, we send a fresh code
                  right away.
                </Text>
                <ButtonLink to="/login" size="lg" block>
                  Get a fresh code
                </ButtonLink>
              </>
            )}
            <OrRule>or enter a code</OrRule>
          </>
        ) : null}
        <VerifyCodeForm key={prefill.n} initialCode={prefill.code} autoSubmit={prefill.n > 0} onVerified={succeed} />
      </AuthLayout>
    </>
  )
}
