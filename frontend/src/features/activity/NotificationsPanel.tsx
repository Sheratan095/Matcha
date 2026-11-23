/**
 * "Notifications": what happened while you were away or looking elsewhere (a like, a visit, a match, a
 * connection that ended, a message, a date), newest first. The feed is built by the state layer from
 * the realtime events (src/wb/notifications.ts) and kept in this browser.
 *
 * Opening the tab marks everything read at once, but the entries that were new stay highlighted while
 * you are on it, so you can still tell them apart.
 */
import { useEffect, useState } from 'react'
import { useNow } from '@/features/chat/hooks'
import { useT } from '@/i18n'
import { pad2, shortAgo } from '@/features/chat/time'
import { Avatar, Button, EmptyState, IconTrash, ListRow, TicketHeader } from '@/ui'
import { clearNotifications, markAllNotificationsRead, NOTIFICATION_LIMIT, useNotifications, type AppNotification } from '@/wb'
import { notificationCopy, type NotificationTab } from './notificationCopy'
import s from './ActivityPage.module.css'

/** An entry is replaced by a newer one with the same id, so its time tells the two apart. */
function freshKey(notification: AppNotification): string {
  return `${notification.id}@${notification.at}`
}

export interface NotificationsPanelProps {
  /** A notification about a like or a visit leads to that tab of the page. */
  onTab: (tab: NotificationTab) => void
}

export function NotificationsPanel({ onTab }: NotificationsPanelProps) {
  const t = useT()
  const items = useNotifications()
  const now = useNow(30_000)
  const unread = items.filter((item) => !item.read)

  // What is new when the tab opens, and what arrives while it is open.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  if (unread.some((item) => !fresh.has(freshKey(item)))) setFresh(new Set([...fresh, ...unread.map(freshKey)]))

  // Being on the tab is reading it.
  useEffect(() => {
    if (unread.length > 0) markAllNotificationsRead()
  }, [unread.length])

  if (items.length === 0) {
    return (
      <EmptyState stamp={t('act.quietStamp')} stampTone="matcha" title={t('act.noteQuietTitle')}>
        {t('act.noteEmpty')}
      </EmptyState>
    )
  }

  return (
    <>
      <TicketHeader label={t('act.newestFirst')} meta={pad2(items.length)} />
      <p className={s.honest}>
        {t('act.kept', { n: NOTIFICATION_LIMIT })}
      </p>
      <ul className={s.notes}>
        {items.map((item) => {
          const copy = notificationCopy(item, now)
          const go = copy.go
          const name = item.person.username.trim() || t('toast.someone')
          return (
            <li key={item.id}>
              <ListRow
                leading={<Avatar src={item.person.profilePictureUrl} name={name} size="md" decorative />}
                title={copy.title}
                subtitle={copy.detail}
                meta={<time dateTime={new Date(item.at).toISOString()}>{shortAgo(item.at, now)}</time>}
                unread={fresh.has(freshKey(item))}
                to={go && 'to' in go ? go.to : undefined}
                onClick={go && 'tab' in go ? () => onTab(go.tab) : undefined}
              />
            </li>
          )
        })}
      </ul>
      <div className={s.notesFoot}>
        <Button size="sm" variant="paper" icon={<IconTrash size={16} />} onClick={clearNotifications}>
          {t('act.clearAll')}
        </Button>
      </div>
    </>
  )
}
