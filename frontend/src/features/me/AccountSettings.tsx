import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UserSummary } from '@/api/types'
import { useT } from '@/i18n'
import {
  Avatar,
  Button,
  Card,
  FormError,
  Headline,
  IconLogout,
  IconMail,
  IconRefresh,
  ListRow,
  LocalePicker,
  Notice,
  Skeleton,
  Stack,
  Text,
  TextField,
  toast,
} from '@/ui'
import { actions, refresh, toApiError, useLoad, useNodeStatus, useNodeValue } from '@/wb'
import { describe, splitApiError } from './errors'
import s from './AccountSettings.module.css'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------- email

function EmailSection() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string[]>([])
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const value = email.trim()
    if (!EMAIL.test(value)) {
      setError(t('me.emailInvalid'))
      return
    }
    setBusy(true)
    setError(undefined)
    setFormError([])
    try {
      await actions.changeEmail(value)
      setSentTo(value.toLowerCase())
      setEmail('')
    } catch (failure) {
      const split = splitApiError(toApiError(failure), { newEmail: t('me.labelNewEmail') }, 'newEmail')
      setError(split.fields.newEmail)
      setFormError(split.form)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card as="section" aria-labelledby="me-email-title" label={t('me.tabAccount')} meta={t('me.emailMeta')}>
      <Stack gap={4}>
        <Headline as="h2" id="me-email-title" size="d3" width="condensed">
          {t('me.emailTitle')}
        </Headline>
        <form onSubmit={submit} noValidate>
          <Stack gap={4}>
            <TextField
              label={t('me.labelNewEmail')}
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={100}
              value={email}
              onChange={(e) => {
                setEmail(e.currentTarget.value)
                setError(undefined)
              }}
              error={error}
              hint={t('me.emailHint')}
            />
            <FormError error={formError} title={t('me.notSent')} />
            <div>
              <Button type="submit" variant="ink" icon={<IconMail size={18} />} loading={busy}>
                {t('me.sendLink')}
              </Button>
            </div>
          </Stack>
        </form>
        {sentTo ? (
          <Notice tone="success" title={t('me.checkInbox')} onDismiss={() => setSentTo(null)}>
            {t.rich('me.linkSent', { email: <strong>{sentTo}</strong> })}
          </Notice>
        ) : null}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------- language

/** The interface language: the same compact picker as the signed-out pages (a flag and the language code), kept in this browser. */
function LanguageSection() {
  const t = useT()
  return (
    <Card as="section" aria-labelledby="me-language-title" label={t('me.tabAccount')} meta={t('me.language')}>
      <Stack gap={4}>
        <Headline as="h2" id="me-language-title" size="d3" width="condensed">
          {t('me.language')}
        </Headline>
        <Text size="sm" muted>
          {t('me.languageIntro')}
        </Text>
        <div>
          <LocalePicker align="start" />
        </div>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------- session

function SessionSection() {
  const t = useT()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logout = async () => {
    setBusy(true)
    setError(null)
    try {
      await actions.logout()
      navigate('/', { replace: true })
    } catch (failure) {
      setError(describe(toApiError(failure)))
      setBusy(false)
    }
  }
  return (
    <Card as="section" aria-labelledby="me-session-title" label={t('me.tabAccount')} meta={t('me.sessionMeta')}>
      <Stack gap={4}>
        <Headline as="h2" id="me-session-title" size="d3" width="condensed">
          {t('me.logOut')}
        </Headline>
        <Text size="sm" muted>
          {t('me.logOutBody')}
        </Text>
        <FormError error={error} title={t('me.logOutFailed')} />
        <div>
          <Button variant="paper" icon={<IconLogout size={18} />} loading={busy} onClick={logout}>
            {t('me.logOut')}
          </Button>
        </div>
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------- blocked people

const pad2 = (n: number) => String(n).padStart(2, '0')

/** The people you blocked (`GET /profile/blocks`, loaded when this tab first shows), each with "Unblock". */
function BlockedSection() {
  const t = useT()
  useLoad('blockedUsers')
  const result = useNodeValue('blockedUsers')
  const status = useNodeStatus('blockedUsers')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const blocks = result && Array.isArray(result.blocks) ? result.blocks : null

  const unblock = async (person: UserSummary) => {
    if (busyId) return
    setBusyId(person.userId)
    setError(null)
    try {
      await actions.unblockUser(person.userId)
      toast.show({
        tone: 'matcha',
        title: t('me.unblockedTitle', { username: person.username }),
        message: t('me.unblockedBody'),
      })
    } catch (failure) {
      setError(describe(toApiError(failure)))
    } finally {
      setBusyId(null)
    }
  }

  let list
  if (blocks === null) {
    list =
      status.status === 'error' ? (
        <Notice
          tone="error"
          title={t('me.blockedLoadFailed')}
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={() => void refresh('blockedUsers')}>
              {t('common.tryAgain')}
            </Button>
          }
        >
          {status.error ? describe(status.error) : t('kit.wrong')}
        </Notice>
      ) : (
        <div className={s.blocked} aria-busy="true" aria-label={t('me.blockedLoading')}>
          {[0, 1].map((index) => (
            <Skeleton key={index} height={52} />
          ))}
        </div>
      )
  } else if (blocks.length === 0) {
    list = <Text size="sm">{t('me.blockedNobody')}</Text>
  } else {
    list = (
      <ul className={s.blocked}>
        {blocks.map((person) => (
          <li key={person.userId}>
            <ListRow
              leading={<Avatar src={person.profilePictureUrl} name={person.username} size="sm" decorative />}
              title={`@${person.username}`}
              trailing={
                <Button
                  size="sm"
                  variant="paper"
                  loading={busyId === person.userId}
                  disabled={busyId !== null && busyId !== person.userId}
                  aria-label={t('me.unblockName', { username: person.username })}
                  onClick={() => void unblock(person)}
                >
                  {t('me.unblock')}
                </Button>
              }
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Card
      as="section"
      aria-labelledby="me-blocked-title"
      label={t('me.tabAccount')}
      meta={blocks ? t.n('me.blockedCount', blocks.length, { n: pad2(blocks.length) }) : t('me.blockedMeta')}
    >
      <Stack gap={4}>
        <Headline as="h2" id="me-blocked-title" size="d3" width="condensed">
          {t('me.blockedTitle')}
        </Headline>
        <Text size="sm" muted>
          {t('me.blockedBody')}
        </Text>
        {list}
        <FormError error={error} title={t('me.notUnblocked')} />
      </Stack>
    </Card>
  )
}

/** The account tab: email, language, blocked people and the session. */
export function AccountSettings() {
  return (
    <Stack gap={6}>
      <EmailSection />
      <LanguageSection />
      <BlockedSection />
      <SessionSection />
    </Stack>
  )
}
