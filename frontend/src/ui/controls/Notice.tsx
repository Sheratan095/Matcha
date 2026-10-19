import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { IconCheck, IconInfo, IconWarning, IconX } from '../icons'
import type { Tone } from '../tones'
import s from './Notice.module.css'

export type NoticeTone = 'error' | 'success' | 'info' | 'warning'

const LOOK: Record<NoticeTone, { tone: Tone; icon: ReactNode; kicker: string }> = {
  error: { tone: 'strawberry', icon: <IconWarning size={20} strokeWidth={2.75} />, kicker: 'Misprint' },
  success: { tone: 'matcha', icon: <IconCheck size={20} strokeWidth={3.5} />, kicker: 'Good to go' },
  info: { tone: 'blue', icon: <IconInfo size={20} strokeWidth={2.75} />, kicker: 'Note' },
  warning: { tone: 'yolk', icon: <IconWarning size={20} strokeWidth={2.75} />, kicker: 'Heads up' },
}

export interface NoticeProps {
  tone?: NoticeTone
  /** Bold first line. */
  title?: ReactNode
  children?: ReactNode
  /** Replace the default icon. */
  icon?: ReactNode
  /** Trailing action (a small Button). */
  action?: ReactNode
  /** Shows a close button. */
  onDismiss?: () => void
  /** ARIA role. Default: "alert" for errors, "status" otherwise. */
  role?: 'alert' | 'status' | 'note'
  className?: string
  style?: CSSProperties
}

/** An inline banner: a tinted slip with a colour tab down its left edge. */
export function Notice({ tone = 'info', title, children, icon, action, onDismiss, role, className, style }: NoticeProps) {
  const look = LOOK[tone]
  return (
    <div
      data-tone={look.tone}
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cx(s.notice, className)}
      style={style}
    >
      <span className={s.tab} aria-hidden="true">
        {icon ?? look.icon}
      </span>
      <div className={s.body}>
        <span className={s.kicker}>{look.kicker}</span>
        {title ? <p className={s.title}>{title}</p> : null}
        {children ? <div className={s.text}>{children}</div> : null}
        {action ? <div className={s.action}>{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className={s.close} aria-label="Dismiss" onClick={onDismiss}>
          <IconX size={16} strokeWidth={3.5} />
        </button>
      ) : null}
    </div>
  )
}

/** Anything a failed request can hand us: a string, a list, or an ApiError-like object. */
export type FormErrorInput =
  | string
  | readonly string[]
  | { message: string; messages?: readonly string[] }
  | null
  | undefined

export interface FormErrorProps {
  /** Renders nothing when null / undefined / empty. Accepts an `ApiError` as is. */
  error: FormErrorInput
  /** Bold first line. Default: the single message, or "Please fix the following" for several. */
  title?: ReactNode
  action?: ReactNode
  className?: string
}

/** The form-level error banner. Put it above the submit button. */
export function FormError({ error, title, action, className }: FormErrorProps) {
  if (!error) return null
  const list: readonly string[] =
    typeof error === 'string'
      ? [error]
      : Array.isArray(error)
        ? (error as readonly string[])
        : ((error as { messages?: readonly string[] }).messages?.length
            ? (error as { messages: readonly string[] }).messages
            : [(error as { message: string }).message])
  const messages = list.filter(Boolean)
  if (messages.length === 0) return null
  if (messages.length === 1) {
    return (
      <Notice tone="error" title={title ?? messages[0]} action={action} className={className}>
        {title ? messages[0] : null}
      </Notice>
    )
  }
  return (
    <Notice tone="error" title={title ?? 'Please fix the following'} action={action} className={className}>
      <ul className={s.list}>
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </Notice>
  )
}
