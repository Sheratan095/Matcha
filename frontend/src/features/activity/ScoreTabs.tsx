/**
 * A tab strip where each tab is a scoreboard ticket: a big numeral and a mono label. Same keyboard
 * model and ids as the kit's `Tabs`, so it pairs with `TabPanel` (pass the same `idBase`).
 */
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { cx, TONE_COLOR, type Tone } from '@/ui'
import { pad2 } from '@/features/chat/time'
import s from './ActivityPage.module.css'

export interface ScoreTab<V extends string> {
  value: V
  label: string
  /** null while not loaded. */
  count: number | null
  /** The numeral's misregistered plate. */
  tone: Tone
  icon?: ReactNode
}

export interface ScoreTabsProps<V extends string> {
  items: readonly ScoreTab<V>[]
  value: V
  onChange: (value: V) => void
  /** Accessible name of the tab list. */
  label: string
  idBase: string
  className?: string
}

export function ScoreTabs<V extends string>({ items, value, onChange, label, idBase, className }: ScoreTabsProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.value === value)
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next < 0) return
    event.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={cx(s.score, className)} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${item.value}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${item.value}`}
            tabIndex={active ? 0 : -1}
            className={cx(s.scoreTab, active && s.scoreActive)}
            data-surface={active ? 'ink' : undefined}
            style={{ '--plate': TONE_COLOR[item.tone] } as CSSProperties}
            onClick={() => onChange(item.value)}
          >
            <span className={s.scoreNum} aria-hidden="true">
              {item.count == null ? '··' : pad2(item.count)}
            </span>
            <span className={s.scoreLabel}>
              {item.icon ? <span className={s.scoreIcon}>{item.icon}</span> : null}
              {item.label}
            </span>
            <span className="sr-only">{item.count == null ? ', loading' : `, ${item.count}`}</span>
          </button>
        )
      })}
    </div>
  )
}
