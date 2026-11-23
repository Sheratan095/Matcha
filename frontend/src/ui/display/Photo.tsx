import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { cx, hash } from '../cx'
import type { Tone } from '../tones'
import { TONE_COLOR } from '../tones'
import s from './Photo.module.css'

// ------------------------------------------------------------------ PosterFigure

const PALETTES = [
  { bg: 'var(--c-matcha)', sun: 'var(--c-yolk)', top: 'var(--c-strawberry)', skin: 'var(--c-paper-hi)' },
  { bg: 'var(--c-strawberry)', sun: 'var(--c-paper-hi)', top: 'var(--c-yolk)', skin: 'var(--c-strawberry-tint)' },
  { bg: 'var(--c-yolk)', sun: 'var(--c-strawberry)', top: 'var(--c-matcha)', skin: 'var(--c-paper-hi)' },
  { bg: 'var(--c-blue-tint)', sun: 'var(--c-blue)', top: 'var(--c-yolk)', skin: 'var(--c-paper-hi)' },
  { bg: 'var(--c-paper-lo)', sun: 'var(--c-matcha)', top: 'var(--c-blue)', skin: 'var(--c-yolk-tint)' },
  { bg: 'var(--c-matcha-tint)', sun: 'var(--c-strawberry)', top: 'var(--c-matcha-deep)', skin: 'var(--c-paper-hi)' },
] as const

export interface PosterFigureProps {
  /** Any string (a user id, a name): picks the palette and the haircut deterministically. */
  seed?: string
  /** Accessible name. Decorative when omitted. */
  title?: string
  className?: string
  style?: CSSProperties
}

/**
 * Placeholder artwork for a person: a flat, two-plate poster bust (3:4).
 * Used as the fallback of PhotoFrame and wherever a portrait is missing.
 */
export function PosterFigure({ seed = 'matcha', title, className, style }: PosterFigureProps) {
  const h = hash(seed)
  const p = PALETTES[h % PALETTES.length]
  const hair = (h >>> 4) % 4
  const sunX = 70 + ((h >>> 8) % 3) * 80
  const dotId = `pf-${h.toString(36)}`
  return (
    <svg
      className={cx(s.figure, className)}
      style={style}
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <pattern id={dotId} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="6" cy="6" r="2.6" fill="var(--c-ink)" />
        </pattern>
      </defs>
      <rect width="300" height="400" fill={p.bg} />
      <circle cx={sunX} cy="120" r="92" fill={p.sun} />
      <rect y="250" width="300" height="150" fill={`url(#${dotId})`} opacity="0.22" />
      <g stroke="var(--c-ink)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
        {/* hair behind the head */}
        {hair === 0 && <path fill="var(--c-ink)" d="M84 190c-10-78 22-120 66-120s76 42 66 120l-10 62H94z" />}
        {hair === 3 && <path fill="var(--c-ink)" d="M78 300c-14-120 4-232 72-232s86 112 72 232z" />}
        {/* shoulders */}
        <path fill={p.top} d="M30 404c0-78 52-118 120-118s120 40 120 118z" />
        {/* neck */}
        <path fill={p.skin} d="M126 236h48v52c0 12-11 22-24 22s-24-10-24-22z" />
        {/* head */}
        <ellipse cx="150" cy="170" rx="54" ry="64" fill={p.skin} />
        {/* hair in front */}
        {hair === 0 && <path fill="var(--c-ink)" d="M96 160c2-52 28-74 58-74s52 20 50 66c-30 4-62-8-78-30-6 16-16 30-30 38z" />}
        {hair === 1 && (
          <>
            <circle cx="150" cy="78" r="30" fill="var(--c-ink)" />
            <path fill="var(--c-ink)" d="M96 164c0-44 24-62 54-62s54 18 54 62c-20-10-34-22-40-36-14 18-40 32-68 36z" />
          </>
        )}
        {hair === 2 && <path fill="var(--c-ink)" d="M94 150c2-36 26-52 58-52s54 18 54 54c-14-14-28-20-44-22-22-2-46 6-68 20z" />}
        {hair === 3 && <path fill="var(--c-ink)" d="M96 172c-4-52 20-76 54-76s58 24 54 76c-10-22-28-40-52-44-22 6-42 22-56 44z" />}
      </g>
      {/* a single misregistered cheek dot */}
      <circle cx="178" cy="196" r="11" fill="var(--c-strawberry)" opacity="0.85" />
    </svg>
  )
}

// ------------------------------------------------------------------ PhotoFrame

export interface PhotoFrameProps {
  src?: string | null
  /** Describe the person / picture; empty string for decorative photos. */
  alt: string
  /** CSS aspect-ratio. Default "3 / 4". Use "auto" to let a parent size the frame. */
  ratio?: string
  /**
   * none: the photo as it is.
   * duotone: one ink plate over a colour field.
   * halftone: a pure-CSS CMYK print on paper, with its own black plate (the --fx-halftone-* tokens: 9px
   * dots by default, override them on the frame). Needs a source with a tonal range: flat artwork, and so
   * the PosterFigure fallback, comes out sparse. `tone` does not apply.
   */
  treatment?: 'none' | 'duotone' | 'halftone'
  /** The colour field of the duotone. Default matcha. */
  tone?: Tone
  /** Seed for the PosterFigure fallback (use the user id). */
  seed?: string
  /** Outline and rounded corners. Default true. */
  framed?: boolean
  /** Hard shadow depth, 0–4. Default 0. */
  shadow?: 0 | 1 | 2 | 3 | 4
  radius?: 'sm' | 'md' | 'lg' | 'xl' | 'none'
  tilt?: number
  loading?: 'lazy' | 'eager'
  /** Overlay content, positioned over the photo (the frame is `position: relative`). */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

/** A photo with the house outline, a poster fallback, and optional print treatments. */
export function PhotoFrame({
  src,
  alt,
  ratio = '3 / 4',
  treatment = 'none',
  tone = 'matcha',
  seed,
  framed = true,
  shadow = 0,
  radius = 'lg',
  tilt,
  loading = 'lazy',
  children,
  className,
  style,
}: PhotoFrameProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const usable = src && failedSrc !== src
  // `decorative` is the second copy of the picture (the halftone's black plate): hidden from assistive tech
  const picture = (decorative = false) =>
    usable ? (
      <img
        className={s.img}
        src={src}
        alt={decorative ? '' : alt}
        loading={loading}
        decoding="async"
        draggable={false}
        onError={() => setFailedSrc(src)}
      />
    ) : (
      <PosterFigure seed={seed ?? alt ?? 'matcha'} title={decorative ? undefined : alt || undefined} className={s.img} />
    )
  return (
    <div
      className={cx(
        s.frame,
        framed && s.framed,
        s[`sh-${shadow}`],
        s[`r-${radius}`],
        treatment === 'duotone' && s.duotone,
        treatment === 'halftone' && s.halftone,
        className,
      )}
      style={
        {
          aspectRatio: ratio === 'auto' ? undefined : ratio,
          '--photo-tone': TONE_COLOR[tone],
          rotate: tilt ? `${tilt}deg` : undefined,
          ...style,
        } as CSSProperties
      }
    >
      {treatment === 'halftone' ? (
        <div className={s.plates}>
          <div className={cx(s.plate, s.plateColour)}>
            {picture()}
            <div className={s.ink} />
          </div>
          <div className={cx(s.plate, s.plateBlack)}>{picture(true)}</div>
        </div>
      ) : (
        picture()
      )}
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ Avatar

const AVATAR_TONES = ['matcha', 'strawberry', 'yolk', 'blue', 'kraft'] as const satisfies readonly Tone[]

export interface AvatarProps {
  src?: string | null
  /** Used for the alt text, the initials fallback and the fallback colour. */
  name: string
  /** xs 28, sm 36, md 48, lg 64, xl 96, 2xl 132 px. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  /** Shows the presence dot: true = online (matcha), false = offline (kraft). Omit for none. */
  online?: boolean
  /** circle (default) or a rounded tile. */
  shape?: 'circle' | 'tile'
  /** Hard shadow under the avatar. */
  shadow?: boolean
  /** Hide from assistive tech (when the name is printed right next to it). */
  decorative?: boolean
  className?: string
  style?: CSSProperties
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** A person's picture, or their initials on a colour field. */
export function Avatar({
  src,
  name,
  size = 'md',
  online,
  shape = 'circle',
  shadow,
  decorative,
  className,
  style,
}: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const usable = src && failedSrc !== src
  const tone = AVATAR_TONES[hash(name) % AVATAR_TONES.length]
  return (
    <span
      className={cx(s.avatar, s[`av-${size}`], s[`av-${shape}`], shadow && s.avShadow, className)}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : online == null ? name : `${name}, ${online ? 'online' : 'offline'}`}
      aria-hidden={decorative || undefined}
    >
      <span className={s.avFace} data-tone={tone}>
        {usable ? (
          <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} />
        ) : (
          <span className={s.initials}>{initials(name)}</span>
        )}
      </span>
      {online != null ? <span className={cx(s.dot, online && s.dotOn)} /> : null}
    </span>
  )
}
