/**
 * `/matches`: new matches nobody has written to yet (a strip of big portraits), then the
 * conversations, most recent first. Tapping either opens `/chat/:matchId`.
 */
import { useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import type { Match } from '@/api/types'
import { firstNameOf, mainPicture } from '@/features/chat/people'
import { useNow, useTypingMatches } from '@/features/chat/hooks'
import { pad2, shortAgo } from '@/features/chat/time'
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  CountBadge,
  EmptyState,
  IconCards,
  IconPlus,
  IconRefresh,
  ListRow,
  Notice,
  PageHeader,
  PosterWord,
  Skeleton,
  TicketHeader,
} from '@/ui'
import { refresh, useNodeStatus, useNodeValue } from '@/wb'
import s from './MatchesPage.module.css'

/** Last activity: the last message, else the match itself. */
function activityAt(match: Match): number {
  return Date.parse(match.lastMessage?.sentAt ?? match.matchedAt)
}

export default function MatchesPage() {
  const matches = useNodeValue('matches')
  const status = useNodeStatus('matches')
  const unread = useNodeValue('unreadCount') ?? 0
  const now = useNow(30_000)
  const typing = useTypingMatches()

  // Coming back to the list: pick up what changed meanwhile (no flash, the list stays on screen).
  useEffect(() => {
    void refresh('matches')
  }, [])

  const list = Array.isArray(matches) ? matches : null
  const fresh = list ? list.filter((match) => !match.lastMessage).sort((a, b) => activityAt(b) - activityAt(a)) : []
  const talking = list ? list.filter((match) => match.lastMessage).sort((a, b) => activityAt(b) - activityAt(a)) : []

  const kicker = list ? (
    <>
      {pad2(fresh.length)} new · {pad2(unread)} unread
    </>
  ) : (
    'Your tin'
  )

  return (
    <div className={s.page}>
      <PageHeader title="Matches" kicker={kicker} />

      {list ? (
        list.length === 0 ? (
          <NoMatches />
        ) : (
          <>
            <NewMatches matches={fresh} />
            <Conversations matches={talking} unread={unread} now={now} typing={typing} hasNew={fresh.length > 0} />
          </>
        )
      ) : status.status === 'error' ? (
        <Notice
          tone="error"
          title="Your matches did not load"
          action={
            <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={() => void refresh('matches')}>
              Try again
            </Button>
          }
        >
          {status.error?.message ?? 'Something went wrong.'}
        </Notice>
      ) : (
        <MatchesSkeleton />
      )}
    </div>
  )
}

// ------------------------------------------------------------ new matches

function NewMatches({ matches }: { matches: Match[] }) {
  const headingId = useId()
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        New matches
      </h2>
      <TicketHeader label={matches.length > 0 ? 'New matches · say hi first' : 'New matches · none waiting'} meta={pad2(matches.length)} />
      <ul className={s.strip}>
        {matches.map((match, index) => {
          const name = firstNameOf(match.profile)
          return (
            <li key={match.id} className={s.stripItem}>
              <Link to={`/chat/${match.id}`} className={s.fresh} style={{ rotate: `${index % 2 === 0 ? -2 : 2}deg` }}>
                <span className={s.freshFace}>
                  <Avatar src={mainPicture(match.profile)} name={name} size="xl" online={match.profile.online} shadow decorative />
                  <span className={s.freshBadge} aria-hidden="true">
                    <Badge tone="yolk" rotate={-8}>
                      New
                    </Badge>
                  </span>
                </span>
                <span className={s.freshName}>{name}</span>
                <span className="sr-only">, new match. Start the conversation.</span>
              </Link>
            </li>
          )
        })}
        <li className={s.stripItem}>
          <Link to="/discover" className={s.more}>
            <span className={s.moreFace} aria-hidden="true">
              <IconPlus size={30} strokeWidth={3} />
            </span>
            <span className={s.freshName}>Find more</span>
          </Link>
        </li>
      </ul>
    </section>
  )
}

// ------------------------------------------------------------ conversations

interface ConversationsProps {
  matches: Match[]
  unread: number
  now: number
  typing: ReadonlySet<string>
  hasNew: boolean
}

function Conversations({ matches, unread, now, typing, hasNew }: ConversationsProps) {
  const headingId = useId()
  return (
    <section className={s.section} aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        Conversations
      </h2>
      <TicketHeader label="Conversations" meta={unread > 0 ? `${pad2(unread)} unread` : pad2(matches.length)} />
      {matches.length === 0 ? (
        <div className={s.quiet}>
          <p className={s.quietTitle}>No conversations yet</p>
          <p className={s.quietText}>
            {hasNew ? 'Pick a new match above and say hello. Someone has to go first.' : 'Say hi to a match to start one.'}
          </p>
        </div>
      ) : (
        <ul className={s.rows}>
          {matches.map((match) => {
            const name = firstNameOf(match.profile)
            const last = match.lastMessage
            const mine = last != null && last.senderId !== match.profile.userId
            const isTyping = typing.has(match.id)
            const subtitle = isTyping ? (
              <span className={s.typing}>Typing…</span>
            ) : last ? (
              <>
                {mine ? <span className={s.you}>You: </span> : null}
                {last.text}
              </>
            ) : null
            return (
              <li key={match.id}>
                <ListRow
                  to={`/chat/${match.id}`}
                  leading={<Avatar src={mainPicture(match.profile)} name={name} size="md" online={match.profile.online} decorative />}
                  title={
                    <>
                      {name}
                      {match.profile.online ? <span className="sr-only">, online</span> : null}
                    </>
                  }
                  subtitle={subtitle}
                  meta={last ? <time dateTime={last.sentAt}>{shortAgo(last.sentAt, now)}</time> : null}
                  unread={match.unread > 0}
                  trailing={
                    match.unread > 0 ? (
                      <CountBadge count={match.unread} label={match.unread === 1 ? 'unread message' : 'unread messages'} />
                    ) : undefined
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ------------------------------------------------------------ empty, loading

function NoMatches() {
  return (
    <div className={s.empty}>
      <PosterWord size="min(40vw, 11rem)" tone="matcha" outline className={s.emptyWord}>
        Swipe
      </PosterWord>
      <EmptyState
        stamp="Empty tin"
        stampTone="strawberry"
        title="No matches yet"
        action={
          <ButtonLink to="/discover" size="lg" icon={<IconCards size={22} />}>
            Go to Discover
          </ButtonLink>
        }
      >
        Every match starts on Discover. Like someone who likes you back, and they land here.
      </EmptyState>
    </div>
  )
}

function MatchesSkeleton() {
  return (
    <div className={s.skeleton} aria-busy="true" aria-label="Loading your matches">
      <div className={s.skeletonStrip}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={s.skeletonFresh}>
            <Skeleton shape="circle" width={96} height={96} />
            <Skeleton shape="text" width={56} height={12} />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className={s.skeletonRow}>
          <Skeleton shape="circle" width={48} height={48} />
          <div className={s.skeletonLines}>
            <Skeleton shape="text" width="40%" height={16} />
            <Skeleton shape="text" width="75%" height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}
