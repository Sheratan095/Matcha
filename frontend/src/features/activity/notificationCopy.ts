/** What a notification of the feed says and where it leads (Activity > Notifications). */
import { upcomingLabel } from '@/features/chat/time'
import type { AppNotification } from '@/wb'

/** The tabs of the Activity page a notification can lead to. */
export type NotificationTab = 'likes' | 'views'

export interface NotificationCopy {
  title: string
  detail?: string
  /** Where it leads: a tab of the Activity page, or a route. Nowhere when absent (a connection that ended). */
  go?: { tab: NotificationTab } | { to: string }
}

/** "Drinks by the river · Sat 21 Nov, 20:00", either half alone when the other is missing. */
function dateLine(notification: AppNotification, now: number): string | undefined {
  const { text, startsAt } = notification
  const parts = [text ?? '', startsAt == null ? '' : upcomingLabel(startsAt, now)]
  return parts.filter(Boolean).join(' · ') || undefined
}

export function notificationCopy(notification: AppNotification, now: number): NotificationCopy {
  const name = notification.person.username.trim() || 'Someone'
  const chat = { to: `/chat/${notification.person.userId}` }
  switch (notification.kind) {
    case 'like':
      return { title: `${name} liked you`, detail: 'Like them back and it’s a match.', go: { tab: 'likes' } }
    case 'view':
      return { title: `${name} viewed your profile`, detail: 'Someone is curious about you.', go: { tab: 'views' } }
    case 'match':
      return { title: `It’s a match with ${name}`, detail: 'You like each other. Say hi.', go: chat }
    case 'unmatch':
      return { title: `${name} ended the connection`, detail: 'The conversation and any dates with them are gone.' }
    case 'message':
      return { title: `${name} sent a message`, detail: notification.text, go: chat }
    case 'date-invite':
      return { title: `${name} invited you on a date`, detail: dateLine(notification, now), go: chat }
    case 'date-accept':
      return { title: `${name} accepted your date`, detail: dateLine(notification, now), go: { to: '/calendar' } }
    case 'date-decline':
      return { title: `${name} declined your date`, detail: dateLine(notification, now), go: { to: '/calendar' } }
    case 'date-cancel':
      return { title: `${name} cancelled the date`, detail: dateLine(notification, now), go: { to: '/calendar' } }
    case 'date-start':
      return { title: `Your date with ${name} is starting`, detail: dateLine(notification, now), go: chat }
  }
}
