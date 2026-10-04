import { act, createElement, StrictMode, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { API_URL } from '@/config'
import type { DiscoverFilters } from './filters'
import { useFilters, useNode, useNodeStatus, useNodeValue } from './hooks'
import { nodeSubject, setNode } from './store'
import { deferred } from './testing/fakeServer'
import { flush, startTestStore, type TestStore } from './testing/harness'
import { refresh } from './commands'
import type { NodeStatus } from './status'

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
})

function render(element: ReactNode): void {
  act(() => root.render(createElement(StrictMode, null, element)))
}

function observers(name: 'filterDistance'): number {
  return (nodeSubject(name) as unknown as { observers: unknown[] }).observers.length
}

describe('hooks', () => {
  it('useNodeValue renders the current value and follows changes; unsubscribes on unmount', () => {
    const before = observers('filterDistance')
    let renders = 0
    function Distance() {
      renders++
      return createElement('span', null, String(useNodeValue('filterDistance')))
    }
    render(createElement(Distance))
    expect(container.textContent).toBe('50')
    expect(observers('filterDistance')).toBe(before + 1)

    const afterMount = renders
    act(() => setNode('filterDistance', 80))
    expect(container.textContent).toBe('80')
    // StrictMode renders twice per update; an unrelated node changing renders nothing.
    expect(renders - afterMount).toBe(2)
    act(() => setNode('filterAgeMax', 50))
    expect(renders - afterMount).toBe(2)

    act(() => root.render(null))
    expect(observers('filterDistance')).toBe(before)
  })

  it('useNode returns a stable setter that writes the node', () => {
    const setters: ((value: number | null) => void)[] = []
    function Editor() {
      const [value, set] = useNode('filterDistance')
      setters.push(set)
      return createElement('span', null, String(value))
    }
    const write = (value: number) => setters[setters.length - 1](value)
    render(createElement(Editor))
    act(() => write(10))
    expect(container.textContent).toBe('10')
    act(() => write(20))
    expect(container.textContent).toBe('20')
    expect(new Set(setters).size).toBe(1)
  })

  it('useNodeStatus follows the request of a node', async () => {
    const gate = deferred()
    store.backend.server.on('GET', `${API_URL}/auth/validate`, () => gate.promise.then(() => ({ valid: false, userId: null })))
    const seen: NodeStatus[] = []
    function Status() {
      const status = useNodeStatus('sessionCheck')
      seen.push(status)
      return createElement('span', null, status.status)
    }
    render(createElement(Status))
    expect(container.textContent).toBe('idle')
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = refresh('sessionCheck')
    })
    expect(container.textContent).toBe('loading')
    gate.resolve()
    await act(async () => {
      await done
    })
    expect(container.textContent).toBe('success')
    // Status objects are shared constants: re-renders do not see new references for the same status.
    expect(new Set(seen.filter((status) => status.status === 'loading')).size).toBe(1)
  })

  it('useFilters returns one object per filter state', async () => {
    const seen: DiscoverFilters[] = []
    function Filters() {
      const filters = useFilters()
      seen.push(filters)
      return createElement('span', null, `${filters.ageMin}-${filters.ageMax} ${filters.tags.join('+')}`)
    }
    render(createElement(Filters))
    expect(container.textContent).toBe('18-45 ')
    act(() => setNode('filterTags', 'art,music'))
    expect(container.textContent).toBe('18-45 art+music')
    const distinct = new Set(seen)
    expect(distinct.size).toBe(2)
    await flush()
  })
})
