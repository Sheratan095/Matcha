/**
 * `/calendar`: dates planned with your connections. Invites waiting for your answer come first (accept
 * or decline), then what is ahead (yours still waiting, turned down, or on), then the dates that are
 * over. "Plan" invites a connection (so does "Plan a date" in a conversation's menu). The calendar loads
 * at sign-in (the tab's badge counts the invites) and realtime keeps it current.
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PlannedDate } from '@/api/types'
import { useT } from '@/i18n'
import { useNow } from '@/features/chat/hooks'
import { pad2 } from '@/features/chat/time'
import { coordinatesLabel } from '@/features/location/geo'
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconExternal,
  IconPin,
  IconPlus,
  IconRefresh,
  IconRegMark,
  IconX,
  Label,
  Notice,
  PageHeader,
  PosterWord,
  Skeleton,
  Text,
  TicketHeader,
} from '@/ui'
import { refresh, REVISIT_MS, useLoad, useNodeStatus, useNodeValue } from '@/wb'
import { CallOffDialog } from './CallOffDialog'
import { lookOf, useAnswerInvite } from './moves'
import { PlanDateSheet } from './PlanDateSheet'
import {
  agendaOf,
  isHappening,
  longDayLabel,
  mapLink,
  movesOf,
  nameOf,
  soonLabel,
  stubOf,
  timeRange,
} from './schedule'
import s from './CalendarPage.module.css'

export default function CalendarPage() {
  const t = useT()
  const dates = useNodeValue('dates')
  const status = useNodeStatus('calendar')
  const connections = useNodeValue('connections')
  const now = useNow(30_000)

  // Loaded at sign-in and kept current by realtime: a visit refetches only once it is getting old.
  // The connections give each date its person.
  useLoad('calendar', { maxAgeMs: REVISIT_MS })
  useLoad('connections', { maxAgeMs: REVISIT_MS })

  const [planning, setPlanning] = useState(false)
  const [callingOff, setCallingOff] = useState<PlannedDate | null>(null)

  const agenda = useMemo(() => (Array.isArray(dates) ? agendaOf(dates, now) : null), [dates, now])
  const empty = agenda !== null && agenda.invites.length + agenda.ahead.length + agenda.past.length === 0
  const noConnections = Array.isArray(connections?.matches) && connections.matches.length === 0

  const kicker = agenda
    ? t('cal.kicker', {
        invites: t.n('cal.invites', agenda.invites.length, { n: pad2(agenda.invites.length) }),
        n: pad2(agenda.ahead.length),
      })
    : t('cal.diary')

  return (
    <div className={s.page}>
      <PageHeader
        title={t('cal.title')}
        kicker={kicker}
        actions={
          <Button size="sm" icon={<IconPlus size={16} strokeWidth={3} />} aria-label={t('chat.planDate')} onClick={() => setPlanning(true)}>
            {t('cal.plan')}
          </Button>
        }
      />

      {agenda ? (
        empty ? (
          <NothingPlanned noConnections={noConnections} onPlan={() => setPlanning(true)} />
        ) : (
          <>
            {agenda.invites.length > 0 ? (
              <Section label={t('cal.invitesSection')} count={agenda.invites.length}>
                <DateList dates={agenda.invites} now={now} onCallOff={setCallingOff} />
              </Section>
            ) : null}
            <Section label={t('cal.ahead')} count={agenda.ahead.length}>
              {agenda.ahead.length > 0 ? (
                <DateList dates={agenda.ahead} now={now} onCallOff={setCallingOff} />
              ) : (
                <div className={s.quiet}>
                  <p className={s.quietTitle}>{t('cal.nothingAhead')}</p>
                  <p className={s.quietText}>
                    {agenda.invites.length > 0 ? t('cal.sayYes') : t('cal.planWithMatch')}
                  </p>
                </div>
              )}
            </Section>
            {agenda.past.length > 0 ? (
              <Section label={t('cal.beenThere')} count={agenda.past.length}>
                <DateList dates={agenda.past} now={now} onCallOff={setCallingOff} />
              </Section>
            ) : null}
            {status.status === 'error' ? (
              <Notice tone="warning" title={t('kit.notUpToDate')} action={<ReloadButton variant="paper" />}>
                {t('cal.latestFailed')}
              </Notice>
            ) : null}
          </>
        )
      ) : status.status === 'error' ? (
        <Notice tone="error" title={t('cal.loadFailed')} action={<ReloadButton variant="ink" />}>
          {status.error?.message ?? t('kit.wrong')}
        </Notice>
      ) : (
        <CalendarSkeleton />
      )}

      <PlanDateSheet open={planning} onClose={() => setPlanning(false)} />
      <CallOffDialog date={callingOff} onClose={() => setCallingOff(null)} />
    </div>
  )
}

function ReloadButton({ variant }: { variant: 'ink' | 'paper' }) {
  const t = useT()
  return (
    <Button size="sm" variant={variant} icon={<IconRefresh size={16} />} onClick={() => void refresh('calendar')}>
      {t('common.tryAgain')}
    </Button>
  )
}

function Section({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const headingId = useId()
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      <TicketHeader label={label} meta={pad2(count)} />
      {children}
    </section>
  )
}

function DateList({ dates, now, onCallOff }: { dates: PlannedDate[]; now: number; onCallOff: (date: PlannedDate) => void }) {
  return (
    <ul className={s.list}>
      {dates.map((date) => (
        <li key={date.id}>
          <DateTicket date={date} now={now} onCallOff={onCallOff} />
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------ one date

interface DateTicketProps {
  date: PlannedDate
  now: number
  onCallOff: (date: PlannedDate) => void
}

function DateTicket({ date, now, onCallOff }: DateTicketProps) {
  const t = useT()
  const { busy, answer } = useAnswerInvite(date)
  const name = nameOf(date)
  const stub = stubOf(date.startsAt)
  const look = lookOf(date, now)
  const moves = movesOf(date, now)
  const soon = soonLabel(date, now)
  const over = date.endsAt <= now

  return (
    <article className={s.ticket} data-over={over ? '' : undefined} aria-label={t('cal.dateWith', { title: date.title, name })}>
      <div className={s.stub} data-tone={look.tone} aria-hidden="true">
        <span className={s.stubWeekday}>{stub.weekday}</span>
        <span className={s.stubDay}>{stub.day}</span>
        <span className={s.stubMonth}>{stub.month}</span>
      </div>

      <div className={s.body}>
        <div className={s.meta}>
          <Label size="sm">
            <time dateTime={new Date(date.startsAt).toISOString()}>
              <span className="sr-only">{longDayLabel(date.startsAt, now)}, </span>
              {timeRange(date)}
            </time>
          </Label>
          {soon && !isHappening(date, now) ? (
            <Label size="sm" tone="muted">
              {soon}
            </Label>
          ) : null}
          {look.badge ? (
            <Badge tone={look.tone} className={s.badge}>
              {look.badge}
            </Badge>
          ) : null}
        </div>

        <h3 className={s.title}>{date.title}</h3>

        <Link to={`/chat/${date.person.userId}`} className={s.person}>
          <Avatar src={date.person.profilePictureUrl} name={name} size="xs" decorative />
          <span className={s.personText}>
            {t.rich(date.mine ? 'cal.youInvitedName' : 'cal.fromName', { name: <strong>{name}</strong> })}
          </span>
          <IconChevronRight size={16} strokeWidth={3} aria-hidden="true" />
          <span className="sr-only">{t('cal.openConversationSr')}</span>
        </Link>

        {date.description ? (
          <Text size="sm" className={s.description}>
            {date.description}
          </Text>
        ) : null}

        {date.place ? (
          <a className={s.place} href={mapLink(date.place)} target="_blank" rel="noopener noreferrer">
            <IconPin size={16} aria-hidden="true" />
            <span className={s.placeText}>{coordinatesLabel(date.place)}</span>
            <span className={s.placeOpen}>
              {t('cal.openMap')} <IconExternal size={14} aria-hidden="true" />
            </span>
            <span className="sr-only">{t('chat.mapSr')}</span>
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
                  {t('chat.accept')}
                </Button>
                <Button
                  size="sm"
                  variant="paper"
                  icon={<IconX size={16} strokeWidth={3} />}
                  loading={busy === 'decline'}
                  disabled={busy !== null}
                  onClick={() => answer('decline')}
                >
                  {t('chat.decline')}
                </Button>
              </>
            ) : null}
            {moves.cancel ? (
              <Button size="sm" variant="ghost" onClick={() => onCallOff(date)}>
                {date.status === 'declined' ? t('chat.remove') : t('chat.callOff')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

// ------------------------------------------------------------ empty, loading

function NothingPlanned({ noConnections, onPlan }: { noConnections: boolean; onPlan: () => void }) {
  const t = useT()
  return (
    <div className={s.empty}>
      <PosterWord size="min(40vw, 11rem)" tone="yolk" outline className={s.emptyWord}>
        {t('cal.free')}
      </PosterWord>
      <EmptyState
        stamp={t('cal.blankStamp')}
        stampTone="matcha"
        icon={<IconCalendar size={28} />}
        title={t('cal.nothingPlanned')}
        action={
          noConnections ? (
            <ButtonLink to="/discover" size="lg" icon={<IconRegMark size={22} />}>
              {t('cal.findMatchFirst')}
            </ButtonLink>
          ) : (
            <Button size="lg" icon={<IconCalendar size={22} />} onClick={onPlan}>
              {t('chat.planDate')}
            </Button>
          )
        }
      >
        {t('cal.emptyBody')}
      </EmptyState>
    </div>
  )
}

function CalendarSkeleton() {
  const t = useT()
  return (
    <div className={s.skeleton} aria-busy="true" aria-label={t('cal.loadingCalendar')}>
      {[0, 1, 2].map((index) => (
        <div key={index} className={s.skeletonTicket}>
          <Skeleton width={72} height={112} style={{ borderRadius: 14 }} />
          <div className={s.skeletonLines}>
            <Skeleton shape="text" width="35%" height={12} />
            <Skeleton shape="text" width="70%" height={20} />
            <Skeleton shape="text" width="50%" height={14} />
          </div>
        </div>
      ))}
    </div>
  )
}
