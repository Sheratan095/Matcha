/**
 * The node graph (docs/ARCHITECTURE.md §4.5), assembled from the domain files, and the types the
 * rest of the app is checked against: `NodeValues` (node name -> value) and `Commands`
 * (command -> payload and result).
 */
import type { HttpSpec, SelectionSpec } from './builders'
import { toNodeDefs } from './builders'
import { discoverNodes, type DiscoverCommands, type DiscoverNodes } from './discover'
import { profileNodes, type ProfileCommands, type ProfileNodes } from './profile'
import { sessionNodes, type SessionCommands, type SessionNodes } from './session'
import { socialNodes, type SocialCommands, type SocialNodes } from './social'

export { DEFAULT_FILTERS } from './discover'

/** Every node of the graph and the type of its value once loaded (a node may also be `null` or `undefined`). */
export interface NodeValues extends SessionNodes, ProfileNodes, DiscoverNodes, SocialNodes {}
export type NodeName = keyof NodeValues

/** What a node can hold: its value, `null` (loading / reset / failed) or `undefined` (never loaded). */
export type NodeValue<Name extends NodeName> = NodeValues[Name] | null | undefined

/** Every mutation: `run(name, payload)` writes `<name>Payload` and settles with `<name>Result`'s request. */
export interface Commands extends SessionCommands, ProfileCommands, DiscoverCommands, SocialCommands {}
export type CommandName = keyof Commands
export type CommandPayload<Name extends CommandName> = Commands[Name]['payload']
export type CommandResult<Name extends CommandName> = Commands[Name]['result']

const specs = { ...sessionNodes, ...profileNodes, ...discoverNodes, ...socialNodes }
type Specs = typeof specs
type NamesOf<Kind> = { [Name in keyof Specs]: Specs[Name] extends Kind ? Name : never }[keyof Specs]

/** Nodes backed by a request: they have a status (`useNodeStatus`). */
export type HttpNodeName = NamesOf<HttpSpec>

/**
 * Read nodes that can be refetched in place, and the nonce node that triggers each.
 * `sessionCheck` is refetched by bumping the session probe.
 */
export const REFRESH_TRIGGERS = {
  sessionCheck: 'sessionProbe',
  myProfile: 'myProfileRefresh',
  myViewers: 'activityRefresh',
  likesReceived: 'activityRefresh',
  onlineCount: 'presenceRefresh',
  matchesMap: 'matchesMapRefresh',
  discoverDeck: 'discoverRefresh',
  matches: 'matchesRefresh',
  chatMessages: 'chatRefresh',
} as const satisfies Partial<Record<HttpNodeName, NamesOf<SelectionSpec>>>
export type RefreshableNodeName = keyof typeof REFRESH_TRIGGERS

type TriggerNodeName = (typeof REFRESH_TRIGGERS)[RefreshableNodeName]
type PayloadNodeName = `${CommandName}Payload`

/**
 * Selection nodes screens may write directly (`setNode`, `useNode`). Command payloads go through
 * `run`, refresh nonces through `refresh`.
 */
export type WritableNodeName = Exclude<NamesOf<SelectionSpec>, TriggerNodeName | PayloadNodeName>

/** The flat list handed to the engine. Order is tangle order. */
export const NODES = toNodeDefs(specs)
