/** "Likes you": everyone who liked the viewer and is waiting for an answer, as pinned polaroids. */
import type { CSSProperties } from 'react'
import type { Card } from '@/api/types'
import { firstNameOf, mainPicture } from '@/features/chat/people'
import { Button, ButtonLink, EmptyState, IconCards, IconHeart, IconRefresh, Notice, PhotoFrame, Skeleton, TicketHeader } from '@/ui'
import type { NodeStatus } from '@/wb'
import s from './ActivityPage.module.css'

export interface LikesPanelProps {
  likes: Card[] | null
  status: NodeStatus
  onOpen: (card: Card) => void
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
          <ButtonLink to="/discover" icon={<IconCards size={20} />}>
            Keep swiping
          </ButtonLink>
        }
      >
        When someone likes you, they show up here before you have even seen their card. Like them back and it is an instant
        match.
      </EmptyState>
    )
  }

  return (
    <>
      <TicketHeader label="They liked you first" meta="Like back = match" />
      <ul className={s.likes}>
        {likes.map((card, index) => {
          const name = firstNameOf(card)
          const tilt = [-1.6, 1.2, 0.8, -1.1][index % 4]
          return (
            <li key={card.userId}>
              <button
                type="button"
                className={s.like}
                style={{ '--tilt': `${tilt}deg` } as CSSProperties}
                onClick={() => onOpen(card)}
              >
                <PhotoFrame src={mainPicture(card)} alt="" seed={card.userId} radius="sm" className={s.likePhoto}>
                  <span className={s.likeHeart} aria-hidden="true">
                    <IconHeart size={18} filled />
                  </span>
                  {card.online ? <span className={s.likeOnline} aria-hidden="true" /> : null}
                </PhotoFrame>
                <span className={s.likeLabel}>
                  <span className={s.likeName}>
                    {name}
                    <span className={s.likeAge}>{card.age}</span>
                  </span>
                  <span className={s.likeMeta}>
                    {card.commonTags.length > 0
                      ? `${card.commonTags.length} in common`
                      : `${Math.max(1, Math.round(card.distanceKm))} km away`}
                  </span>
                </span>
                <span className="sr-only">
                  {card.online ? ', online' : ''}. Liked you. Open the profile.
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
