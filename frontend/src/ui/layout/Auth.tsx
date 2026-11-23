import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n'
import { cx } from '../cx'
import { Headline } from '../lettering/Headline'
import { Sticker } from '../lettering/Stamp'
import { Wordmark } from '../lettering/Wordmark'
import { LocaleLabel } from '../overlay/LocalePicker'
import { Barcode, Halftone, Perforation, RegMark, Serial } from '../print/Print'
import s from './Auth.module.css'

export interface PosterProps {
  /** Two to four short words, stacked. Each line is sized to fill the width. Default: "Whisk me away" in the current language. */
  lines?: readonly string[]
  /** Colour field. Default matcha. */
  tone?: 'matcha' | 'strawberry' | 'yolk' | 'blue'
  /** The burst sticker. null hides it; left out, it says "Fresh daily" in the current language. */
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

/**
 * The poster: a flat colour field with huge stacked lettering that runs off the edge, a halftone
 * sun, a sticker, registration marks and a ticker band. Decorative; the lettering is hidden from
 * assistive tech, so say the same thing in real text nearby.
 */
export function Poster({
  lines: linesProp,
  tone = 'matcha',
  sticker: stickerProp,
  wordmark = true,
  homeTo = '/',
  compact,
  className,
  style,
}: PosterProps) {
  const t = useT()
  const lines = linesProp ?? t.lines('poster.defaultLines')
  const sticker = stickerProp === undefined ? t.stack('poster.defaultSticker') : stickerProp
  return (
    <div data-tone={tone} className={cx(s.poster, compact && s.compact, className)} style={style}>
      <div className={s.sun} aria-hidden="true">
        <Halftone from="bottom-left" tone="ink" columns={16} opacity={0.22} />
      </div>
      <RegMark size={22} className={s.regTL} />
      <RegMark size={22} className={s.regBR} />

      <div className={s.top}>
        {wordmark ? (
          <Link to={homeTo} className={s.mark} aria-label={t('poster.home')}>
            <Wordmark size={compact ? 'sm' : 'md'} />
          </Link>
        ) : (
          <span />
        )}
        <span className={s.edition} aria-hidden="true">
          <Serial value="01" prefix={t('poster.serialPrefix')} />
          <span>{t('poster.edition')}</span>
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
    </div>
  )
}

export interface AuthLayoutProps {
  /** The form's heading. */
  title: ReactNode
  /** Mono label on the ticket strip. Default "Admit one" in the current language. */
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
 * The signed-out frame. Phones: a poster band (wordmark in its corner), then the form on a ticket that overlaps it.
 * Wide screens: the poster fills the left half, the ticket sits calm on paper on the right with the wordmark
 * above it, so the poster's lettering has the whole panel to itself.
 */
export function AuthLayout({ title, kicker, intro, children, footer, poster }: AuthLayoutProps) {
  const t = useT()
  const { wordmark = true, homeTo = '/' } = poster ?? {}
  return (
    <div className={s.authRoot}>
      <div className={s.auth}>
        <div className={s.posterSide}>
          <Poster {...poster} compact className={s.posterCompact} />
          <Poster {...poster} wordmark={false} className={s.posterFull} />
        </div>
        <main id="main" className={s.formSide}>
          {wordmark ? (
            <div className={s.formMark}>
              <Link to={homeTo} className={s.formMarkLink} aria-label={t('poster.home')}>
                <Wordmark size="md" />
              </Link>
            </div>
          ) : null}
          <div className={s.ticket}>
            <div className={s.ticketStrip}>
              <span>{kicker ?? t('auth.kicker')}</span>
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
          <div className={s.locale}>
            <LocaleLabel side="up" />
          </div>
        </main>
      </div>
    </div>
  )
}
