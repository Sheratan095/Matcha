/**
 * The sheet against the real state layer, under StrictMode (as in development): opening a profile
 * sends ONE `GET /profile/{id}` (each one records a visit and notifies the person), although
 * StrictMode mounts the sheet's effect, cleans it up and mounts it again.
 */
import { act, createElement, StrictMode, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { API_URL } from '@/config'
import { actions, getNodeValue } from '@/wb'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import ProfileSheet, { type ProfileTarget } from './ProfileSheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let store: TestStore
let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  store = await startTestStore()
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  store.stop()
})

function render(element: ReactNode): void {
  act(() => root.render(createElement(StrictMode, null, element)))
}

const sheet = (target: ProfileTarget | null) => createElement(ProfileSheet, { target, onClose: () => undefined })

it('opening a profile under StrictMode sends one GET /profile/{id}; closing it lets it go', async () => {
  render(sheet({ userId: 'bea' }))
  await act(() => flush(40))
  expect(store.backend.server.sent('GET', `${API_URL}/profile/bea`)).toHaveLength(1)
  expect(getNodeValue('apiProfile')?.userId).toBe('bea')

  // another person: one request for them
  render(sheet({ userId: 'cid' }))
  await act(() => flush(40))
  expect(store.backend.server.sent('GET', `${API_URL}/profile/cid`)).toHaveLength(1)
  expect(store.backend.server.sent('GET', `${API_URL}/profile/bea`)).toHaveLength(1)

  render(sheet(null))
  await act(() => flush(40))
  expect(getNodeValue('apiProfileId')).toBeNull()
})
