/**
 * Global toasts from `realtime$`: a new connection, a message for a conversation that is not open,
 * someone liking you, someone viewing your profile, and a date invited to, accepted, declined,
 * cancelled or starting. Each links to the right place. Renders nothing itself (the Toaster does).
 */
import { useEffect } from 'react'
import type { CalendarAction, CalendarEventSummary, UserSummary } from '@/api/types'
import { upcomingLabel } from '@/features/chat/time'
import { Avatar, toast, type ToastTone } from '@/ui'
import { getNodeValue, realtime$ } from '@/wb'

function nameOf(person: UserSummary): string {
  return person.username.trim() || 'Someone'
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 88)}…` : flat
}

interface CalendarToast {
  tone: ToastTone
  title: (name: string) => string
  action: string
  /** The conversation with them (where an invite is answered too), rather than the calendar. */
  inChat: boolean
  duration?: number
}

const CALENDAR: Record<CalendarAction, CalendarToast> = {
  invite: { tone: 'blue', title: (name) => `${name} invited you on a date`, action: 'Answer', inChat: true, duration: 7000 },
  accept: { tone: 'matcha', title: (name) => `${name} accepted your date`, action: 'See dates', inChat: false },
  decline: { tone: 'ink', title: (name) => `${name} declined your date`, action: 'See dates', inChat: false },
  cancel: { tone: 'ink', title: (name) => `${name} cancelled the date`, action: 'See dates', inChat: false },
  start: { tone: 'strawberry', title: (name) => `Your date with ${name} is starting`, action: 'Open chat', inChat: true, duration: 7000 },
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
        case 'match': {
          const name = nameOf(event.person)
          // Same id as the like toast: the like that made the match is replaced, not stacked.
          toast.show({
            id: `person-${event.person.userId}`,
            tone: 'matcha',
            title: "It's a match!",
            message: `You and ${name} like each other.`,
            icon: avatarOf(event.person),
            duration: 7000,
            action: { label: 'Say hi', onClick: () => navigate(`/chat/${event.person.userId}`) },
          })
          break
        }
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
            title: `${name} sent a message`,
            message: excerpt(event.message.text),
            icon: avatarOf(event.from),
            action: { label: 'Reply', onClick: () => navigate(`/chat/${from}`) },
          })
          break
        }
        case 'like': {
          const name = nameOf(event.person)
          toast.show({
            id: `person-${event.person.userId}`,
            tone: 'yolk',
            title: `${name} liked you`,
            message: 'Like them back and it’s a match.',
            icon: avatarOf(event.person),
            action: { label: 'See who', onClick: () => navigate('/activity') },
          })
          break
        }
        case 'view': {
          const name = nameOf(event.person)
          // Its own id: a visit never replaces their like or match toast; a second visit replaces the first.
          toast.show({
            id: `view-${event.person.userId}`,
            tone: 'blue',
            title: `${name} viewed your profile`,
            message: 'Someone is curious about you.',
            icon: avatarOf(event.person),
            action: { label: 'See visitors', onClick: () => navigate('/activity?tab=views') },
          })
          break
        }
        case 'calendar': {
          const { tone, title, action, inChat, duration } = CALENDAR[event.action]
          const chat = `/chat/${event.person.userId}`
          const to = inChat ? chat : '/calendar'
          // One toast per date: a later answer about it replaces the earlier one. In the conversation
          // already, the date is on screen: no button to go there.
          const here = currentPath().replace(/\/+$/, '') === to
          toast.show({
            id: `date-${event.event.id}`,
            tone,
            title: title(nameOf(event.person)),
            message: dateLine(event.event),
            icon: avatarOf(event.person),
            duration,
            action: here ? undefined : { label: action, onClick: () => navigate(to) },
          })
          break
        }
        case 'unmatch':
        case 'seen':
          break
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate, currentPath])
  return null
}
