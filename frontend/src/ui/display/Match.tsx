import type { ReactNode } from 'react'
import { useT } from '@/i18n'
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
  const t = useT()
  return (
    <div className={cx(s.celebration, animate && s.animate, className)} data-surface="ink">
      <div className={s.rays} aria-hidden="true" />
      <Halftone from="center" tone="strawberry" columns={36} opacity={0.5} className={s.dots} />

      <div className={s.bandTop}>
        <Marquee items={[t('kit.matchMarquee1'), t('kit.matchMarquee2'), t('kit.matchMarquee1'), t('kit.matchMarquee3')]} tone="matcha" tilt={-4} speed={18} />
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
            {t('kit.matchStamp')}
          </Stamp>
        </span>
      </div>

      <div className={s.copy}>
        <p className={s.kicker}>{t('kit.matchKicker')}</p>
        <p className={s.word}>{t('kit.matchWord')}</p>
        <p className={s.line}>{children ?? t('kit.matchLine', { name: them.name })}</p>
      </div>

      {(onMessage || onDismiss) && (
        <div className={s.actions}>
          {onMessage ? (
            <Button size="lg" block icon={<IconChat size={22} filled />} onClick={onMessage}>
              {t('kit.matchMessage')}
            </Button>
          ) : null}
          {onDismiss ? (
            <Button size="md" variant="paper" block onClick={onDismiss}>
              {t('kit.matchKeep')}
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
  const t = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('kit.matchTitle', { name: rest.them.name })} hideTitle variant="takeover" tone="ink">
      <MatchCelebration {...rest} onDismiss={onDismiss ?? onClose} />
    </Modal>
  )
}
