/**
 * "Viewed you": the profile service only gives the ids of the people who opened the viewer's
 * profile, so they are shown as what they are: numbered ticket stubs with a short id.
 */
import { Barcode, Button, ButtonLink, EmptyState, IconEye, IconPencil, IconRefresh, Notice, Skeleton, TicketHeader } from '@/ui'
import type { NodeStatus } from '@/wb'
import { pad2 } from '@/features/chat/time'
import s from './ActivityPage.module.css'

/** "3f9a2c1e-..." -> "3F9A2C". */
function shortId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || '??????'
}

export interface ViewersPanelProps {
  viewers: string[] | null
  status: NodeStatus
  onOpen: (userId: string) => void
  onRetry: () => void
}

export function ViewersPanel({ viewers, status, onOpen, onRetry }: ViewersPanelProps) {
  if (!viewers) {
    if (status.status === 'error') {
      return (
        <Notice
          tone="error"
          title="Your visitors did not load"
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
      <div className={s.stubs} aria-busy="true" aria-label="Loading your visitors">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={92} style={{ borderRadius: 'var(--r-md)' }} />
        ))}
      </div>
    )
  }

  if (viewers.length === 0) {
    return (
      <EmptyState
        stamp="No visits"
        stampTone="blue"
        title="Nobody has peeked yet"
        action={
          <ButtonLink to="/me" variant="paper" icon={<IconPencil size={18} />}>
            Polish your profile
          </ButtonLink>
        }
      >
        A clear photo and a few honest interests go a long way. Visitors land here as soon as they open your profile.
      </EmptyState>
    )
  }

  return (
    <>
      <TicketHeader label="Visitors · newest first" meta={pad2(viewers.length)} />
      <p className={s.honest}>
        The profile service shares who visited by ticket number only, not by name. Open a stub to see who it is: that
        counts as a visit to their profile too.
      </p>
      <ol className={s.stubs}>
        {viewers.map((id, index) => (
          <li key={id}>
            <button type="button" className={s.stub} onClick={() => onOpen(id)}>
              <span className={s.stubMain}>
                <span className={s.stubKicker} aria-hidden="true">
                  Admit one · Visitor
                </span>
                <span className={s.stubId}>
                  <span aria-hidden="true">#</span>
                  <span className="sr-only">Visitor </span>
                  {shortId(id)}
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
