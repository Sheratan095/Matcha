import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import { IconX } from '../icons'
import type { Tone } from '../tones'
import s from './Modal.module.css'

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

const EXIT_MS = 200

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

let lockCount = 0
function lockScroll() {
  lockCount++
  if (lockCount === 1) {
    const gap = window.innerWidth - document.documentElement.clientWidth
    document.documentElement.style.setProperty('--scrollbar-gap', `${gap}px`)
    document.documentElement.setAttribute('data-scroll-lock', '')
  }
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.documentElement.removeAttribute('data-scroll-lock')
    document.documentElement.style.removeProperty('--scrollbar-gap')
  }
}

export interface ModalProps {
  open: boolean
  /** Called on Escape, on the close button and on a click on the scrim (when dismissible). */
  onClose: () => void
  /** Heading of the dialog; also its accessible name. */
  title: ReactNode
  /** Keep the title for assistive tech only (e.g. a profile sheet that prints its own name). */
  hideTitle?: boolean
  /** Mono label above the title. */
  kicker?: ReactNode
  children?: ReactNode
  /** Actions row, pinned to the bottom of the panel. */
  footer?: ReactNode
  /**
   * auto: a bottom sheet on phones, a centred dialog from 640px. sheet / dialog force one look.
   * takeover: the whole viewport, no header chrome (celebrations such as the match moment).
   */
  variant?: 'auto' | 'sheet' | 'dialog' | 'takeover'
  /** Dialog width: sm 400, md 520, lg 680. */
  size?: 'sm' | 'md' | 'lg'
  /** Panel colour. Default paper. */
  tone?: Tone
  /** Remove the body padding (content that bleeds to the edges, like a photo). */
  bleed?: boolean
  /** Escape and the scrim close it. Default true. Set false for a blocking step. */
  dismissible?: boolean
  /** Element to focus on open. Default: the first focusable element in the body, else the panel. */
  initialFocus?: RefObject<HTMLElement | null>
  className?: string
  style?: CSSProperties
}

/**
 * A modal: bottom sheet on phones, centred dialog on wide screens.
 * Traps focus, closes on Escape, locks page scroll, makes the rest of the page inert,
 * and gives focus back to whatever opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  hideTitle,
  kicker,
  children,
  footer,
  variant = 'auto',
  size = 'md',
  tone = 'paper',
  bleed,
  dismissible = true,
  initialFocus,
  className,
  style,
}: ModalProps) {
  // `present` = mounted: it turns on with `open` and off once the exit animation has played.
  const [present, setPresent] = useState(open)
  if (open && !present) setPresent(true)
  const closing = present && !open
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')))
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // unmount once the exit animation has played
  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => setPresent(false), reducedMotion() ? 0 : EXIT_MS)
    return () => window.clearTimeout(t)
  }, [closing])

  // portal host: attached to <body> while mounted
  useLayoutEffect(() => {
    if (!present || !host) return
    host.setAttribute('data-modal-host', '')
    document.body.appendChild(host)
    return () => host.remove()
  }, [present, host])

  // scroll lock + inert background + focus in / focus back
  useEffect(() => {
    if (!present || !host) return
    restoreRef.current = document.activeElement as HTMLElement | null
    lockScroll()
    const inerted: HTMLElement[] = []
    for (const child of Array.from(document.body.children)) {
      if (child === host || !(child instanceof HTMLElement)) continue
      if (child.hasAttribute('data-toaster') || child.inert) continue
      child.inert = true
      inerted.push(child)
    }
    const panel = panelRef.current
    const target = initialFocus?.current ?? bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel
    target?.focus({ preventScroll: true })
    return () => {
      unlockScroll()
      for (const el of inerted) el.inert = false
      const back = restoreRef.current
      if (back && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [present, host, initialFocus])

  // Escape + focus trap
  useEffect(() => {
    if (!present || !host) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      )
      if (nodes.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      } else if (!panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    host.addEventListener('keydown', onKey)
    return () => host.removeEventListener('keydown', onKey)
  }, [present, host, dismissible])

  if (!present || !host) return null

  const dark = tone === 'ink' || tone === 'deep' || tone === 'blue'
  return createPortal(
    <div className={cx(s.root, s[variant], closing && s.closing)}>
      <div className={s.scrim} aria-hidden="true" onClick={dismissible ? () => onCloseRef.current() : undefined} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-tone={tone}
        data-surface={dark ? 'ink' : undefined}
        className={cx(s.panel, s[`size-${size}`], className)}
        style={style}
      >
        <span className={s.grip} aria-hidden="true" />
        <header className={cx(s.head, hideTitle && s.headHidden)}>
          <div className={cx(s.titles, hideTitle && 'sr-only')}>
            {kicker ? <span className={s.kicker}>{kicker}</span> : null}
            <h2 id={titleId} className={s.title}>
              {title}
            </h2>
          </div>
          <button type="button" className={s.close} aria-label="Close" onClick={() => onCloseRef.current()}>
            <IconX size={20} strokeWidth={3.5} />
          </button>
        </header>
        <div ref={bodyRef} className={cx(s.body, bleed && s.bleed)}>{children}</div>
        {footer ? <div className={s.footer}>{footer}</div> : null}
      </div>
    </div>,
    host,
  )
}

export type SheetProps = Omit<ModalProps, 'variant'>

/** A Modal that is always a bottom sheet (filters, action lists). */
export function Sheet(props: SheetProps) {
  return <Modal {...props} variant="sheet" />
}
