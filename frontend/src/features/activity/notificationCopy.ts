/** What a notification of the feed says and where it leads (Activity > Notifications). */
import { upcomingLabel } from '@/features/chat/time'
import { t } from '@/i18n'
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
  const name = notification.person.username.trim() || t('toast.someone')
  const chat = { to: `/chat/${notification.person.userId}` }
  switch (notification.kind) {
    case 'like':
      return { title: t('toast.likeTitle', { name }), detail: t('toast.likeMessage'), go: { tab: 'likes' } }
    case 'view':
      return { title: t('toast.viewTitle', { name }), detail: t('toast.viewMessage'), go: { tab: 'views' } }
    case 'match':
      return { title: t('act.matchTitle', { name }), detail: t('act.matchDetail'), go: chat }
    case 'unmatch':
      return { title: t('toast.unmatchTitle', { name }), detail: t('act.unmatchDetail') }
    case 'message':
      return { title: t('toast.messageTitle', { name }), detail: notification.text, go: chat }
    case 'date-invite':
      return { title: t('toast.inviteTitle', { name }), detail: dateLine(notification, now), go: chat }
    case 'date-accept':
      return { title: t('toast.acceptTitle', { name }), detail: dateLine(notification, now), go: { to: '/calendar' } }
    case 'date-decline':
      return { title: t('toast.declineTitle', { name }), detail: dateLine(notification, now), go: { to: '/calendar' } }
    case 'date-cancel':
      return { title: t('toast.cancelTitle', { name }), detail: dateLine(notification, now), go: { to: '/calendar' } }
    case 'date-start':
      return { title: t('toast.startTitle', { name }), detail: dateLine(notification, now), go: chat }
  }
}
