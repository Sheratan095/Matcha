import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useT } from '@/i18n'
import { cx } from '../cx'
import { IconCheck, IconChevronRight, IconMore } from '../icons'
import s from './Menu.module.css'

export interface MenuItem {
  label: string
  icon?: ReactNode
  /** Makes the item a radio of the menu (a choice among several): true marks the current one. Menu only. */
  checked?: boolean
  /** Smaller second line (ActionList only). */
  description?: string
  onSelect: () => void
  /** danger prints the item in strawberry (unmatch, block, delete). */
  tone?: 'default' | 'danger'
  disabled?: boolean
}

export interface MenuProps {
  items: readonly MenuItem[]
  /** Accessible name of the trigger. Default "More options". */
  label?: string
  /** Trigger content. Default the three-dot icon. */
  trigger?: ReactNode
  /** Which edge of the trigger the menu lines up with. Default end. */
  align?: 'start' | 'end'
  /** Open below the trigger (default) or above it, for a trigger at the foot of the page. */
  side?: 'down' | 'up'
  /** Trigger look: a paper icon button (default) or bare. */
  triggerVariant?: 'paper' | 'ghost'
  /** Extra class on the trigger button (a custom size or shape). */
  triggerClassName?: string
  className?: string
}

/**
 * A dropdown of actions behind a button (the "…" on a chat header).
 * Arrow keys move, Enter picks, Escape / Tab / an outside click closes.
 */
export function Menu({
  items,
  label,
  trigger,
  align = 'end',
  side = 'down',
  triggerVariant = 'paper',
  triggerClassName,
  className,
}: MenuProps) {
  const t = useT()
  const name = label ?? t('kit.moreOptions')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  /** Where focus lands when the menu opens: the current choice of a radio menu, else the first item. */
  const firstIndex = Math.max(
    0,
    items.findIndex((it) => it.checked),
  )

  const focusItem = (i: number) => {
    const enabled = items.map((it, idx) => (it.disabled ? -1 : idx)).filter((x) => x >= 0)
    if (enabled.length === 0) return
    const target = enabled.includes(i) ? i : enabled[0]
    itemRefs.current[target]?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      requestAnimationFrame(() => focusItem(e.key === 'ArrowUp' ? items.length - 1 : firstIndex))
    }
  }

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement)
    const step = (dir: 1 | -1) => {
      for (let k = 1; k <= items.length; k++) {
        const i = (current + dir * k + items.length) % items.length
        if (!items[i].disabled) return i
      }
      return current
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      itemRefs.current[step(1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      itemRefs.current[step(-1)]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      itemRefs.current[items.length - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className={cx(s.menuRoot, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cx(s.trigger, triggerVariant === 'ghost' && s.triggerGhost, open && s.triggerOpen, triggerClassName)}
        aria-label={name}
        title={name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) requestAnimationFrame(() => focusItem(firstIndex))
        }}
        onKeyDown={onTriggerKey}
      >
        {trigger ?? <IconMore size={22} />}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={name}
          className={cx(s.menu, s[`align-${align}`], side === 'up' && s.sideUp)}
          onKeyDown={onMenuKey}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              tabIndex={-1}
              disabled={item.disabled}
              className={cx(s.item, item.tone === 'danger' && s.danger)}
              onMouseEnter={(e) => e.currentTarget.focus()}
              onClick={() => {
                close()
                item.onSelect()
              }}
            >
              {item.icon ? <span className={s.itemIcon}>{item.icon}</span> : null}
              <span className={s.itemLabel}>{item.label}</span>
              {item.checked ? <IconCheck size={18} strokeWidth={3.5} className={s.itemCheck} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface ActionListProps {
  items: readonly MenuItem[]
  className?: string
}

/** Big tappable rows of actions, for the inside of a Sheet (report, block, unmatch). */
export function ActionList({ items, className }: ActionListProps) {
  return (
    <ul className={cx(s.actionList, className)}>
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            className={cx(s.action, item.tone === 'danger' && s.danger)}
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            {item.icon ? <span className={s.actionIcon}>{item.icon}</span> : null}
            <span className={s.actionText}>
              <span className={s.actionLabel}>{item.label}</span>
              {item.description ? <span className={s.actionDesc}>{item.description}</span> : null}
            </span>
            <IconChevronRight size={20} strokeWidth={3} />
          </button>
        </li>
      ))}
    </ul>
  )
}
