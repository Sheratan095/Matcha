import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MockEmail } from '@/api/types'
import { API_URL, IS_MOCK_BACKEND, MOCK_PREFIX, SOCIAL_URL } from '@/config'
import {
  Barcode,
  Button,
  Card,
  FormError,
  Headline,
  IconLogout,
  IconMail,
  IconRefresh,
  ListRow,
  Modal,
  Notice,
  Serial,
  Stack,
  Text,
  TextField,
} from '@/ui'
import { actions, storeInfo, toApiError, useNodeStatus, useNodeValue } from '@/wb'
import { describe, splitApiError } from './errors'
import s from './AccountSettings.module.css'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMAIL_KIND: Record<MockEmail['kind'], string> = {
  'verify-email': 'Verify your email',
  'reset-password': 'Reset your password',
}

function sentAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------- demo inbox

/** Demo mode: the emails the mock backend "sent", with their links. */
function DemoInbox({ highlight }: { highlight: string | null }) {
  const inbox = useNodeValue('devInbox')
  const status = useNodeStatus('devInbox')
  const [asked, setAsked] = useState(false)
  const loading = status.status === 'loading'

  const open = () => {
    setAsked(true)
    // the error, if any, is on the node's status
    void actions.loadDevInbox().catch(() => undefined)
  }

  return (
    <div className={s.inbox} data-surface="ink">
      <div className={s.inboxHead}>
        <span className={s.inboxTitle}>
          <IconMail size={18} /> Demo inbox
        </span>
        <Button size="sm" variant="yolk" icon={inbox ? <IconRefresh size={16} /> : undefined} loading={loading} onClick={open}>
          {inbox ? 'Refresh' : 'Open inbox'}
        </Button>
      </div>
      <p className={s.inboxNote}>No email leaves this browser in demo mode: the links land here instead.</p>
      {status.status === 'error' && status.error ? <FormError error={describe(status.error)} /> : null}
      {asked && inbox && inbox.length === 0 ? <p className={s.inboxNote}>Nothing yet.</p> : null}
      {inbox && inbox.length > 0 ? (
        <ul className={s.inboxList}>
          {inbox.slice(0, 5).map((email) => (
            <li key={email.token}>
              <ListRow
                to={email.link}
                title={EMAIL_KIND[email.kind]}
                subtitle={`To ${email.to}`}
                meta={sentAt(email.sentAt)}
                unread={highlight !== null && email.to === highlight && email.kind === 'verify-email'}
                className={s.inboxRow}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

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
      if (IS_MOCK_BACKEND) void actions.loadDevInbox().catch(() => undefined)
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
            it.{IS_MOCK_BACKEND ? ' This is the demo: find the link in the demo inbox below.' : ''}
          </Notice>
        ) : null}
        {IS_MOCK_BACKEND ? <DemoInbox highlight={sentTo} /> : null}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------- session + demo data

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

function DemoDataSection() {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reset = async () => {
    setConfirm(false)
    setBusy(true)
    setDone(false)
    setError(null)
    try {
      await actions.resetDemoData()
      setDone(true)
    } catch (failure) {
      setError(describe(toApiError(failure)))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card as="section" aria-labelledby="me-demo-title" label="Simulated" meta="Social data">
      <Stack gap={4}>
        <Headline as="h2" id="me-demo-title" size="d3" width="condensed">
          Reset demo matches
        </Headline>
        <Text size="sm">
          Discover, likes, matches and chats are simulated in this browser
          {IS_MOCK_BACKEND ? '' : ', even with the real backend, which has no such service yet'}. Resetting brings back the
          starting set of people, matches and messages. Your account, profile and photos are not touched.
        </Text>
        <FormError error={error} title="Could not reset" />
        {done ? (
          <Notice tone="success" title="Demo data restored" onDismiss={() => setDone(false)}>
            A full deck and the starting matches are back.
          </Notice>
        ) : null}
        <div>
          <Button variant="paper" icon={<IconRefresh size={18} />} loading={busy} onClick={() => setConfirm(true)}>
            Reset demo data
          </Button>
        </div>
      </Stack>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset the demo data?"
        kicker="Simulated social data"
        size="sm"
        initialFocus={cancelRef}
        footer={
          <>
            <Button ref={cancelRef} variant="paper" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="strawberry" onClick={reset}>
              Reset
            </Button>
          </>
        }
      >
        <Text>
          Swipes, matches and conversations made in this browser are replaced by the starting set. Your profile and photos
          stay.
        </Text>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------- about this build

function AboutBuild() {
  const profileBackend = storeInfo.backend === 'real' ? `Real gateway · ${API_URL}` : 'Mock, in this browser'
  const socialBackend = SOCIAL_URL.startsWith(MOCK_PREFIX) ? 'Mock, in this browser' : SOCIAL_URL
  return (
    <Card as="section" tone="ink" aria-labelledby="me-build-title" label="About this build" meta={<Serial value={2026} tone="paper" />}>
      <Stack gap={4}>
        <Headline as="h2" id="me-build-title" size="d3" width="condensed" print="riso" ink="paper" offset="matcha">
          Under the hood
        </Headline>
        <dl className={s.specs}>
          <div>
            <dt>Account & profile</dt>
            <dd>{profileBackend}</dd>
          </div>
          <div>
            <dt>Matches & chat</dt>
            <dd>{socialBackend}</dd>
          </div>
        </dl>
        <Barcode value={`matcha-${storeInfo.backend}`} height={28} tone="paper" caption />
      </Stack>
    </Card>
  )
}

/** The account tab: email, session, simulated data, and what this build runs on. */
export function AccountSettings() {
  return (
    <Stack gap={6}>
      <EmailSection />
      <SessionSection />
      <DemoDataSection />
      <AboutBuild />
    </Stack>
  )
}
