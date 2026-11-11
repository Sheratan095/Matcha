/**
 * `/activity`: who likes you (answer them: a like is an instant match) and who viewed your profile.
 * The tab is in the URL (`?tab=views`) so a notification can link straight to it.
 */
import { useEffect, useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Card, Match, SwipeAction } from '@/api/types'
import { firstNameOf, mainPicture } from '@/features/chat/people'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import { isCard } from '@/features/profile/format'
import { ActionButton, IconEye, IconHeart, MatchMoment, PageHeader, TabPanel, toast } from '@/ui'
import { actions, refresh, toApiError, useNodeStatus, useNodeValue } from '@/wb'
import { LikesPanel } from './LikesPanel'
import { ScoreTabs } from './ScoreTabs'
import { ViewersPanel } from './ViewersPanel'
import s from './ActivityPage.module.css'

type TabValue = 'likes' | 'views'

export default function ActivityPage() {
  const idBase = useId()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: TabValue = params.get('tab') === 'views' ? 'views' : 'likes'
  const setTab = (value: TabValue) => setParams(value === 'likes' ? {} : { tab: value }, { replace: true })

  const likesValue = useNodeValue('likesReceived')
  const likesStatus = useNodeStatus('likesReceived')
  const viewersValue = useNodeValue('myViewers')
  const viewersStatus = useNodeStatus('myViewers')
  const myProfile = useNodeValue('myProfile')
  const myId = useNodeValue('sessionUserId')

  const likes = Array.isArray(likesValue) ? likesValue : null
  const viewers = viewersValue ? viewersValue.viewers : null

  // Both lists share one refresh trigger: one bump reloads likes and visitors, in place.
  useEffect(() => {
    void refresh('likesReceived')
  }, [])

  // ------------------------------------------------------------ profile sheet + answering a like
  const [target, setTarget] = useState<ProfileTarget | null>(null)
  const [busy, setBusy] = useState<SwipeAction | null>(null)
  const [swipeError, setSwipeError] = useState<string | null>(null)
  const closeSheet = () => {
    if (busy) return
    setTarget(null)
    setSwipeError(null)
  }

  const [match, setMatch] = useState<Match | null>(null)
  // The match moment keeps its people on screen while it plays its exit.
  const [shownMatch, setShownMatch] = useState<Match | null>(null)
  if (match && match !== shownMatch) setShownMatch(match)

  const answer = (card: Card, action: 'like' | 'pass') => {
    if (busy) return
    const name = firstNameOf(card)
    setBusy(action)
    setSwipeError(null)
    actions.answerLike(card, action).then(
      (result) => {
        setBusy(null)
        setTarget(null)
        if (result.match) setMatch(result.match)
        else if (action === 'like') toast.show({ tone: 'strawberry', title: `You liked ${name}` })
        else toast.show({ tone: 'ink', title: `You passed on ${name}`, message: 'They will not show up here again.' })
      },
      (error: unknown) => {
        setBusy(null)
        setSwipeError(toApiError(error).message)
      },
    )
  }

  const card = target?.source === 'social' && target.preview && isCard(target.preview) ? target.preview : undefined
  const sheetActions = card ? (
    <div className={s.answer}>
      <p className={s.answerNote}>
        <span className={s.answerHeart} aria-hidden="true">
          <IconHeart size={16} filled />
        </span>
        {firstNameOf(card)} already likes you. Like back and it&rsquo;s a match.
      </p>
      <div className={s.answerButtons}>
        <ActionButton
          kind="pass"
          size="lg"
          label={`Pass on ${firstNameOf(card)}`}
          disabled={busy !== null}
          aria-busy={busy === 'pass' || undefined}
          onClick={() => answer(card, 'pass')}
        />
        <ActionButton
          kind="like"
          size="xl"
          label={`Like ${firstNameOf(card)} back`}
          disabled={busy !== null}
          aria-busy={busy === 'like' || undefined}
          onClick={() => answer(card, 'like')}
        />
      </div>
      {swipeError ? (
        <p className={s.answerError} role="alert">
          {swipeError}
        </p>
      ) : null}
    </div>
  ) : undefined

  const them = shownMatch?.profile
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
        ]}
      />

      <TabPanel idBase={idBase} value="likes" active={tab === 'likes'} className={s.panel}>
        <LikesPanel
          likes={likes}
          status={likesStatus}
          onRetry={() => void refresh('likesReceived')}
          onOpen={(person) => setTarget({ userId: person.userId, source: 'social', preview: person })}
        />
      </TabPanel>
      <TabPanel idBase={idBase} value="views" active={tab === 'views'} className={s.panel}>
        <ViewersPanel
          viewers={viewers}
          status={viewersStatus}
          onRetry={() => void refresh('myViewers')}
          onOpen={(userId) => setTarget({ userId, source: 'api' })}
        />
      </TabPanel>

      <ProfileSheet target={target} onClose={closeSheet} actions={sheetActions} />

      <MatchMoment
        open={match !== null}
        onClose={() => setMatch(null)}
        me={{ name: firstNameOf(myProfile, 'You'), photo: mainPicture(myProfile), seed: myId ?? 'me' }}
        them={{ name: firstNameOf(them), photo: mainPicture(them), seed: them?.userId }}
        onMessage={() => {
          const id = match?.id
          setMatch(null)
          if (id) navigate(`/chat/${id}`)
        }}
      >
        {firstNameOf(them)} liked you first, and now it&rsquo;s mutual. Say something before the tea goes cold.
      </MatchMoment>
    </div>
  )
}
