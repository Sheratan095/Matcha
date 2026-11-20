/**
 * The notification feed against the real state layer: realtime events are injected as if they came
 * from the socket, and the feed is read back (what the Activity page shows).
 */
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RealtimeEvent } from '@/api/types'
import {
  actions,
  clearNotifications,
  getNodeValue,
  getNotifications,
  markAllNotificationsRead,
  NOTIFICATION_LIMIT,
  startRealtime,
} from '@/wb'
import { connect, incoming, person } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import { notificationFrom } from './notifications'

let store: TestStore
let source: Subject<RealtimeEvent>
let stopRealtime: () => void

const ids = () => getNotifications().map((item) => item.id)
const unread = () => getNotifications().filter((item) => !item.read).length
const like = (userId: string): RealtimeEvent => ({ type: 'like', person: person(userId) })

beforeEach(async () => {
  localStorage.clear()
  store = await startTestStore()
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  source = new Subject<RealtimeEvent>()
  stopRealtime = startRealtime({ events$: source, socket: false })
})

afterEach(async () => {
  // the refreshes the events started land before the store stops
  await flush(40)
  stopRealtime()
  store.stop()
  localStorage.clear()
})

describe('notificationFrom', () => {
  it('turns each news event into an unread entry about the person, and ignores a chat-seen', () => {
    const ann = person('ann')
    expect(notificationFrom({ type: 'like', person: ann }, 5)).toEqual({ id: 'like:ann', kind: 'like', person: ann, at: 5, read: false })
    expect(notificationFrom({ type: 'view', person: ann }, 5)).toMatchObject({ id: 'view:ann', kind: 'view' })
    expect(notificationFrom({ type: 'match', person: ann }, 5)).toMatchObject({ id: 'match:ann', kind: 'match' })
    expect(notificationFrom({ type: 'unmatch', person: ann }, 5)).toMatchObject({ id: 'unmatch:ann', kind: 'unmatch' })
    expect(notificationFrom({ type: 'seen', chatId: 'c1', userId: 'ann' }, 5)).toBeNull()
  })

  it('keeps a message as a one-line excerpt, and a date with its title and start', () => {
    const ann = person('ann')
    const message = { id: 'm1', senderId: 'ann', text: `  hello\n\n   there ${'x'.repeat(300)}`, sentAt: 1, status: 'sent' as const }
    const entry = notificationFrom({ type: 'message', from: ann, message }, 5)
    expect(entry).toMatchObject({ id: 'message:ann', kind: 'message' })
    expect(entry?.text?.startsWith('hello there x')).toBe(true)
    expect(entry?.text?.length).toBeLessThanOrEqual(140)

    expect(
      notificationFrom({ type: 'calendar', action: 'accept', person: ann, event: { id: 'ev-1', title: 'Drinks', startsAt: 99 } }, 5),
    ).toEqual({ id: 'date-accept:ev-1', kind: 'date-accept', person: ann, at: 5, read: false, text: 'Drinks', startsAt: 99 })
  })
})

describe('the feed', () => {
  it('lists what happened, newest first, unread', () => {
    source.next(like('ann'))
    source.next({ type: 'view', person: person('bea') })
    expect(ids()).toEqual(['view:bea', 'like:ann'])
    expect(unread()).toBe(2)
  })

  it('replaces an older entry about the same thing, and brings it back unread on top', () => {
    source.next(like('ann'))
    source.next({ type: 'view', person: person('bea') })
    markAllNotificationsRead()
    expect(unread()).toBe(0)

    source.next(like('ann'))
    expect(ids()).toEqual(['like:ann', 'view:bea'])
    expect(getNotifications().map((item) => item.read)).toEqual([false, true])
  })

  it('keeps the latest NOTIFICATION_LIMIT', () => {
    for (let index = 0; index < NOTIFICATION_LIMIT + 5; index += 1) source.next(like(`user-${index}`))
    expect(getNotifications()).toHaveLength(NOTIFICATION_LIMIT)
    expect(getNotifications()[0].id).toBe(`like:user-${NOTIFICATION_LIMIT + 4}`)
  })

  it('records a connection the other person ended, but not the echo of your own unlike', async () => {
    connect(store.backend, 'bea')
    const unliking = actions.unlikeUser('bea')
    // the backend pushes the unmatch to you too, while your request is on its way
    source.next({ type: 'unmatch', person: person('bea') })
    await unliking
    expect(getNotifications()).toEqual([])

    source.next({ type: 'unmatch', person: person('bea') })
    expect(ids()).toEqual(['unmatch:bea'])
  })

  it('leaves out a message from the open conversation, and reads the others once it is opened', async () => {
    const message = incoming(store.backend, 'ann', 'hello')
    const event: RealtimeEvent = {
      type: 'message',
      from: person('ann'),
      message: { id: message.messageId, senderId: 'ann', text: message.content, sentAt: message.timestamp, status: 'sent' },
    }
    source.next(event)
    expect(getNotifications()).toMatchObject([{ id: 'message:ann', text: 'hello', read: false }])

    await actions.openChat('ann')
    expect(unread()).toBe(0)

    // the thread is open: it shows the message, the feed does not repeat it
    source.next({ ...event, from: person('ann') })
    expect(getNotifications()).toHaveLength(1)
    expect(unread()).toBe(0)
  })
})

describe('the feed in the browser', () => {
  it('comes back after the page reloads', () => {
    source.next(like('ann'))
    source.next({ type: 'match', person: person('bea') })
    markAllNotificationsRead()
    source.next({ type: 'view', person: person('cid') })
    const before = [...getNotifications()]

    // a reload: the realtime layer stops (memory goes), then starts again
    stopRealtime()
    expect(getNotifications()).toEqual([])
    stopRealtime = startRealtime({ events$: source, socket: false })
    expect(getNotifications()).toEqual(before)
    expect(unread()).toBe(1)
  })

  it('ignores stored entries that do not look like entries', () => {
    stopRealtime()
    const me = getNodeValue('sessionUserId')
    localStorage.setItem(
      `matcha.notifications.${me}`,
      JSON.stringify([
        { id: 'like:ann', kind: 'like', person: person('ann'), at: 1, read: false },
        { id: 'x', kind: 'nonsense', person: person('ann'), at: 1, read: false },
        { id: 'y', kind: 'like', person: { userId: 7 }, at: 1, read: false },
        'oops',
      ]),
    )
    stopRealtime = startRealtime({ events$: source, socket: false })
    expect(ids()).toEqual(['like:ann'])

    stopRealtime()
    localStorage.setItem(`matcha.notifications.${me}`, '{not json')
    stopRealtime = startRealtime({ events$: source, socket: false })
    expect(getNotifications()).toEqual([])
  })

  it('is emptied by "clear all" and by signing out, memory and storage alike', async () => {
    source.next(like('ann'))
    expect(Object.keys(localStorage).some((name) => name.startsWith('matcha.notifications.'))).toBe(true)

    clearNotifications()
    expect(getNotifications()).toEqual([])
    expect(Object.keys(localStorage).some((name) => name.startsWith('matcha.notifications.'))).toBe(false)

    source.next(like('bea'))
    await actions.logout()
    await flush(30)
    expect(getNotifications()).toEqual([])
    expect(Object.keys(localStorage).some((name) => name.startsWith('matcha.notifications.'))).toBe(false)
  })
})
