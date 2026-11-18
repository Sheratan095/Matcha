/**
 * The calendar page against the real state layer: an invite is answered from its ticket.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { API_URL } from '@/config'
import { toast } from '@/ui'
import { actions, getNodeValue } from '@/wb'
import { invitedBy } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import CalendarPage from './CalendarPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let store: TestStore
let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  store = await startTestStore()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  store.stop()
  toast.clear()
})

async function open(): Promise<void> {
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  act(() => root.render(createElement(MemoryRouter, null, createElement(CalendarPage))))
  await act(() => flush(30))
}

const sectionOf = (label: string) =>
  [...container.querySelectorAll('section')].find((section) => section.querySelector('h2')?.textContent === label)

const button = (scope: Element | undefined, text: string) =>
  [...(scope?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === text)

it('lists an invite with its person, and accepting it moves it ahead', async () => {
  const invite = invitedBy(store.backend, 'ann', { title: 'Drinks by the river' })
  await open()
  const invites = sectionOf('Invites · answer before it starts')
  expect(invites?.textContent).toContain('Drinks by the river')
  expect(invites?.textContent).toContain('ann')

  act(() => button(invites, 'Accept')?.click())
  await act(() => flush(40))

  expect(store.backend.server.sent('POST', `${API_URL}/profile/calendar/event/${invite.eventId}/accept`)).toHaveLength(1)
  expect(getNodeValue('dates')?.[0].status).toBe('accepted')
  expect(sectionOf('Invites · answer before it starts')).toBeUndefined()
  expect(sectionOf('Ahead')?.textContent).toContain("It's on")
  expect(toast.getSnapshot().at(-1)?.title).toBe("It's a date with ann")
})

it('says nothing is planned when the calendar is empty', async () => {
  await open()
  expect(container.textContent).toContain('Nothing planned yet')
})
