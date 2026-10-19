import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { IconX } from '../icons'
import type { Tone } from '../tones'
import s from './Chip.module.css'

export interface ChipProps {
  children: ReactNode
  tone?: Tone
  size?: 'sm' | 'md'
  icon?: ReactNode
  /** Makes the chip a toggle button. */
  onClick?: () => void
  /** Pressed state of a toggle chip (aria-pressed). */
  selected?: boolean
  /** Adds a remove button after the text. */
  onRemove?: () => void
  /** Accessible name of the remove button. Default "Remove". */
  removeLabel?: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * A tag: mono, outlined, pill. Static by default; a toggle with `onClick`; removable with `onRemove`.
 * Interests print as `#tea`: put the hash in the children.
 */
export function Chip({
  children,
  tone = 'paper',
  size = 'md',
  icon,
  onClick,
  selected,
  onRemove,
  removeLabel = 'Remove',
  disabled,
  className,
  style,
}: ChipProps) {
  const cls = cx(s.chip, s[size], onClick && s.clickable, selected && s.selected, onRemove && s.removable, className)
  const body = (
    <>
      {icon ? <span className={s.icon}>{icon}</span> : null}
      <span className={s.text}>{children}</span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        data-tone={tone}
        className={cls}
        style={style}
        aria-pressed={selected ?? undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {body}
      </button>
    )
  }
  return (
    <span data-tone={tone} className={cls} style={style}>
      {body}
      {onRemove ? (
        <button type="button" className={s.remove} aria-label={removeLabel} disabled={disabled} onClick={onRemove}>
          <IconX size={12} strokeWidth={4} />
        </button>
      ) : null}
    </span>
  )
}

export interface BadgeProps {
  children: ReactNode
  tone?: Tone
  /** Degrees; badges often sit at a slight angle. */
  rotate?: number
  icon?: ReactNode
  className?: string
  style?: CSSProperties
}

/** A small solid label: NEW, ONLINE, LIKES YOU. */
export function Badge({ children, tone = 'ink', rotate, icon, className, style }: BadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cx(s.badge, className)}
      style={{ rotate: rotate ? `${rotate}deg` : undefined, ...style }}
    >
      {icon ? <span className={s.icon}>{icon}</span> : null}
      {children}
    </span>
  )
}

export interface CountBadgeProps {
  count: number
  /** Cap, shown as "99+". Default 99. */
  max?: number
  tone?: Tone
  /** Render even when the count is 0. */
  showZero?: boolean
  /** Text for assistive tech, e.g. "unread messages". */
  label?: string
  className?: string
}

/** A round count sticker for unread messages and new likes. Renders nothing at 0. */
export function CountBadge({ count, max = 99, tone = 'strawberry', showZero, label, className }: CountBadgeProps) {
  if (count <= 0 && !showZero) return null
  return (
    <span data-tone={tone} className={cx(s.count, className)}>
      <span aria-hidden={label ? true : undefined}>{count > max ? `${max}+` : count}</span>
      {label ? (
        <span className="sr-only">
          {count} {label}
        </span>
      ) : null}
    </span>
  )
}
