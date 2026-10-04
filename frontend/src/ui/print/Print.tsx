import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { cx, hash } from '../cx'
import type { Tone } from '../tones'
import { TONE_COLOR } from '../tones'
import s from './Print.module.css'

// ------------------------------------------------------------------ Pattern

export type PatternKind = 'dots' | 'halftone' | 'stripes' | 'grid' | 'checks'

export interface PatternProps {
  kind?: PatternKind
  /** The single colour the pattern prints in. */
  tone?: Tone
  /** Stretch over the nearest positioned ancestor (absolute, inset 0). Default true. */
  cover?: boolean
  opacity?: number
  className?: string
  style?: CSSProperties
}

/** A flat, repeating print texture in one colour. Decorative. */
export function Pattern({ kind = 'dots', tone = 'ink', cover = true, opacity, className, style }: PatternProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(s.pattern, s[`p-${kind}`], cover && s.cover, className)}
      style={{ color: TONE_COLOR[tone], opacity, ...style }}
    />
  )
}

// ------------------------------------------------------------------ Halftone

export interface HalftoneProps {
  /** Where the dots are biggest. */
  from?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'bottom-left' | 'top-right'
  tone?: Tone
  /** Dot columns across the tile. More = finer screen. Default 26. */
  columns?: number
  /** Stretch over the nearest positioned ancestor. Default true. */
  cover?: boolean
  opacity?: number
  className?: string
  style?: CSSProperties
}

/**
 * A real halftone ramp: dots on a 45° screen that shrink to nothing.
 * Scales to cover its box (dots stay round). Decorative.
 */
export function Halftone({
  from = 'bottom',
  tone = 'ink',
  columns = 26,
  cover = true,
  opacity,
  className,
  style,
}: HalftoneProps) {
  const dots = useMemo(() => {
    const step = 10
    const rows = Math.round(columns * 1.25)
    const out: Array<{ x: number; y: number; r: number }> = []
    for (let row = 0; row <= rows * 2; row++) {
      for (let col = 0; col <= columns; col++) {
        const x = col * step + (row % 2 ? step / 2 : 0)
        const y = (row * step) / 2
        const u = x / (columns * step)
        const v = y / (rows * step)
        let t: number
        switch (from) {
          case 'top':
            t = 1 - v
            break
          case 'left':
            t = 1 - u
            break
          case 'right':
            t = u
            break
          case 'center':
            t = 1 - Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2)
            break
          case 'bottom-left':
            t = ((1 - u) + v) / 2
            break
          case 'top-right':
            t = (u + (1 - v)) / 2
            break
          default:
            t = v
        }
        const r = Math.max(0, t * 1.25 - 0.18) * step * 0.52
        if (r > 0.35) out.push({ x, y, r: Math.round(r * 100) / 100 })
      }
    }
    return { out, w: columns * step, h: rows * step }
  }, [columns, from])

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cx(s.halftone, cover && s.cover, className)}
      viewBox={`0 0 ${dots.w} ${dots.h}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ color: TONE_COLOR[tone], opacity, ...style }}
    >
      {dots.out.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} />
      ))}
    </svg>
  )
}

// ------------------------------------------------------------------ Perforation

export interface PerforationProps {
  /** holes: a row of punched dots. dashes: a tear line. */
  variant?: 'holes' | 'dashes'
  /** Half-circle notches at both ends, like a ticket stub. Needs `bleed` to reach the card edge. */
  notches?: boolean
  /**
   * How far to extend past the content box on each side (a CSS length), so the line reaches the
   * edges of a padded card. Inside a `Card` this defaults to the card's padding.
   */
  bleed?: string
  /** Background showing through the notches. Default: the page paper. */
  notchColor?: string
  className?: string
  style?: CSSProperties
}

/** A perforated divider: tear here. */
export function Perforation({
  variant = 'dashes',
  notches,
  bleed,
  notchColor,
  className,
  style,
}: PerforationProps) {
  return (
    <div
      role="separator"
      className={cx(s.perf, s[`perf-${variant}`], notches && s.notches, className)}
      style={{ '--perf-bleed': bleed, '--perf-notch': notchColor, ...style } as CSSProperties}
    />
  )
}

// ------------------------------------------------------------------ Serial

export interface SerialProps {
  /** Numbers are zero-padded to `digits`; strings print as given. */
  value: number | string
  /** Default "№". */
  prefix?: string
  digits?: number
  tone?: 'ink' | 'muted' | 'paper'
  className?: string
}

/** A mono serial number: № 000421. */
export function Serial({ value, prefix = '№', digits = 6, tone = 'ink', className }: SerialProps) {
  const text = typeof value === 'number' ? String(Math.abs(Math.trunc(value))).padStart(digits, '0') : value
  return (
    <span className={cx(s.serial, s[`serial-${tone}`], className)}>
      {prefix ? <span className={s.serialPrefix}>{prefix}</span> : null}
      {text}
    </span>
  )
}

// ------------------------------------------------------------------ Barcode

export interface BarcodeProps {
  /** Any string: the bars are derived from it, so the same value always draws the same code. */
  value: string
  /** Bar height in px. Default 36. */
  height?: number
  /** Print the value underneath in mono. */
  caption?: boolean
  tone?: 'ink' | 'paper'
  className?: string
}

/** A decorative barcode ornament (not scannable). */
export function Barcode({ value, height = 36, caption, tone = 'ink', className }: BarcodeProps) {
  const bars = useMemo(() => {
    const out: Array<{ x: number; w: number }> = []
    let x = 0
    let seed = hash(value) || 1
    const next = () => {
      // xorshift32
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      seed >>>= 0
      return seed
    }
    // guard bars
    out.push({ x, w: 1 }, { x: x + 2, w: 1 })
    x += 4
    for (let i = 0; i < 26; i++) {
      const w = 1 + (next() % 3)
      const gap = 1 + (next() % 2)
      out.push({ x, w })
      x += w + gap
    }
    out.push({ x, w: 1 }, { x: x + 2, w: 1 })
    x += 3
    return { out, total: x }
  }, [value])
  return (
    <span className={cx(s.barcode, s[`bc-${tone}`], className)} aria-hidden="true">
      <svg
        viewBox={`0 0 ${bars.total} 10`}
        preserveAspectRatio="none"
        width={bars.total * 1.6}
        height={height}
        shapeRendering="crispEdges"
        focusable="false"
      >
        {bars.out.map((b, i) => (
          <rect key={i} x={b.x} y="0" width={b.w} height="10" />
        ))}
      </svg>
      {caption ? <span className={s.barcodeCaption}>{value}</span> : null}
    </span>
  )
}

// ------------------------------------------------------------------ Crop marks & registration

export interface CropMarksProps {
  /** Length of each mark, px. Default 14. */
  size?: number
  /** Gap between the corner of the box and the marks, px. Default 6. */
  gap?: number
  tone?: Tone
  className?: string
}

/**
 * Printer's crop marks around the four corners of the nearest positioned ancestor.
 * They sit outside the box, so the ancestor must not clip overflow.
 */
export function CropMarks({ size = 14, gap = 6, tone = 'ink', className }: CropMarksProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(s.crop, className)}
      style={{ '--crop-size': `${size}px`, '--crop-gap': `${gap}px`, color: TONE_COLOR[tone] } as CSSProperties}
    >
      <i className={s.tl} />
      <i className={s.tr} />
      <i className={s.bl} />
      <i className={s.br} />
    </span>
  )
}

export interface RegMarkProps {
  size?: number
  tone?: Tone
  className?: string
  style?: CSSProperties
}

/** A registration target: circle and crosshair. */
export function RegMark({ size = 24, tone = 'ink', className, style }: RegMarkProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cx(s.reg, className)}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ color: TONE_COLOR[tone], ...style }}
    >
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 0v24M0 12h24" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  )
}

// ------------------------------------------------------------------ Colour bar

/** A printer's colour bar: one swatch per ink drum. A small sign-off ornament for footers. */
export function ColorBar({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx(s.colorbar, className)}>
      <i style={{ background: 'var(--c-ink)' }} />
      <i style={{ background: 'var(--c-matcha)' }} />
      <i style={{ background: 'var(--c-strawberry)' }} />
      <i style={{ background: 'var(--c-yolk)' }} />
      <i style={{ background: 'var(--c-blue)' }} />
      <i style={{ background: 'var(--c-paper-hi)' }} />
    </span>
  )
}

// ------------------------------------------------------------------ Ticket header

export interface TicketHeaderProps {
  /** Left: what this is ("Boarding pass", "Lot"). */
  label: ReactNode
  /** Right: a serial, a date, a count. */
  meta?: ReactNode
  tone?: 'ink' | 'paper'
  className?: string
}

/** The mono strip that tops a panel: LABEL ———— № 0042. */
export function TicketHeader({ label, meta, tone = 'ink', className }: TicketHeaderProps) {
  return (
    <div className={cx(s.ticketHeader, s[`th-${tone}`], className)}>
      <span>{label}</span>
      <i aria-hidden="true" />
      {meta != null ? <span>{meta}</span> : null}
    </div>
  )
}
