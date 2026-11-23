import { useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n'
import { cx } from '../cx'
import { IconChevronRight } from '../icons'
import { Stamp } from '../lettering/Stamp'
import type { Tone } from '../tones'
import { TONE_COLOR } from '../tones'
import s from './Data.module.css'

// ------------------------------------------------------------------ Stat

export interface StatProps {
  /** The numeral. */
  value: ReactNode
  /** Small unit after the numeral ("km", "%", "yrs"). */
  unit?: ReactNode
  /** Mono label under the numeral. */
  label: ReactNode
  icon?: ReactNode
  /** Colour of the numeral's misregistered plate. Default matcha. */
  tone?: Tone
  size?: 'md' | 'lg'
  className?: string
}

/** A big condensed numeral with a mono label: fame, distance, age. */
export function Stat({ value, unit, label, icon, tone = 'matcha', size = 'md', className }: StatProps) {
  return (
    <div className={cx(s.stat, s[`stat-${size}`], className)} style={{ '--stat-plate': TONE_COLOR[tone] } as CSSProperties}>
      <span className={s.statValue}>
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span className={s.statLabel}>
        {icon ? <span className={s.statIcon}>{icon}</span> : null}
        {label}
      </span>
    </div>
  )
}

/** Stats side by side in one outlined box, divided by rules. */
export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(s.statGroup, className)}>{children}</div>
}

// ------------------------------------------------------------------ Steps

export interface StepsProps {
  /** 1-based current step. */
  current: number
  total: number
  /** Optional names; the current one is printed next to the counter. */
  labels?: readonly string[]
  className?: string
}

/** Wizard progress as a punch card: done steps are punched through, the current one is inked. */
export function Steps({ current, total, labels, className }: StepsProps) {
  const t = useT()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = labels?.[current - 1]
  return (
    <div className={cx(s.steps, className)}>
      <div className={s.stepsHead}>
        <span className={s.stepsCount}>
          {t('kit.step')} {pad(current)}
          <span aria-hidden="true">/</span>
          <span className="sr-only">{t('kit.stepOf')}</span>
          {pad(total)}
        </span>
        {name ? <span className={s.stepsName}>{name}</span> : null}
      </div>
      <ol className={s.holes}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1
          const state = n < current ? 'done' : n === current ? 'current' : 'todo'
          return (
            <li
              key={n}
              className={cx(s.hole, s[`hole-${state}`])}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="sr-only">
                {labels?.[i] ?? t('kit.stepN', { n })}
                {state === 'done' ? t('kit.stepDone') : state === 'current' ? t('kit.stepCurrent') : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ------------------------------------------------------------------ Tabs

export interface TabItem<V extends string> {
  value: V
  label: ReactNode
  /** Count sticker after the label. Hidden at 0. */
  count?: number
  icon?: ReactNode
}

export interface TabsProps<V extends string> {
  items: readonly TabItem<V>[]
  value: V
  onChange: (value: V) => void
  /** Accessible name of the tab list. */
  label: string
  /** Prefix for tab / panel ids; pass the same to TabPanel. Generated when omitted. */
  idBase?: string
  className?: string
}

/** A bar of tabs set in one outlined strip. Arrow keys move between them. */
export function Tabs<V extends string>({ items, value, onChange, label, idBase, className }: TabsProps<V>) {
  const auto = useId()
  const base = idBase ?? auto
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.value === value)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next >= 0) {
      e.preventDefault()
      onChange(items[next].value)
      refs.current[next]?.focus()
    }
  }
  return (
    <div role="tablist" aria-label={label} className={cx(s.tabs, className)} onKeyDown={onKeyDown}>
      {items.map((t, i) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.value}`}
            aria-selected={active}
            aria-controls={`${base}-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            className={cx(s.tab, active && s.tabActive)}
            onClick={() => onChange(t.value)}
          >
            {t.icon ? <span className={s.tabIcon}>{t.icon}</span> : null}
            <span className={s.tabLabel}>{t.label}</span>
            {t.count ? <span className={s.tabCount}>{t.count > 99 ? '99+' : t.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export interface TabPanelProps {
  /** The same idBase given to Tabs. */
  idBase: string
  value: string
  active: boolean
  children: ReactNode
  className?: string
}

/** The panel a tab controls. Rendered only while active. */
export function TabPanel({ idBase, value, active, children, className }: TabPanelProps) {
  if (!active) return null
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      tabIndex={0}
      className={cx(s.panel, className)}
    >
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ ListRow

export interface ListRowProps {
  /** Left: usually an Avatar. */
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Top-right mono note: a time, a distance. */
  meta?: ReactNode
  /** Right: a CountBadge, a Button, a chevron. Defaults to a chevron when the row is a link. */
  trailing?: ReactNode
  /** Bold title and a matcha edge: something new here. */
  unread?: boolean
  /** In-app route: the row becomes a Link. */
  to?: string
  /** Makes the row a button. */
  onClick?: () => void
  className?: string
}

/** One row of a list (matches, likes, settings). Rows separate themselves with a dashed rule. */
export function ListRow({ leading, title, subtitle, meta, trailing, unread, to, onClick, className }: ListRowProps) {
  const interactive = to != null || onClick != null
  const body = (
    <>
      {leading ? <span className={s.rowLead}>{leading}</span> : null}
      <span className={s.rowMain}>
        <span className={s.rowTop}>
          <span className={s.rowTitle}>{title}</span>
          {meta ? <span className={s.rowMeta}>{meta}</span> : null}
        </span>
        {subtitle ? <span className={s.rowSub}>{subtitle}</span> : null}
      </span>
      {trailing ?? (interactive ? <IconChevronRight size={20} strokeWidth={3} className={s.rowChevron} /> : null)}
    </>
  )
  const cls = cx(s.row, interactive && s.rowInteractive, unread && s.rowUnread, className)
  if (to != null) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}

// ------------------------------------------------------------------ EmptyState

export interface EmptyStateProps {
  title: ReactNode
  children?: ReactNode
  /** A word for the rubber stamp (e.g. "Sold out", "Nobody yet"). */
  stamp?: string
  stampTone?: Tone
  /** An icon in a tile instead of (or above) the stamp. */
  icon?: ReactNode
  /** A Button or ButtonLink. */
  action?: ReactNode
  className?: string
}

/** Nothing here yet: a stamp, a heavy line, a sentence, and what to do next. */
export function EmptyState({ title, children, stamp, stampTone = 'strawberry', icon, action, className }: EmptyStateProps) {
  return (
    <div className={cx(s.empty, className)}>
      {icon ? <span className={s.emptyIcon}>{icon}</span> : null}
      {stamp ? (
        <Stamp variant="rubber" tone={stampTone} size="lg" rotate={-7} className={s.emptyStamp}>
          {stamp}
        </Stamp>
      ) : null}
      <h3 className={s.emptyTitle}>{title}</h3>
      {children ? <div className={s.emptyText}>{children}</div> : null}
      {action ? <div className={s.emptyAction}>{action}</div> : null}
    </div>
  )
}
