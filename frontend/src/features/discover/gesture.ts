/**
 * The card drag as one RxJS pipeline (framework-free; the deck subscribes to it).
 *
 *   pointerdown on the root (primary button, on the live card only: `pick`)
 *     └─ switchMap: one gesture per press (a new press abandons the previous one)
 *          pointermove (+ coalesced samples) · pointerup · pointercancel / lostpointercapture
 *            └─ takeWhile(move, inclusive)  the release sample ends the gesture
 *               └─ scan  →  Track { offset, last ~90 ms of samples, max travel }   (shared)
 *                    ├─ auditTime(0, animationFrameScheduler) → 'move', at most one per frame
 *                    │    (takeUntil the release, so no stale frame lands after it)
 *                    └─ last() → 'end' with the release velocity and whether it was a tap
 *
 * Moves are coalesced to animation frames, so the consumer writes one transform per frame. The only
 * layout read is the card's rect, once, when the press starts.
 */
import {
  animationFrameScheduler,
  auditTime,
  concat,
  filter,
  fromEvent,
  last,
  map,
  merge,
  mergeMap,
  of,
  scan,
  share,
  switchMap,
  takeUntil,
  takeWhile,
  type Observable,
} from 'rxjs'

export interface GestureStart {
  type: 'start'
  /** The element under the finger (it holds the pointer capture). */
  target: HTMLElement
  rect: DOMRect
  /** Where the card was grabbed, 0-1 from its top-left corner. */
  grabX: number
  grabY: number
}

export interface GestureMove {
  type: 'move'
  /** Offset from the press, px. */
  dx: number
  dy: number
}

export interface GestureEnd {
  type: 'end'
  dx: number
  dy: number
  /** Release velocity, px/ms, from the last ~90 ms of samples. */
  vx: number
  vy: number
  /** Released without moving much, quickly: a click / tap. */
  tap: boolean
  /** The browser took the pointer (scroll, system gesture): never commit a swipe. */
  cancelled: boolean
}

export type CardGesture = GestureStart | GestureMove | GestureEnd

interface Sample {
  x: number
  y: number
  t: number
}

interface PointerInput {
  kind: 'move' | 'up' | 'cancel'
  sample: Sample
}

interface Track {
  origin: Sample
  last: Sample
  /** Samples of the last VELOCITY_WINDOW_MS, oldest first. */
  recent: Sample[]
  /** Largest distance from the origin so far (tells a tap from a drag that came back). */
  travel: number
  ended: 'up' | 'cancel' | null
}

const VELOCITY_WINDOW_MS = 90
const TAP_SLOP_PX = 8
const TAP_MAX_MS = 500

const sampleOf = (event: PointerEvent): Sample => ({ x: event.clientX, y: event.clientY, t: event.timeStamp })

/** Every sample the browser merged into this event (more accurate velocity on fast flicks). */
function coalesced(event: PointerEvent): PointerEvent[] {
  const list = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
  return list.length > 0 ? list : [event]
}

function begin(origin: Sample): Track {
  return { origin, last: origin, recent: [origin], travel: 0, ended: null }
}

function advance(track: Track, input: PointerInput): Track {
  // pointercancel carries no trustworthy position: keep the last one
  const sample = input.kind === 'cancel' ? { ...track.last, t: input.sample.t } : input.sample
  const recent = track.recent.filter((s) => sample.t - s.t <= VELOCITY_WINDOW_MS)
  recent.push(sample)
  const travel = Math.max(track.travel, Math.hypot(sample.x - track.origin.x, sample.y - track.origin.y))
  return { origin: track.origin, last: sample, recent, travel, ended: input.kind === 'move' ? null : input.kind }
}

function velocity(recent: readonly Sample[]): { vx: number; vy: number } {
  if (recent.length < 2) return { vx: 0, vy: 0 }
  const first = recent[0]
  const lastSample = recent[recent.length - 1]
  const dt = lastSample.t - first.t
  if (dt < 8) return { vx: 0, vy: 0 }
  return { vx: (lastSample.x - first.x) / dt, vy: (lastSample.y - first.y) / dt }
}

function toEnd(track: Track): GestureEnd {
  const cancelled = track.ended !== 'up'
  const { vx, vy } = cancelled ? { vx: 0, vy: 0 } : velocity(track.recent)
  return {
    type: 'end',
    dx: track.last.x - track.origin.x,
    dy: track.last.y - track.origin.y,
    vx,
    vy,
    tap: !cancelled && track.travel < TAP_SLOP_PX && track.last.t - track.origin.t < TAP_MAX_MS,
    cancelled,
  }
}

function gesture(down: PointerEvent, target: HTMLElement): Observable<CardGesture> {
  const id = down.pointerId
  try {
    target.setPointerCapture(id)
  } catch {
    // the pointer is already gone (released between the event and now): moves still bubble
  }
  const rect = target.getBoundingClientRect()
  const origin = sampleOf(down)
  const mine = (event: PointerEvent) => event.pointerId === id

  const input$: Observable<PointerInput> = merge(
    fromEvent<PointerEvent>(target, 'pointermove').pipe(
      filter(mine),
      mergeMap(coalesced),
      map((event): PointerInput => ({ kind: 'move', sample: sampleOf(event) })),
    ),
    fromEvent<PointerEvent>(target, 'pointerup').pipe(
      filter(mine),
      map((event): PointerInput => ({ kind: 'up', sample: sampleOf(event) })),
    ),
    merge(fromEvent<PointerEvent>(target, 'pointercancel'), fromEvent<PointerEvent>(target, 'lostpointercapture')).pipe(
      filter(mine),
      map((event): PointerInput => ({ kind: 'cancel', sample: sampleOf(event) })),
    ),
  )

  const track$ = input$.pipe(
    takeWhile((input) => input.kind === 'move', true),
    scan(advance, begin(origin)),
    share(),
  )
  const end$ = track$.pipe(last(), map(toEnd))
  const moves$ = track$.pipe(
    filter((track) => track.ended === null),
    auditTime(0, animationFrameScheduler),
    map((track): GestureMove => ({ type: 'move', dx: track.last.x - origin.x, dy: track.last.y - origin.y })),
    takeUntil(end$),
  )

  const start: GestureStart = {
    type: 'start',
    target,
    rect,
    grabX: rect.width > 0 ? (down.clientX - rect.left) / rect.width : 0.5,
    grabY: rect.height > 0 ? (down.clientY - rect.top) / rect.height : 0.5,
  }
  return concat(of(start), merge(moves$, end$))
}

/**
 * Drag gestures on the cards inside `root`. `pick` returns the element to drag for a press (the live
 * card's draggable layer), or null to ignore the press (buttons inside the card, the cards beneath).
 */
export function cardDrag(root: HTMLElement, pick: (event: PointerEvent) => HTMLElement | null): Observable<CardGesture> {
  return fromEvent<PointerEvent>(root, 'pointerdown').pipe(
    filter((event) => event.isPrimary && event.button === 0),
    map((event) => ({ event, target: pick(event) })),
    filter((press): press is { event: PointerEvent; target: HTMLElement } => press.target !== null),
    switchMap(({ event, target }) => gesture(event, target)),
  )
}
