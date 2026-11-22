/**
 * The Photos / Details / Account tabs live in the URL (`?tab=`), so a switch is a navigation, and the
 * app's <ScrollRestoration /> answered every one with `window.scrollTo(0, 0)`: clicking a tab threw the
 * page back to the top. A switch now carries an anchor, as a `#section` link does: the hash names the
 * revealed panel (or the section a header button points at) and the router snaps it into view.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OwnProfile } from '@/api/types'
import MePage from './MePage'

vi.mock('@/wb', () => ({
  refresh: vi.fn(() => Promise.resolve()),
  useNodeValue: (name: string) => (name === 'profileComplete' || name === 'profileFilled' ? true : null),
}))
vi.mock('./useMyProfile', () => ({
  useMyProfile: () => ({
    state: 'ready',
    profile: { userId: 'u-me', pictures: [] } as unknown as OwnProfile,
    error: null,
  }),
}))
// The sections are not under test: each stands in as a marker, the details with two of their anchors.
vi.mock('./ProfileHeader', () => ({
  ProfileHeader: ({ onEdit }: { onEdit: () => void }) => (
    <header>
      <button type="button" onClick={onEdit}>
        Edit profile
      </button>
    </header>
  ),
}))
vi.mock('./PhotoManager', () => ({ PhotoManager: () => <p>photos</p> }))
vi.mock('./EditSections', () => ({
  EditSections: () => (
    <>
      <section id="me-names">
        <input aria-label="First name" />
      </section>
      <section id="me-location">
        <button type="button">Locate me</button>
      </section>
    </>
  ),
}))
vi.mock('./AccountSettings', () => ({ AccountSettings: () => <p>account</p> }))
vi.mock('@/features/profile/ProfileSheet', () => ({ default: () => null }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
/** The ids of the elements scrolled into view, in order. */
let snapped: string[] = []
const scrollIntoView = Element.prototype.scrollIntoView

beforeEach(() => {
  // jsdom does not implement scrolling; the stubs record what ScrollRestoration asks for.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  snapped = []
  Element.prototype.scrollIntoView = function (this: Element) {
    snapped.push(this.id)
  }
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
  Element.prototype.scrollIntoView = scrollIntoView
})

function Layout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

async function renderMe(): Promise<ReturnType<typeof createMemoryRouter>> {
  const router = createMemoryRouter([{ element: <Layout />, children: [{ path: '/me', element: <MePage /> }] }], {
    initialEntries: ['/me'],
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(<RouterProvider router={router} />))
  vi.mocked(window.scrollTo).mockClear() // the first render may restore the initial position
  return router
}

function tab(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent === name)
  if (!found) throw new Error(`no "${name}" tab`)
  return found
}

describe('MePage tabs', () => {
  it('snap each switch to the revealed panel, like a #section link, never back to the top', async () => {
    const router = await renderMe()

    for (const [name, value, search] of [
      ['Details', 'details', '?tab=details'],
      ['Account', 'account', '?tab=account'],
      ['Photos', 'photos', ''],
    ] as const) {
      await act(async () => tab(name).click())
      expect(tab(name).getAttribute('aria-selected')).toBe('true')
      expect(router.state.location.search).toBe(search)
      expect(router.state.location.hash).toBe(`#me-panel-${value}`)
      expect(document.getElementById(`me-panel-${value}`)?.getAttribute('role')).toBe('tabpanel')
      expect(snapped.at(-1)).toBe(`me-panel-${value}`)
    }

    expect(snapped).toHaveLength(3)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('snap to the panel again when the open tab is pressed', async () => {
    const router = await renderMe()
    await act(async () => tab('Photos').click())
    expect(router.state.location.hash).toBe('#me-panel-photos')
    expect(snapped).toEqual(['me-panel-photos'])
  })

  it('open Details at the names section from the header, with the keyboard in its first field', async () => {
    const router = await renderMe()
    const edit = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Edit profile')!

    await act(async () => edit.click())

    expect(tab('Details').getAttribute('aria-selected')).toBe('true')
    expect(router.state.location.search).toBe('?tab=details')
    expect(router.state.location.hash).toBe('#me-names')
    expect(snapped).toEqual(['me-names'])
    expect(document.activeElement?.getAttribute('aria-label')).toBe('First name')
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
