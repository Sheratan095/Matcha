/**
 * Types shim for wave-binder 0.0.2 (docs/WAVEBINDER.md §3.3 and §8).
 *
 * The package does not export its config types and types `la.type` & co. as enums that reject
 * string literals, so node definitions are authored with the literal mirrors below and cast once,
 * where the real engine is constructed. Everything here is type-only: importing this file never
 * evaluates the library.
 */
import type { WaveBinder } from 'wave-binder'

// ---- the library's own types, derived because they are not exported
type CtorArgs = ConstructorParameters<typeof WaveBinder>
export type WbLicense = CtorArgs[0]
export type WbProtoNode = CtorArgs[1][number]
export type WbServiceMap = CtorArgs[2]
export type WbFunctionInstance = CtorArgs[3][number]
export type WbInstance = WaveBinder

// ---- authoring types: the string values the runtime compares against
export type NodeType = 'SINGLE' | 'MULTI' | 'LIST' | 'COMPLEX'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
export type LoadingType = 'USER_SELECTION' | 'CUSTOM_FUNCTION' | HttpMethod
export type DependencyType = 'PATH_VARIABLE' | 'REQUEST_PARAMETER' | 'BODY'
export type BodyType = 'JSON_OBJECT' | 'MULTI_PART_FORM_DATA'

export interface NamingRule {
  type: 'SAME_INDEX' | 'ALMOST_SAME_INDEX' | 'FIXED_INDEX'
  fatherNodeName: string
  value?: number
}

export interface DepDef {
  /** Node to listen to. */
  nodeName: string
  /** `{placeholder}` in `addr`, query key, body key, or custom function argument name. */
  parameterName: string
  /** false: the node does nothing until this dependency is non-null. */
  isOptional: boolean
  /** true: the node emits `null` before recomputing when this dependency emits. */
  onUpdate: boolean
  type?: DependencyType
  /** LIST scenarios only; not used by this app. */
  namingResolvingRule?: NamingRule | NamingRule[]
}

export interface LoadingActionDef {
  type: LoadingType
  /** Appended to the service target; may contain `{parameterName}` placeholders. */
  addr?: string
  serviceName?: string
  headers?: Record<string, string>
  bodyType?: BodyType
  functionName?: string
}

export interface NodeDef {
  /** Unique across the whole graph. */
  name: string
  path: string
  type: NodeType
  dep: DepDef[]
  la: LoadingActionDef
  /** Applied when the graph is tangled and the value is still null / undefined. */
  defaultValue?: unknown
  proto?: NodeDef
  protos?: NodeDef[]
}

export interface ServiceDef {
  target: string
  /** true rewrites the target to https://. */
  secure: boolean
  authorization: string | null
  headers?: Record<string, string>
}

export interface FunctionDef {
  name: string
  // Custom functions take the dependency values positionally; their signatures differ per node.
  implementation: (...args: never[]) => unknown
}

export function isHttpMethod(type: LoadingType): type is HttpMethod {
  return type !== 'USER_SELECTION' && type !== 'CUSTOM_FUNCTION'
}
