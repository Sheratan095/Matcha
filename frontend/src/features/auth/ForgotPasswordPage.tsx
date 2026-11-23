/**
 * /forgot-password. The backend answers the same thing whether or not the address has an account,
 * so the page always ends on the same generic confirmation.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocaleState, useT } from '@/i18n'
import { AuthLayout, Button, ButtonLink, IconArrowLeft, Stamp, TextField } from '@/ui'
import { actions } from '@/wb'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { FormBanner } from './parts'
import { checkEmail, codeLifetime, EMAIL_MAX, normaliseEmail } from './rules'
import { useAuthForm } from './useAuthForm'
import a from './auth.module.css'

type Field = 'email'
const FIELDS: readonly Field[] = ['email']

export default function ForgotPasswordPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [banner, setBanner] = useLocaleState<Banner | null>(null)
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

  const signInFooter = (
    <p className={a.links}>
      {t('common.remembered')} <Link to="/login">{t('common.signIn')}</Link>
    </p>
  )

  if (sentTo) {
    return (
      <>
        <title>{`${t('common.checkInbox')} · Matcha`}</title>
        <AuthLayout
          title={t('common.checkInbox')}
          kicker={t('forgot.sentKicker')}
          intro={t.rich('forgot.sentIntro', { email: <strong>{sentTo}</strong>, time: codeLifetime() })}
          footer={signInFooter}
        >
          <div className={a.result}>
            <Stamp tone="blue" variant="rubber" size="lg" rotate={-6} thunk sub={t('forgot.stampSub')} className={a.resultStamp}>
              {t('forgot.stamp')}
            </Stamp>
            <div className={a.actions}>
              <ButtonLink to="/login" size="lg" block variant="paper" icon={<IconArrowLeft size={20} strokeWidth={3} />}>
                {t('common.backToSignIn')}
              </ButtonLink>
              <Button variant="ghost" onClick={() => setSentTo(null)}>
                {t('forgot.useAnother')}
              </Button>
            </div>
          </div>
        </AuthLayout>
      </>
    )
  }

  return (
    <>
      <title>{`${t('forgot.docTitle')} · Matcha`}</title>
      <AuthLayout
        title={t('forgot.title')}
        kicker={t('common.keyCutting')}
        intro={t('forgot.intro')}
        footer={signInFooter}
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
            label={t('common.email')}
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
            {t('forgot.send')}
          </Button>
        </form>
      </AuthLayout>
    </>
  )
}
