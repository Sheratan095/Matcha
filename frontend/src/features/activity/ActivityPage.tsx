/**
 * `/activity`: who likes you (answer them: a like back connects you), who viewed your profile, and the
 * profiles you visited. The tab is in the URL (`?tab=views`, `?tab=visited`) so a notification can link
 * straight to it. Likes load at sign-in (the shell's badge); the visitors load with this page, your
 * visits with their tab.
 */
import { useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { DeckAction, UserSummary } from '@/api/types'
import { firstNameOf, mainPicture } from '@/features/chat/people'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import { summaryPreviewProfile } from '@/features/profile/format'
import { ActionButton, IconEye, IconHeart, IconPin, MatchMoment, PageHeader, TabPanel, toast } from '@/ui'
import { actions, refresh, REVISIT_MS, toApiError, useLoad, useNodeStatus, useNodeValue } from '@/wb'
import { LikesPanel } from './LikesPanel'
import { ScoreTabs } from './ScoreTabs'
import { ViewersPanel } from './ViewersPanel'
import s from './ActivityPage.module.css'

type TabValue = 'likes' | 'views' | 'visited'

function tabFrom(value: string | null): TabValue {
  return value === 'views' || value === 'visited' ? value : 'likes'
}

export default function ActivityPage() {
  const idBase = useId()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = tabFrom(params.get('tab'))
  // A tab switch is a navigation: preventScrollReset keeps <ScrollRestoration /> from jumping to the top.
  const setTab = (value: TabValue) =>
    setParams(value === 'likes' ? {} : { tab: value }, { replace: true, preventScrollReset: true })

  // Realtime keeps likes and visitors current: a visit refetches them only once they are getting old.
  useLoad('likesReceived', { maxAgeMs: REVISIT_MS })
  useLoad('myViewers', { maxAgeMs: REVISIT_MS })
  // No event tells of your own visits: opening a profile marks the list stale instead.
  useLoad('visitedProfiles', { maxAgeMs: REVISIT_MS, enabled: tab === 'visited' })

  const likesValue = useNodeValue('likesReceived')
  const likesStatus = useNodeStatus('likesReceived')
  const viewersValue = useNodeValue('myViewers')
  const viewersStatus = useNodeStatus('myViewers')
  const visitedValue = useNodeValue('visitedProfiles')
  const visitedStatus = useNodeStatus('visitedProfiles')
  const myProfile = useNodeValue('myProfile')
  const myId = useNodeValue('sessionUserId')

  const likes = likesValue && Array.isArray(likesValue.likes) ? likesValue.likes : null
  const viewers = viewersValue ? viewersValue.viewers : null
  const visited = visitedValue ? visitedValue.visited : null

  // ------------------------------------------------------------ profile sheet + answering a like
  const [target, setTarget] = useState<ProfileTarget | null>(null)
  /** Set when the sheet shows someone who liked you: it offers to answer them. */
  const [admirer, setAdmirer] = useState<UserSummary | null>(null)
  const [busy, setBusy] = useState<DeckAction | null>(null)
  const [swipeError, setSwipeError] = useState<string | null>(null)
  const closeSheet = () => {
    if (busy) return
    setTarget(null)
    setAdmirer(null)
    setSwipeError(null)
  }

  const openAdmirer = (person: UserSummary) => {
    setAdmirer(person)
    setTarget({ userId: person.userId, preview: summaryPreviewProfile(person, { liked: false, likesYou: true, matched: false }) })
  }

  const [match, setMatch] = useState<UserSummary | null>(null)
  // The match moment keeps its people on screen while it plays its exit.
  const [shownMatch, setShownMatch] = useState<UserSummary | null>(null)
  if (match && match !== shownMatch) setShownMatch(match)

  const answer = (person: UserSummary, action: DeckAction) => {
    if (busy) return
    const name = person.username
    setBusy(action)
    setSwipeError(null)
    actions.answerLike(person.userId, action).then(
      (outcome) => {
        setBusy(null)
        setTarget(null)
        setAdmirer(null)
        if (outcome.matched) setMatch(person)
        else if (action === 'like') toast.show({ tone: 'strawberry', title: `You liked ${name}` })
        else toast.show({ tone: 'ink', title: `You passed on ${name}`, message: 'They will not show up here again.' })
      },
      (error: unknown) => {
        setBusy(null)
        setSwipeError(toApiError(error).message)
      },
    )
  }

  const sheetActions =
    admirer && target?.userId === admirer.userId ? (
      <div className={s.answer}>
        <p className={s.answerNote}>
          <span className={s.answerHeart} aria-hidden="true">
            <IconHeart size={16} filled />
          </span>
          {admirer.username} already likes you. Like back and you&rsquo;re connected.
        </p>
        <div className={s.answerButtons}>
          <ActionButton
            kind="pass"
            size="lg"
            label={`Pass on ${admirer.username}`}
            disabled={busy !== null}
            aria-busy={busy === 'pass' || undefined}
            onClick={() => answer(admirer, 'pass')}
          />
          <ActionButton
            kind="like"
            size="xl"
            label={`Like ${admirer.username} back`}
            disabled={busy !== null}
            aria-busy={busy === 'like' || undefined}
            onClick={() => answer(admirer, 'like')}
          />
        </div>
        {swipeError ? (
          <p className={s.answerError} role="alert">
            {swipeError}
          </p>
        ) : null}
      </div>
    ) : undefined

  return (
    <div className={s.page}>
      <PageHeader title="Activity" kicker="Who is into you" />

      <ScoreTabs
        label="Activity"
        idBase={idBase}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'likes', label: 'Likes you', count: likes ? likes.length : null, tone: 'strawberry', icon: <IconHeart size={16} filled /> },
          { value: 'views', label: 'Viewed you', count: viewers ? viewers.length : null, tone: 'blue', icon: <IconEye size={16} strokeWidth={3} /> },
          { value: 'visited', label: 'You visited', count: visited ? visited.length : null, tone: 'yolk', icon: <IconPin size={16} strokeWidth={3} /> },
        ]}
      />

      <TabPanel idBase={idBase} value="likes" active={tab === 'likes'} className={s.panel}>
        <LikesPanel likes={likes} status={likesStatus} onRetry={() => void refresh('likesReceived')} onOpen={openAdmirer} />
      </TabPanel>
      <TabPanel idBase={idBase} value="views" active={tab === 'views'} className={s.panel}>
        <ViewersPanel
          viewers={viewers}
          status={viewersStatus}
          onRetry={() => void refresh('myViewers')}
          onOpen={(userId) => {
            setAdmirer(null)
            setTarget({ userId })
          }}
        />
      </TabPanel>
      <TabPanel idBase={idBase} value="visited" active={tab === 'visited'} className={s.panel}>
        <ViewersPanel
          kind="visited"
          viewers={visited}
          status={visitedStatus}
          onRetry={() => void refresh('visitedProfiles')}
          onOpen={(userId) => {
            setAdmirer(null)
            setTarget({ userId })
          }}
        />
      </TabPanel>

      <ProfileSheet target={target} onClose={closeSheet} actions={sheetActions} />

      <MatchMoment
        open={match !== null}
        onClose={() => setMatch(null)}
        me={{ name: firstNameOf(myProfile, 'You'), photo: mainPicture(myProfile), seed: myId ?? 'me' }}
        them={{ name: shownMatch?.username ?? 'Someone', photo: shownMatch?.profilePictureUrl ?? null, seed: shownMatch?.userId }}
        onMessage={() => {
          const id = match?.userId
          setMatch(null)
          if (id) navigate(`/chat/${id}`)
        }}
      >
        {shownMatch?.username ?? 'They'} liked you first, and now it&rsquo;s mutual. Say something before the tea goes cold.
      </MatchMoment>
    </div>
  )
}
