/**
 * The node-graph vocabulary: the types the app's node definitions are authored in and the engine
 * (src/wb/engine) interprets. Everything here is type-only.
 */

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
