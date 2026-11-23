/** "Likes you": everyone who liked the viewer and is waiting for an answer, as pinned polaroids. */
import type { CSSProperties } from 'react'
import type { UserSummary } from '@/api/types'
import { useT } from '@/i18n'
import { Button, ButtonLink, EmptyState, IconHeart, IconRefresh, IconRegMark, Notice, PhotoFrame, Skeleton, TicketHeader } from '@/ui'
import type { NodeStatus } from '@/wb'
import s from './ActivityPage.module.css'

export interface LikesPanelProps {
  likes: UserSummary[] | null
  status: NodeStatus
  onOpen: (liker: UserSummary) => void
  onRetry: () => void
}

export function LikesPanel({ likes, status, onOpen, onRetry }: LikesPanelProps) {
  const t = useT()
  if (!likes) {
    if (status.status === 'error') {
      return (
        <Notice
          tone="error"
          title={t('act.likesFailed')}
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
      <div className={s.likes} aria-busy="true" aria-label={t('act.loadingLikes')}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} height={238} style={{ borderRadius: 'var(--r-md)' }} />
        ))}
      </div>
    )
  }

  if (likes.length === 0) {
    return (
      <EmptyState
        stamp={t('act.quietStamp')}
        stampTone="strawberry"
        title={t('act.queueTitle')}
        action={
          <ButtonLink to="/discover" icon={<IconRegMark size={20} />}>
            {t('act.keepSwiping')}
          </ButtonLink>
        }
      >
        {t('act.likesEmpty')}
      </EmptyState>
    )
  }

  return (
    <>
      <TicketHeader label={t('act.likedFirst')} meta={t('act.likeBackMatch')} />
      <ul className={s.likes}>
        {likes.map((liker, index) => {
          const tilt = [-1.6, 1.2, 0.8, -1.1][index % 4]
          return (
            <li key={liker.userId}>
              <button
                type="button"
                className={s.like}
                style={{ '--tilt': `${tilt}deg` } as CSSProperties}
                onClick={() => onOpen(liker)}
              >
                <PhotoFrame src={liker.profilePictureUrl} alt="" seed={liker.userId} radius="sm" className={s.likePhoto}>
                  <span className={s.likeHeart} aria-hidden="true">
                    <IconHeart size={18} filled />
                  </span>
                </PhotoFrame>
                <span className={s.likeLabel}>
                  <span className={s.likeName}>{liker.username}</span>
                  <span className={s.likeMeta}>{t('act.tabLikes')}</span>
                </span>
                <span className="sr-only">{t('act.likeSr')}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
