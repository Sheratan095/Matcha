/**
 * The deck's physics, as pure functions: what a drag means (intent), when a release commits a swipe,
 * and the keyframes of the fling, the spring back and the rewind's return. Everything animates
 * `transform` only (Web Animations), so a frame never touches layout.
 */
import type { DeckAction } from '@/api/types'

export interface Pose {
  x: number
  y: number
  /** Degrees. */
  r: number
}

export interface Box {
  width: number
  height: number
}

/** A rect relative to the viewport (enough to know how far a card must travel to leave it). */
export interface Edges {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Motion {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

export const REST: Pose = Object.freeze({ x: 0, y: 0, r: 0 })

/** Commit distance as a share of the card: 30% of its width sideways, 22% of its height upwards. */
const COMMIT_X = 0.3
/** No stamp for the first few pixels (a tap that wobbles must not flash NOPE). */
const DEAD_ZONE_PX = 10
/** A flick this fast commits even when short (px/ms). */
const FLICK_SPEED = 0.55
const FLICK_MIN_TRAVEL_PX = 24
const MAX_ROTATION = 22
/** Degrees per px of horizontal travel. */
const ROTATION_PER_PX = 0.075

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function poseTransform(pose: Pose): string {
  return `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) rotate(${pose.r.toFixed(3)}deg)`
}

/** The pose of an element right now (inline style or a running animation), from its computed matrix. */
export function currentPose(element: HTMLElement): Pose {
  const value = getComputedStyle(element).transform
  if (!value || value === 'none') return { ...REST }
  try {
    const m = new DOMMatrixReadOnly(value)
    return { x: m.m41, y: m.m42, r: (Math.atan2(m.b, m.a) * 180) / Math.PI }
  } catch {
    return { ...REST }
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Tilt for a horizontal offset. Grabbed by the bottom third, the card pivots the other way, like a
 * piece of card stock held low.
 */
export function rotationFor(x: number, grabY: number): number {
  const sign = grabY > 0.66 ? -1 : 1
  return Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, x * ROTATION_PER_PX * sign))
}

export interface Intent {
  action: DeckAction | null
  /** 0-1: how close the drag is to committing (1 = past the line). */
  strength: number
}

/** What the card would do if released here (drives the stamp, the buttons and the cards beneath). */
export function intentOf(x: number, _y: number, card: Box): Intent {
  const lineX = Math.max(60, card.width * COMMIT_X)
  const side = Math.max(0, Math.abs(x) - DEAD_ZONE_PX) / (lineX - DEAD_ZONE_PX)
  if (side > 0) return { action: x > 0 ? 'like' : 'pass', strength: clamp01(side) }
  return { action: null, strength: 0 }
}

/** The swipe a release commits, or null to spring back. A fast flick wins over the position. */
export function decide(x: number, y: number, vx: number, vy: number, card: Box): DeckAction | null {
  const speed = Math.hypot(vx, vy)
  if (speed >= FLICK_SPEED) {
    if (Math.abs(vx) >= Math.abs(vy) * 0.8 && Math.abs(x) > FLICK_MIN_TRAVEL_PX && Math.sign(vx) === Math.sign(x)) {
      return vx > 0 ? 'like' : 'pass'
    }
  }
  const intent = intentOf(x, y, card)
  return intent.strength >= 1 ? intent.action : null
}

/** Release velocity used when a button or a key throws the card (px/ms). */
export function throwVelocity(action: DeckAction): { vx: number; vy: number } {
  return { vx: action === 'like' ? 2.1 : -2.1, vy: -0.15 }
}

/**
 * The card thrown off the screen. It keeps the release speed (the initial slope of the easing is
 * matched to it), keeps turning the way it leans, and travels just far enough to clear the viewport.
 */
export function flingMotion(from: Pose, action: DeckAction, v: { vx: number; vy: number }, edges: Edges): Motion {
  const vw = window.innerWidth
  const slack = Math.max(edges.width, edges.height) * 0.35 // a rotated card is wider than its box
  const sign = action === 'like' ? 1 : -1
  const dx = sign > 0 ? vw - (edges.left + from.x) + slack : -(edges.right + from.x + slack)
  const to: Pose = { x: from.x + dx, y: from.y + Math.max(-260, Math.min(260, v.vy * 220)), r: from.r + sign * 14 }
  const distance = Math.abs(dx)
  const speed = Math.max(Math.abs(v.vx), 1.2)
  // easing cubic-bezier(.3,.6,.6,1) starts at slope 2: double the constant-speed duration
  const duration = Math.max(240, Math.min(560, (2 * distance) / speed))
  return {
    keyframes: [{ transform: poseTransform(from) }, { transform: poseTransform(to) }],
    options: { duration, easing: 'cubic-bezier(0.3, 0.6, 0.6, 1)', fill: 'forwards' },
  }
}

/** Reduced motion: no travel, no rotation, a quick fade where the card is. */
export function fadeOutMotion(from: Pose): Motion {
  return {
    keyframes: [
      { transform: poseTransform(from), opacity: 1 },
      { transform: poseTransform(from), opacity: 0 },
    ],
    options: { duration: 140, easing: 'linear', fill: 'forwards' },
  }
}

/**
 * Back to rest on a damped spring (semi-implicit Euler at 240 Hz, sampled at 60 fps), starting with
 * the release velocity. Slightly under-damped: it overshoots once, then settles.
 */
export function springMotion(from: Pose, v: { vx: number; vy: number }): Motion {
  const stiffness = 520
  const damping = 25
  const dt = 1 / 240
  let x = from.x
  let y = from.y
  let r = from.r
  let vx = v.vx * 1000
  let vy = v.vy * 1000
  let vr = 0
  const frames: Keyframe[] = [{ transform: poseTransform(from) }]
  let steps = 0
  for (let frame = 0; frame < 90; frame++) {
    for (let i = 0; i < 4; i++) {
      vx += (-stiffness * x - damping * vx) * dt
      vy += (-stiffness * y - damping * vy) * dt
      vr += (-stiffness * r - damping * vr) * dt
      x += vx * dt
      y += vy * dt
      r += vr * dt
      steps++
    }
    const settled = Math.abs(x) < 0.4 && Math.abs(y) < 0.4 && Math.abs(r) < 0.05 && Math.hypot(vx, vy) < 12
    if (settled) break
    frames.push({ transform: poseTransform({ x, y, r }) })
  }
  frames.push({ transform: poseTransform(REST) })
  return {
    keyframes: frames,
    options: { duration: Math.max(120, steps * dt * 1000), easing: 'linear' },
  }
}

/** Reduced motion: straight back, quickly, no overshoot. */
export function snapBackMotion(from: Pose): Motion {
  return {
    keyframes: [{ transform: poseTransform(from) }, { transform: poseTransform(REST) }],
    options: { duration: 120, easing: 'ease-out' },
  }
}

/** A rewound card comes back from the side it left, and lands with a thunk. */
export function returnMotion(action: DeckAction, edges: Edges, reduced: boolean): Motion {
  if (reduced) {
    return { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 150, easing: 'linear' } }
  }
  const vw = window.innerWidth
  const from: Pose =
    action === 'like'
      ? { x: vw - edges.left + edges.width * 0.2, y: -40, r: 18 }
      : { x: -(edges.right + edges.width * 0.2), y: -40, r: -18 }
  return {
    keyframes: [{ transform: poseTransform(from) }, { transform: poseTransform(REST) }],
    options: { duration: 460, easing: 'cubic-bezier(0.2, 1.25, 0.4, 1)' },
  }
}

export function edgesOf(rect: DOMRect): Edges {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
}
