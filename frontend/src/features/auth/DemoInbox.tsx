/**
 * Demo mode sends no email: the mock backend files every "sent" message in a dev inbox
 * (`devInbox` node, `actions.loadDevInbox()`). This panel shows it as a postcard lying under the
 * ticket, each email an envelope with a one-click "Open link". Renders nothing with the real backend.
 */
import { useCallback, useEffect, useId, useState } from 'react'
import type { MockEmail } from '@/api/types'
import {
  Badge,
  Button,
  ButtonLink,
  Headline,
  IconArrowRight,
  IconLock,
  IconMail,
  IconRefresh,
  Label,
  LogoMark,
  Notice,
  Skeleton,
  Text,
} from '@/ui'
import { actions, storeInfo, useNodeStatus, useNodeValue } from '@/wb'
import s from './DemoInbox.module.css'

export interface DemoInboxProps {
  /** Only this kind of email. */
  kind?: MockEmail['kind']
  /** Only mail sent to this address. */
  to?: string
  /** Offer "Use code" next to "Open link" (fills the code in place). */
  onUseCode?: (token: string) => void
  /** Change it to reload the inbox (after an action that sends mail). */
  refreshKey?: unknown
}

const SUBJECT: Record<MockEmail['kind'], string> = {
  'verify-email': 'Verify your email',
  'reset-password': 'Reset your password',
}

const LIMIT = 4

function ago(iso: string, now: number): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Splits a hex token in groups of four so it can be read off the card. */
function grouped(token: string): string {
  return token.replace(/(.{4})(?=.)/g, '$1 ')
}

export function DemoInbox(props: DemoInboxProps) {
  if (storeInfo.backend !== 'mock') return null
  return <Postcard {...props} />
}

function Postcard({ kind, to, onUseCode, refreshKey }: DemoInboxProps) {
  const titleId = useId()
  const emails = useNodeValue('devInbox')
  const { status, error } = useNodeStatus('devInbox')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    setNow(Date.now())
    // The failure is on the node's status, rendered below.
    actions.loadDevInbox().catch(() => undefined)
  }, [])

  useEffect(() => {
    actions.loadDevInbox().catch(() => undefined)
  }, [refreshKey])

  // Keep "2 min ago" honest while the card is on screen.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const address = to?.trim().toLowerCase()
  const list = (emails ?? []).filter((email) => (!kind || email.kind === kind) && (!address || email.to === address))
  const shown = list.slice(0, LIMIT)
  const loading = status === 'loading'

  let body
  if (status === 'error' && !emails) {
    body = (
      <Notice
        tone="error"
        title="The demo inbox didn't load"
        action={
          <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} onClick={load}>
            Try again
          </Button>
        }
      >
        {error?.message}
      </Notice>
    )
  } else if (emails === undefined || (emails === null && loading)) {
    body = (
      <div className={s.skeletons} aria-hidden="true">
        <Skeleton height={92} />
        <Skeleton height={92} />
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <p className={s.empty}>
        {address ? (
          <>
            Nothing for <strong>{address}</strong> yet.
          </>
        ) : (
          'Nothing in the inbox yet.'
        )}{' '}
        {kind === 'reset-password' && address
          ? 'If no account uses this address, no email is sent.'
          : 'Emails from the demo backend land here.'}
      </p>
    )
  } else {
    body = (
      <ul className={s.list}>
        {shown.map((email, index) => (
          <li key={`${email.token}-${email.sentAt}`} className={s.mail} data-kind={email.kind}>
            <span className={s.tab} aria-hidden="true">
              {email.kind === 'verify-email' ? <IconMail size={20} filled /> : <IconLock size={20} filled />}
            </span>
            <div className={s.mailBody}>
              <p className={s.meta}>
                <span className={s.to}>To {email.to}</span>
                <time dateTime={email.sentAt}>{ago(email.sentAt, now)}</time>
              </p>
              <p className={s.subject}>{SUBJECT[email.kind]}</p>
              <p className={s.codeLine}>
                <span className={s.codeLabel}>Code</span>
                <code className={s.code}>{grouped(email.token)}</code>
              </p>
              <div className={s.mailActions}>
                <ButtonLink
                  to={email.link}
                  size="sm"
                  variant="ink"
                  iconRight={<IconArrowRight size={16} strokeWidth={3} />}
                  aria-label={`Open the “${SUBJECT[email.kind]}” link sent to ${email.to}`}
                >
                  Open link
                </ButtonLink>
                {onUseCode && email.kind === 'verify-email' ? (
                  <Button size="sm" variant="paper" onClick={() => onUseCode(email.token)}>
                    Use code
                  </Button>
                ) : null}
              </div>
            </div>
            {index === 0 ? (
              <Badge tone="yolk" rotate={7} className={s.newest}>
                Newest
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className={s.postcard} aria-labelledby={titleId}>
      <div className={s.stampWrap} aria-hidden="true">
        <span className={s.postage}>
          <span className={s.postageInner}>
            <LogoMark size={28} flat />
            <span className={s.postageValue}>0,00</span>
          </span>
        </span>
        <span className={s.postmark}>
          <span>Mock post</span>
          <span>Demo</span>
        </span>
        <svg className={s.cancel} viewBox="0 0 120 30" focusable="false">
          <path d="M0 6q7.5-6 15 0t15 0 15 0 15 0 15 0 15 0 15 0 15 0" />
          <path d="M0 15q7.5-6 15 0t15 0 15 0 15 0 15 0 15 0 15 0 15 0" />
          <path d="M0 24q7.5-6 15 0t15 0 15 0 15 0 15 0 15 0 15 0 15 0" />
        </svg>
      </div>

      <div className={s.head}>
        <Label size="sm" tone="muted">
          Demo mode · nothing leaves this browser
        </Label>
        <Headline as="h2" size="d3" width="condensed" print="riso" offset="yolk" id={titleId}>
          Demo inbox
        </Headline>
        <Text size="sm" className={s.intro}>
          No real email is sent in the demo. The messages the app would have mailed you are filed here.
        </Text>
      </div>

      {body}

      <div className={s.foot}>
        <Label size="sm" tone="muted">
          {list.length > LIMIT ? `${LIMIT} newest of ${list.length}` : `${String(list.length).padStart(2, '0')} in the bag`}
        </Label>
        <Button size="sm" variant="ghost" icon={<IconRefresh size={16} />} loading={loading} onClick={load}>
          Check again
        </Button>
      </div>
    </section>
  )
}
