import type { CSSProperties } from 'react'
import { cx } from '../cx'
import s from './Wordmark.module.css'

export interface LogoMarkProps {
  /** Pixel size. Default 32. */
  size?: number
  /** Flat tile without the hard shadow. */
  flat?: boolean
  title?: string
  className?: string
}

/**
 * The brand mark: a tea-tin tile carrying a heart that is also two leaves.
 * The same drawing is used for the favicon.
 */
export function LogoMark({ size = 32, flat, title, className }: LogoMarkProps) {
  return (
    <svg
      className={cx(s.mark, className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {!flat && <rect x="6" y="6" width="32" height="32" rx="9" fill="var(--c-ink)" />}
      <rect
        x="2.5"
        y="2.5"
        width={flat ? 35 : 32}
        height={flat ? 35 : 32}
        rx="8"
        fill="var(--c-matcha)"
        stroke="var(--c-ink)"
        strokeWidth="3"
      />
      <g transform={flat ? 'translate(20 20.5)' : 'translate(18.5 19)'}>
        <path
          fill="var(--c-ink)"
          d="M0 10.5C-6.6 6-10 1.8-10-2.7c0-3.3 2.4-5.5 5.2-5.5C-2.6-8.2-1-7 0-5.2 1-7 2.6-8.2 4.8-8.2 7.6-8.2 10-6 10-2.7 10 1.8 6.6 6 0 10.5z"
        />
        <path
          fill="none"
          stroke="var(--c-matcha)"
          strokeWidth="1.7"
          strokeLinecap="round"
          d="M0-4.2V7.5M0 .2l-3.8-3M0 .2l3.8-3M0 4l-3.2-2.5M0 4l3.2-2.5"
        />
      </g>
    </svg>
  )
}

export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Show the tile mark before the lettering. Default true. */
  mark?: boolean
  /** Mono strapline under the lettering. */
  tagline?: string | boolean
  /** `paper` for use on ink / dark fields. */
  tone?: 'ink' | 'paper'
  className?: string
  style?: CSSProperties
}

const MARK_PX = { sm: 26, md: 34, lg: 48, xl: 72 } as const

/** The MATCHA lockup: tile mark + expanded heavy lettering with a misregistered green plate. */
export function Wordmark({ size = 'md', mark = true, tagline, tone = 'ink', className, style }: WordmarkProps) {
  const strap = tagline === true ? 'Press edition' : tagline
  return (
    <span className={cx(s.wordmark, s[size], s[tone], className)} style={style}>
      {mark && <LogoMark size={MARK_PX[size]} />}
      <span className={s.lockup}>
        <span className={s.letters}>Matcha</span>
        {strap ? <span className={s.strap}>{strap}</span> : null}
      </span>
    </span>
  )
}
