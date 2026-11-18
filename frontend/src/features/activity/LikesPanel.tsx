/** "Likes you": everyone who liked the viewer and is waiting for an answer, as pinned polaroids. */
import type { CSSProperties } from 'react'
import type { UserSummary } from '@/api/types'
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
  if (!likes) {
    if (status.status === 'error') {
      return (
        <Notice
          tone="error"
          title="Your likes did not load"
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
      <div className={s.likes} aria-busy="true" aria-label="Loading your likes">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} height={238} style={{ borderRadius: 'var(--r-md)' }} />
        ))}
      </div>
    )
  }

  if (likes.length === 0) {
    return (
      <EmptyState
        stamp="All quiet"
        stampTone="strawberry"
        title="Nobody in the queue yet"
        action={
          <ButtonLink to="/discover" icon={<IconRegMark size={20} />}>
            Keep swiping
          </ButtonLink>
        }
      >
        When someone likes you, they show up here before you have even seen their card. Like them back and you are
        connected.
      </EmptyState>
    )
  }

  return (
    <>
      <TicketHeader label="They liked you first" meta="Like back = match" />
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
                  <span className={s.likeMeta}>Likes you</span>
                </span>
                <span className="sr-only">. Liked you. Open the profile.</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
