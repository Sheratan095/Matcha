/**
 * The node graph (docs/ARCHITECTURE.md §4.5), assembled from the domain files, and the types the
 * rest of the app is checked against: `NodeValues` (node name -> value) and `Commands`
 * (command -> payload and result).
 */
import type { HttpSpec, SelectionSpec } from './builders'
import { toNodeDefs } from './builders'
import { discoverNodes, type DiscoverCommands, type DiscoverNodes } from './discover'
import { profileNodes, type ProfileCommands, type ProfileNodes } from './profile'
import { searchNodes, type SearchNodes } from './search'
import { sessionNodes, type SessionCommands, type SessionNodes } from './session'
import { matchesNodes, type ChatCommands, type MatchesNodes } from './matches'

export { DEFAULT_FILTERS } from './discover'

/** Every node of the graph and the type of its value once loaded (a node may also be `null` or `undefined`). */
export interface NodeValues extends SessionNodes, ProfileNodes, DiscoverNodes, SearchNodes, MatchesNodes {}
export type NodeName = keyof NodeValues

/** What a node can hold: its value, `null` (loading / reset / failed) or `undefined` (never loaded). */
export type NodeValue<Name extends NodeName> = NodeValues[Name] | null | undefined

/** Every mutation: `run(name, payload)` writes `<name>Payload` and settles with `<name>Result`'s request. */
export interface Commands extends SessionCommands, ProfileCommands, DiscoverCommands, ChatCommands {}
export type CommandName = keyof Commands
export type CommandPayload<Name extends CommandName> = Commands[Name]['payload']
export type CommandResult<Name extends CommandName> = Commands[Name]['result']

const specs = { ...sessionNodes, ...profileNodes, ...discoverNodes, ...searchNodes, ...matchesNodes }
type Specs = typeof specs
type NamesOf<Kind> = { [Name in keyof Specs]: Specs[Name] extends Kind ? Name : never }[keyof Specs]

/** Nodes backed by a request: they have a status (`useNodeStatus`). */
export type HttpNodeName = NamesOf<HttpSpec>

/**
 * Read nodes that can be refetched in place, and the nonce node that triggers each.
 * `sessionCheck` is refetched by bumping the session probe. `chatHistory` is not here: writing its
 * `chatAfter` cursor is what refetches it (src/wb/actions.ts).
 */
export const REFRESH_TRIGGERS = {
  sessionCheck: 'sessionProbe',
  myProfile: 'myProfileRefresh',
  myViewers: 'viewersRefresh',
  visitedProfiles: 'visitedRefresh',
  blockedUsers: 'blocksRefresh',
  likesReceived: 'likesRefresh',
  matchesMap: 'matchesMapRefresh',
  discoverDeck: 'discoverRefresh',
  interestCatalogue: 'interestsRefresh',
  searchResults: 'searchRefresh',
  connections: 'connectionsRefresh',
  chatList: 'chatListRefresh',
} as const satisfies Partial<Record<HttpNodeName, NamesOf<SelectionSpec>>>
export type RefreshableNodeName = keyof typeof REFRESH_TRIGGERS

/**
 * Reads that load on demand, and the gate (a `demand` dependency) each waits behind. Nothing is sent
 * for them at sign-in: a screen asks with `load` / `useLoad` (src/wb/demand.ts), which opens the gate
 * once; from then on they behave like any read (refreshes, realtime) until the user signs out.
 */
export const LAZY_GATES = {
  discoverDeck: 'discoverWanted',
  interestCatalogue: 'interestsWanted',
  myViewers: 'viewersWanted',
  visitedProfiles: 'visitedWanted',
  blockedUsers: 'blocksWanted',
  matchesMap: 'mapWanted',
} as const satisfies Partial<Record<RefreshableNodeName, NamesOf<SelectionSpec>>>
export type LazyNodeName = keyof typeof LAZY_GATES

type TriggerNodeName = (typeof REFRESH_TRIGGERS)[RefreshableNodeName]
type GateNodeName = (typeof LAZY_GATES)[LazyNodeName]
type PayloadNodeName = `${CommandName}Payload`
/** Kept by the state layer itself (the open thread and its fetch cursor). */
type InternalNodeName = 'chatAfter' | 'chatThread'

/**
 * Selection nodes screens may write directly (`setNode`, `useNode`). Command payloads go through
 * `run`, refresh nonces through `refresh`, gates through `load`.
 */
export type WritableNodeName = Exclude<NamesOf<SelectionSpec>, TriggerNodeName | GateNodeName | PayloadNodeName | InternalNodeName>

/** The flat list handed to the engine. Order is tangle order. */
export const NODES = toNodeDefs(specs)
