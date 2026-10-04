/**
 * The profile sheet's photo strip: native horizontal scrolling with snap points (touch swipes and
 * trackpads just work), prev / next buttons, tap the left / right third to step, and pips + a counter
 * that follow the scroll (an RxJS stream of scroll events coalesced to animation frames).
 */
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { animationFrameScheduler, auditTime, distinctUntilChanged, fromEvent, map } from 'rxjs'
import type { UserPicture } from '@/api/types'
import { IconButton, IconChevronLeft, IconChevronRight, PhotoFrame } from '@/ui'
import s from './PhotoCarousel.module.css'

export interface PhotoCarouselProps {
  photos: readonly UserPicture[]
  /** The person's name (alt texts, the region's name). */
  name: string
  /** Fallback artwork seed (the user id). */
  seed: string
  /** Overlays (menu, badges) positioned over the photos. */
  children?: ReactNode
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function PhotoCarousel({ photos, name, seed, children }: PhotoCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = Math.max(1, photos.length)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const subscription = fromEvent(track, 'scroll', { passive: true })
      .pipe(
        auditTime(0, animationFrameScheduler),
        map(() => Math.round(track.scrollLeft / Math.max(1, track.clientWidth))),
        distinctUntilChanged(),
      )
      .subscribe(setIndex)
    return () => subscription.unsubscribe()
  }, [])

  const go = (target: number) => {
    const track = trackRef.current
    if (!track) return
    const next = Math.max(0, Math.min(count - 1, target))
    track.scrollTo({ left: next * track.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  // tap the left or right third of the photo to step through (the middle does nothing)
  const onTap = (event: MouseEvent<HTMLDivElement>) => {
    if (count < 2) return
    const rect = event.currentTarget.getBoundingClientRect()
    const at = (event.clientX - rect.left) / rect.width
    if (at < 1 / 3) go(index - 1)
    else if (at > 2 / 3) go(index + 1)
  }

  return (
    <div className={s.carousel} role="region" aria-roledescription="carousel" aria-label={`${name}'s photos`}>
      <div ref={trackRef} className={s.track} onClick={onTap}>
        {photos.length > 0 ? (
          photos.map((photo, i) => (
            <div
              key={photo.id}
              className={s.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${photos.length}`}
            >
              <PhotoFrame
                src={photo.url}
                alt={i === 0 ? name : `${name}, photo ${i + 1}`}
                seed={seed}
                ratio="auto"
                framed={false}
                radius="none"
                loading={i < 2 ? 'eager' : 'lazy'}
                className={s.photo}
              />
            </div>
          ))
        ) : (
          <div className={s.slide}>
            <PhotoFrame src={null} alt={`${name} has no photo yet`} seed={seed} ratio="auto" framed={false} radius="none" className={s.photo} />
          </div>
        )}
      </div>

      {count > 1 ? (
        <>
          <div className={s.pips} aria-hidden="true">
            {photos.map((photo, i) => (
              <i key={photo.id} data-on={i === index || undefined} />
            ))}
          </div>
          <span className={s.counter} aria-live="polite">
            {String(index + 1).padStart(2, '0')}/{String(count).padStart(2, '0')}
          </span>
          <span className={s.prev}>
            <IconButton label="Previous photo" size="sm" round onClick={() => go(index - 1)} disabled={index === 0}>
              <IconChevronLeft size={20} strokeWidth={3} />
            </IconButton>
          </span>
          <span className={s.next}>
            <IconButton label="Next photo" size="sm" round onClick={() => go(index + 1)} disabled={index >= count - 1}>
              <IconChevronRight size={20} strokeWidth={3} />
            </IconButton>
          </span>
        </>
      ) : null}

      {children}
    </div>
  )
}
