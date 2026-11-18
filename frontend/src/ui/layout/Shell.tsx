import type { CSSProperties, ElementType, ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { cx } from '../cx'
import { CountBadge } from '../display/Chip'
import { IconArrowLeft } from '../icons'
import { Headline } from '../lettering/Headline'
import type { HeadlinePrint } from '../lettering/Headline'
import { PosterWord } from '../lettering/Headline'
import { Wordmark } from '../lettering/Wordmark'
import { Barcode, ColorBar, CropMarks, Halftone, RegMark, Serial } from '../print/Print'
import s from './Shell.module.css'

// ------------------------------------------------------------------ Stack / Row

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16

const gapVar = (g: Gap) => (g === 0 ? '0px' : `var(--s-${g})`)

export interface StackProps {
  as?: ElementType
  /** Step on the 4px scale (1 = 4px, 4 = 16px…). Default 4. */
  gap?: Gap
  align?: 'stretch' | 'start' | 'center' | 'end'
  className?: string
  style?: CSSProperties
  children?: ReactNode
  id?: string
}

/** Vertical rhythm: children in a column with a token gap. */
export function Stack({ as: Tag = 'div', gap = 4, align, className, style, children, id }: StackProps) {
  return (
    <Tag id={id} className={cx(s.stack, className)} style={{ gap: gapVar(gap), alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align, ...style }}>
      {children}
    </Tag>
  )
}

export interface RowProps extends StackProps {
  justify?: 'start' | 'center' | 'end' | 'between'
  wrap?: boolean
}

/** Horizontal group with a token gap. */
export function Row({ as: Tag = 'div', gap = 3, align = 'center', justify, wrap, className, style, children, id }: RowProps) {
  return (
    <Tag
      id={id}
      className={cx(s.row, className)}
      style={{
        gap: gapVar(gap),
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
        justifyContent: justify === 'between' ? 'space-between' : justify === 'start' ? 'flex-start' : justify === 'end' ? 'flex-end' : justify,
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}

// ------------------------------------------------------------------ Stage (wide-screen composition)

interface StageProps {
  /** The giant word printed in the margin on wide screens. */
  poster?: string
  children: ReactNode
  className?: string
}

/** The cutting mat on wide screens: the phone column as a sheet of paper, poster lettering beside it. */
function Stage({ poster, children, className }: StageProps) {
  return (
    <div className={cx(s.stage, className)}>
      <div className={s.mat} aria-hidden="true">
        {poster ? (
          <span className={s.matWord}>
            <PosterWord size="min(30vh, 17vw)" width="condensed" tone="ink" outline>
              {poster}
            </PosterWord>
          </span>
        ) : null}
        <Halftone from="bottom-left" tone="matcha" columns={22} className={s.matHalftone} cover={false} />
        <RegMark size={28} className={s.matRegA} />
        <RegMark size={28} className={s.matRegB} />
      </div>
      <div className={s.sheet}>
        <CropMarks size={16} gap={8} className={s.sheetCrop} />
        {children}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ AppShell

export interface ShellTab {
  to: string
  label: string
  icon: ReactNode
  /** Count sticker on the tab (unread, new likes). Hidden at 0. */
  badge?: number
  /** Match the route exactly (NavLink `end`). */
  end?: boolean
  /** Show the tab as current on a route outside its own path (a conversation under Matches). */
  active?: boolean
}

export interface AppShellProps {
  tabs: readonly ShellTab[]
  children: ReactNode
  /** Right side of the top bar (icon buttons). */
  actions?: ReactNode
  /**
   * A search bar between the wordmark and the actions. The top bar is positioned, so a drop-down
   * inside the bar can span the column; on phones under 480px the wordmark hides while the bar
   * carries `data-search-expanded`.
   */
  search?: ReactNode
  /** A strip above everything (e.g. a back link). */
  banner?: ReactNode
  /** The giant margin word on wide screens (usually the section name). */
  poster?: string
  /** Where the wordmark links. Default "/discover". */
  homeTo?: string
  /** Hide the bottom tab bar on phones (full-screen flows). */
  hideTabBar?: boolean
  /** Hide the top bar on phones, for a page with its own header (a conversation). Wide screens keep it. */
  hideTopBar?: boolean
  /** Remove the column's side padding (edge-to-edge content like the deck). */
  flush?: boolean
  /**
   * Fit the viewport: the shell stops growing with its content and the page scrolls inside it.
   * The content is then a `Pane` (fixed header, scrolling middle, fixed footer).
   */
  fit?: boolean
}

/**
 * A tab's link: current (lit, and `aria-current="page"`) on its own path, or wherever the tab says it is
 * (`active`, a conversation under Matches), where NavLink alone would light it without announcing it.
 */
function TabLink({ tab, className, children }: { tab: ShellTab; className: string; children: ReactNode }) {
  if (tab.active) {
    return (
      <Link to={tab.to} className={cx(className, s.active)} aria-current="page">
        {children}
      </Link>
    )
  }
  return (
    <NavLink to={tab.to} end={tab.end} className={({ isActive }) => cx(className, isActive && s.active)}>
      {children}
    </NavLink>
  )
}

/**
 * The signed-in frame. Phones: top bar with the wordmark, content, bottom tab bar.
 * Wide screens: a side rail with the wordmark and the tabs, the content as a phone-sized sheet
 * on a cutting mat, and poster lettering in the margin.
 */
export function AppShell({
  tabs,
  children,
  actions,
  search,
  banner,
  poster,
  homeTo = '/discover',
  hideTabBar,
  hideTopBar,
  flush,
  fit,
}: AppShellProps) {
  return (
    <div className={s.shellRoot}>
      <div className={cx(s.shell, hideTabBar && s.noTabs, hideTopBar && s.noTop, fit && s.fit)}>
        <a href="#main" className={s.skip}>
          Skip to content
        </a>
        {banner ? <div className={s.banner}>{banner}</div> : null}

        <aside className={s.rail} aria-label="Main">
          <Link to={homeTo} className={s.railMark} aria-label="Matcha home">
            <Wordmark size="md" tagline="Press edition · Nº 01" />
          </Link>
          <nav className={s.railNav} aria-label="Sections">
            {tabs.map((t) => (
              <TabLink key={t.to} tab={t} className={s.railLink}>
                <span className={s.railIcon}>{t.icon}</span>
                <span className={s.railLabel}>{t.label}</span>
                <CountBadge count={t.badge ?? 0} label="new" className={s.railBadge} />
              </TabLink>
            ))}
          </nav>
          <div className={s.railFoot} aria-hidden="true">
            <ColorBar />
            <Barcode value={`matcha-${poster ?? 'app'}`} height={30} />
            <Serial value={2026} digits={6} tone="muted" />
          </div>
        </aside>

        <Stage poster={poster} className={s.shellStage}>
          <header className={s.topbar}>
            <Link to={homeTo} className={s.topMark} aria-label="Matcha home">
              <Wordmark size="sm" />
            </Link>
            {search ? <div className={s.topSearch}>{search}</div> : null}
            <div className={s.topActions}>{actions}</div>
          </header>
          <main id="main" tabIndex={-1} className={cx(s.main, flush && s.flush)}>
            {children}
          </main>
        </Stage>

        {!hideTabBar ? (
          <nav className={s.tabbar} aria-label="Sections">
            {tabs.map((t) => (
              <TabLink key={t.to} tab={t} className={s.tab}>
                <span className={s.tabIcon}>
                  {t.icon}
                  <CountBadge count={t.badge ?? 0} label="new" className={s.tabBadge} />
                </span>
                <span className={s.tabLabel}>{t.label}</span>
              </TabLink>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Pane

export interface PaneProps {
  /** Pinned at the top (usually a compact PageHeader). */
  header?: ReactNode
  /** Pinned at the bottom (a ChatComposer, a sticky action bar). */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A page inside a `fit` AppShell (the chat): fixed header, scrolling middle, fixed footer, so the
 * rail and the top bar stay on screen beside it.
 */
export function Pane({ header, footer, children, className }: PaneProps) {
  return (
    <div className={cx(s.screen, s.pane, className)}>
      {header ? <div className={s.screenHead}>{header}</div> : null}
      <div className={s.screenBody}>{children}</div>
      {footer ? <div className={s.screenFoot}>{footer}</div> : null}
    </div>
  )
}

// ------------------------------------------------------------------ Screen

export interface ScreenProps {
  /** Pinned at the top (usually a compact PageHeader). */
  header?: ReactNode
  /** Pinned at the bottom (a ChatComposer, a sticky action bar). */
  footer?: ReactNode
  children: ReactNode
  /** Giant margin word on wide screens. */
  poster?: string
  banner?: ReactNode
  className?: string
}

/**
 * A full-height screen outside the tabbed shell (onboarding): fixed header, scrolling middle,
 * fixed footer. Same phone-sheet-on-mat composition on wide screens.
 */
export function Screen({ header, footer, children, poster, banner, className }: ScreenProps) {
  return (
    <div className={cx(s.screenRoot, className)}>
      {banner ? <div className={s.banner}>{banner}</div> : null}
      <Stage poster={poster} className={s.screenStage}>
        <div className={s.screen}>
          {header ? <div className={s.screenHead}>{header}</div> : null}
          <main id="main" tabIndex={-1} className={s.screenBody}>
            {children}
          </main>
          {footer ? <div className={s.screenFoot}>{footer}</div> : null}
        </div>
      </Stage>
    </div>
  )
}

// ------------------------------------------------------------------ PageHeader

export interface PageHeaderProps {
  title: ReactNode
  /** Mono line above the title (a count, a section number). */
  kicker?: ReactNode
  /** Back target: a route, or a handler. Shows an arrow button. */
  back?: string | (() => void)
  backLabel?: string
  /** Right side: icon buttons, a Menu. */
  actions?: ReactNode
  /** lg: a poster headline for top-level pages. md: smaller. compact: one line, for chat / sheets. */
  size?: 'lg' | 'md' | 'compact'
  print?: HeadlinePrint
  /** Content under the title row (tabs, a lead sentence). */
  children?: ReactNode
  className?: string
}

/** The top of a page: kicker, heavy title, actions, then whatever goes under it. */
export function PageHeader({
  title,
  kicker,
  back,
  backLabel = 'Back',
  actions,
  size = 'lg',
  print = 'riso',
  children,
  className,
}: PageHeaderProps) {
  const backButton =
    back == null ? null : typeof back === 'string' ? (
      <Link to={back} className={s.back} aria-label={backLabel} title={backLabel}>
        <IconArrowLeft size={22} strokeWidth={3} />
      </Link>
    ) : (
      <button type="button" className={s.back} aria-label={backLabel} title={backLabel} onClick={back}>
        <IconArrowLeft size={22} strokeWidth={3} />
      </button>
    )
  return (
    <header className={cx(s.pageHeader, s[`ph-${size}`], className)}>
      <div className={s.phRow}>
        {backButton}
        <div className={s.phTitles}>
          {kicker ? <span className={s.phKicker}>{kicker}</span> : null}
          <Headline
            as="h1"
            size={size === 'lg' ? 'd1' : size === 'md' ? 'd2' : 'd4'}
            width={size === 'compact' ? 'narrow' : 'condensed'}
            print={size === 'compact' ? 'solid' : print}
            className={s.phTitle}
          >
            {title}
          </Headline>
        </div>
        {actions ? <div className={s.phActions}>{actions}</div> : null}
      </div>
      {children ? <div className={s.phBelow}>{children}</div> : null}
    </header>
  )
}
