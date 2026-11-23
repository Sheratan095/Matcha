/**
 * Visits as numbered ticket stubs with the username, newest first: "Viewed you", the people who opened
 * your profile (`GET /profile/viewers`), or "You visited", the profiles you opened (`GET /profile/visited`).
 */
import type { ReactNode } from 'react'
import { Barcode, Button, ButtonLink, EmptyState, IconEye, IconPencil, IconRefresh, IconRegMark, Notice, Skeleton, TicketHeader } from '@/ui'
import type { UserSummary } from '@/api/types'
import { useT, type Translator } from '@/i18n'
import type { NodeStatus } from '@/wb'
import { pad2 } from '@/features/chat/time'
import s from './ActivityPage.module.css'

type VisitKind = 'viewers' | 'visited'

interface VisitCopy {
  failed: string
  loading: string
  stamp: string
  emptyTitle: string
  emptyText: string
  emptyAction: ReactNode
  header: string
  kicker: string
  who: string
  honest: string
}

/** The words of each kind of visit list, in the language the page is in. */
function copyFor(kind: VisitKind, t: Translator): VisitCopy {
  if (kind === 'viewers') {
    return {
      failed: t('act.viewersFailed'),
      loading: t('act.viewersLoading'),
      stamp: t('act.viewersStamp'),
      emptyTitle: t('act.viewersEmptyTitle'),
      emptyText: t('act.viewersEmptyText'),
      emptyAction: (
        <ButtonLink to="/me" variant="paper" icon={<IconPencil size={18} />}>
          {t('act.viewersPolish')}
        </ButtonLink>
      ),
      header: t('act.viewersHeader'),
      kicker: t('act.viewersKicker'),
      who: t('act.viewersWho'),
      honest: t('act.viewersHonest'),
    }
  }
  return {
    failed: t('act.visitedFailed'),
    loading: t('act.visitedLoading'),
    stamp: t('act.visitedStamp'),
    emptyTitle: t('act.visitedEmptyTitle'),
    emptyText: t('act.visitedEmptyText'),
    emptyAction: (
      <ButtonLink to="/discover" variant="paper" icon={<IconRegMark size={18} />}>
        {t('act.visitedGoDeck')}
      </ButtonLink>
    ),
    header: t('act.visitedHeader'),
    kicker: t('act.visitedKicker'),
    who: t('act.visitedWho'),
    honest: t('act.visitedHonest'),
  }
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
  const t = useT()
  const copy = copyFor(kind, t)
  if (!viewers) {
    if (status.status === 'error') {
      return (
        <Notice
          tone="error"
          title={copy.failed}
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={onRetry}>
              {t('common.tryAgain')}
            </Button>
          }
        >
          {status.error?.message ?? t('kit.wrong')}
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
        {copy.honest}
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
                  {t('act.stubOpen')}
                </span>
              </span>
              <span className="sr-only">{t('act.stubSr', { n: index + 1 })}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}
