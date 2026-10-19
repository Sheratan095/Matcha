import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import type { Tone } from '../tones'
import s from './Stamp.module.css'

export interface StampProps {
  children: ReactNode
  /** strawberry = LIKE, ink = NOPE, yolk = SUPER, matcha = MATCH. */
  tone?: Tone
  /**
   * solid: a colour block with ink lettering and a hard shadow (use over photos).
   * rubber: keyline + lettering in the tone, transparent, like a rubber stamp on paper.
   */
  variant?: 'solid' | 'rubber'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Degrees. Default -8. */
  rotate?: number
  /** Play the thunk-in animation on mount. */
  thunk?: boolean
  /** Ink-wear voids. Default true for rubber, false for solid. */
  worn?: boolean
  /** Small mono line under the word (a date, a serial). */
  sub?: ReactNode
  className?: string
  style?: CSSProperties
}

/** A rotated, heavy label: LIKE / NOPE / SUPER / MATCH. */
export function Stamp({
  children,
  tone = 'strawberry',
  variant = 'solid',
  size = 'md',
  rotate = -8,
  thunk,
  worn,
  sub,
  className,
  style,
}: StampProps) {
  const isWorn = worn ?? variant === 'rubber'
  return (
    <span
      data-tone={tone}
      className={cx(s.stamp, s[variant], s[size], thunk && s.thunk, isWorn && s.worn, className)}
      style={{ '--stamp-rot': `${rotate}deg`, ...style } as CSSProperties}
    >
      <span className={s.word}>{children}</span>
      {sub ? <span className={s.sub}>{sub}</span> : null}
    </span>
  )
}

export interface StickerProps {
  children: ReactNode
  tone?: Tone
  /** burst: a price-star; circle: a round seal; pill: a rounded label; tag: a square-cornered label. */
  shape?: 'burst' | 'circle' | 'pill' | 'tag'
  /** Diameter for burst / circle, any CSS length. Default 88px. */
  size?: string
  rotate?: number
  /** Play the thunk-in animation on mount. */
  thunk?: boolean
  className?: string
  style?: CSSProperties
}

const BURST = (() => {
  const points: string[] = []
  const n = 14
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 48 : 39
    const a = (Math.PI * i) / n - Math.PI / 2
    points.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return points.join(' ')
})()

/** A sticker slapped on at an angle: price-star bursts, round seals, labels. */
export function Sticker({
  children,
  tone = 'yolk',
  shape = 'burst',
  size,
  rotate = 8,
  thunk,
  className,
  style,
}: StickerProps) {
  return (
    <span
      data-tone={tone}
      className={cx(s.sticker, s[`sh-${shape}`], thunk && s.thunk, className)}
      style={{ '--stamp-rot': `${rotate}deg`, '--sticker-size': size, ...style } as CSSProperties}
    >
      {shape === 'burst' && (
        <svg className={s.burst} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <polygon points={BURST} />
        </svg>
      )}
      <span className={s.stickerText}>{children}</span>
    </span>
  )
}
