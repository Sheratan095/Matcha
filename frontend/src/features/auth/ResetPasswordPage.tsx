/**
 * /reset-password?token= (the link in the reset email). New password twice; the backend refuses a
 * common password (COMMON_PASSWORD), the previous one (PASSWORD_REUSE) and a used or expired token
 * (403). Success does not sign in, and signs out a session open in this browser (its refresh token is
 * revoked by the reset).
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useLocaleState, useT, type Translator } from '@/i18n'
import { AuthLayout, Button, ButtonLink, IconArrowRight, Notice, PasswordField, Stamp, Text } from '@/ui'
import { actions, useNodeValue } from '@/wb'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { readFlag } from './navState'
import { FormBanner } from './parts'
import { checkNewPassword, codeLifetime, PASSWORD_MAX, PASSWORD_MIN } from './rules'
import { useAuthForm } from './useAuthForm'
import a from './auth.module.css'

type Field = 'password' | 'confirm'
const FIELDS: readonly Field[] = ['password', 'confirm']

/** The poster of every state of this page; built per render because its words follow the language. */
function posterFor(t: Translator) {
  return {
    lines: t.lines('reset.lines'),
    tone: 'yolk' as const,
    sticker: t.stack('reset.sticker'),
    marquee: [t('reset.marquee1'), t('reset.marquee2'), t('reset.marquee3')],
  }
}

export default function ResetPasswordPage() {
  const t = useT()
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() || null
  const location = useLocation()
  const navigate = useNavigate()
  const done = readFlag(location.state, 'reset')
  const signedIn = useNodeValue('authStatus') === 'authenticated'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [banner, setBanner] = useLocaleState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  /** The token the backend refused, with the server's own words; `said` is null when the link had no token at all. */
  const [dead, setDead] = useState<{ token: string; said: string | null } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const poster = posterFor(t)

  const form = useAuthForm<Field>(
    FIELDS,
    (field) =>
      field === 'password'
        ? checkNewPassword(password)
        : !confirm
          ? t('reset.confirmEmpty')
          : confirm !== password
            ? t('reset.confirmMismatch')
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
      // The backend revokes the refresh token on reset, so a session open in this browser would only last
      // until its access cookie expires (up to 15 min) and then drop mid-use. End it now instead.
      if (signedIn) await actions.logout().catch(() => undefined)
      navigate(location.pathname, { replace: true, state: { reset: true } })
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.code === 'PASSWORD_REUSE') {
        form.fail({ password: t('reset.reused') })
      } else if (error.code === 'COMMON_PASSWORD') {
        form.fail({ password: t('rule.passwordCommon') })
      } else if (error.status === 403) {
        setDead({ token, said: error.message })
      } else if (error.status === 400) {
        const mapped = mapValidation<Field>(error, (property) => (property === 'password' ? 'password' : null))
        if (error.messages.some((message) => message.startsWith('token'))) {
          setDead({ token, said: null })
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

  const backLink = (
    <p className={a.links}>
      {signedIn ? (
        <Link to="/me">{t('common.backToProfile')}</Link>
      ) : (
        <Link to="/login">{t('common.backToSignIn')}</Link>
      )}
    </p>
  )

  if (done) {
    return (
      <>
        <title>{`${t('common.passwordChanged')} · Matcha`}</title>
        <AuthLayout
          title={t('common.passwordChanged')}
          kicker={t('reset.doneKicker')}
          intro={t('reset.doneIntro')}
          poster={poster}
        >
          <div className={a.result}>
            <Stamp tone="yolk" variant="solid" size="xl" rotate={-7} thunk sub={t('reset.doneStampSub')} className={a.resultStamp}>
              {t('reset.doneStamp')}
            </Stamp>
            <div className={a.actions}>
              {signedIn ? (
                <ButtonLink to="/" size="lg" block iconRight={<IconArrowRight size={20} strokeWidth={3} />}>
                  {t('common.backToMatcha')}
                </ButtonLink>
              ) : (
                <Button
                  size="lg"
                  block
                  iconRight={<IconArrowRight size={20} strokeWidth={3} />}
                  onClick={() => navigate('/login', { state: { reset: true } })}
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

  if (!token || dead?.token === token) {
    const expired = Boolean(token)
    // The backend's generic answer is replaced by our own wording; any other message of its is kept in front.
    const serverSaid = !dead
      ? ''
      : dead.said === null
        ? `${t('reset.missingToken')} `
        : dead.said && dead.said !== 'Invalid or expired reset token'
          ? `${dead.said}. `
          : ''
    return (
      <>
        <title>{`${t('reset.noToken')} · Matcha`}</title>
        <AuthLayout
          title={expired ? t('common.linkExpired') : t('reset.noToken')}
          kicker={expired ? t('common.outOfDate') : t('common.keyCutting')}
          intro={expired ? undefined : t('reset.noTokenIntro')}
          poster={poster}
          footer={backLink}
        >
          {expired ? (
            <Notice tone="warning" title={t('reset.deadTitle')}>
              {serverSaid}
              {t('reset.deadBody', { time: codeLifetime() })}
            </Notice>
          ) : null}
          <ButtonLink to="/forgot-password" size="lg" block>
            {expired ? t('reset.sendNew') : t('reset.send')}
          </ButtonLink>
        </AuthLayout>
      </>
    )
  }

  return (
    <>
      <title>{`${t('reset.chooseTitle')} · Matcha`}</title>
      <AuthLayout
        title={t('reset.chooseTitle')}
        kicker={t('common.keyCutting')}
        intro={t('reset.chooseIntro')}
        poster={poster}
        footer={backLink}
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
            label={t('reset.newPassword')}
            name="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              form.changed('password')
            }}
            onBlur={(event) => form.blur('password', event.target.value)}
            error={form.errorOf('password')}
            hint={t('common.passwordHint', { n: PASSWORD_MIN })}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            autoFocus
          />
          <PasswordField
            label={t('reset.confirmPassword')}
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
            {t('reset.save')}
          </Button>
          <Text size="xs" muted>
            {t('reset.note')}
          </Text>
        </form>
      </AuthLayout>
    </>
  )
}
