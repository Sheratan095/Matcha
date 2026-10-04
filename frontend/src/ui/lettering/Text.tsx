import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cx } from '../cx'
import s from './Text.module.css'

export type LabelTone = 'ink' | 'muted' | 'matcha' | 'strawberry' | 'yolk' | 'blue' | 'paper'

export interface LabelProps {
  as?: ElementType
  /** md 12px (default), sm 11px, lg 14px. */
  size?: 'sm' | 'md' | 'lg'
  tone?: LabelTone
  /** Ticket box: outlined, padded. */
  boxed?: boolean
  /** Solid ink ticket with paper text. */
  inverse?: boolean
  /** Regular weight instead of bold. */
  light?: boolean
  htmlFor?: string
  id?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** The mono "ticket" label: Space Mono, uppercase, tracked. For metadata, kickers, numbering. */
export function Label({
  as: Tag = 'span',
  size = 'md',
  tone = 'ink',
  boxed,
  inverse,
  light,
  className,
  children,
  ...rest
}: LabelProps) {
  return (
    <Tag
      className={cx(
        s.label,
        s[`l-${size}`],
        s[`t-${tone}`],
        boxed && s.boxed,
        inverse && s.inverse,
        light && s.light,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export interface TextProps {
  as?: ElementType
  size?: 'lead' | 'body' | 'sm' | 'xs'
  muted?: boolean
  /** Semi-bold. */
  strong?: boolean
  align?: 'start' | 'center' | 'end'
  /** Clamp to this many lines with an ellipsis. */
  lines?: number
  id?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** Running text in Archivo at normal width. */
export function Text({
  as: Tag = 'p',
  size = 'body',
  muted,
  strong,
  align,
  lines,
  className,
  style,
  children,
  ...rest
}: TextProps) {
  return (
    <Tag
      className={cx(
        s.text,
        s[`x-${size}`],
        muted && s.muted,
        strong && s.strong,
        align && s[`a-${align}`],
        lines ? s.clamp : undefined,
        className,
      )}
      style={lines ? ({ '--lines': lines, ...style } as CSSProperties) : style}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Content for screen readers only. */
export function VisuallyHidden({ as: Tag = 'span', children }: { as?: ElementType; children: ReactNode }) {
  return <Tag className="sr-only">{children}</Tag>
}
