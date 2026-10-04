import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { LogoMark } from '../lettering/Wordmark'
import s from './Loader.module.css'

export interface SpinnerProps {
  /** Pixel size. Default 20. */
  size?: number
  /** Accessible label. Default "Loading". Pass an empty string when a parent already announces it. */
  label?: string
  className?: string
}

/** A registration mark that clicks round in eight steps. Inherits currentColor. */
export function Spinner({ size = 20, label = 'Loading', className }: SpinnerProps) {
  return (
    <svg
      className={cx(s.spinner, className)}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 1v8M12 15v8M1 12h8M15 12h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="5" r="2.6" fill="currentColor" />
    </svg>
  )
}

export interface LoaderProps {
  /** Mono caption under the mark. Default "Whisking". */
  children?: ReactNode
  /** Fill the available height and centre (for whole-page loading). */
  fill?: boolean
  className?: string
  style?: CSSProperties
}

/** The page-level loader: the brand tile being stamped onto the paper, over and over. */
export function Loader({ children = 'Whisking', fill, className, style }: LoaderProps) {
  return (
    <div className={cx(s.loader, fill && s.fill, className)} style={style} role="status" aria-live="polite">
      <span className={s.pad}>
        <span className={s.tile}>
          <LogoMark size={56} flat />
        </span>
      </span>
      <span className={s.caption}>
        {children}
        <span className={s.dots} aria-hidden="true">
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </span>
    </div>
  )
}

export interface SkeletonProps {
  /** CSS width. Default 100%. */
  width?: string | number
  /** CSS height. Default 1em (a line of text). */
  height?: string | number
  /** block: a rounded rectangle. text: a line. circle: an avatar. */
  shape?: 'block' | 'text' | 'circle'
  className?: string
  style?: CSSProperties
}

/** A placeholder with moving make-ready stripes, shown while content loads. */
export function Skeleton({ width, height, shape = 'block', className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(s.skeleton, s[`sk-${shape}`], className)}
      style={{ width, height, ...style }}
    />
  )
}
