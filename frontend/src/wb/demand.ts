/**
 * Reads asked for by the screens that show them (docs/ARCHITECTURE.md §4.4).
 *
 * Two problems, one entry point (`load`, and `useLoad` in ./hooks.ts):
 * - a read only one screen needs (the deck, the map, the visitors...) waits behind a gate
 *   (`LAZY_GATES`) instead of loading for everyone at sign-in; the first `load` opens it, for the rest
 *   of the session;
 * - a screen that wants fresh data when it is shown asks for it with a maximum age instead of
 *   refreshing on every mount: a read that is still on its way, or young enough, is left alone. That
 *   also makes StrictMode's double effects (and quick back-and-forth between pages) cost nothing.
 */
import { awaitLoad, refresh } from './commands'
import { LAZY_GATES, type LazyNodeName, type RefreshableNodeName } from './nodes'
import { firstTimeForStore, getLoadedAt, getNodeStatus, getNodeValue, isStoreLive, onStoreStop, writeNode } from './store'

/** The age past which a screen refetches what it shows when it is shown again. */
export const REVISIT_MS = 30_000

/** Reads whose value is known to be out of date: their next `load` refetches, whatever its age. */
const stale = new Set<RefreshableNodeName>()

function forgetOnStop(): void {
  if (firstTimeForStore('demand')) onStoreStop(() => stale.clear())
}

function gateOf(name: RefreshableNodeName): (typeof LAZY_GATES)[LazyNodeName] | null {
  return name in LAZY_GATES ? LAZY_GATES[name as LazyNodeName] : null
}

/** The read changed on the server (e.g. a profile view adds to the visit history): refetch it on its next `load`. */
export function markStale(name: RefreshableNodeName): void {
  forgetOnStop()
  stale.add(name)
}

/**
 * The screen showing `name` needs it:
 * - a lazy read whose gate is closed: the gate opens, and that is its first load;
 * - a request of it on its way: nothing more is sent;
 * - otherwise it is refetched in place when it failed, was never loaded, was marked stale, or is older
 *   than `maxAgeMs` (by default it is loaded once and then kept fresh by actions and realtime).
 * Resolves once the load it caused (if any) is in; never rejects (errors are on `useNodeStatus`).
 */
export async function load(name: RefreshableNodeName, maxAgeMs = Number.POSITIVE_INFINITY): Promise<void> {
  if (!isStoreLive()) return
  forgetOnStop()
  const gate = gateOf(name)
  if (gate && getNodeValue(gate) == null) {
    stale.delete(name)
    await awaitLoad(name, () => writeNode(gate, true))
    return
  }
  const { status } = getNodeStatus(name)
  if (status === 'loading') return
  const loadedAt = getLoadedAt(name)
  const fresh = loadedAt !== null && Date.now() - loadedAt < maxAgeMs && !stale.has(name)
  if (fresh) return
  stale.delete(name)
  await refresh(name)
}

/** Signing out (or another user signing in) closes every gate: the next user loads only what they open. */
export function closeGates(): void {
  for (const gate of Object.values(LAZY_GATES)) {
    if (getNodeValue(gate) != null) writeNode(gate, null)
  }
  stale.clear()
}
