/**
 * The activity page against the real state layer: each tab shows its count as soon as the page opens
 * ("You visited" included), the visit lists are right after a profile was opened from the page, and
 * the notifications tab shows what realtime sent.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RealtimeEvent } from '@/api/types'
import { API_URL } from '@/config'
import { toast } from '@/ui'
import { actions, getNodeValue, getNotifications, startRealtime } from '@/wb'
import { person } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import ActivityPage from './ActivityPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const VISITED = `${API_URL}/profile/visited`

let store: TestStore
let container: HTMLDivElement
let root: Root
let source: Subject<RealtimeEvent>
let stopRealtime: (() => void) | null

beforeEach(async () => {
  localStorage.clear()
  store = await startTestStore()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  source = new Subject<RealtimeEvent>()
  stopRealtime = null
})

afterEach(async () => {
  await act(() => flush(40))
  act(() => root.unmount())
  container.remove()
  stopRealtime?.()
  store.stop()
  toast.clear()
  localStorage.clear()
})

async function signIn(): Promise<void> {
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
}

async function show(path = '/activity'): Promise<void> {
  act(() => root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(ActivityPage))))
  await act(() => flush(40))
}

const tab = (label: string): HTMLElement => {
  const found = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((element) => element.textContent?.includes(label))
  if (!found) throw new Error(`no "${label}" tab`)
  return found
}

const buttonWith = (text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>('button')].find((element) => element.textContent?.includes(text))

describe('the visit lists', () => {
  it('every tab has its count when the page opens, "You visited" included', async () => {
    store.backend.state.visited = [person('cid'), person('dan')]
    await signIn()
    await show()

    expect(store.backend.server.sent('GET', VISITED)).toHaveLength(1)
    expect(tab('You visited').textContent).toContain('02')
    expect(tab('Likes you').textContent).toContain('01')
    expect(tab('Viewed you').textContent).toContain('00')
  })

  it('lists the visits when its tab is opened, without asking for them again', async () => {
    store.backend.state.visited = [person('cid'), person('dan')]
    await signIn()
    await show()

    act(() => tab('You visited').click())
    await act(() => flush(10))

    expect(container.textContent).toContain('cid')
    expect(container.textContent).toContain('dan')
    expect(store.backend.server.sent('GET', VISITED)).toHaveLength(1)
  })

  it('a profile opened from the page is on top of "You visited" once its sheet is closed', async () => {
    store.backend.state.visited = [person('cid')]
    await signIn()
    await show()
    expect(tab('You visited').textContent).toContain('01')

    // ann is waiting in "Likes you": opening her profile records a visit
    act(() => buttonWith('Open the profile')?.click())
    await act(() => flush(40))
    act(() => document.querySelector<HTMLElement>('button[aria-label="Close"]')?.click())
    await act(() => flush(40))

    expect(store.backend.server.sent('GET', VISITED)).toHaveLength(2)
    expect(getNodeValue('visitedProfiles')?.visited.map((entry) => entry.userId)).toEqual(['ann', 'cid'])
    expect(tab('You visited').textContent).toContain('02')
  })
})

describe('the notifications tab', () => {
  async function startFeed(): Promise<void> {
    await signIn()
    stopRealtime = startRealtime({ events$: source, socket: false })
  }

  it('counts what is new, lists it when opened and reads it while open', async () => {
    await startFeed()
    await show()
    expect(tab('Notifications').textContent).toContain('00')

    act(() => {
      source.next({ type: 'like', person: person('dan') })
      source.next({ type: 'view', person: person('eve') })
    })
    expect(tab('Notifications').textContent).toContain('02')

    act(() => tab('Notifications').click())
    await act(() => flush(30))
    expect(container.textContent).toContain('dan liked you')
    expect(container.textContent).toContain('eve viewed your profile')
    // being on the tab is reading it
    expect(tab('Notifications').textContent).toContain('00')
    expect(getNotifications().every((item) => item.read)).toBe(true)

    // one that arrives while it is open is shown, and read, at once
    act(() => source.next({ type: 'match', person: person('fay') }))
    expect(container.textContent).toContain('a match with fay')
    expect(getNotifications().every((item) => item.read)).toBe(true)
  })

  it('opens the tab a like or a visit belongs to, and can be cleared', async () => {
    await startFeed()
    await show('/activity?tab=notifications')
    expect(container.textContent).toContain('Nothing new yet')

    act(() => source.next({ type: 'like', person: person('dan') }))
    await act(() => flush(30))
    act(() => [...container.querySelectorAll<HTMLElement>('button')].find((element) => element.textContent?.includes('dan liked you'))?.click())
    await act(() => flush(30))
    expect(tab('Likes you').getAttribute('aria-selected')).toBe('true')

    act(() => tab('Notifications').click())
    await act(() => flush(30))
    act(() => buttonWith('Clear all')?.click())
    expect(container.textContent).toContain('Nothing new yet')
    expect(getNotifications()).toEqual([])
  })
})
