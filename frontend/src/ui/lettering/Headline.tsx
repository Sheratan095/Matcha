import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cx } from '../cx'
import type { Tone } from '../tones'
import { TONE_COLOR } from '../tones'
import s from './Headline.module.css'

export type HeadlineSize = 'mega' | 'd1' | 'd2' | 'd3' | 'd4' | 'd5'
export type TypeWidth = 'condensed' | 'narrow' | 'normal' | 'wide' | 'expanded'
/**
 * How the word is "printed":
 * - solid:     one plate.
 * - riso:      the ink plate with a second colour peeking out, misregistered.
 * - overprint: two colour plates multiplied over each other (children must be text).
 * - outline:   paper letters with an ink keyline and a colour plate behind.
 */
export type HeadlinePrint = 'solid' | 'riso' | 'overprint' | 'outline'

export interface HeadlineProps {
  as?: ElementType
  size?: HeadlineSize
  width?: TypeWidth
  print?: HeadlinePrint
  /** Colour of the main plate. Default ink. */
  ink?: Tone
  /** Colour of the misregistered plate. Default matcha. */
  offset?: Tone
  align?: 'start' | 'center' | 'end'
  italic?: boolean
  /** Break the solid ink with small voids, like a worn letterpress block. */
  worn?: boolean
  /** Keep on one line (for words meant to be cropped by their container). */
  nowrap?: boolean
  id?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** Display lettering: uppercase Archivo 900 with tight leading. */
export function Headline({
  as: Tag = 'h2',
  size = 'd2',
  width = 'normal',
  print = 'solid',
  ink = 'ink',
  offset = 'matcha',
  align,
  italic,
  worn,
  nowrap,
  id,
  className,
  style,
  children,
}: HeadlineProps) {
  const vars = {
    '--hl-ink': TONE_COLOR[ink],
    '--hl-offset': TONE_COLOR[offset],
    ...style,
  } as CSSProperties
  return (
    <Tag
      id={id}
      className={cx(
        s.headline,
        s[size],
        s[`w-${width}`],
        s[print],
        align && s[`a-${align}`],
        italic && s.italic,
        worn && s.worn,
        nowrap && s.nowrap,
        className,
      )}
      style={vars}
    >
      {print === 'overprint' ? (
        <>
          <span className={s.plate}>{children}</span>
          <span className={s.ghost} aria-hidden="true">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </Tag>
  )
}

export interface PosterWordProps {
  children: ReactNode
  /** Any CSS length. Default 34vw. */
  size?: string
  width?: TypeWidth
  tone?: Tone
  /** Draw as a keyline only. */
  outline?: boolean
  rotate?: number
  opacity?: number
  className?: string
  style?: CSSProperties
}

/**
 * A giant decorative word, meant to be absolutely positioned and cropped by its parent
 * (which needs `position: relative; overflow: hidden`). Hidden from assistive tech.
 */
export function PosterWord({
  children,
  size = '34vw',
  width = 'condensed',
  tone = 'ink',
  outline,
  rotate,
  opacity,
  className,
  style,
}: PosterWordProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(s.poster, s[`w-${width}`], outline && s.posterOutline, className)}
      style={
        {
          '--pw-size': size,
          '--pw-color': TONE_COLOR[tone],
          rotate: rotate ? `${rotate}deg` : undefined,
          opacity,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </span>
  )
}
