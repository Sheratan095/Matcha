/**
 * /verify-email?token= (the link in the verification email; also the end of an email change).
 * A token in the URL is sent at once; without one, the code can be typed in. Success replaces the
 * URL (a token works once, a reload would only fail) and leads to sign-in, or back to the profile
 * when a session exists (email change).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useT, type Translator } from '@/i18n'
import { AuthLayout, Button, ButtonLink, IconArrowRight, Loader, Notice, Stamp, Text } from '@/ui'
import { actions, useNodeValue } from '@/wb'
import { asApiError, bannerFor, type Banner } from './errors'
import { readFlag } from './navState'
import { FormBanner, OrRule } from './parts'
import { codeLifetime } from './rules'
import { VerifyCodeForm } from './VerifyCodeForm'
import a from './auth.module.css'

type Outcome = { token: string; kind: 'expired' } | { token: string; kind: 'error'; banner: Banner }

/** The poster of the waiting states; built per render because its words follow the language. */
function posterFor(t: Translator) {
  return {
    lines: t.lines('common.checkMailLines'),
    tone: 'blue' as const,
    sticker: t.stack('common.newLetterSticker'),
    marquee: [t('common.signedSealed'), t('verify.marquee1'), t('common.validFor', { time: codeLifetime() })],
  }
}

export default function VerifyEmailPage() {
  const t = useT()
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() || null
  const location = useLocation()
  const navigate = useNavigate()
  const done = readFlag(location.state, 'verified')
  const signedIn = useNodeValue('authStatus') === 'authenticated'
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [retrying, setRetrying] = useState(false)
  const started = useRef<string | null>(null)
  const poster = posterFor(t)

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

  if (done) {
    return (
      <>
        <title>{`${t('login.verifiedTitle')} · Matcha`}</title>
        <AuthLayout
          title={t('verify.doneTitle')}
          kicker={t('verify.doneKicker')}
          intro={signedIn ? t('verify.doneIntroSignedIn') : t('verify.doneIntro')}
          poster={{
            lines: t.lines('verify.doneLines'),
            tone: 'matcha',
            sticker: t.stack('verify.doneSticker'),
            marquee: [t('verify.doneMarquee1'), t('verify.doneMarquee2'), t('verify.doneMarquee3')],
          }}
        >
          <div className={a.result}>
            <Stamp tone="matcha" variant="rubber" size="xl" rotate={-8} thunk sub={t('verify.doneStampSub')} className={a.resultStamp}>
              {t('verify.doneStamp')}
            </Stamp>
            <div className={a.actions}>
              {signedIn ? (
                <ButtonLink to="/me" size="lg" block iconRight={<IconArrowRight size={20} strokeWidth={3} />}>
                  {t('common.backToProfile')}
                </ButtonLink>
              ) : (
                <Button
                  size="lg"
                  block
                  iconRight={<IconArrowRight size={20} strokeWidth={3} />}
                  onClick={() => navigate('/login', { state: { verified: true } })}
                >
                  {t('common.signIn')}
                </Button>
              )}
            </div>
          </div>
        </AuthLayout>
      </>
    )
  }

  const footer = (
    <p className={a.links}>
      {signedIn ? (
        <Link to="/me">{t('common.backToProfile')}</Link>
      ) : (
        <Link to="/login">{t('common.backToSignIn')}</Link>
      )}
    </p>
  )

  if (token && outcome?.token !== token) {
    return (
      <>
        <title>{`${t('verify.checkingTitle')} · Matcha`}</title>
        <AuthLayout title={t('verify.checkingTitle')} kicker={t('verify.checkingKicker')} poster={poster}>
          <Loader className={a.checking}>{t('verify.checkingLoader')}</Loader>
        </AuthLayout>
      </>
    )
  }

  if (token && outcome?.kind === 'error') {
    return (
      <>
        <title>{`${t('verify.title')} · Matcha`}</title>
        <AuthLayout title={t('verify.errorTitle')} kicker={t('verify.errorKicker')} poster={poster} footer={footer}>
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
              {t('common.tryAgain')}
            </Button>
          ) : null}
        </AuthLayout>
      </>
    )
  }

  const expired = token !== null && outcome?.kind === 'expired'
  return (
    <>
      <title>{`${t('verify.title')} · Matcha`}</title>
      <AuthLayout
        title={expired ? t('common.linkExpired') : t('verify.title')}
        kicker={expired ? t('common.outOfDate') : t('common.oneStepLeft')}
        intro={expired ? undefined : t('verify.intro')}
        poster={poster}
        footer={footer}
      >
        {expired ? (
          <>
            <Notice tone="warning" title={t('verify.deadTitle')}>
              {t('verify.deadBody', { time: codeLifetime() })}
            </Notice>
            {signedIn ? (
              <Text size="sm">{t('verify.deadSignedIn')}</Text>
            ) : (
              <>
                <Text size="sm">{t('verify.deadSignedOut')}</Text>
                <ButtonLink to="/login" size="lg" block>
                  {t('verify.freshCode')}
                </ButtonLink>
              </>
            )}
            <OrRule>{t('verify.orEnterCode')}</OrRule>
          </>
        ) : null}
        <VerifyCodeForm onVerified={succeed} />
      </AuthLayout>
    </>
  )
}
