import { Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { IconSparkle } from '../icons'
import type { Tone } from '../tones'
import s from './Marquee.module.css'

export interface MarqueeProps {
  /** The phrases that run along the band. */
  items: ReactNode[]
  tone?: Tone
  /** Seconds for one full loop. Default 22. */
  speed?: number
  reverse?: boolean
  /** Degrees of tilt (the band then overhangs its container; clip it with the parent). */
  tilt?: number
  size?: 'sm' | 'md' | 'lg'
  /** Glyph between phrases. Default a four-point sparkle. */
  separator?: ReactNode
  /** Accessible text. Without it the band is decorative and hidden from assistive tech. */
  label?: string
  className?: string
  style?: CSSProperties
}

/** A ticker band of heavy lettering that scrolls forever (and stands still under reduced motion). */
export function Marquee({
  items,
  tone = 'ink',
  speed = 22,
  reverse,
  tilt,
  size = 'md',
  separator,
  label,
  className,
  style,
}: MarqueeProps) {
  // Repeat the phrases so one track is always wider than the viewport.
  const repeats = Math.max(2, Math.ceil(12 / Math.max(1, items.length)))
  const sep = separator ?? <IconSparkle filled size="0.7em" />
  const track = (hidden: boolean) => (
    <span className={s.track} aria-hidden={hidden || undefined}>
      {Array.from({ length: repeats }, (_, r) =>
        items.map((item, i) => (
          <Fragment key={`${r}-${i}`}>
            <span className={s.item}>{item}</span>
            <span className={s.sep}>{sep}</span>
          </Fragment>
        )),
      )}
    </span>
  )
  return (
    <div
      data-tone={tone}
      className={cx(s.marquee, s[size], reverse && s.reverse, className)}
      style={
        {
          '--mq-speed': `${speed}s`,
          rotate: tilt ? `${tilt}deg` : undefined,
          ...style,
        } as CSSProperties
      }
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className={s.belt}>
        {track(Boolean(label))}
        {track(true)}
      </div>
    </div>
  )
}
