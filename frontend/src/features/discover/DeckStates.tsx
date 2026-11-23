/** What the deck's tray shows when there is no card: shuffling, jammed, sold out. */
import type { ReactNode } from 'react'
import { useT } from '@/i18n'
import {
  Button,
  Halftone,
  Headline,
  IconRefresh,
  IconSliders,
  IconWarning,
  Label,
  Pattern,
  PosterWord,
  Skeleton,
  Stamp,
  Text,
} from '@/ui'
import s from './DeckStates.module.css'

/** A deck of blank cards being shuffled. */
export function DeckSkeleton({ caption }: { caption?: string }) {
  const t = useT()
  return (
    <div className={s.skeleton} role="status" aria-live="polite">
      <span className="sr-only">{caption ?? t('deck.shuffling')}…</span>
      <div className={s.skUnder} data-depth="2" aria-hidden="true" />
      <div className={s.skUnder} data-depth="1" aria-hidden="true" />
      <div className={s.skCard} aria-hidden="true">
        <div className={s.skPhoto}>
          <Skeleton className={s.skFill} />
          <Stamp variant="rubber" tone="ink" size="lg" rotate={-9} className={s.skStamp}>
            {t('deck.skeletonStamp')}
          </Stamp>
        </div>
        <div className={s.skLabel}>
          <Skeleton shape="text" width="46%" height={10} />
          <Skeleton width="62%" height={40} />
          <div className={s.skChips}>
            <Skeleton shape="text" width={64} height={22} />
            <Skeleton shape="text" width={82} height={22} />
            <Skeleton shape="text" width={54} height={22} />
          </div>
        </div>
      </div>
    </div>
  )
}

interface PosterPanelProps {
  word: string
  wordTone: 'matcha' | 'strawberry' | 'yolk' | 'blue'
  /** A halftone ramp printed behind the word. */
  halftone?: 'yolk' | 'blue'
  children: ReactNode
  role?: 'alert' | 'status'
}

/** The back of the last card: a poster with a giant cropped word behind the message. */
function PosterPanel({ word, wordTone, halftone, children, role }: PosterPanelProps) {
  return (
    <section className={s.poster} role={role}>
      <Pattern kind="dots" tone="ink" opacity={0.14} />
      {halftone ? <Halftone from="top-right" tone={halftone} columns={18} opacity={0.4} className={s.halftone} cover={false} /> : null}
      <div className={s.posterWord}>
        <PosterWord size="clamp(7rem, 46cqw, 12rem)" tone={wordTone} rotate={-6}>
          {word}
        </PosterWord>
      </div>
      <div className={s.posterBody}>{children}</div>
    </section>
  )
}

export interface DeckErrorProps {
  message: string
  onRetry: () => void
  retrying: boolean
}

export function DeckError({ message, onRetry, retrying }: DeckErrorProps) {
  const t = useT()
  return (
    <PosterPanel word={t('deck.jam')} wordTone="strawberry" role="alert">
      <Stamp variant="rubber" tone="strawberry" size="md" rotate={-7} className={s.stamp}>
        {t('deck.misprint')}
      </Stamp>
      <Headline as="h2" size="d2" width="condensed" print="riso" offset="strawberry">
        {t('deck.jammedTitle')}
      </Headline>
      <Text size="sm" className={s.copy}>
        <IconWarning size={16} strokeWidth={3} className={s.inlineIcon} /> {t('deck.jammedBody', { message })}
      </Text>
      <div className={s.actions}>
        <Button variant="ink" block icon={<IconRefresh size={20} />} loading={retrying} onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      </div>
    </PosterPanel>
  )
}

export interface DeckEmptyProps {
  /** "between 18 and 45, within 50 km" */
  scope: string
  /** null when the filters are already as wide as they go. */
  onWiden: (() => void) | null
  onEditFilters: () => void
  /** Fetches the deck again: the people passed on come back, at the bottom. */
  onReload: () => void
  onRewind: () => void
  busy: 'widen' | 'reload' | null
}

export function DeckEmpty({ scope, onWiden, onEditFilters, onReload, onRewind, busy }: DeckEmptyProps) {
  const t = useT()
  return (
    <PosterPanel word={t('deck.soldOut')} wordTone="matcha" halftone="yolk" role="status">
      <Label tone="muted" className={s.kicker}>
        {t('deck.lastCard')}
      </Label>
      <Headline as="h2" size="d2" width="condensed" print="riso">
        {t('deck.everyone')}
      </Headline>
      <Text size="sm" className={s.copy}>
        {t('deck.emptyBody', { scope })}
      </Text>
      <div className={s.actions}>
        {onWiden ? (
          <Button block icon={<IconSliders size={20} />} loading={busy === 'widen'} onClick={onWiden}>
            {t('deck.widen')}
          </Button>
        ) : (
          <Button block icon={<IconSliders size={20} />} onClick={onEditFilters}>
            {t('deck.editFilters')}
          </Button>
        )}
        <Button variant="paper" size="sm" block loading={busy === 'reload'} onClick={onReload}>
          {t('deck.goRound')}
        </Button>
        <button type="button" className={s.textButton} onClick={onRewind}>
          {t('deck.undoLast')}
        </button>
      </div>
    </PosterPanel>
  )
}
