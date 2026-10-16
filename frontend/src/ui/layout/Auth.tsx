import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../cx'
import { Headline } from '../lettering/Headline'
import { Marquee } from '../lettering/Marquee'
import { Sticker } from '../lettering/Stamp'
import { Wordmark } from '../lettering/Wordmark'
import { Barcode, Halftone, Perforation, RegMark, Serial } from '../print/Print'
import s from './Auth.module.css'

export interface PosterProps {
  /** Two to four short words, stacked. Each line is sized to fill the width. */
  lines?: readonly string[]
  /** Colour field. Default matcha. */
  tone?: 'matcha' | 'strawberry' | 'yolk' | 'blue'
  /** The burst sticker. null hides it. */
  sticker?: ReactNode | null
  /** Phrases for the ticker band along the bottom. null hides it. */
  marquee?: readonly string[] | null
  /** Show the wordmark in the top corner. Default true. */
  wordmark?: boolean
  /** Where the wordmark links. */
  homeTo?: string
  /** A band (phone header) rather than a full-height panel. */
  compact?: boolean
  className?: string
  style?: CSSProperties
}

const DEFAULT_LINES = ['Whisk', 'me', 'away'] as const
const DEFAULT_MARQUEE = ['Fresh matches daily', 'Stone-ground in Paris', 'Ceremonial grade romance', 'No sugar added'] as const

/**
 * The poster: a flat colour field with huge stacked lettering that runs off the edge, a halftone
 * sun, a sticker, registration marks and a ticker band. Decorative; the lettering is hidden from
 * assistive tech, so say the same thing in real text nearby.
 */
export function Poster({
  lines = DEFAULT_LINES,
  tone = 'matcha',
  sticker = (
    <>
      Fresh
      <br />
      daily
    </>
  ),
  marquee = DEFAULT_MARQUEE,
  wordmark = true,
  homeTo = '/',
  compact,
  className,
  style,
}: PosterProps) {
  return (
    <div data-tone={tone} className={cx(s.poster, compact && s.compact, className)} style={style}>
      <div className={s.sun} aria-hidden="true">
        <Halftone from="bottom-left" tone="ink" columns={16} opacity={0.22} />
      </div>
      <RegMark size={22} className={s.regTL} />
      <RegMark size={22} className={s.regBR} />

      <div className={s.top}>
        {wordmark ? (
          <Link to={homeTo} className={s.mark} aria-label="Matcha home">
            <Wordmark size={compact ? 'sm' : 'md'} />
          </Link>
        ) : (
          <span />
        )}
        <span className={s.edition} aria-hidden="true">
          <Serial value="01" prefix="Nº" />
          <span>Press edition</span>
        </span>
      </div>

      <div className={s.lettering} aria-hidden="true">
        {lines.map((line, i) => (
          <span key={`${line}-${i}`} className={cx(s.line, s[`line-${i % 3}`])} style={{ '--n': Math.max(2, line.length) } as CSSProperties}>
            {line}
          </span>
        ))}
      </div>

      {sticker ? (
        <Sticker tone={tone === 'yolk' ? 'strawberry' : 'yolk'} shape="burst" size={compact ? '84px' : '128px'} rotate={14} className={s.sticker}>
          {sticker}
        </Sticker>
      ) : null}

      {!compact ? (
        <div className={s.barcode} aria-hidden="true">
          <Barcode value={lines.join('-')} height={44} caption />
        </div>
      ) : null}

      {marquee && marquee.length > 0 ? (
        <div className={s.band}>
          <Marquee items={[...marquee]} tone="ink" size={compact ? 'sm' : 'md'} tilt={-2.5} speed={26} />
        </div>
      ) : null}
    </div>
  )
}

export interface AuthLayoutProps {
  /** The form's heading. */
  title: ReactNode
  /** Mono label on the ticket strip. Default "Admit one". */
  kicker?: ReactNode
  /** A sentence under the heading. */
  intro?: ReactNode
  /** The form. */
  children: ReactNode
  /** Under the ticket: "No account? Register". */
  footer?: ReactNode
  /** Customise the poster (lines, tone, sticker, marquee). */
  poster?: Omit<PosterProps, 'compact' | 'className' | 'style'>
}

/**
 * The signed-out frame. Phones: a poster band, then the form on a ticket that overlaps it.
 * Wide screens: the poster fills the left half, the ticket sits calm on paper on the right.
 */
export function AuthLayout({ title, kicker = 'Admit one', intro, children, footer, poster }: AuthLayoutProps) {
  return (
    <div className={s.authRoot}>
      <div className={s.auth}>
        <div className={s.posterSide}>
          <Poster {...poster} compact className={s.posterCompact} />
          <Poster {...poster} className={s.posterFull} />
        </div>
        <main id="main" className={s.formSide}>
          <div className={s.ticket}>
            <div className={s.ticketStrip}>
              <span>{kicker}</span>
              <i aria-hidden="true" />
              <Serial value={4217} digits={6} />
            </div>
            <Headline as="h1" size="d2" width="condensed" print="riso" className={s.title}>
              {title}
            </Headline>
            {intro ? <div className={s.intro}>{intro}</div> : null}
            <Perforation notches />
            <div className={s.form}>{children}</div>
          </div>
          {footer ? <div className={s.footer}>{footer}</div> : null}
        </main>
      </div>
    </div>
  )
}
