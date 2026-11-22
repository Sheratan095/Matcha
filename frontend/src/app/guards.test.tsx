/**
 * The signed-in guards against the real state layer: the sections need a filled-in profile, and Discover
 * also a profile photo (the backend refuses likes and passes without one, and shows such a profile to
 * nobody), while the rest of the app stays open to a profile that has none.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OwnProfile } from '@/api/types'
import { API_URL } from '@/config'
import { actions } from '@/wb'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import { HomeGate, RequireFilledProfile, RequireProfilePhoto } from './guards'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FILLED: Partial<OwnProfile> = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  sexualPreference: 'both',
  biography: 'Hello',
  interests: [{ id: 'tea', name: 'tea' }],
  latitude: 41.89,
  longitude: 12.51,
  dateOfBirth: '1995-12-10',
}
const PHOTO = { id: 'p1', url: 'http://img.test/p1.webp', isProfile: true }

let store: TestStore
let container: HTMLDivElement
let root: Root
let router: ReturnType<typeof createMemoryRouter>

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
})

async function visit(path: string, profile: Partial<OwnProfile>): Promise<void> {
  store.backend.state.profile = { ...store.backend.state.profile, ...profile }
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  router = createMemoryRouter(
    [
      { element: <HomeGate />, children: [{ path: '/', element: <p>landing</p> }] },
      { path: '/onboarding', element: <p>onboarding</p> },
      {
        element: <RequireFilledProfile />,
        children: [
          { element: <RequireProfilePhoto />, children: [{ path: '/discover', element: <p>DECK PAGE</p> }] },
          { path: '/matches', element: <p>MATCHES PAGE</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  await act(async () => root.render(<RouterProvider router={router} />))
  await act(() => flush(20))
}

describe('a filled-in profile without a photo', () => {
  it('keeps Discover closed, says why, and asks for nothing from the deck', async () => {
    await visit('/discover', { ...FILLED, pictures: [] })
    expect(container.textContent).toContain('Add a photo to open the deck')
    expect(container.textContent).not.toContain('DECK PAGE')
    expect(container.querySelector('a[href="/me"]')?.textContent).toContain('Add a photo')
    expect(store.backend.server.sent('GET', `${API_URL}/profile/discover`)).toHaveLength(0)
  })

  it('still reaches the other sections', async () => {
    await visit('/matches', { ...FILLED, pictures: [] })
    expect(container.textContent).toContain('MATCHES PAGE')
  })

  it('is taken from / into the app, not to onboarding (which has no way out to the sections)', async () => {
    await visit('/', { ...FILLED, pictures: [] })
    expect(router.state.location.pathname).toBe('/discover')
    expect(container.textContent).toContain('Add a photo to open the deck')
  })

  it('opens Discover as soon as a photo is uploaded', async () => {
    await visit('/discover', { ...FILLED, pictures: [] })
    await act(async () => {
      await actions.uploadPicture(new Blob(['x'], { type: 'image/png' }))
    })
    expect(container.textContent).toContain('DECK PAGE')
  })
})

describe('the other profiles', () => {
  it('opens Discover with a profile photo', async () => {
    await visit('/discover', { ...FILLED, pictures: [PHOTO] })
    expect(container.textContent).toContain('DECK PAGE')
  })

  it('sends a profile that is not filled in to onboarding, photo or not', async () => {
    await visit('/matches', { ...FILLED, biography: null, pictures: [PHOTO] })
    expect(router.state.location.pathname).toBe('/onboarding')
  })
})
