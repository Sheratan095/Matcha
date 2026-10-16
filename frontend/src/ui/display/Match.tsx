import type { ReactNode } from 'react'
import { cx } from '../cx'
import { Button } from '../controls/Button'
import { IconChat } from '../icons'
import { Marquee } from '../lettering/Marquee'
import { Stamp } from '../lettering/Stamp'
import { LogoMark } from '../lettering/Wordmark'
import { Modal } from '../overlay/Modal'
import { Halftone } from '../print/Print'
import { PhotoFrame } from './Photo'
import s from './Match.module.css'

export interface MatchPerson {
  name: string
  photo?: string | null
  /** Seed for the fallback artwork. */
  seed?: string
}

export interface MatchCelebrationProps {
  me: MatchPerson
  them: MatchPerson
  /** "Send a message". Omit to hide the button. */
  onMessage?: () => void
  /** "Keep swiping". Omit to hide the button. */
  onDismiss?: () => void
  /** Replace the default line under the headline. */
  children?: ReactNode
  /** Play the entrance (stamp thunk, photos sliding in). Default true. */
  animate?: boolean
  className?: string
}

/**
 * The "It's a match" composition: sunburst, two portraits slapped on at angles, a MATCH stamp,
 * a ticker band and the two next steps. Fills its container; use MatchMoment for the overlay.
 */
export function MatchCelebration({ me, them, onMessage, onDismiss, children, animate = true, className }: MatchCelebrationProps) {
  return (
    <div className={cx(s.celebration, animate && s.animate, className)} data-surface="ink">
      <div className={s.rays} aria-hidden="true" />
      <Halftone from="center" tone="strawberry" columns={36} opacity={0.5} className={s.dots} />

      <div className={s.bandTop}>
        <Marquee items={["It's a match", 'Pour two cups', "It's a match", 'Steeped in mutual interest']} tone="matcha" tilt={-4} speed={18} />
      </div>

      <div className={s.photos}>
        <div className={cx(s.polaroid, s.left)}>
          <PhotoFrame src={me.photo} alt={me.name} seed={me.seed ?? me.name} radius="md" />
          <span className={s.caption}>{me.name}</span>
        </div>
        <div className={cx(s.polaroid, s.right)}>
          <PhotoFrame src={them.photo} alt={them.name} seed={them.seed ?? them.name} radius="md" />
          <span className={s.caption}>{them.name}</span>
        </div>
        <span className={s.seal} aria-hidden="true">
          <LogoMark size={64} />
        </span>
        <span className={s.stamp} aria-hidden="true">
          <Stamp tone="matcha" size="lg" rotate={-9} thunk={animate}>
            Match!
          </Stamp>
        </span>
      </div>

      <div className={s.copy}>
        <p className={s.kicker}>It&rsquo;s a</p>
        <p className={s.word}>Match</p>
        <p className={s.line}>{children ?? <>You and {them.name} liked each other. Say something before the tea goes cold.</>}</p>
      </div>

      {(onMessage || onDismiss) && (
        <div className={s.actions}>
          {onMessage ? (
            <Button size="lg" block icon={<IconChat size={22} filled />} onClick={onMessage}>
              Send a message
            </Button>
          ) : null}
          {onDismiss ? (
            <Button size="md" variant="paper" block onClick={onDismiss}>
              Keep swiping
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export interface MatchMomentProps extends Omit<MatchCelebrationProps, 'animate' | 'className'> {
  open: boolean
  /** Escape, the close button, and "Keep swiping" (when onDismiss is not given separately). */
  onClose: () => void
}

/** The match celebration as a full-screen takeover (focus-trapped, Escape closes). */
export function MatchMoment({ open, onClose, onDismiss, ...rest }: MatchMomentProps) {
  return (
    <Modal open={open} onClose={onClose} title={`It's a match with ${rest.them.name}`} hideTitle variant="takeover" tone="ink">
      <MatchCelebration {...rest} onDismiss={onDismiss ?? onClose} />
    </Modal>
  )
}
