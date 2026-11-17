/**
 * Visits as numbered ticket stubs with the username, newest first: "Viewed you", the people who opened
 * your profile (`GET /profile/viewers`), or "You visited", the profiles you opened (`GET /profile/visited`).
 */
import type { ReactNode } from 'react'
import { Barcode, Button, ButtonLink, EmptyState, IconCards, IconEye, IconPencil, IconRefresh, Notice, Skeleton, TicketHeader } from '@/ui'
import type { UserSummary } from '@/api/types'
import type { NodeStatus } from '@/wb'
import { pad2 } from '@/features/chat/time'
import s from './ActivityPage.module.css'

type VisitKind = 'viewers' | 'visited'

const COPY: Record<
  VisitKind,
  {
    failed: string
    loading: string
    stamp: string
    emptyTitle: string
    emptyText: string
    emptyAction: ReactNode
    header: string
    kicker: string
    who: string
  }
> = {
  viewers: {
    failed: 'Your visitors did not load',
    loading: 'Loading your visitors',
    stamp: 'No visits',
    emptyTitle: 'Nobody has peeked yet',
    emptyText: 'A clear photo and a few honest interests go a long way. Visitors land here as soon as they open your profile.',
    emptyAction: (
      <ButtonLink to="/me" variant="paper" icon={<IconPencil size={18} />}>
        Polish your profile
      </ButtonLink>
    ),
    header: 'Visitors · newest first',
    kicker: 'Admit one · Visitor',
    who: 'Visitor',
  },
  visited: {
    failed: 'Your visits did not load',
    loading: 'Loading the profiles you visited',
    stamp: 'No trips',
    emptyTitle: 'You have not opened a profile yet',
    emptyText: 'Open a card on the deck, a search result or a face on the map: every profile you open lands here.',
    emptyAction: (
      <ButtonLink to="/discover" variant="paper" icon={<IconCards size={18} />}>
        Go to the deck
      </ButtonLink>
    ),
    header: 'Profiles you opened · latest first',
    kicker: 'Return ticket · Visited',
    who: 'Visited',
  },
}

export interface ViewersPanelProps {
  /** Which visits: who viewed you (default), or whom you visited. */
  kind?: VisitKind
  viewers: UserSummary[] | null
  status: NodeStatus
  onOpen: (userId: string) => void
  onRetry: () => void
}

export function ViewersPanel({ kind = 'viewers', viewers, status, onOpen, onRetry }: ViewersPanelProps) {
  const copy = COPY[kind]
  if (!viewers) {
    if (status.status === 'error') {
      return (
        <Notice
          tone="error"
          title={copy.failed}
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {status.error?.message ?? 'Something went wrong.'}
        </Notice>
      )
    }
    return (
      <div className={s.stubs} aria-busy="true" aria-label={copy.loading}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={92} style={{ borderRadius: 'var(--r-md)' }} />
        ))}
      </div>
    )
  }

  if (viewers.length === 0) {
    return (
      <EmptyState stamp={copy.stamp} stampTone="blue" title={copy.emptyTitle} action={copy.emptyAction}>
        {copy.emptyText}
      </EmptyState>
    )
  }

  return (
    <>
      <TicketHeader label={copy.header} meta={pad2(viewers.length)} />
      <p className={s.honest}>
        {kind === 'viewers'
          ? 'Open a stub to see their profile: that counts as a visit to theirs too.'
          : 'Open a stub to see their profile again: they are told about each visit.'}
      </p>
      <ol className={s.stubs}>
        {viewers.map(({ userId: id, username }, index) => (
          <li key={`${id}-${index}`}>
            <button type="button" className={s.stub} onClick={() => onOpen(id)}>
              <span className={s.stubMain}>
                <span className={s.stubKicker} aria-hidden="true">
                  {copy.kicker}
                </span>
                <span className={s.stubId}>
                  <span aria-hidden="true">@</span>
                  <span className="sr-only">{copy.who} </span>
                  {username}
                </span>
                <Barcode value={id} height={20} className={s.stubBarcode} />
              </span>
              <span className={s.stubSide}>
                <span className={s.stubNo} aria-hidden="true">
                  {pad2(index + 1)}
                </span>
                <span className={s.stubOpen} aria-hidden="true">
                  <IconEye size={16} strokeWidth={3} />
                  Open
                </span>
              </span>
              <span className="sr-only">, number {index + 1}. Open their profile.</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}
