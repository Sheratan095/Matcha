/** What the deck's tray shows when there is no card: shuffling, jammed, sold out. */
import type { ReactNode } from 'react'
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
export function DeckSkeleton({ caption = 'Shuffling the deck' }: { caption?: string }) {
  return (
    <div className={s.skeleton} role="status" aria-live="polite">
      <span className="sr-only">{caption}…</span>
      <div className={s.skUnder} data-depth="2" aria-hidden="true" />
      <div className={s.skUnder} data-depth="1" aria-hidden="true" />
      <div className={s.skCard} aria-hidden="true">
        <div className={s.skPhoto}>
          <Skeleton className={s.skFill} />
          <Stamp variant="rubber" tone="ink" size="lg" rotate={-9} className={s.skStamp}>
            Shuffling
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
  return (
    <PosterPanel word="Jam" wordTone="strawberry" role="alert">
      <Stamp variant="rubber" tone="strawberry" size="md" rotate={-7} className={s.stamp}>
        Misprint
      </Stamp>
      <Headline as="h2" size="d2" width="condensed" print="riso" offset="strawberry">
        The press jammed
      </Headline>
      <Text size="sm" className={s.copy}>
        <IconWarning size={16} strokeWidth={3} className={s.inlineIcon} /> The deck could not be printed: {message}
      </Text>
      <div className={s.actions}>
        <Button variant="ink" block icon={<IconRefresh size={20} />} loading={retrying} onClick={onRetry}>
          Try again
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
  onReload: () => void
  onReset: () => void
  onRewind: () => void
  busy: 'widen' | 'reload' | 'reset' | null
}

export function DeckEmpty({ scope, onWiden, onEditFilters, onReload, onReset, onRewind, busy }: DeckEmptyProps) {
  return (
    <PosterPanel word="Sold out" wordTone="matcha" halftone="yolk" role="status">
      <Label tone="muted" className={s.kicker}>
        Last card · end of the print run
      </Label>
      <Headline as="h2" size="d2" width="condensed" print="riso">
        That&rsquo;s everyone
      </Headline>
      <Text size="sm" className={s.copy}>
        Nobody new {scope}. Widen the net, check again, or roll the demo world back to the start.
      </Text>
      <div className={s.actions}>
        {onWiden ? (
          <Button block icon={<IconSliders size={20} />} loading={busy === 'widen'} onClick={onWiden}>
            Widen filters
          </Button>
        ) : (
          <Button block icon={<IconSliders size={20} />} onClick={onEditFilters}>
            Edit filters
          </Button>
        )}
        <div className={s.pair}>
          <Button variant="paper" size="sm" loading={busy === 'reload'} onClick={onReload}>
            Reload
          </Button>
          <Button variant="paper" size="sm" loading={busy === 'reset'} onClick={onReset}>
            Reset demo
          </Button>
        </div>
        <button type="button" className={s.textButton} onClick={onRewind}>
          Undo my last swipe
        </button>
      </div>
    </PosterPanel>
  )
}
