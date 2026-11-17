/**
 * /discover: the swipe deck, its filters, the match moment and the profile sheet.
 *
 * Data: `visibleDeck` (GET /profile/discover, sorted in the browser; the deck loads the first time this
 * page asks for it) + `useNodeStatus('discoverDeck')` (loading vs failure), `useFilters()`, `myProfile`
 * (your side of the match moment). Flows:
 * `actions.swipe / rewind / setFilters / reloadDeck`. Opening a card loads the full profile
 * (GET /profile/:userId, which records a visit). Ephemeral view state (drag, flights, sheets) stays here.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DeckAction, DeckCard } from '@/api/types'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import { cardName, deckPreviewProfile, displayName, mainPicture } from '@/features/profile/format'
import { ActionButton, CountBadge, IconSliders, MatchMoment, toast } from '@/ui'
import { actions, toApiError, useFilters, useLoad, useNodeStatus, useNodeValue, type DiscoverFilters } from '@/wb'
import { Deck, type DeckHandle, type SwipeRecord } from './Deck'
import { DeckEmpty, DeckError, DeckSkeleton } from './DeckStates'
import { canWiden, changedFilters, scopeText, SORT_LABEL, WIDEST } from './filterRules'
import { FilterSheet } from './FilterSheet'
import { useAnnouncer, usePreloadDeck, useViewportFit } from './hooks'
import { prefersReducedMotion } from './motion'
import s from './DiscoverPage.module.css'

const NO_CARDS: readonly DeckCard[] = []

const DONE: Record<DeckAction, string> = { like: 'Liked', pass: 'Passed on' }

type Busy = 'retry' | 'widen' | 'reload' | null

/** "Alice, 27" */
const nameAndAge = (card: DeckCard) => `${cardName(card)}, ${card.age}`

function FilterTicket({ filters, onOpen }: { filters: DiscoverFilters; onOpen: () => void }) {
  const changed = changedFilters(filters)
  const tags = filters.tags
  const into = tags.length === 0 ? 'Anyone' : tags.length === 1 ? `#${tags[0]}` : `#${tags[0]} +${tags.length - 1}`
  const summary = `ages ${filters.ageMin} to ${filters.ageMax}, within ${filters.distance} km, ${
    filters.fameMin > 0 ? `fame ${filters.fameMin} or more, ` : ''
  }sorted by ${SORT_LABEL[filters.sort]}, ${tags.length ? `into ${tags.join(', ')}` : 'any interests'}`
  return (
    <button type="button" className={s.ticket} onClick={onOpen} aria-haspopup="dialog" aria-label={`Filters: ${summary}. Change filters`}>
      <span className={s.seg}>
        <small>Age</small>
        <b>
          {filters.ageMin}–{filters.ageMax}
        </b>
      </span>
      <span className={s.seg}>
        <small>Within</small>
        <b>{filters.distance} km</b>
      </span>
      <span className={s.seg} data-optional="">
        <small>Sort</small>
        <b>{SORT_LABEL[filters.sort]}</b>
      </span>
      <span className={s.seg} data-grow="">
        <small>Into</small>
        <b>{into}</b>
      </span>
      <span className={s.knob} aria-hidden="true">
        <IconSliders size={20} strokeWidth={2.75} />
        <CountBadge count={changed} className={s.knobBadge} />
      </span>
    </button>
  )
}

export default function DiscoverPage() {
  const navigate = useNavigate()
  // Loaded once; afterwards swipes, filters and "reload" keep it current.
  useLoad('discoverDeck')
  const deck = useNodeValue('visibleDeck')
  const deckStatus = useNodeStatus('discoverDeck')
  const filters = useFilters()
  const me = useNodeValue('myProfile')
  const fitRef = useViewportFit<HTMLDivElement>()
  const deckRef = useRef<DeckHandle>(null)
  const [history] = useState<SwipeRecord[]>(() => [])
  const [message, announce] = useAnnouncer()

  const [sheet, setSheet] = useState<ProfileTarget | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  /** People this session's likes connected with, waiting for their match moment. */
  const [matches, setMatches] = useState<DeckCard[]>([])
  const [shownMatch, setShownMatch] = useState<DeckCard | null>(null)
  const [rewinding, setRewinding] = useState(false)
  const [pendingSwipes, setPendingSwipes] = useState(0)
  const [busy, setBusy] = useState<Busy>(null)

  const cards = deck ?? NO_CARDS
  const latestCards = useRef(cards)
  useLayoutEffect(() => {
    latestCards.current = cards
  })
  usePreloadDeck(cards)

  // The match on screen stays mounted through the takeover's exit animation.
  const match = matches[0] ?? null
  if (match && match !== shownMatch) setShownMatch(match)

  // ---------------------------------------------------------------- flows

  const onSwipe = useCallback(
    (card: DeckCard, action: DeckAction) => {
      const name = cardName(card)
      const next = latestCards.current.find((other) => other.userId !== card.userId)
      announce(`${DONE[action]} ${name}.${next ? ` Next: ${nameAndAge(next)}.` : ''}`)
      setPendingSwipes((n) => n + 1)
      actions
        .swipe(card, action)
        .then(
          (result) => {
            if (result.matched) {
              setMatches((queue) => [...queue, card])
              announce(`It's a match! You and ${name} liked each other.`)
            }
          },
          (error: unknown) => {
            const reason = toApiError(error).message
            toast.show({ id: `swipe-${card.userId}`, tone: 'strawberry', title: `${name} is back`, message: `That swipe did not go through: ${reason}` })
            announce(`The swipe on ${name} failed: ${reason}`)
          },
        )
        .finally(() => setPendingSwipes((n) => n - 1))
    },
    [announce],
  )

  const rewindBusy = useRef(false)
  const onRewind = useCallback(async () => {
    if (rewindBusy.current) return
    rewindBusy.current = true
    setRewinding(true)
    try {
      const result = await actions.rewind()
      if (result.restored) {
        announce(`Rewound. ${nameAndAge(result.restored)} is back on top.`)
      } else if (result.matched) {
        toast.show({
          id: 'rewind',
          tone: 'blue',
          title: 'That one is a match',
          message: 'A match is not undone here: open their profile to disconnect.',
        })
        announce('The last swipe made a match, which cannot be undone here.')
      } else {
        toast.show({ id: 'rewind', tone: 'blue', title: 'Nothing to undo', message: 'No swipe to take back in this session.' })
        announce('Nothing to undo.')
      }
    } catch (error) {
      const reason = toApiError(error).message
      toast.show({ id: 'rewind', tone: 'strawberry', title: 'Rewind failed', message: reason })
      announce(`Rewind failed: ${reason}`)
    } finally {
      rewindBusy.current = false
      setRewinding(false)
    }
  }, [announce])

  const onOpen = useCallback(
    (card: DeckCard) => setSheet({ userId: card.userId, preview: deckPreviewProfile(card) }),
    [],
  )

  const run = useCallback(
    async (kind: Exclude<Busy, null>, task: () => Promise<void>, done?: string) => {
      setBusy(kind)
      try {
        await task()
        if (done) announce(done)
      } catch (error) {
        const reason = toApiError(error).message
        toast.show({ tone: 'strawberry', title: 'That did not work', message: reason })
        announce(reason)
      } finally {
        setBusy(null)
      }
    },
    [announce],
  )

  /** From the profile sheet: close it, then throw the card the same way the buttons do. */
  const swipeFromSheet = (action: DeckAction) => {
    const target = sheet
    setSheet(null)
    if (!target) return
    const top = latestCards.current[0]
    const card = latestCards.current.find((c) => c.userId === target.userId)
    if (!card) return
    if (top?.userId === card.userId) {
      window.setTimeout(() => deckRef.current?.throwTop(action), prefersReducedMotion() ? 0 : 220)
    } else {
      onSwipe(card, action)
    }
  }

  // ---------------------------------------------------------------- what the tray shows

  const phase: 'ready' | 'loading' | 'error' | 'empty' =
    cards.length > 0
      ? 'ready'
      : deckStatus.status === 'error'
        ? 'error'
        : deck == null || deckStatus.status === 'loading' || pendingSwipes > 0
          ? 'loading'
          : 'empty'

  let placeholder = null
  if (phase === 'loading') {
    placeholder = <DeckSkeleton caption={deck == null ? 'Shuffling the deck' : 'Printing more cards'} />
  } else if (phase === 'error') {
    placeholder = (
      <DeckError
        message={deckStatus.error?.message ?? 'no answer from the server.'}
        retrying={busy === 'retry'}
        onRetry={() => void run('retry', () => actions.reloadDeck(), 'Deck reloaded.')}
      />
    )
  } else if (phase === 'empty') {
    placeholder = (
      <DeckEmpty
        scope={scopeText(filters)}
        busy={busy === 'retry' ? null : busy}
        onWiden={canWiden(filters) ? () => void run('widen', () => actions.setFilters(WIDEST), 'Filters widened.') : null}
        onEditFilters={() => setFiltersOpen(true)}
        onReload={() =>
          void run(
            'reload',
            async () => {
              await actions.reloadDeck()
              history.length = 0
            },
            'Deck reloaded.',
          )
        }
        onRewind={() => void onRewind()}
      />
    )
  }

  const sheetCard = sheet ? cards.find((card) => card.userId === sheet.userId) : undefined
  const keyboard = !sheet && !filtersOpen && !match

  return (
    <div ref={fitRef} className={s.page}>
      <h1 className="sr-only">Discover</h1>

      <header className={s.head}>
        <div className={s.count} aria-hidden={phase === 'loading' || phase === 'error'}>
          <b>{phase === 'ready' || phase === 'empty' ? String(cards.length).padStart(2, '0') : '··'}</b>
          <small>In the deck</small>
        </div>
        <FilterTicket filters={filters} onOpen={() => setFiltersOpen(true)} />
      </header>

      <Deck
        ref={deckRef}
        cards={cards}
        placeholder={placeholder}
        onSwipe={onSwipe}
        onOpen={onOpen}
        onRewind={() => void onRewind()}
        rewinding={rewinding}
        keyboard={keyboard}
        history={history}
      />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApplied={(next) => announce(`Filters applied: ${scopeText(next)}.`)}
      />

      <ProfileSheet
        target={sheet}
        onClose={() => setSheet(null)}
        actions={
          sheetCard ? (
            <div className={s.sheetActions}>
              <ActionButton kind="pass" size="lg" label={`Pass on ${cardName(sheetCard)}`} onClick={() => swipeFromSheet('pass')} />
              <ActionButton kind="like" size="lg" label={`Like ${cardName(sheetCard)}`} onClick={() => swipeFromSheet('like')} />
            </div>
          ) : undefined
        }
      />

      {shownMatch ? (
        <MatchMoment
          open={match !== null}
          onClose={() => setMatches((queue) => queue.slice(1))}
          me={{ name: me ? displayName(me) : 'You', photo: mainPicture(me)?.url, seed: me?.userId ?? 'me' }}
          them={{
            name: cardName(shownMatch),
            photo: shownMatch.profilePictureUrl,
            seed: shownMatch.userId,
          }}
          onMessage={() => {
            setMatches([])
            navigate(`/chat/${shownMatch.userId}`)
          }}
        />
      ) : null}
    </div>
  )
}
