/**
 * /register. Client rules mirror the backend's RegisterDto (rules.ts); server answers are mapped back
 * onto the fields (RESERVED_USERNAME, COMMON_PASSWORD, 409 username taken / email in use, the profile
 * service's date-of-birth and name verdicts, validation arrays). Success does not sign in: the email
 * must be verified first, so the page turns into "check your inbox" with the code form.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LANGUAGES, type Language } from '@/api/types'
import { LANGUAGE_NAMES, useLocale, useLocaleState, useT } from '@/i18n'
import { AuthLayout, Button, PasswordField, Segmented, Text, TextField } from '@/ui'
import { actions } from '@/wb'
import { asApiError, bannerFor, mapValidation, type Banner } from './errors'
import { FormBanner, GithubButton, OrRule } from './parts'
import {
  checkDateOfBirth,
  checkEmail,
  checkName,
  checkNewPassword,
  checkUsername,
  codeLifetime,
  dateOfBirthBounds,
  EMAIL_MAX,
  MIN_AGE,
  NAME_MAX,
  nameRule,
  normaliseEmail,
  normaliseUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
} from './rules'
import { useAuthForm } from './useAuthForm'
import { VerifyCodeForm } from './VerifyCodeForm'
import a from './auth.module.css'

type Field = 'username' | 'email' | 'password' | 'firstName' | 'lastName' | 'dateOfBirth' | 'language'
const FIELDS: readonly Field[] = ['username', 'email', 'password', 'firstName', 'lastName', 'dateOfBirth', 'language']

/** Short codes on the chips (three equal chips fit a 360px phone); the full name for assistive tech. */
const LANGUAGE_OPTIONS = LANGUAGES.map((value) => ({
  value,
  label: (
    <>
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{LANGUAGE_NAMES[value]}</span>
    </>
  ),
}))

function isField(property: string): property is Field {
  return (FIELDS as readonly string[]).includes(property)
}

export default function RegisterPage() {
  const t = useT()
  const navigate = useNavigate()
  const locale = useLocale()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [bounds] = useState(dateOfBirthBounds)
  /** The email language starts as the interface language and follows it until the user picks one here. */
  const [picked, setPicked] = useState<Language | null>(null)
  const language = picked ?? locale
  const [banner, setBanner] = useLocaleState<Banner | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ email: string; username: string } | null>(null)
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
        case 'dateOfBirth':
          return checkDateOfBirth(dateOfBirth)
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
        dateOfBirth: dateOfBirth.trim(),
        language,
      })
      setSent({ email: normaliseEmail(email), username: normaliseUsername(username) })
    } catch (thrown) {
      const error = asApiError(thrown)
      if (error.code === 'RESERVED_USERNAME') {
        form.fail({ username: t('rule.usernameReserved') })
      } else if (error.code === 'COMMON_PASSWORD') {
        form.fail({ password: t('rule.passwordCommon') })
      } else if (error.status === 409) {
        if (/email/i.test(error.message)) {
          form.fail({ email: t('register.emailTaken') })
        } else {
          form.fail({ username: t('register.usernameTaken') })
        }
      } else if (error.status === 400 && /date of birth/i.test(error.message)) {
        // The profile service's verdict, relayed by auth as a single message (not a validation array)
        form.fail({ dateOfBirth: t('register.birthRejected', { n: MIN_AGE }) })
      } else if (error.status === 400 && /^Invalid (first|last) name\b/i.test(error.message)) {
        // Also the profile service's verdict (the name rule lives in the database), relayed the same way
        form.fail(/^Invalid first/i.test(error.message) ? { firstName: nameRule() } : { lastName: nameRule() })
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
        <title>{`${t('common.checkInbox')} · Matcha`}</title>
        <AuthLayout
          title={t('common.checkInbox')}
          kicker={t('register.sentKicker')}
          intro={t.rich('register.sentIntro', { email: <strong>{sent.email}</strong>, time: codeLifetime() })}
          poster={{
            lines: t.lines('register.sentLines'),
            tone: 'blue',
            sticker: t.stack('register.sentSticker'),
            marquee: [t('common.signedSealed'), t('register.sentMarquee'), t('common.validFor', { time: codeLifetime() })],
          }}
          footer={
            <p className={a.links}>
              {t('register.alreadyVerified')} <Link to="/login" state={{ username: sent.username }}>{t('common.signIn')}</Link>
            </p>
          }
        >
          <VerifyCodeForm
            onVerified={() => navigate('/login', { state: { verified: true, username: sent.username } })}
          />
        </AuthLayout>
      </>
    )
  }

  const lowered = username.trim() !== username.trim().toLowerCase() && !form.errorOf('username')
  const rule = nameRule()

  return (
    <>
      <title>{`${t('register.docTitle')} · Matcha`}</title>
      <AuthLayout
        title={t('register.title')}
        kicker={t('register.kicker')}
        intro={t('register.intro')}
        poster={{
          lines: t.lines('register.lines'),
          tone: 'strawberry',
          sticker: t.stack('common.freeSticker'),
        }}
        footer={
          <p className={a.links}>
            {t('register.haveAccount')} <Link to="/login">{t('common.signIn')}</Link>
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
            label={t('common.username')}
            name="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              form.changed('username')
            }}
            onBlur={(event) => form.blur('username', event.target.value)}
            error={form.errorOf('username')}
            hint={lowered ? t('register.usernameLowered', { name: normaliseUsername(username) }) : t('register.usernameHint')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={USERNAME_MAX + 10}
            placeholder="alice_w"
            autoFocus
          />
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
            hint={t('register.emailHint')}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={EMAIL_MAX + 10}
            placeholder="alice@example.com"
          />
          <PasswordField
            label={t('common.password')}
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
          />
          <div className={a.pair}>
            <TextField
              label={t('register.firstName')}
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
              label={t('register.lastName')}
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
            {t('register.namesNote', { rule: rule.charAt(0).toLowerCase() + rule.slice(1) })}
          </Text>
          <TextField
            label={t('register.dateOfBirth')}
            name="bday"
            type="date"
            value={dateOfBirth}
            onChange={(event) => {
              setDateOfBirth(event.target.value)
              form.changed('dateOfBirth')
            }}
            onBlur={(event) => form.blur('dateOfBirth', event.target.value)}
            error={form.errorOf('dateOfBirth')}
            hint={t('register.dateOfBirthHint', { n: MIN_AGE })}
            autoComplete="bday"
            min={bounds.min}
            max={bounds.max}
          />
          <Segmented<Language>
            label={t('register.emailLanguage')}
            name="language"
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={(value) => {
              setPicked(value)
              form.changed('language')
            }}
            error={form.errorOf('language')}
            hint={t('register.emailLanguageHint', { language: LANGUAGE_NAMES[language] })}
            block
          />
          <FormBanner banner={banner} onRetry={() => void submit()} retrying={busy} />
          <Button type="submit" size="lg" block loading={busy}>
            {t('common.createAccount')}
          </Button>
          <OrRule />
          <GithubButton label={t('common.githubSignUp')} />
        </form>
      </AuthLayout>
    </>
  )
}
