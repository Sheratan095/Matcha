import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import { IconBell, IconCheck, IconHeart, IconInfo, IconWarning, IconX } from '../icons'
import { toast } from './toast'
import type { ToastItem, ToastTone } from './toast'
import s from './Toaster.module.css'

const ICON: Record<ToastTone, ReactNode> = {
  ink: <IconBell size={22} />,
  matcha: <IconCheck size={22} strokeWidth={3.5} />,
  strawberry: <IconWarning size={22} strokeWidth={2.75} />,
  yolk: <IconHeart size={22} filled />,
  blue: <IconInfo size={22} strokeWidth={2.75} />,
}

function ToastView({ item, index }: { item: ToastItem; index: number }) {
  const [paused, setPaused] = useState(false)
  const remaining = useRef(item.duration)
  const started = useRef(0)

  useEffect(() => {
    remaining.current = item.duration
  }, [item.createdAt, item.duration])

  useEffect(() => {
    if (item.duration <= 0 || paused) return
    started.current = Date.now()
    const timer = window.setTimeout(() => toast.dismiss(item.id), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current -= Date.now() - started.current
    }
  }, [item.id, item.duration, item.createdAt, paused])

  return (
    <li
      className={s.toast}
      data-tone={item.tone}
      data-surface={item.tone === 'ink' || item.tone === 'blue' ? 'ink' : undefined}
      role={item.tone === 'strawberry' ? 'alert' : 'status'}
      style={{ rotate: `${index % 2 ? 1.2 : -1.4}deg` }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={s.tab} aria-hidden="true">
        {item.icon ?? ICON[item.tone]}
      </span>
      <div className={s.body}>
        <p className={s.title}>{item.title}</p>
        {item.message ? <p className={s.message}>{item.message}</p> : null}
        {item.action ? (
          <button
            type="button"
            className={s.action}
            onClick={() => {
              item.action?.onClick()
              toast.dismiss(item.id)
            }}
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button type="button" className={s.close} aria-label="Dismiss notification" onClick={() => toast.dismiss(item.id)}>
        <IconX size={16} strokeWidth={3.5} />
      </button>
      {item.duration > 0 ? (
        <span
          className={cx(s.fuse, paused && s.fusePaused)}
          style={{ animationDuration: `${item.duration}ms` }}
          aria-hidden="true"
        />
      ) : null}
    </li>
  )
}

export interface ToasterProps {
  /** Where the stack sits on wide screens. On phones it is always at the top. Default "top-right". */
  position?: 'top-right' | 'top-center' | 'bottom-right'
}

// Only the first mounted Toaster renders, so an app-level and a page-level one never double up.
const mounted: symbol[] = []
const mountListeners = new Set<() => void>()
const mountStore = {
  subscribe(l: () => void) {
    mountListeners.add(l)
    return () => {
      mountListeners.delete(l)
    }
  },
  first: () => mounted[0] ?? null,
}

/** Renders the toast stack. Mount once, anywhere (it portals to <body>); extra instances stay silent. */
export function Toaster({ position = 'top-right' }: ToasterProps) {
  const list = useSyncExternalStore(toast.subscribe, toast.getSnapshot, toast.getSnapshot)
  const [me] = useState(() => Symbol('toaster'))
  const first = useSyncExternalStore(mountStore.subscribe, mountStore.first, mountStore.first)
  useEffect(() => {
    mounted.push(me)
    for (const l of mountListeners) l()
    return () => {
      mounted.splice(mounted.indexOf(me), 1)
      for (const l of mountListeners) l()
    }
  }, [me])
  if (typeof document === 'undefined' || first !== me) return null
  return createPortal(
    <section className={cx(s.region, s[position])} aria-label="Notifications" data-toaster="">
      <ol className={s.stack}>
        {list.map((item, i) => (
          <ToastView key={item.id} item={item} index={i} />
        ))}
      </ol>
    </section>,
    document.body,
  )
}
