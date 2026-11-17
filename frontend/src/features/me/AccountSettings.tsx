import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UserSummary } from '@/api/types'
import { API_URL } from '@/config'
import {
  Avatar,
  Barcode,
  Button,
  Card,
  FormError,
  Headline,
  IconLogout,
  IconMail,
  IconRefresh,
  ListRow,
  Notice,
  Serial,
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
      setError('Enter a valid email address.')
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
      const split = splitApiError(toApiError(failure), { newEmail: 'New email' }, 'newEmail')
      setError(split.fields.newEmail)
      setFormError(split.form)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card as="section" aria-labelledby="me-email-title" label="Account" meta="Email">
      <Stack gap={4}>
        <Headline as="h2" id="me-email-title" size="d3" width="condensed">
          Change email
        </Headline>
        <form onSubmit={submit} noValidate>
          <Stack gap={4}>
            <TextField
              label="New email"
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
              hint="We send a link to the new address. Your current one keeps working until you open it."
            />
            <FormError error={formError} title="Not sent" />
            <div>
              <Button type="submit" variant="ink" icon={<IconMail size={18} />} loading={busy}>
                Send link
              </Button>
            </div>
          </Stack>
        </form>
        {sentTo ? (
          <Notice tone="success" title="Check the new inbox" onDismiss={() => setSentTo(null)}>
            A verification link is on its way to <strong>{sentTo}</strong>. Your sign-in email changes once you open
            it.
          </Notice>
        ) : null}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------- session

function SessionSection() {
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
    <Card as="section" aria-labelledby="me-session-title" label="Account" meta="Session">
      <Stack gap={4}>
        <Headline as="h2" id="me-session-title" size="d3" width="condensed">
          Log out
        </Headline>
        <Text size="sm" muted>
          Ends the session in this browser. Your profile stays as it is.
        </Text>
        <FormError error={error} title="Could not log out" />
        <div>
          <Button variant="paper" icon={<IconLogout size={18} />} loading={busy} onClick={logout}>
            Log out
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
        title: `@${person.username} is unblocked`,
        message: 'They can show up in your deck and in searches again.',
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
          title="The list did not load"
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={() => void refresh('blockedUsers')}>
              Try again
            </Button>
          }
        >
          {status.error ? describe(status.error) : 'Something went wrong.'}
        </Notice>
      ) : (
        <div className={s.blocked} aria-busy="true" aria-label="Loading the people you blocked">
          {[0, 1].map((index) => (
            <Skeleton key={index} height={52} />
          ))}
        </div>
      )
  } else if (blocks.length === 0) {
    list = <Text size="sm">Nobody. Someone you block from their profile shows up here, and can be unblocked.</Text>
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
                  aria-label={`Unblock @${person.username}`}
                  onClick={() => void unblock(person)}
                >
                  Unblock
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
      label="Account"
      meta={blocks ? `${pad2(blocks.length)} blocked` : 'Blocked'}
    >
      <Stack gap={4}>
        <Headline as="h2" id="me-blocked-title" size="d3" width="condensed">
          Blocked people
        </Headline>
        <Text size="sm" muted>
          They do not show up in your deck or searches, and cannot reach you. Unblocking does not bring a match back.
        </Text>
        {list}
        <FormError error={error} title="Not unblocked" />
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------- about this build

function AboutBuild() {
  return (
    <Card as="section" tone="ink" aria-labelledby="me-build-title" label="About this build" meta={<Serial value={2026} tone="paper" />}>
      <Stack gap={4}>
        <Headline as="h2" id="me-build-title" size="d3" width="condensed" print="riso" ink="paper" offset="matcha">
          Under the hood
        </Headline>
        <dl className={s.specs}>
          <div>
            <dt>Account, profile, matches & chat</dt>
            <dd>Gateway · {API_URL}</dd>
          </div>
        </dl>
        <Barcode value="matcha-gateway" height={28} tone="paper" caption />
      </Stack>
    </Card>
  )
}

/** The account tab: email, blocked people, session, and what this build runs on. */
export function AccountSettings() {
  return (
    <Stack gap={6}>
      <EmailSection />
      <BlockedSection />
      <SessionSection />
      <AboutBuild />
    </Stack>
  )
}
