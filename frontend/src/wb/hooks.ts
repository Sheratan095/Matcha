/**
 * React bindings (docs/ARCHITECTURE.md §4.6). Built on `useSyncExternalStore`, so they are safe under
 * StrictMode and concurrent rendering: the snapshot is the node's current value (stable until the node
 * emits again), and `subscribe` is cached per node so React never resubscribes needlessly.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { skip, type Observable } from 'rxjs'
import { filtersFrom, type DiscoverFilters } from './filters'
import type { HttpNodeName, NodeName, NodeValue, NodeValues, WritableNodeName } from './nodes'
import type { NodeStatus } from './status'
import { nodeSubject, setNode, statusSource } from './store'

interface Readable<T> extends Observable<T> {
  getValue(): T
}

interface ExternalStore {
  subscribe(onChange: () => void): () => void
  getSnapshot(): unknown
}

/** One per source object, so a restarted store (tests) gets fresh entries. */
const externalStores = new WeakMap<object, ExternalStore>()

function externalStore(source: Readable<unknown>): ExternalStore {
  let store = externalStores.get(source)
  if (!store) {
    store = {
      subscribe(onChange) {
        // A BehaviorSubject replays its value on subscribe; React reads it through getSnapshot anyway.
        const subscription = source.pipe(skip(1)).subscribe(() => onChange())
        return () => subscription.unsubscribe()
      },
      getSnapshot: () => source.getValue(),
    }
    externalStores.set(source, store)
  }
  return store
}

function useReadable<T>(source: Readable<T>): T {
  const store = externalStore(source)
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot) as T
}

/** The value of a node: loaded value, `null` (loading / reset / failed) or `undefined` (never loaded). */
export function useNodeValue<Name extends NodeName>(name: Name): NodeValue<Name> {
  return useReadable(nodeSubject(name)) as NodeValue<Name>
}

/** `[value, set]` for the selection nodes screens own. `set` is stable for a given name. */
export function useNode<Name extends WritableNodeName>(
  name: Name,
): [NodeValue<Name>, (value: NodeValues[Name] | null) => void] {
  const value = useNodeValue(name)
  const set = useCallback((next: NodeValues[Name] | null) => setNode(name, next), [name])
  return [value, set]
}

/** `{ status: 'idle' | 'loading' | 'success' | 'error', error }` of an HTTP node. */
export function useNodeStatus(name: HttpNodeName): NodeStatus {
  return useReadable(statusSource(name))
}

/** The discover filters as one object (stable until one of them changes). Write with `actions.setFilters`. */
export function useFilters(): DiscoverFilters {
  const ageMin = useNodeValue('filterAgeMin')
  const ageMax = useNodeValue('filterAgeMax')
  const distance = useNodeValue('filterDistance')
  const fameMin = useNodeValue('filterFameMin')
  const sort = useNodeValue('filterSort')
  const tags = useNodeValue('filterTags')
  return useMemo(
    () => filtersFrom({ ageMin, ageMax, distance, fameMin, sort, tags }),
    [ageMin, ageMax, distance, fameMin, sort, tags],
  )
}
