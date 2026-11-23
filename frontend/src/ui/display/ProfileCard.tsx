import type { CSSProperties, ReactNode } from 'react'
import { useT, type MessageKey } from '@/i18n'
import { cx } from '../cx'
import { IconPin, IconRegMark } from '../icons'
import { Stamp, Sticker } from '../lettering/Stamp'
import { Serial } from '../print/Print'
import { Chip } from './Chip'
import { PhotoFrame } from './Photo'
import s from './ProfileCard.module.css'

export type CardStamp = 'like' | 'nope' | 'super'

export interface ProfileCardProps {
  name: string
  age?: number
  photo?: string | null
  /** Seed for the fallback artwork (use the user id). */
  seed?: string
  city?: string
  distanceKm?: number
  /** Public fame rating (0-100), printed with the distance. */
  fame?: number
  online?: boolean
  /** Interest names, without '#'. */
  tags?: readonly string[]
  /** Shared interests: printed first, in matcha. */
  commonTags?: readonly string[]
  /** Shows the LIKES YOU sticker. */
  likedYou?: boolean
  /** Which verdict stamp shows on the photo (drive it from the drag direction). */
  stamp?: CardStamp | null
  /** 0–1: how strongly the stamp shows (drive it from the drag distance). Default 1. */
  stampStrength?: number
  /** Printed in the ticket strip. */
  serial?: number | string
  /** Photo pips at the top: how many pictures, and which one is showing (0-based). */
  photoCount?: number
  photoIndex?: number
  /** Shows the info button (open the full profile). */
  onInfo?: () => void
  /** Fill the parent's height instead of keeping the default 3:4.6 proportion. */
  fill?: boolean
  /** Extra overlay content on the photo. */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

const STAMPS: Record<CardStamp, { word: MessageKey; tone: 'strawberry' | 'ink' | 'yolk'; rotate: number }> = {
  like: { word: 'kit.stampLike', tone: 'strawberry', rotate: -14 },
  nope: { word: 'kit.stampNope', tone: 'ink', rotate: 12 },
  super: { word: 'kit.stampSuper', tone: 'yolk', rotate: -6 },
}

/**
 * The face of a swipe card: a photo on top and a tin label below with the name, the numbers
 * and the interests. Purely presentational; the deck adds the drag.
 */
export function ProfileCard({
  name,
  age,
  photo,
  seed,
  city,
  distanceKm,
  fame,
  online,
  tags = [],
  commonTags = [],
  likedYou,
  stamp,
  stampStrength = 1,
  serial,
  photoCount,
  photoIndex = 0,
  onInfo,
  fill,
  children,
  className,
  style,
}: ProfileCardProps) {
  const tx = useT()
  const common = commonTags.filter((tag) => tags.includes(tag) || !tags.length)
  const others = tags.filter((tag) => !common.includes(tag))
  const ordered = [...common, ...others]
  const visible = ordered.slice(0, 4)
  const rest = ordered.length - visible.length
  const where = [
    distanceKm != null ? tx('kit.cardAway', { distance: distanceKm < 1 ? '<1' : Math.round(distanceKm) }) : null,
    city,
    fame != null ? tx('kit.cardFame', { n: Math.round(fame) }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const strength = Math.max(0, Math.min(1, stampStrength))

  return (
    <article className={cx(s.card, fill && s.fill, className)} style={style} aria-label={age != null ? `${name}, ${age}` : name}>
      <div className={s.photo}>
        <PhotoFrame src={photo} alt="" seed={seed ?? name} ratio="auto" framed={false} radius="none" loading="eager" className={s.frame} />

        {photoCount != null && photoCount > 1 ? (
          <div className={s.pips} aria-label={tx('kit.cardPhotoOf', { i: photoIndex + 1, n: photoCount })} role="img">
            {Array.from({ length: photoCount }, (_, i) => (
              <i key={i} className={cx(i === photoIndex && s.pipOn)} />
            ))}
          </div>
        ) : null}

        {online ? <span className={s.online}>{tx('kit.cardOnline')}</span> : null}

        {stamp ? (
          <span
            className={cx(s.stamp, s[`stamp-${stamp}`])}
            style={{ opacity: strength, scale: String(0.7 + 0.3 * strength) }}
            aria-hidden="true"
          >
            <Stamp tone={STAMPS[stamp].tone} size="lg" rotate={STAMPS[stamp].rotate}>
              {tx(STAMPS[stamp].word)}
            </Stamp>
          </span>
        ) : null}

        {likedYou ? (
          <Sticker tone="yolk" shape="burst" size="84px" rotate={12} className={s.likesYou}>
            {tx.stack('kit.likesYou')}
          </Sticker>
        ) : null}

        {children}
      </div>

      <div className={s.label}>
        <div className={cx(s.strip, likedYou && s.stripClear)}>
          {serial != null ? <Serial value={serial} /> : <span />}
          <i aria-hidden="true" />
          {where ? (
            <span className={s.where}>
              <IconPin size={13} strokeWidth={3} />
              {where}
            </span>
          ) : null}
        </div>
        <div className={s.nameRow}>
          <h3 className={s.name}>
            <span className={s.nameText}>{name}</span>
            {age != null ? <span className={s.age}>{age}</span> : null}
          </h3>
          {onInfo ? (
            <button type="button" className={s.info} aria-label={tx('kit.cardOpen', { name })} onClick={onInfo}>
              <IconRegMark size={22} strokeWidth={3} filled />
            </button>
          ) : null}
        </div>
        {visible.length > 0 ? (
          <div className={s.tags}>
            {visible.map((tag) => (
              <Chip key={tag} size="sm" tone={common.includes(tag) ? 'matcha' : 'paper'}>
                #{tag}
              </Chip>
            ))}
            {rest > 0 ? (
              <Chip size="sm" tone="kraft">
                +{rest}
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
