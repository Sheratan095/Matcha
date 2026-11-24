/**
 * The global toasts against the real state layer: events are injected as if they came from the socket.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent } from '@/api/types'
import { toast } from '@/ui'
import { actions, startRealtime } from '@/wb'
import { connect, person } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import { RealtimeToasts } from './RealtimeToasts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let store: TestStore
let container: HTMLDivElement
let root: Root
let source: Subject<RealtimeEvent>
let stopRealtime: () => void
const navigate = vi.fn<(to: string) => void>()

beforeEach(async () => {
  store = await startTestStore()
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  source = new Subject<RealtimeEvent>()
  stopRealtime = startRealtime({ events$: source, socket: false })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(RealtimeToasts, { navigate, currentPath: () => '/discover' })))
})

afterEach(async () => {
  // the refreshes the events started land before the store stops
  await act(() => flush(40))
  act(() => root.unmount())
  container.remove()
  stopRealtime()
  store.stop()
  toast.clear()
  navigate.mockReset()
})

const shown = (id: string) => toast.getSnapshot().find((item) => item.id === id)

describe('RealtimeToasts', () => {
  it('a profile view says who looked, and links to the visitors', () => {
    act(() => source.next({ type: 'view', person: person('ann') }))
    const item = shown('view-ann')
    expect(item).toMatchObject({ tone: 'blue', title: 'ann viewed your profile', action: { label: 'See visitors' } })
    item?.action?.onClick()
    expect(navigate).toHaveBeenCalledWith('/activity?tab=views')
  })

  it('a view never replaces the like of the same person, and a second view replaces the first', () => {
    act(() => {
      source.next({ type: 'like', person: person('ann') })
      source.next({ type: 'view', person: person('ann') })
      source.next({ type: 'view', person: person('ann') })
    })
    expect(toast.getSnapshot().map((item) => item.id)).toEqual(['person-ann', 'view-ann'])
  })

  it('a match takes the like it completes off the screen (the match moment tells of it)', () => {
    act(() => source.next({ type: 'like', person: person('ann') }))
    expect(shown('person-ann')).toMatchObject({ title: 'ann liked you' })
    act(() => source.next({ type: 'match', person: person('ann') }))
    expect(toast.getSnapshot()).toEqual([])
  })

  it('a connection the other person ended says so', () => {
    act(() => {
      source.next({ type: 'match', person: person('ann') })
      source.next({ type: 'unmatch', person: person('ann') })
    })
    expect(toast.getSnapshot().map((item) => item.id)).toEqual(['person-ann'])
    expect(shown('person-ann')).toMatchObject({ tone: 'ink', title: 'ann ended the connection' })
    // nowhere to go: the conversation and the connection are gone
    expect(shown('person-ann')?.action).toBeUndefined()
  })

  it('says nothing of the unmatch you caused yourself (the backend echoes it to you too)', async () => {
    connect(store.backend, 'bea')
    let unliking: Promise<void> = Promise.resolve()
    act(() => {
      unliking = actions.unlikeUser('bea')
    })
    act(() => source.next({ type: 'unmatch', person: person('bea') }))
    await act(() => unliking)
    expect(toast.getSnapshot()).toEqual([])
  })

  it('a date invite links to the conversation, where it is answered', () => {
    act(() =>
      source.next({ type: 'calendar', action: 'invite', person: person('bea'), event: { id: 'ev-1', title: 'Drinks', startsAt: null } }),
    )
    const item = shown('date-ev-1')
    expect(item).toMatchObject({ title: 'bea invited you on a date', message: 'Drinks', action: { label: 'Answer' } })
    item?.action?.onClick()
    expect(navigate).toHaveBeenCalledWith('/chat/bea')
  })

  it('an answer to your invite links to the calendar', () => {
    act(() =>
      source.next({ type: 'calendar', action: 'accept', person: person('bea'), event: { id: 'ev-1', title: 'Drinks', startsAt: null } }),
    )
    const item = shown('date-ev-1')
    expect(item).toMatchObject({ title: 'bea accepted your date', action: { label: 'See dates' } })
    item?.action?.onClick()
    expect(navigate).toHaveBeenCalledWith('/calendar')
  })

  it('the start of a date says who it is with, and opens the conversation', () => {
    act(() =>
      source.next({ type: 'calendar', action: 'start', person: person('bea'), event: { id: 'ev-2', title: 'Picnic', startsAt: null } }),
    )
    const item = shown('date-ev-2')
    expect(item).toMatchObject({ tone: 'strawberry', title: 'Your date with bea is starting', message: 'Picnic', action: { label: 'Open chat' } })
    item?.action?.onClick()
    expect(navigate).toHaveBeenCalledWith('/chat/bea')
  })
})

describe('RealtimeToasts in the conversation', () => {
  it('offers no button to the conversation already open', () => {
    act(() => root.render(createElement(RealtimeToasts, { navigate, currentPath: () => '/chat/bea' })))
    act(() =>
      source.next({ type: 'calendar', action: 'start', person: person('bea'), event: { id: 'ev-3', title: 'Picnic', startsAt: null } }),
    )
    expect(shown('date-ev-3')).toMatchObject({ title: 'Your date with bea is starting' })
    expect(shown('date-ev-3')?.action).toBeUndefined()
  })
})
