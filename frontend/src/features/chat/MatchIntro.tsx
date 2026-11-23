/** The top of a conversation: who you are connected with, and, while it is empty, a few ways to start. */
import { useId } from 'react'
import type { Match } from '@/api/types'
import { useT } from '@/i18n'
import { Button, Headline, IconArrowRight, IconCalendar, Label, PhotoFrame, Serial, Stamp } from '@/ui'
import { icebreakersFor } from './icebreakers'
import { pad2 } from './time'
import s from './ChatPage.module.css'

export interface MatchIntroProps {
  match: Match
  me: { name: string; photo: string | null; seed: string }
  /** The conversation has no message yet: show the icebreakers. */
  empty: boolean
  onIcebreaker: (text: string) => void
  /** Offered under the icebreakers: skip the small talk and invite them. */
  onPlanDate?: () => void
}

/** A serial for the match ticket, stable per person. */
function ticketNumber(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 1_000_000
}

export function MatchIntro({ match, me, empty, onIcebreaker, onPlanDate }: MatchIntroProps) {
  const t = useT()
  const headingId = useId()
  const name = match.username

  if (!empty) {
    return (
      <div className={s.stub}>
        <Stamp variant="rubber" tone="matcha" size="sm" rotate={-3}>
          {t('chat.matched')}
        </Stamp>
        <span className="sr-only">{t('chat.connectedSr', { name })}</span>
      </div>
    )
  }

  // Nothing about them is loaded here (opening their profile counts as a visit): generic openers.
  const icebreakers = icebreakersFor()
  return (
    <section className={s.intro} aria-labelledby={headingId}>
      <div className={s.introArt} aria-hidden="true">
        <PhotoFrame src={me.photo} alt="" seed={me.seed} radius="md" shadow={3} tilt={-6} className={s.introMe} />
        <PhotoFrame src={match.profilePictureUrl} alt="" seed={match.userId} radius="md" shadow={3} tilt={5} className={s.introThem} />
        <Stamp tone="matcha" size="md" rotate={-11} className={s.introStamp} thunk>
          {t('kit.matchStamp')}
        </Stamp>
      </div>

      <div className={s.introCopy}>
        <Label tone="muted" className={s.introMeta}>
          <Serial value={ticketNumber(match.userId)} /> · {t('chat.connected')}
        </Label>
        <Headline as="h2" id={headingId} size="d2" width="condensed" print="riso" align="center">
          {t('chat.sayHi', { name })}
        </Headline>
      </div>

      <div className={s.breakers}>
        <Label size="sm" className={s.breakersHead}>
          {t('chat.icebreakers')}
        </Label>
        <ul className={s.breakerList}>
          {icebreakers.map((item, index) => (
            <li key={item.text}>
              <button type="button" className={s.breaker} onClick={() => onIcebreaker(item.text)}>
                <span className={s.breakerNo} aria-hidden="true">
                  {pad2(index + 1)}
                </span>
                <span className={s.breakerText}>{item.text}</span>
                <span className={s.breakerUse} aria-hidden="true">
                  <IconArrowRight size={18} strokeWidth={3} />
                </span>
                <span className="sr-only">{t('chat.useSr')}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {onPlanDate ? (
        <Button variant="paper" icon={<IconCalendar size={18} />} onClick={onPlanDate} className={s.introPlan}>
          {t('chat.orPlan')}
        </Button>
      ) : null}
    </section>
  )
}
