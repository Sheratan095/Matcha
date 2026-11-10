/**
 * Small builders for node definitions. They encode the conventions of docs/ARCHITECTURE.md §4.2 once,
 * so the domain files read as a description of the graph and cannot get a flag wrong.
 *
 * Every node is a top-level `SINGLE` node (the only kind the engine supports).
 */
import type { DepDef, HttpMethod, LoadingActionDef, NodeDef } from '../types'

// ---------------------------------------------------------------- specs

export type ServiceName = 'api' | 'social'

interface Spec<Type extends LoadingActionDef['type']> {
  dep: DepDef[]
  la: LoadingActionDef & { type: Type }
  defaultValue?: unknown
}
/** `USER_SELECTION`: written by the app. */
export type SelectionSpec = Spec<'USER_SELECTION'>
/** `CUSTOM_FUNCTION`: computed synchronously from other nodes. */
export type DerivedSpec = Spec<'CUSTOM_FUNCTION'>
/** An axios request built from other nodes. */
export type HttpSpec = Spec<HttpMethod>
export type NodeSpec = SelectionSpec | DerivedSpec | HttpSpec

/** One spec per key of a node value map: adding a node without typing it (or the reverse) fails to compile. */
export type SpecsFor<Values> = { [Name in keyof Values]: NodeSpec }

/** A mutation: a `<name>Payload` selection node plus a `<name>Result` HTTP node. */
export interface Command<Payload, Result> {
  payload: Payload
  result: Result
}

/** The two nodes behind each command, with their value types. A command without payload is fired by a nonce. */
export type CommandNodes<C> = {
  [Name in keyof C & string as `${Name}Payload`]: C[Name] extends Command<infer Payload, unknown>
    ? [Payload] extends [void]
      ? number
      : Payload
    : never
} & {
  [Name in keyof C & string as `${Name}Result`]: C[Name] extends Command<unknown, infer Result> ? Result : never
}

type CommandSpecs<C> = { [Name in keyof C & string as `${Name}Payload`]: SelectionSpec } & {
  [Name in keyof C & string as `${Name}Result`]: HttpSpec
}

// ---------------------------------------------------------------- dependencies

/**
 * Required dependency on the signed-in user: the read loads at login, resets to `null` at logout and
 * never fires while anonymous. The value is not sent (cookies carry the identity).
 */
export function session(): DepDef {
  return { nodeName: 'sessionUserId', parameterName: 'viewer', isOptional: false, onUpdate: true }
}

/**
 * Refresh trigger: bumping the nonce node refetches without flashing the value to `null`
 * (optional + `onUpdate: false`).
 */
export function trigger(nodeName: string): DepDef {
  return { nodeName, parameterName: 'refresh', isOptional: true, onUpdate: false }
}

/** Fills the `{parameterName}` placeholder of `addr`. The value is inserted raw: it must be URL-safe. */
export function pathVariable(nodeName: string, parameterName: string): DepDef {
  return { nodeName, parameterName, isOptional: false, onUpdate: true, type: 'PATH_VARIABLE' }
}

/** Sent as `?parameterName=value`; axios drops it when the value is null. */
export function queryParameter(nodeName: string, parameterName: string, options: { optional?: boolean } = {}): DepDef {
  return { nodeName, parameterName, isOptional: options.optional ?? false, onUpdate: true, type: 'REQUEST_PARAMETER' }
}

/**
 * Input of a custom function. Optional and without `onUpdate`, so the function runs on every
 * emission, receives `null` / `undefined` for what is not loaded, and its node never keeps a stale
 * value (a required input would freeze the node when the input resets).
 */
export function input(nodeName: string, parameterName: string): DepDef {
  return { nodeName, parameterName, isOptional: true, onUpdate: false }
}

// ---------------------------------------------------------------- nodes

export function selection(defaultValue?: unknown): SelectionSpec {
  return defaultValue === undefined
    ? { dep: [], la: { type: 'USER_SELECTION' } }
    : { dep: [], la: { type: 'USER_SELECTION' }, defaultValue }
}

export function get(serviceName: ServiceName, addr: string, dep: DepDef[]): HttpSpec {
  return { dep, la: { type: 'GET', serviceName, addr } }
}

/** `dep` order is the argument order of the function (src/wb/functions.ts). */
export function derived(functionName: string, dep: DepDef[]): DerivedSpec {
  return { dep, la: { type: 'CUSTOM_FUNCTION', functionName } }
}

export interface CommandSpec {
  method: Exclude<HttpMethod, 'GET'>
  serviceName: ServiceName
  addr: string
  /**
   * How the payload node reaches the request:
   * - `'body'`: it is the request body as-is (an object is sent as JSON, a FormData as multipart);
   * - `{ pathVariable }`: it fills that placeholder of `addr`;
   * - `'none'`: it is only a nonce that fires the request.
   */
  payload: 'body' | 'none' | { pathVariable: string }
}

function commandNodes(name: string, spec: CommandSpec): [SelectionSpec, HttpSpec] {
  const payloadNode = `${name}Payload`
  const la: HttpSpec['la'] = { type: spec.method, serviceName: spec.serviceName, addr: spec.addr }
  // The result depends on the payload ONLY: a second dependency would re-send the request whenever
  // that other node emits.
  let dep: DepDef
  if (spec.payload === 'body') {
    dep = { nodeName: payloadNode, parameterName: 'body', isOptional: false, onUpdate: true, type: 'BODY' }
  } else {
    dep =
      spec.payload === 'none'
        ? { nodeName: payloadNode, parameterName: 'nonce', isOptional: false, onUpdate: true }
        : pathVariable(payloadNode, spec.payload.pathVariable)
    // Without a BODY dependency the engine would send an empty multipart form; ask for `{}` instead.
    la.bodyType = 'JSON_OBJECT'
  }
  return [selection(), { dep: [dep], la }]
}

export function commands<C>(specs: { [Name in keyof C & string]: CommandSpec }): CommandSpecs<C> {
  const nodes: Record<string, NodeSpec> = {}
  for (const [name, spec] of Object.entries<CommandSpec>(specs)) {
    const [payload, result] = commandNodes(name, spec)
    nodes[`${name}Payload`] = payload
    nodes[`${name}Result`] = result
  }
  return nodes as CommandSpecs<C>
}

/** Turns a record of specs into the flat list the engine takes. Record order is tangle order. */
export function toNodeDefs(specs: Record<string, NodeSpec>): NodeDef[] {
  return Object.entries(specs).map(([name, spec]) => ({ name, path: `/${name}`, type: 'SINGLE', ...spec }))
}
