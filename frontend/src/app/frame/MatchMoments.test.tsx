/**
 * The app's match moment against the real state layer: a `match` is injected as if it came from the
 * socket, whatever page is open, and the takeover plays.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent } from '@/api/types'
import { actions, celebrateMatch, clearMatchMoments, startRealtime } from '@/wb'
import { getMatchMoments } from '@/wb/matchMoments'
import { person } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import { MatchMoments } from './MatchMoments'

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
  act(() => root.render(createElement(MatchMoments, { navigate })))
})

afterEach(async () => {
  await act(() => flush(40))
  act(() => clearMatchMoments())
  act(() => root.unmount())
  container.remove()
  stopRealtime()
  store.stop()
  navigate.mockReset()
})

/** The takeover's dialog (the kit's Modal renders in a portal on <body>), when one is open. */
const takeover = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const button = (label: string) =>
  [...(takeover()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((element) => element.textContent?.includes(label))

describe('MatchMoments', () => {
  it('plays when realtime tells of a match, on any page', () => {
    expect(takeover()).toBeNull()
    act(() => source.next({ type: 'match', person: person('ann') }))
    expect(takeover()?.textContent).toContain('You and ann liked each other')
  })

  it('plays the next match once one is dismissed', () => {
    act(() => {
      source.next({ type: 'match', person: person('ann') })
      source.next({ type: 'match', person: person('bea') })
    })
    act(() => button('Keep swiping')?.click())
    expect(takeover()?.textContent).toContain('You and bea liked each other')
  })

  it('says they liked you first when your like answered theirs', () => {
    act(() => celebrateMatch({ userId: 'ann', name: 'Ann', photo: null, theyLikedFirst: true }))
    expect(takeover()?.textContent).toContain('Ann liked you first')
  })

  it('"Send a message" opens the conversation and drops the moments still waiting', () => {
    act(() => {
      source.next({ type: 'match', person: person('ann') })
      source.next({ type: 'match', person: person('bea') })
    })
    act(() => button('Send a message')?.click())
    expect(navigate).toHaveBeenCalledWith('/chat/ann')
    // nothing plays after it: bea waits in the notification feed instead
    expect(getMatchMoments()).toEqual([])
  })
})
