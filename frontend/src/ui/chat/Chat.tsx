import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { Spinner } from '../display/Loader'
import { IconCheck, IconSend, IconWarning } from '../icons'
import s from './Chat.module.css'

// ------------------------------------------------------------------ ChatBubble

export interface ChatBubbleProps {
  /** mine: right, matcha. theirs: left, paper. */
  side: 'mine' | 'theirs'
  children: ReactNode
  /** Preformatted time ("14:02"). */
  time?: string
  /** Delivery state of my own messages. */
  status?: 'sending' | 'sent' | 'read' | 'failed'
  /**
   * Where the bubble sits in a run of messages from the same side: the tail corner is drawn on
   * `single` and `last`; `first`/`middle` sit tighter. Default single.
   */
  position?: 'single' | 'first' | 'middle' | 'last'
  /** Show the time and status line. Default: on single and last. */
  showMeta?: boolean
  className?: string
}

/** One message. Group consecutive bubbles from the same side with `position`. */
export function ChatBubble({ side, children, time, status, position = 'single', showMeta, className }: ChatBubbleProps) {
  const meta = showMeta ?? (position === 'single' || position === 'last')
  return (
    <div className={cx(s.line, s[side], s[`pos-${position}`], className)}>
      <div className={cx(s.bubble, status === 'failed' && s.failed, status === 'sending' && s.sending)}>{children}</div>
      {meta && (time || status) ? (
        <span className={s.meta}>
          {time ? <time>{time}</time> : null}
          {side === 'mine' && status ? (
            <span className={s.status}>
              {status === 'sending' ? (
                <Spinner size={12} label="Sending" />
              ) : status === 'failed' ? (
                <>
                  <IconWarning size={13} strokeWidth={3} />
                  Not sent
                </>
              ) : status === 'read' ? (
                <>
                  <IconCheck size={13} strokeWidth={3.5} />
                  Read
                </>
              ) : (
                <>
                  <IconCheck size={13} strokeWidth={3.5} />
                  Sent
                </>
              )}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ TypingIndicator

/** "…" bubble on their side while they type. */
export function TypingIndicator({ name }: { name?: string }) {
  return (
    <div className={cx(s.line, s.theirs, s['pos-single'])} role="status" aria-live="polite">
      <div className={cx(s.bubble, s.typing)}>
        <i />
        <i />
        <i />
        <span className="sr-only">{name ? `${name} is typing` : 'Typing'}</span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ DayDivider

/** A mono date slug between rules: TODAY, YESTERDAY, 12 MAR. */
export function DayDivider({ children }: { children: ReactNode }) {
  return (
    <div className={s.day} role="separator">
      <span>{children}</span>
    </div>
  )
}

// ------------------------------------------------------------------ ChatComposer

export interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  /** Called with the trimmed text on Enter (Shift+Enter makes a new line) or on the send button. */
  onSend: (text: string) => void
  placeholder?: string
  /** Default 1000 (the API limit). */
  maxLength?: number
  disabled?: boolean
  /** Shows a spinner in the send button. */
  sending?: boolean
  /** Accessible name of the text box. Default "Message". */
  label?: string
  className?: string
}

/** The message box pinned under a conversation: grows to five lines, sends with Enter. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder = 'Write something nice…',
  maxLength = 1000,
  disabled,
  sending,
  label = 'Message',
  className,
}: ChatComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const text = value.trim()
  const canSend = text.length > 0 && !disabled && !sending

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 5 * 22 + 22)}px`
  }, [value])

  const send = () => {
    if (canSend) onSend(text)
  }

  return (
    <form
      className={cx(s.composer, className)}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <label className={s.box}>
        <span className="sr-only">{label}</span>
        <textarea
          ref={ref}
          className={s.textarea}
          rows={1}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          enterKeyHint="send"
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        {value.length > maxLength * 0.8 ? (
          <span className={s.count} aria-live="polite">
            {maxLength - value.length}
          </span>
        ) : null}
      </label>
      <button type="submit" className={s.send} disabled={!canSend} aria-label="Send">
        {sending ? <Spinner size={22} label="" /> : <IconSend size={22} filled />}
      </button>
    </form>
  )
}

// ------------------------------------------------------------------ ChatThread

/** The scrolling column that holds bubbles, typing indicators and day dividers (role="log"). */
export function ChatThread({ children, label = 'Messages', className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div role="log" aria-label={label} aria-live="polite" className={cx(s.thread, className)}>
      {children}
    </div>
  )
}
