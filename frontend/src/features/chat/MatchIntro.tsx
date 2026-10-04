/** The top of a conversation: when you matched, and, while it is empty, a few ways to start. */
import { useId } from 'react'
import type { Match } from '@/api/types'
import { Chip, Headline, IconArrowRight, Label, PhotoFrame, Serial, Stamp } from '@/ui'
import { icebreakersFor } from './icebreakers'
import { firstNameOf, mainPicture, tagLabel } from './people'
import { agoPhrase, pad2, shortDate } from './time'
import s from './ChatPage.module.css'

export interface MatchIntroProps {
  match: Match
  me: { name: string; photo: string | null; seed: string }
  now: number
  /** The conversation has no message yet: show the icebreakers. */
  empty: boolean
  onIcebreaker: (text: string) => void
}

/** A serial for the match ticket, stable per match. */
function ticketNumber(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 1_000_000
}

export function MatchIntro({ match, me, now, empty, onIcebreaker }: MatchIntroProps) {
  const headingId = useId()
  const person = match.profile
  const name = firstNameOf(person)

  if (!empty) {
    return (
      <div className={s.stub}>
        <Stamp variant="rubber" tone="matcha" size="sm" rotate={-3} sub={shortDate(match.matchedAt, now)}>
          Matched
        </Stamp>
        <span className="sr-only">
          You matched with {name} {agoPhrase(match.matchedAt, now)}.
        </span>
        {person.commonTags.length > 0 ? (
          <p className={s.stubCommon}>
            You both like{' '}
            {person.commonTags.map((tag) => (
              <span key={tag} className={s.stubTag}>
                #{tagLabel(tag)}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    )
  }

  const icebreakers = icebreakersFor(person)
  return (
    <section className={s.intro} aria-labelledby={headingId}>
      <div className={s.introArt} aria-hidden="true">
        <PhotoFrame src={me.photo} alt="" seed={me.seed} radius="md" shadow={3} tilt={-6} className={s.introMe} />
        <PhotoFrame src={mainPicture(person)} alt="" seed={person.userId} radius="md" shadow={3} tilt={5} className={s.introThem} />
        <Stamp tone="matcha" size="md" rotate={-11} className={s.introStamp} thunk>
          Match!
        </Stamp>
      </div>

      <div className={s.introCopy}>
        <Label tone="muted" className={s.introMeta}>
          <Serial value={ticketNumber(match.id)} /> · Matched {agoPhrase(match.matchedAt, now)}
        </Label>
        <Headline as="h2" id={headingId} size="d2" width="condensed" print="riso" align="center">
          Say hi to {name}
        </Headline>
      </div>

      {person.commonTags.length > 0 ? (
        <div className={s.common}>
          <Label size="sm">You both like</Label>
          <ul className={s.commonTags}>
            {person.commonTags.map((tag) => (
              <li key={tag}>
                <Chip tone="matcha" size="sm">
                  #{tagLabel(tag)}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={s.breakers}>
        <Label size="sm" className={s.breakersHead}>
          Icebreakers · tap to use
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
                <span className="sr-only">: put it in the message box</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
