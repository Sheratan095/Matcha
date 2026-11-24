/**
 * `/activity`: who likes you (answer them: a like back connects you, and plays the app's match moment),
 * who viewed your profile, the profiles you visited, and the notifications you were sent
 * (src/wb/notifications.ts). The tab is in the URL (`?tab=views`, `?tab=visited`, `?tab=notifications`)
 * so a notification can link straight to it. Likes load at sign-in; the visitors and your visits load
 * with this page, so every tab shows its count at once.
 */
import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DeckAction, UserSummary } from '@/api/types'
import { useT } from '@/i18n'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import { summaryPreviewProfile } from '@/features/profile/format'
import { ActionButton, IconBell, IconEye, IconHeart, IconPin, PageHeader, TabPanel, toast } from '@/ui'
import { actions, celebrateMatch, load, refresh, REVISIT_MS, toApiError, useLoad, useNodeStatus, useNodeValue, useUnreadNotifications } from '@/wb'
import { LikesPanel } from './LikesPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { ScoreTabs } from './ScoreTabs'
import { ViewersPanel } from './ViewersPanel'
import s from './ActivityPage.module.css'

type TabValue = 'likes' | 'views' | 'visited' | 'notifications'

function tabFrom(value: string | null): TabValue {
  return value === 'views' || value === 'visited' || value === 'notifications' ? value : 'likes'
}

export default function ActivityPage() {
  const t = useT()
  const idBase = useId()
  const [params, setParams] = useSearchParams()
  const tab = tabFrom(params.get('tab'))
  // A tab switch is a navigation: preventScrollReset keeps <ScrollRestoration /> from jumping to the top.
  const setTab = (value: TabValue) =>
    setParams(value === 'likes' ? {} : { tab: value }, { replace: true, preventScrollReset: true })

  // Realtime keeps likes and visitors current: a visit refetches them only once they are getting old.
  useLoad('likesReceived', { maxAgeMs: REVISIT_MS })
  useLoad('myViewers', { maxAgeMs: REVISIT_MS })
  // No event tells of your own visits: opening a profile marks the list stale instead, so it is asked
  // for with the page (not with its tab: the tab's count would stay empty until it was opened), and
  // refetched when a stale one is shown again (here, or when the profile sheet closes: see closeSheet).
  useLoad('visitedProfiles', { maxAgeMs: REVISIT_MS })

  const unreadNotifications = useUnreadNotifications()
  const likesValue = useNodeValue('likesReceived')
  const likesStatus = useNodeStatus('likesReceived')
  const viewersValue = useNodeValue('myViewers')
  const viewersStatus = useNodeStatus('myViewers')
  const visitedValue = useNodeValue('visitedProfiles')
  const visitedStatus = useNodeStatus('visitedProfiles')

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
    // Opening a profile records a visit, and blocking someone takes them off both lists: whichever of
    // them the sheet left stale is refetched now, so the lists are right behind it. A list that is
    // neither stale nor old sends nothing.
    void load('visitedProfiles', REVISIT_MS)
    void load('myViewers', REVISIT_MS)
  }

  const openAdmirer = (person: UserSummary) => {
    setAdmirer(person)
    setTarget({ userId: person.userId, preview: summaryPreviewProfile(person, { liked: false, likesYou: true, matched: false }) })
  }

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
        if (outcome.matched) celebrateMatch({ userId: person.userId, name: person.username, photo: person.profilePictureUrl, theyLikedFirst: true })
        else if (action === 'like') toast.show({ tone: 'strawberry', title: t('act.youLiked', { name }) })
        else toast.show({ tone: 'ink', title: t('act.youPassed', { name }), message: t('act.passedMessage') })
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
          {t('act.admirerNote', { name: admirer.username })}
        </p>
        <div className={s.answerButtons}>
          <ActionButton
            kind="pass"
            size="lg"
            label={t('act.passOn', { name: admirer.username })}
            disabled={busy !== null}
            aria-busy={busy === 'pass' || undefined}
            onClick={() => answer(admirer, 'pass')}
          />
          <ActionButton
            kind="like"
            size="xl"
            label={t('act.likeBack', { name: admirer.username })}
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
      <PageHeader title={t('act.title')} kicker={t('act.kicker')} />

      <ScoreTabs
        label={t('act.title')}
        idBase={idBase}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'likes', label: t('act.tabLikes'), count: likes ? likes.length : null, tone: 'strawberry', icon: <IconHeart size={16} filled /> },
          { value: 'views', label: t('act.tabViews'), count: viewers ? viewers.length : null, tone: 'blue', icon: <IconEye size={16} strokeWidth={3} /> },
          { value: 'visited', label: t('act.tabVisited'), count: visited ? visited.length : null, tone: 'yolk', icon: <IconPin size={16} strokeWidth={3} /> },
          // the numeral is what is new, not the length of the list (kept up to NOTIFICATION_LIMIT)
          { value: 'notifications', label: t('act.tabNotifications'), count: unreadNotifications, unit: t('act.unread'), tone: 'matcha', icon: <IconBell size={16} strokeWidth={3} /> },
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

      <TabPanel idBase={idBase} value="notifications" active={tab === 'notifications'} className={s.panel}>
        <NotificationsPanel onTab={setTab} />
      </TabPanel>

      <ProfileSheet target={target} onClose={closeSheet} actions={sheetActions} />
    </div>
  )
}
