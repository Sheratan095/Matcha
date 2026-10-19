import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cx } from '../cx'
import { TicketHeader } from '../print/Print'
import type { Tone } from '../tones'
import s from './Card.module.css'

export interface CardProps {
  as?: ElementType
  /** The colour field. Default paper (card stock). */
  tone?: Tone
  /** Hard shadow depth, 0 (flat) to 4. Default 2. */
  shadow?: 0 | 1 | 2 | 3 | 4
  pad?: 'none' | 'sm' | 'md' | 'lg'
  radius?: 'sm' | 'md' | 'lg' | 'xl'
  /** Degrees of rotation, for things lying loose on the page. */
  tilt?: number
  /** An inner keyline, like the rim of a tin lid. */
  rim?: boolean
  /** Dashed outline and no shadow: a placeholder / drop zone. */
  dashed?: boolean
  /** Clip overflowing children (photos or patterns that bleed to the edge). */
  clip?: boolean
  /** Ticket strip at the top: mono label on the left... */
  label?: ReactNode
  /** ...and a serial / date / count on the right. */
  meta?: ReactNode
  id?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
  'aria-labelledby'?: string
  'aria-label'?: string
  role?: string
}

const DARK: ReadonlySet<Tone> = new Set<Tone>(['ink', 'deep', 'blue'])

/**
 * The "tin": the kit's panel. Outlined, hard-shadowed, flat colour.
 * Exposes its padding as --card-pad so a Perforation inside reaches the edges on its own.
 */
export function Card({
  as: Tag = 'div',
  tone = 'paper',
  shadow = 2,
  pad = 'md',
  radius = 'lg',
  tilt,
  rim,
  dashed,
  clip,
  label,
  meta,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const dark = DARK.has(tone)
  return (
    <Tag
      data-tone={tone}
      data-surface={dark ? 'ink' : undefined}
      className={cx(
        s.card,
        s[`sh-${shadow}`],
        s[`pad-${pad}`],
        s[`r-${radius}`],
        rim && s.rim,
        dashed && s.dashed,
        clip && s.clip,
        className,
      )}
      style={{ rotate: tilt ? `${tilt}deg` : undefined, ...style }}
      {...rest}
    >
      {label != null || meta != null ? (
        <TicketHeader label={label} meta={meta} tone={dark ? 'paper' : 'ink'} className={s.header} />
      ) : null}
      {children}
    </Tag>
  )
}
