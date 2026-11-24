/**
 * The state layer's public surface (docs/ARCHITECTURE.md §4.6). Screens import from `@/wb` only.
 *
 * - Hooks: `useNodeValue`, `useNode`, `useNodeStatus`, `useLoad`, `useFilters`.
 * - Imperative: `getNodeValue`, `setNode`, `node$`, `getNodeStatus`, `nodeStatus$`, `load`, `refresh`, `run`.
 * - `actions`: the flows screens call.
 * - `realtime$`, and the notification feed it fills: `useNotifications`, `useUnreadNotifications`,
 *   `getNotifications`, `markAllNotificationsRead`, `clearNotifications`.
 * - The match moment queue (realtime's `match` and the screens' own likes): `useMatchMoment`,
 *   `celebrateMatch`, `dismissMatchMoment`, `clearMatchMoments`.
 * - Boot (main.tsx only): `installStoreHttp`, `startStore`, `startRealtime`.
 */
export {
  actions,
  MAX_MESSAGE_LENGTH,
  type Actions,
  type DateAnswer,
  type DatePlan,
  type RewindOutcome,
  type SwipeOutcome,
} from './actions'
export { installStoreHttp } from './boot'
export { refresh, run, type RunArgs } from './commands'
export { load, REVISIT_MS } from './demand'
export {
  DEFAULT_DISCOVER_FILTERS,
  DISCOVER_SORTS,
  FILTER_LIMITS,
  normaliseTags,
  tagFromInput,
  type DiscoverFilters,
} from './filters'
export type { AuthStatus } from './functions'
export { useFilters, useLoad, useNode, useNodeStatus, useNodeValue, useSearchCriteria, type UseLoadOptions } from './hooks'
export {
  DEFAULT_FILTERS,
  type CommandName,
  type CommandPayload,
  type CommandResult,
  type Commands,
  type HttpNodeName,
  type LazyNodeName,
  type NodeName,
  type NodeValue,
  type NodeValues,
  type RefreshableNodeName,
  type WritableNodeName,
} from './nodes'
export {
  celebrateMatch,
  clearMatchMoments,
  dismissMatchMoment,
  useMatchMoment,
  type MatchedPerson,
} from './matchMoments'
export {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  NOTIFICATION_LIMIT,
  useNotifications,
  useUnreadNotifications,
  type AppNotification,
  type NotificationKind,
} from './notifications'
export { realtime$, startRealtime, type RealtimeOptions } from './realtime'
export { EMPTY_SEARCH, hasSearchCriteria, type SearchCriteria } from './search'
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
