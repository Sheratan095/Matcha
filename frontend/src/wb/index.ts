/**
 * The state layer's public surface (docs/ARCHITECTURE.md §4.6). Screens import from `@/wb` only.
 *
 * - Hooks: `useNodeValue`, `useNode`, `useNodeStatus`, `useFilters`.
 * - Imperative: `getNodeValue`, `setNode`, `node$`, `getNodeStatus`, `nodeStatus$`, `refresh`, `run`.
 * - `actions`: the flows screens call.
 * - `realtime$`.
 * - Boot (main.tsx only): `installStoreHttp`, `startStore`, `getViewerId`, `startRealtime`.
 */
export { actions, MAX_MESSAGE_LENGTH, type Actions } from './actions'
export { getViewerId, installStoreHttp } from './boot'
export { refresh, run, type RunArgs } from './commands'
export { DEFAULT_DISCOVER_FILTERS, DISCOVER_SORTS, normaliseTags, type DiscoverFilters } from './filters'
export type { AuthStatus } from './functions'
export { useFilters, useNode, useNodeStatus, useNodeValue } from './hooks'
export {
  DEFAULT_FILTERS,
  type CommandName,
  type CommandPayload,
  type CommandResult,
  type Commands,
  type HttpNodeName,
  type NodeName,
  type NodeValue,
  type NodeValues,
  type RefreshableNodeName,
  type WritableNodeName,
} from './nodes'
export { realtime$, startRealtime, type RealtimeOptions } from './realtime'
export type { NodeStatus, RequestStatus } from './status'
export {
  getNodeStatus,
  getNodeValue,
  isStoreLive,
  node$,
  nodeStatus$,
  setNode,
  startStore,
  type StoreHandle,
} from './store'
export { isApiError, LOCAL_ERROR, toApiError } from '@/api/http'
