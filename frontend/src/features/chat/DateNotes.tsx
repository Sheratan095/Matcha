/**
 * The calendar's lines in a conversation, drawn from the dates planned with the partner (nothing is
 * stored as a message): where an invite was sent, a ticket with its answer and what can still be done
 * about it; where an accepted date began, a line saying so.
 */
import type { PlannedDate } from '@/api/types'
import { lookOf, useAnswerInvite } from '@/features/calendar/moves'
import { isHappening, longDayLabel, mapLink, movesOf, nameOf, stubOf, timeRange } from '@/features/calendar/schedule'
import { coordinatesLabel } from '@/features/location/geo'
import { Badge, Button, IconCalendar, IconCheck, IconExternal, IconPin, IconX, Label } from '@/ui'
import { clockTime } from './time'
import s from './DateNotes.module.css'

const iso = (time: number) => new Date(time).toISOString()

export interface DatePlannedProps {
  date: PlannedDate
  now: number
  onCallOff: (date: PlannedDate) => void
}

/** The invite: who asked whom, the ticket, and accept / decline / call off while they can be done. */
export function DatePlanned({ date, now, onCallOff }: DatePlannedProps) {
  const { busy, answer } = useAnswerInvite(date)
  const name = nameOf(date)
  const stub = stubOf(date.startsAt)
  const look = lookOf(date, now)
  const moves = movesOf(date, now)
  const over = date.endsAt <= now
  const badge = look.badge ?? (date.status === 'accepted' ? 'Been there' : null)

  return (
    <article className={s.planned} data-over={over ? '' : undefined} aria-label={`Date: ${date.title}`}>
      <p className={s.kicker}>
        <IconCalendar size={14} aria-hidden="true" />
        {date.mine ? (
          <span>
            You invited <strong>{name}</strong> on a date
          </span>
        ) : (
          <span>
            <strong>{name}</strong> invited you on a date
          </span>
        )}
        {date.plannedAt != null ? (
          <time className={s.kickerTime} dateTime={iso(date.plannedAt)}>
            {clockTime(date.plannedAt)}
          </time>
        ) : null}
      </p>

      <div className={s.ticket}>
        <div className={s.stub} data-tone={look.tone} aria-hidden="true">
          <span className={s.stubSmall}>{stub.weekday}</span>
          <span className={s.stubDay}>{stub.day}</span>
          <span className={s.stubSmall}>{stub.month}</span>
        </div>

        <div className={s.body}>
          <div className={s.meta}>
            <Label size="sm">
              <time dateTime={iso(date.startsAt)}>
                <span className="sr-only">{longDayLabel(date.startsAt, now)}, </span>
                {timeRange(date)}
              </time>
            </Label>
            {badge ? (
              <Badge tone={look.tone} className={s.badge}>
                {badge}
              </Badge>
            ) : null}
          </div>

          <h3 className={s.title}>{date.title}</h3>

          {date.description ? <p className={s.description}>{date.description}</p> : null}

          {date.place ? (
            <a className={s.place} href={mapLink(date.place)} target="_blank" rel="noopener noreferrer">
              <IconPin size={16} aria-hidden="true" />
              <span className={s.placeText}>{coordinatesLabel(date.place)}</span>
              <span className={s.placeOpen}>
                Map <IconExternal size={14} aria-hidden="true" />
              </span>
              <span className="sr-only"> (opens OpenStreetMap in a new tab)</span>
            </a>
          ) : null}

          {moves.answer || moves.cancel ? (
            <div className={s.actions}>
              {moves.answer ? (
                <>
                  <Button
                    size="sm"
                    icon={<IconCheck size={16} strokeWidth={3} />}
                    loading={busy === 'accept'}
                    disabled={busy !== null}
                    onClick={() => answer('accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="paper"
                    icon={<IconX size={16} strokeWidth={3} />}
                    loading={busy === 'decline'}
                    disabled={busy !== null}
                    onClick={() => answer('decline')}
                  >
                    Decline
                  </Button>
                </>
              ) : null}
              {moves.cancel ? (
                <Button size="sm" variant="ghost" onClick={() => onCallOff(date)}>
                  {date.status === 'declined' ? 'Remove' : 'Call off'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/** An accepted date began: lit while it is on. */
export function DateStarted({ date, now }: { date: PlannedDate; now: number }) {
  const on = isHappening(date, now)
  return (
    <p className={s.started} data-on={on ? '' : undefined}>
      <span className={s.startedDot} aria-hidden="true" />
      <span className={s.startedText}>
        {on ? 'Your date has started' : 'Your date started'} · <strong>{date.title}</strong>
      </span>
      <time className={s.kickerTime} dateTime={iso(date.startsAt)}>
        {clockTime(date.startsAt)}
      </time>
    </p>
  )
}
