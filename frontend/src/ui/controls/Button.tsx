import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../cx'
import { Spinner } from '../display/Loader'
import { IconHeart, IconStar, IconUndo, IconX } from '../icons'
import type { Tone } from '../tones'
import s from './Button.module.css'

/** matcha = primary. paper = outline. ghost = text-only. */
export type ButtonVariant = 'matcha' | 'ink' | 'strawberry' | 'yolk' | 'blue' | 'paper' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonLook {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Full width of the container. */
  block?: boolean
  /** Leading icon. */
  icon?: ReactNode
  /** Trailing icon. */
  iconRight?: ReactNode
}

function tone(variant: ButtonVariant): Tone {
  return variant === 'ghost' ? 'paper' : variant
}

function classes(look: ButtonLook, extra?: string | false) {
  const { variant = 'matcha', size = 'md', block } = look
  return cx(s.button, s[size], variant === 'ghost' && s.ghost, block && s.block, extra)
}

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'>, ButtonLook {
  /** Shows a spinner, sets aria-busy and ignores clicks. */
  loading?: boolean
  children?: ReactNode
}

/** The press button: outlined, hard-shadowed, and it travels into its shadow when pushed. */
export function Button({
  variant = 'matcha',
  size = 'md',
  block,
  icon,
  iconRight,
  loading,
  disabled,
  type = 'button',
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      data-tone={tone(variant)}
      className={classes({ variant, size, block }, cx(loading && s.loading, className))}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? (
        <span className={s.icon}>
          <Spinner size={size === 'lg' ? 22 : 18} label="" />
        </span>
      ) : icon ? (
        <span className={s.icon}>{icon}</span>
      ) : null}
      {children != null && <span className={s.label}>{children}</span>}
      {iconRight ? <span className={s.icon}>{iconRight}</span> : null}
    </button>
  )
}

export interface ButtonLinkProps extends ButtonLook {
  /** In-app route (react-router). */
  to?: string
  /** Plain href: external pages or top-level navigations such as the GitHub OAuth redirect. */
  href?: string
  target?: string
  rel?: string
  replace?: boolean
  className?: string
  style?: CSSProperties
  'aria-label'?: string
  children?: ReactNode
}

/** A link that looks and presses like a Button. */
export function ButtonLink({
  to,
  href,
  variant = 'matcha',
  size = 'md',
  block,
  icon,
  iconRight,
  className,
  children,
  replace,
  ...rest
}: ButtonLinkProps) {
  const body = (
    <>
      {icon ? <span className={s.icon}>{icon}</span> : null}
      {children != null && <span className={s.label}>{children}</span>}
      {iconRight ? <span className={s.icon}>{iconRight}</span> : null}
    </>
  )
  const cls = classes({ variant, size, block }, className)
  if (to != null) {
    return (
      <Link to={to} replace={replace} data-tone={tone(variant)} className={cls} {...rest}>
        {body}
      </Link>
    )
  }
  return (
    <a href={href} data-tone={tone(variant)} className={cls} {...rest}>
      {body}
    </a>
  )
}

// ------------------------------------------------------------------ IconButton

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  /** Accessible name (also the tooltip). Required: the button has no visible text. */
  label: string
  children: ReactNode
  variant?: ButtonVariant
  /** sm 36px (44px hit area), md 44px, lg 52px. */
  size?: ButtonSize
  /** Round instead of rounded-square. */
  round?: boolean
  /** Small count sticker on the corner. Hidden at 0. */
  badge?: number
}

/** A square (or round) button holding one icon. */
export function IconButton({
  label,
  children,
  variant = 'paper',
  size = 'md',
  round,
  badge,
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={badge ? `${label} (${badge})` : label}
      title={label}
      data-tone={tone(variant)}
      className={cx(
        s.button,
        s.iconButton,
        s[`ib-${size}`],
        variant === 'ghost' && s.ghost,
        round && s.round,
        className,
      )}
      {...rest}
    >
      {children}
      {badge ? (
        <span className={s.badge} aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  )
}

// ------------------------------------------------------------------ ActionButton

export type ActionKind = 'pass' | 'like' | 'superlike' | 'rewind'

const ACTIONS: Record<ActionKind, { tone: Tone; label: string; icon: (px: number) => ReactNode }> = {
  pass: { tone: 'paper', label: 'Pass', icon: (px) => <IconX size={px} strokeWidth={4} /> },
  like: { tone: 'strawberry', label: 'Like', icon: (px) => <IconHeart size={px} filled /> },
  superlike: { tone: 'yolk', label: 'Super like', icon: (px) => <IconStar size={px} filled /> },
  rewind: { tone: 'blue', label: 'Rewind', icon: (px) => <IconUndo size={px} strokeWidth={3} /> },
}

export interface ActionButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  /** A deck preset: sets the tone, the icon and the accessible name. */
  kind?: ActionKind
  /** Override the preset's tone, or set it for a custom action. */
  tone?: Tone
  /** Accessible name. Defaults to the preset's. */
  label?: string
  /** md 56px, lg 68px, xl 80px. */
  size?: 'md' | 'lg' | 'xl'
  /** Custom icon (overrides the preset's). */
  children?: ReactNode
}

const ACTION_ICON_PX = { md: 24, lg: 30, xl: 36 } as const

/** The big round deck buttons: pass, like, super-like, rewind. */
export function ActionButton({
  kind,
  tone: toneProp,
  label,
  size = 'lg',
  type = 'button',
  className,
  children,
  ...rest
}: ActionButtonProps) {
  const preset = kind ? ACTIONS[kind] : undefined
  const name = label ?? preset?.label ?? 'Action'
  return (
    <button
      type={type}
      aria-label={name}
      title={name}
      data-tone={toneProp ?? preset?.tone ?? 'paper'}
      className={cx(s.button, s.action, s[`ac-${size}`], className)}
      {...rest}
    >
      {children ?? preset?.icon(ACTION_ICON_PX[size])}
    </button>
  )
}
