/**
 * Regression: opening a real profile from the deck (Discover, Search) gives the sheet a `preview`.
 * When the full profile then arrived, `merged` was a new `{ ...preview, ...loaded }` object on every
 * render, and the render-phase `merged !== kept` check kept setting state: "Too many re-renders".
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfileSheet from './ProfileSheet'
import { deckPreviewProfile } from './format'

const h = vi.hoisted(() => {
  const full = {
    userId: '74cc17c6-c25f-4afb-8b02-b0feb16d4c4e',
    username: 'sofia',
    firstName: 'Sofia',
    lastName: 'Rossi',
    gender: 'female',
    sexualPreference: 'both',
    biography: 'Hello there',
    interests: [{ id: 'i1', name: 'hiking' }],
    pictures: [{ id: 'p1', url: 'http://localhost/a.webp', isProfile: true }],
    lastSeen: null,
    fameRating: 55,
    age: 25,
    createdAt: '2026-11-12T09:21:51.901Z',
    updatedAt: '2026-11-12T09:21:51.901Z',
    isOnline: false,
    relation: { liked: false, likesYou: false, matched: false },
    distanceKm: 432,
  }
  // `state.api` is what the `apiProfile` node holds: null while GET /profile/{id} is in flight.
  // `renders` counts ProfileSheet renders (it reads the node once per render).
  return { full, state: { api: null as typeof full | null }, renders: { n: 0 } }
})

vi.mock('@/wb', () => ({
  actions: {
    showApiProfile: vi.fn(() => Promise.resolve(h.full)),

    closeProfile: vi.fn(),
    blockUser: vi.fn(),
    reportUser: vi.fn(),
    likeUser: vi.fn(),
    unlikeUser: vi.fn(),
  },
  LOCAL_ERROR: { DROPPED: 'dropped' },
  toApiError: (error: unknown) => ({ code: 'x', status: 0, message: String(error) }),
  useNodeStatus: () => ({ status: 'success', error: null }),
  useNodeValue: (name: string) => {
    if (name !== 'apiProfile') return null
    h.renders.n++
    return h.state.api
  },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Opens the sheet while the profile is loading, then delivers the profile. */
async function openThenLoad(withPreview: boolean): Promise<{ crashed: string | null; text: string; renders: number }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let crashed: string | null = null
  const root = createRoot(host, {
    onUncaughtError: (error) => {
      crashed = (error as Error).message
    },
    onCaughtError: () => undefined,
  })
  const preview = deckPreviewProfile({
    userId: h.full.userId,
    username: 'sofia',
    firstName: 'Sofia',
    profilePictureUrl: 'http://localhost/a.webp',
    age: 25,
    fameRating: 55,
    distanceKm: 432,
    likesYou: false,
  } as never)
  // One target object for the sheet's whole life, as DiscoverPage's `sheet` state is.
  const target = { userId: h.full.userId, preview: withPreview ? preview : undefined }
  const element = () => <ProfileSheet target={target} onClose={() => undefined} />

  h.renders.n = 0
  h.state.api = null
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await act(async () => root.render(element()))
    h.state.api = h.full
    await act(async () => root.render(element()))
  } catch (error) {
    crashed = (error as Error).message
  } finally {
    consoleError.mockRestore()
  }

  const result = { crashed, text: document.body.textContent ?? '', renders: h.renders.n }
  try {
    await act(async () => root.unmount())
  } catch {
    // a crashed tree may refuse to unmount cleanly
  }
  host.remove()
  return result
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ProfileSheet, real profile (source api)', () => {
  it('shows the full profile once it loads, without a preview', async () => {
    const result = await openThenLoad(false)
    expect(result.crashed).toBeNull()
    expect(result.text).toContain('Hello there')
  })

  it('shows the full profile once it loads on top of a deck preview, without re-render looping', async () => {
    const result = await openThenLoad(true)
    expect(result.crashed).toBeNull()
    expect(result.text).toContain('Hello there')
    // A handful of renders (open, load, settle); the bug hit React's 25-render limit and crashed.
    expect(result.renders).toBeLessThan(10)
  })
})
