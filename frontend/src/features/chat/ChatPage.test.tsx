/**
 * The conversation against the real state layer: the dates planned with the partner sit in the
 * thread, are answered there, and a new one is booked from the header.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { API_URL } from '@/config'
import { toast } from '@/ui'
import { actions, getNodeValue } from '@/wb'
import { connect, invitedBy } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import ChatPage from './ChatPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MINUTE = 60_000

let store: TestStore
let container: HTMLDivElement
let root: Root

beforeAll(() => {
  // jsdom has no layout: the thread's stick-to-bottom only needs the observer to exist
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(async () => {
  store = await startTestStore()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  act(() => root.unmount())
  await act(() => flush(20))
  container.remove()
  store.stop()
  toast.clear()
  document.body.replaceChildren()
})

async function openChatWith(userId: string): Promise<void> {
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  act(() =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/chat/${userId}`] },
        createElement(Routes, null, createElement(Route, { path: '/chat/:userId', element: createElement(ChatPage) })),
      ),
    ),
  )
  await act(() => flush(40))
}

const button = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text)

const ticket = (title: string) =>
  [...container.querySelectorAll('article')].find((article) => article.getAttribute('aria-label') === `Date: ${title}`)

it('shows their invite in the thread, and accepting it there settles it', async () => {
  const invite = invitedBy(store.backend, 'ann', { title: 'Drinks by the river' })
  await openChatWith('ann')

  const card = ticket('Drinks by the river')
  expect(card?.textContent).toContain('ann invited you on a date')
  expect(card?.textContent).toContain('Invite')

  act(() => button(card as Element, 'Accept')?.click())
  await act(() => flush(40))

  expect(store.backend.server.sent('POST', `${API_URL}/profile/calendar/event/${invite.eventId}/accept`)).toHaveLength(1)
  expect(getNodeValue('dates')?.[0].status).toBe('accepted')
  expect(ticket('Drinks by the river')?.textContent).toContain("It's on")
  expect(button(ticket('Drinks by the river') as Element, 'Accept')).toBeUndefined()
  expect(toast.getSnapshot().at(-1)?.title).toBe("It's a date with ann")
})

it('notes when an accepted date has begun', async () => {
  const now = Date.now()
  invitedBy(store.backend, 'ann', {
    title: 'Picnic',
    status: 'accepted',
    createdAt: new Date(now - 60 * MINUTE).toISOString(),
    startTime: new Date(now - 10 * MINUTE).toISOString(),
    endTime: new Date(now + 60 * MINUTE).toISOString(),
  })
  await openChatWith('ann')

  expect(container.textContent).toContain('Your date has started · Picnic')
  // it has begun: nothing left to answer or call off
  expect(button(ticket('Picnic') as Element, 'Call off')).toBeUndefined()
})

it('books a date with them from the header', async () => {
  connect(store.backend, 'bea')
  await openChatWith('bea')

  act(() => (container.querySelector('button[aria-label="Plan a date"]') as HTMLButtonElement).click())
  await act(() => flush(10))

  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain('A date with bea')
  expect(dialog?.textContent).toContain('With bea')
})
