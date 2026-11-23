/**
 * The swipe deck: the live card on top, the next two beneath it with depth, the three action buttons.
 *
 * - The drag is the RxJS pipeline of `gesture.ts`; this component turns its frames into one inline
 *   `transform` per animation frame on the live card's drag layer, plus three CSS custom properties
 *   (`--p` on the stack for the cards beneath, `--like` / `--nope` on the buttons). The
 *   verdict stamp is React state, quantised to 1/20 so the card re-renders only when it visibly changes.
 * - A committed swipe (drag, button, key, profile sheet) throws the card with the Web Animations API
 *   and calls `onSwipe` at once: the store drops the card from the deck immediately, and the card
 *   keeps flying in a "flight" list until its animation ends. Cards and flights are rendered as ONE
 *   keyed list (flights first), so React keeps the very same DOM node when a card leaves the deck.
 * - A card that comes back on top after being thrown by this deck (a rewind, a failed swipe) flies
 *   back in from the side it left.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { distinctUntilChanged, map, Subject } from 'rxjs'
import type { DeckAction, DeckCard } from '@/api/types'
import { cardName, serialOf } from '@/features/profile/format'
import { useT } from '@/i18n'
import { ActionButton, ProfileCard, type CardStamp } from '@/ui'
import { cardDrag } from './gesture'
import {
  currentPose,
  decide,
  edgesOf,
  fadeOutMotion,
  flingMotion,
  intentOf,
  poseTransform,
  prefersReducedMotion,
  returnMotion,
  rotationFor,
  snapBackMotion,
  springMotion,
  throwVelocity,
  type Box,
  type Edges,
  type Intent,
  type Pose,
} from './motion'
import s from './Deck.module.css'

export interface SwipeRecord {
  userId: string
  action: DeckAction
}

export interface DeckHandle {
  /** Throws the live card exactly like a drag would (buttons, keys, the profile sheet). */
  throwTop(action: DeckAction): void
}

export interface DeckProps {
  /** The deck still to show, top first (`visibleDeck`). */
  cards: readonly DeckCard[]
  /** What the tray shows when there is no card (loading, error, empty). */
  placeholder?: ReactNode
  /** A swipe was committed (the card is already flying away). */
  onSwipe: (card: DeckCard, action: DeckAction) => void
  /** A tap on the live card, or its info button. */
  onOpen: (card: DeckCard) => void
  onRewind: () => void
  rewinding?: boolean
  /** Arrow keys swipe, Backspace / Z rewind. Turn off while a sheet is open. */
  keyboard?: boolean
  /** Swipes thrown by this deck, newest last. Owned by the page so it outlives the deck. */
  history: SwipeRecord[]
  ref?: Ref<DeckHandle>
}

interface Flight {
  card: DeckCard
  action: DeckAction
}

interface LiveStamp {
  stamp: CardStamp
  strength: number
}

const STAMP: Record<DeckAction, CardStamp> = { like: 'like', pass: 'nope' }

type Depth = 0 | 1 | 2 | 'fly'

interface SlotProps {
  card: DeckCard
  depth: Depth
  stamp: CardStamp | null
  strength: number
  onOpen?: (card: DeckCard) => void
}

/** One card of the stack. Memoised: during a drag only the live card re-renders (its stamp). */
const Slot = memo(function Slot({ card, depth, stamp, strength, onOpen }: SlotProps) {
  const live = depth === 0
  return (
    <div className={s.slot} data-depth={depth} data-user={card.userId} aria-hidden={live ? undefined : true} inert={!live}>
      <div className={s.drag} data-drag="">
        <ProfileCard
          name={cardName(card)}
          age={card.age}
          photo={card.profilePictureUrl}
          seed={card.userId}
          distanceKm={card.distanceKm ?? undefined}
          fame={card.fameRating}
          likedYou={card.likesYou === true}
          stamp={stamp}
          stampStrength={strength}
          serial={serialOf(card.userId)}
          onInfo={live && onOpen ? () => onOpen(card) : undefined}
          fill
        />
      </div>
    </div>
  )
})

const DRAG_LAYER = ':scope > [data-drag]'

interface Grip {
  card: DeckCard
  element: HTMLElement
  /** Where the card was when grabbed (mid-spring, it is not at rest). */
  base: Pose
  grabY: number
  box: Box
  edges: Edges
}

function cancelAnimations(element: HTMLElement): void {
  for (const animation of element.getAnimations()) animation.cancel()
}

export function Deck({ cards, placeholder, onSwipe, onOpen, onRewind, rewinding, keyboard = true, history, ref }: DeckProps) {
  const t = useT()
  const stackRef = useRef<HTMLDivElement>(null)
  const buttonsRef = useRef<HTMLDivElement>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [live, setLive] = useState<LiveStamp | null>(null)
  const [stamp$] = useState(() => new Subject<Intent | null>())
  const dragging = useRef(false)

  const flyingIds = useMemo(() => new Set(flights.map((flight) => flight.card.userId)), [flights])
  const shown = useMemo(() => cards.filter((card) => !flyingIds.has(card.userId)).slice(0, 3), [cards, flyingIds])
  const top = shown[0] ?? null

  // The long-lived subscriptions read the latest props through this ref.
  const latest = useRef({ top, onSwipe, onOpen, onRewind, history })
  useLayoutEffect(() => {
    latest.current = { top, onSwipe, onOpen, onRewind, history }
  })

  const openCard = useCallback((card: DeckCard) => latest.current.onOpen(card), [])

  const dragLayer = useCallback((userId: string): HTMLElement | null => {
    const slot = stackRef.current?.querySelector<HTMLElement>(`[data-user="${CSS.escape(userId)}"]`)
    return slot?.querySelector<HTMLElement>(DRAG_LAYER) ?? null
  }, [])

  /** Per-frame feedback outside React: the cards beneath rise, the matching button swells. */
  const paintIntent = useCallback((intent: Intent | null) => {
    const p = intent?.strength ?? 0
    const value = (action: DeckAction) => (intent?.action === action ? p.toFixed(3) : '0')
    stackRef.current?.style.setProperty('--p', p.toFixed(3))
    const buttons = buttonsRef.current
    if (buttons) {
      buttons.style.setProperty('--like', value('like'))
      buttons.style.setProperty('--nope', value('pass'))
    }
  }, [])

  const setDragging = useCallback((on: boolean) => {
    dragging.current = on
    for (const element of [stackRef.current, buttonsRef.current]) {
      if (!element) continue
      if (on) element.setAttribute('data-dragging', '')
      else element.removeAttribute('data-dragging')
    }
  }, [])

  // The stamp follows the drag, at most 20 steps of strength.
  useEffect(() => {
    const subscription = stamp$
      .pipe(
        map((intent): LiveStamp | null =>
          intent?.action ? { stamp: STAMP[intent.action], strength: Math.round(intent.strength * 20) / 20 } : null,
        ),
        distinctUntilChanged((a, b) => a?.stamp === b?.stamp && a?.strength === b?.strength),
      )
      .subscribe(setLive)
    return () => subscription.unsubscribe()
  }, [stamp$])

  /** Throws a card off the screen and commits the swipe. */
  const launch = useCallback(
    (card: DeckCard, element: HTMLElement, from: Pose, action: DeckAction, velocity: { vx: number; vy: number }, edges: Edges) => {
      const reduced = prefersReducedMotion()
      const motion = reduced ? fadeOutMotion({ ...from, r: 0 }) : flingMotion(from, action, velocity, edges)
      cancelAnimations(element)
      element.style.transform = ''
      element.animate(motion.keyframes, motion.options).finished.then(
        () => setFlights((list) => list.filter((flight) => flight.card.userId !== card.userId)),
        () => undefined,
      )
      latest.current.history.push({ userId: card.userId, action })
      setFlights((list) => [...list.filter((flight) => flight.card.userId !== card.userId), { card, action }])
      stamp$.next(null)
      paintIntent(null)
      latest.current.onSwipe(card, action)
    },
    [paintIntent, stamp$],
  )

  /** Back to rest on a spring (a quick snap with reduced motion). */
  const settle = useCallback((element: HTMLElement, from: Pose, velocity: { vx: number; vy: number }) => {
    const motion = prefersReducedMotion() ? snapBackMotion(from) : springMotion(from, velocity)
    element.style.transform = ''
    element.animate(motion.keyframes, motion.options)
  }, [])

  const throwTop = useCallback(
    (action: DeckAction) => {
      if (dragging.current) return
      const card = latest.current.top
      const element = card ? dragLayer(card.userId) : null
      if (!card || !element?.parentElement) return
      const from = currentPose(element)
      launch(card, element, from, action, throwVelocity(action), edgesOf(element.parentElement.getBoundingClientRect()))
    },
    [dragLayer, launch],
  )

  useImperativeHandle(ref, () => ({ throwTop }), [throwTop])

  // The drag gesture: one subscription for the life of the deck (it follows whichever card is on top).
  useEffect(() => {
    const stack = stackRef.current
    if (!stack) return
    const pick = (event: PointerEvent): HTMLElement | null => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest('button, a, input, select, textarea')) return null
      const slot = target.closest<HTMLElement>('[data-depth="0"]')
      return slot?.querySelector<HTMLElement>(DRAG_LAYER) ?? null
    }
    let grip: Grip | null = null
    const poseAt = (g: Grip, dx: number, dy: number, reduced: boolean): Pose => {
      const x = g.base.x + dx
      const y = g.base.y + dy
      return { x, y, r: reduced ? 0 : rotationFor(x, g.grabY) }
    }

    const subscription = cardDrag(stack, pick).subscribe((event) => {
      const reduced = prefersReducedMotion()
      if (event.type === 'start') {
        const card = latest.current.top
        const slot = event.target.parentElement
        if (!card || !slot) return
        // grabbed mid-spring: continue from where the card is, not from rest
        const base = currentPose(event.target)
        cancelAnimations(event.target)
        event.target.style.transform = poseTransform(base)
        const rect = slot.getBoundingClientRect()
        grip = {
          card,
          element: event.target,
          base,
          grabY: event.grabY,
          box: { width: rect.width, height: rect.height },
          edges: edgesOf(rect),
        }
        setDragging(true)
        return
      }
      const g = grip
      if (!g) return
      if (event.type === 'move') {
        const pose = poseAt(g, event.dx, event.dy, reduced)
        g.element.style.transform = poseTransform(pose)
        const intent = intentOf(pose.x, pose.y, g.box)
        paintIntent(intent)
        stamp$.next(intent)
        return
      }
      grip = null
      setDragging(false)
      const pose = poseAt(g, event.dx, event.dy, reduced)
      const action = event.cancelled || event.tap ? null : decide(pose.x, pose.y, event.vx, event.vy, g.box)
      if (action) {
        launch(g.card, g.element, pose, action, { vx: event.vx, vy: event.vy }, g.edges)
        return
      }
      stamp$.next(null)
      paintIntent(null)
      settle(g.element, pose, { vx: event.vx, vy: event.vy })
      if (event.tap) latest.current.onOpen(g.card)
    })
    return () => {
      subscription.unsubscribe()
      setDragging(false)
    }
  }, [launch, paintIntent, setDragging, settle, stamp$])

  // A card thrown by this deck is back on top (rewind, failed swipe): fly it in from where it left.
  const lastTop = useRef<string | null>(null)
  useLayoutEffect(() => {
    const id = top?.userId ?? null
    if (id === lastTop.current) return
    lastTop.current = id
    if (!id) return
    const records = latest.current.history
    let index = -1
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].userId === id) {
        index = i
        break
      }
    }
    if (index < 0) return
    const { action } = records[index]
    records.splice(index, 1)
    const element = dragLayer(id)
    if (!element?.parentElement) return
    cancelAnimations(element)
    element.style.transform = ''
    const motion = returnMotion(action, edgesOf(element.parentElement.getBoundingClientRect()), prefersReducedMotion())
    element.animate(motion.keyframes, motion.options)
  }, [top, dragLayer])

  // Keyboard: ← pass, → like, Backspace / Z rewind.
  useEffect(() => {
    if (!keyboard) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
        )
      ) {
        return
      }
      const action: DeckAction | 'rewind' | null =
        event.key === 'ArrowLeft'
          ? 'pass'
          : event.key === 'ArrowRight'
            ? 'like'
            : event.key === 'Backspace' || event.key === 'z' || event.key === 'Z'
              ? 'rewind'
              : null
      if (!action) return
      event.preventDefault()
      if (event.repeat) return
      if (action === 'rewind') latest.current.onRewind()
      else throwTop(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, throwTop])

  const items: { card: DeckCard; depth: Depth }[] = [
    ...flights.map((flight) => ({ card: flight.card, depth: 'fly' as const })),
    ...shown.map((card, index) => ({ card, depth: index as 0 | 1 | 2 })),
  ]
  const flightAction = new Map(flights.map((flight) => [flight.card.userId, flight.action]))
  const name = top ? cardName(top) : null

  return (
    <div className={s.deck}>
      <div ref={stackRef} className={s.stack} data-count={shown.length}>
        {shown.length === 0 ? <div className={s.tray}>{placeholder}</div> : null}
        {items.map(({ card, depth }) => {
          const flying = flightAction.get(card.userId)
          return (
            <Slot
              key={card.userId}
              card={card}
              depth={depth}
              stamp={flying ? STAMP[flying] : depth === 0 ? (live?.stamp ?? null) : null}
              strength={flying ? 1 : depth === 0 ? (live?.strength ?? 0) : 0}
              onOpen={depth === 0 ? openCard : undefined}
            />
          )
        })}
      </div>

      <div ref={buttonsRef} className={s.buttons}>
        <span className={s.btn} data-kind="rewind">
          <ActionButton kind="rewind" size="md" onClick={onRewind} disabled={rewinding} aria-keyshortcuts="Backspace Z" />
        </span>
        <span className={s.btn} data-kind="pass">
          <ActionButton
            kind="pass"
            size="lg"
            label={name ? t('act.passOn', { name }) : t('kit.actionPass')}
            onClick={() => throwTop('pass')}
            disabled={!top}
            aria-keyshortcuts="ArrowLeft"
          />
        </span>
        <span className={s.btn} data-kind="like">
          <ActionButton
            kind="like"
            size="lg"
            label={name ? t('deck.likeName', { name }) : t('kit.actionLike')}
            onClick={() => throwTop('like')}
            disabled={!top}
            aria-keyshortcuts="ArrowRight"
          />
        </span>
      </div>

      <p className={s.legend} aria-hidden="true">
        <span>
          <kbd>←</kbd> {t('deck.legendNope')}
        </span>
        <span>
          <kbd>→</kbd> {t('deck.legendLike')}
        </span>
        <span>
          <kbd>Z</kbd> {t('deck.legendUndo')}
        </span>
      </p>
    </div>
  )
}
