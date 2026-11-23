/**
 * /login. Username + password; the redirect afterwards is AnonymousOnly's job (it sends the user
 * back to `from`, or into the app), so a successful sign-in simply unmounts this page.
 * A correct password on an unverified account (403 EMAIL_NOT_VERIFIED) makes the backend mail a
 * fresh code: the page switches to "check your inbox", verifies, then comes back to the form.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLocaleState, useT } from '@/i18n'
import { AuthLayout, Button, IconArrowLeft, Notice, PasswordField, TextField } from '@/ui'
import { actions, refresh, useNodeStatus } from '@/wb'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { readLoginState } from './navState'
import { FormBanner, GithubButton, OrRule } from './parts'
import { checkRequired, codeLifetime } from './rules'
import { useAuthForm } from './useAuthForm'
import { VerifyCodeForm } from './VerifyCodeForm'
import a from './auth.module.css'

type Field = 'username' | 'password'
const FIELDS: readonly Field[] = ['username', 'password']
const PASSWORD_ID = 'login-password'

type Phase = 'form' | 'unverified'
type Flash = 'verified' | 'reset' | null

export default function LoginPage() {
  const t = useT()
  const location = useLocation()
  const arrived = readLoginState(location.state)
  const [username, setUsername] = useState(arrived.username ?? '')
  const [password, setPassword] = useState('')
  const [banner, setBanner] = useLocaleState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [flash, setFlash] = useState<Flash>(arrived.verified ? 'verified' : arrived.reset ? 'reset' : null)
  const formRef = useRef<HTMLFormElement>(null)
  const sessionCheck = useNodeStatus('sessionCheck')

  const values: Record<Field, string> = { username, password }
  const form = useAuthForm(
    FIELDS,
    (field) =>
      field === 'username'
        ? checkRequired(username, t('login.enterUsername'))
        : checkRequired(password, t('login.enterPassword')),
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
        setPhase('unverified')
      } else if (error.status === 403) {
        setBanner({
          title: t('login.wrongTitle'),
          detail: t('login.wrongDetail'),
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
        <title>{`${t('verify.title')} · Matcha`}</title>
        <AuthLayout
          title={t('common.checkInbox')}
          kicker={t('common.oneStepLeft')}
          intro={t.rich('login.unverifiedIntro', { username: <strong>{username.trim().toLowerCase()}</strong> })}
          poster={{
            lines: t.lines('common.checkMailLines'),
            tone: 'blue',
            sticker: t.stack('common.newLetterSticker'),
            marquee: [
              t('common.signedSealed'),
              t('login.unverifiedMarquee1'),
              t('common.validFor', { time: codeLifetime() }),
            ],
          }}
          footer={
            <p className={a.links}>
              {t('login.notYours')}{' '}
              <button type="button" className={a.inlineButton} onClick={() => setPhase('form')}>
                {t('login.useAnother')}
              </button>
            </p>
          }
        >
          <VerifyCodeForm
            submitLabel={t('login.verifyContinue')}
            onVerified={() => {
              setFlash('verified')
              setBanner(null)
              setPhase('form')
            }}
          />
          <Button variant="ghost" icon={<IconArrowLeft size={18} strokeWidth={3} />} onClick={() => setPhase('form')}>
            {t('common.backToSignIn')}
          </Button>
        </AuthLayout>
      </>
    )
  }

  const serverDown =
    sessionCheck.status === 'error' && (sessionCheck.error?.code === 'NETWORK' || sessionCheck.error?.code === 'TIMEOUT')

  return (
    <>
      <title>{`${t('common.signIn')} · Matcha`}</title>
      <AuthLayout
        title={t('common.signIn')}
        intro={arrived.from ? t('login.introFrom') : t('login.intro')}
        footer={
          <p className={a.links}>
            {t('login.noAccount')} <Link to="/register">{t('login.createOne')}</Link>
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
            <Notice tone="success" title={t('login.verifiedTitle')} onDismiss={() => setFlash(null)}>
              {password ? t('login.verifiedPressSignIn') : t('login.verifiedSignIn')}
            </Notice>
          ) : flash === 'reset' ? (
            <Notice tone="success" title={t('common.passwordChanged')} onDismiss={() => setFlash(null)}>
              {t('login.resetSignIn')}
            </Notice>
          ) : null}
          {serverDown ? (
            <Notice
              tone="warning"
              title={t('login.serverDownTitle')}
              action={
                <Button size="sm" variant="paper" onClick={() => void refresh('sessionCheck')}>
                  {t('login.checkAgain')}
                </Button>
              }
            >
              {t('login.serverDownBody')}
            </Notice>
          ) : null}

          <TextField
            label={t('common.username')}
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
            label={t('common.password')}
            name="password"
            value={values.password}
            onChange={(event) => {
              setPassword(event.target.value)
              form.changed('password')
            }}
            onBlur={(event) => form.blur('password', event.target.value)}
            error={form.errorOf('password')}
            autoComplete="current-password"
            aside={<Link to="/forgot-password">{t('login.forgot')}</Link>}
            autoFocus={Boolean(arrived.username)}
          />
          <FormBanner banner={banner} onRetry={() => void submit()} retrying={busy} />
          <Button type="submit" size="lg" block loading={busy}>
            {t('common.signIn')}
          </Button>
          <OrRule />
          <GithubButton />
        </form>
      </AuthLayout>
    </>
  )
}
