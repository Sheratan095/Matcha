/**
 * Global toasts from `realtime$`: a connection ended by the other person, a message
 * for a conversation that is not open, someone liking you, someone viewing your profile, and a date
 * invited to, accepted, declined, cancelled or starting. Each links to the right place (an ended
 * connection has nowhere to go). A new connection gets the match moment instead (./MatchMoments.tsx),
 * which replaces the toast of the like that made it. Renders nothing itself (the Toaster does). What the
 * toasts say is also kept in the Activity > Notifications feed.
 */
import { useEffect } from 'react'
import type { CalendarAction, CalendarEventSummary, UserSummary } from '@/api/types'
import { upcomingLabel } from '@/features/chat/time'
import { t } from '@/i18n'
import { Avatar, toast, type ToastTone } from '@/ui'
import { getNodeValue, realtime$ } from '@/wb'

function nameOf(person: UserSummary): string {
  return person.username.trim() || t('toast.someone')
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 88)}…` : flat
}

interface CalendarToast {
  tone: ToastTone
  title: string
  action: string
  /** The conversation with them (where an invite is answered too), rather than the calendar. */
  inChat: boolean
  duration?: number
}

/** The toast for an answer about a date, worded in the language the page is in when it arrives. */
function calendarToast(action: CalendarAction, name: string): CalendarToast {
  switch (action) {
    case 'invite':
      return { tone: 'blue', title: t('toast.inviteTitle', { name }), action: t('toast.inviteAction'), inChat: true, duration: 7000 }
    case 'accept':
      return { tone: 'matcha', title: t('toast.acceptTitle', { name }), action: t('toast.seeDates'), inChat: false }
    case 'decline':
      return { tone: 'ink', title: t('toast.declineTitle', { name }), action: t('toast.seeDates'), inChat: false }
    case 'cancel':
      return { tone: 'ink', title: t('toast.cancelTitle', { name }), action: t('toast.seeDates'), inChat: false }
    case 'start':
      return { tone: 'strawberry', title: t('toast.startTitle', { name }), action: t('toast.startAction'), inChat: true, duration: 7000 }
  }
}

/** "Drinks by the river · Sat 21 Nov, 20:00", either half alone when the other is missing. */
function dateLine(event: CalendarEventSummary): string | undefined {
  const parts = [excerpt(event.title), event.startsAt === null ? '' : upcomingLabel(event.startsAt, Date.now())]
  return parts.filter(Boolean).join(' · ') || undefined
}

function avatarOf(person: UserSummary) {
  return <Avatar src={person.profilePictureUrl} name={nameOf(person)} size="sm" decorative />
}

export interface RealtimeToastsProps {
  navigate: (to: string) => void
  /** The current route's pathname (the toasts live outside the router tree). */
  currentPath: () => string
}

export function RealtimeToasts({ navigate, currentPath }: RealtimeToastsProps) {
  useEffect(() => {
    const subscription = realtime$.subscribe((event) => {
      if (getNodeValue('authStatus') !== 'authenticated') return
      switch (event.type) {
        case 'match':
          // The match moment takes the whole screen (MatchMoments): the like that made the match is
          // old news under it.
          toast.dismiss(`person-${event.person.userId}`)
          break
        case 'message': {
          const from = event.from.userId
          // The open conversation shows it already. Check the route too: right after navigating to a
          // chat, its page may not have opened it yet when the event arrives.
          if (getNodeValue('activeChatUserId') === from) return
          if (currentPath().replace(/\/+$/, '') === `/chat/${from}`) return
          const name = nameOf(event.from)
          toast.show({
            id: `chat-${from}`,
            tone: 'ink',
            title: t('toast.messageTitle', { name }),
            message: excerpt(event.message.text),
            icon: avatarOf(event.from),
            action: { label: t('toast.messageAction'), onClick: () => navigate(`/chat/${from}`) },
          })
          break
        }
        case 'like': {
          const name = nameOf(event.person)
          toast.show({
            id: `person-${event.person.userId}`,
            tone: 'yolk',
            title: t('toast.likeTitle', { name }),
            message: t('toast.likeMessage'),
            icon: avatarOf(event.person),
            action: { label: t('toast.likeAction'), onClick: () => navigate('/activity') },
          })
          break
        }
        case 'view': {
          const name = nameOf(event.person)
          // Its own id: a visit never replaces their like or match toast; a second visit replaces the first.
          toast.show({
            id: `view-${event.person.userId}`,
            tone: 'blue',
            title: t('toast.viewTitle', { name }),
            message: t('toast.viewMessage'),
            icon: avatarOf(event.person),
            action: { label: t('toast.viewAction'), onClick: () => navigate('/activity?tab=views') },
          })
          break
        }
        case 'calendar': {
          const { tone, title, action, inChat, duration } = calendarToast(event.action, nameOf(event.person))
          const chat = `/chat/${event.person.userId}`
          const to = inChat ? chat : '/calendar'
          // One toast per date: a later answer about it replaces the earlier one. In the conversation
          // already, the date is on screen: no button to go there.
          const here = currentPath().replace(/\/+$/, '') === to
          toast.show({
            id: `date-${event.event.id}`,
            tone,
            title,
            message: dateLine(event.event),
            icon: avatarOf(event.person),
            duration,
            action: here ? undefined : { label: action, onClick: () => navigate(to) },
          })
          break
        }
        case 'unmatch': {
          // Unliking or blocking someone is echoed to you too: only the other person's doing is news.
          if (event.own) break
          // Same id as their like toast: it replaces a "likes you" that is no longer true.
          toast.show({
            id: `person-${event.person.userId}`,
            tone: 'ink',
            title: t('toast.unmatchTitle', { name: nameOf(event.person) }),
            message: t('toast.unmatchMessage'),
            icon: avatarOf(event.person),
            duration: 7000,
          })
          break
        }
        case 'seen':
          break
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate, currentPath])
  return null
}
