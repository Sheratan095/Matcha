/**
 * How an HTTP node turns its dependency values into an axios request. This mirrors
 * wave-binder 0.0.2's HttpService line by line (docs/WAVEBINDER.md §4.3), including its quirks, so
 * the preview engine sends exactly what the real engine would send for the same node definition.
 */
import type { AxiosRequestConfig } from 'axios'
import type { NodeDef, ServiceDef } from '../types'

/** The service target, rewritten to https:// when the service is marked `secure`. */
export function serviceBase(service: ServiceDef | undefined): string {
  const target = service?.target ?? ''
  if (service?.secure !== true || !target) return target
  // Same order as the library: a relative target (including a protocol-relative one) is left alone.
  if (target.startsWith('/')) return target
  if (target.startsWith('https://')) return target
  if (target.startsWith('http://')) return `https://${target.slice('http://'.length)}`
  if (/^[a-z]+:\/\//i.test(target)) return target
  return `https://${target}`
}

function requestUrl(def: NodeDef, depValues: ReadonlyMap<string, unknown>, service: ServiceDef | undefined): string {
  let url = serviceBase(service) + (def.la.addr ?? '')
  // Every dependency is tried as a placeholder, whatever its `type`, and the value is not URL-encoded.
  for (const dep of def.dep) {
    url = url.replace(`{${dep.parameterName}}`, String(depValues.get(dep.nodeName)))
  }
  return url
}

function requestParams(def: NodeDef, depValues: ReadonlyMap<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const dep of def.dep) {
    if (dep.type === 'REQUEST_PARAMETER') params[dep.parameterName] = depValues.get(dep.nodeName)
  }
  return params
}

function requestBody(def: NodeDef, depValues: ReadonlyMap<string, unknown>): unknown {
  const bodyDeps = def.dep.filter((dep) => dep.type === 'BODY')
  // Exactly one BODY dependency: its value is the body as-is (object -> JSON, FormData -> multipart).
  if (bodyDeps.length === 1) return depValues.get(bodyDeps[0].nodeName)
  if (def.la.bodyType === 'JSON_OBJECT') {
    const body: Record<string, unknown> = {}
    for (const dep of bodyDeps) body[dep.parameterName] = depValues.get(dep.nodeName)
    return body
  }
  const form = new FormData()
  for (const dep of bodyDeps) {
    const part = new Blob([JSON.stringify(depValues.get(dep.nodeName))], { type: 'application/json' })
    form.append(dep.parameterName, part)
  }
  return form
}

function requestHeaders(def: NodeDef, service: ServiceDef | undefined): Record<string, string> {
  const headers: Record<string, string> = { ...structuredClone(service?.headers ?? {}), ...(def.la.headers ?? {}) }
  const hasAuthorization = Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')
  if (service?.authorization && !hasAuthorization) headers.Authorization = service.authorization
  return headers
}

/** The config handed to the default axios instance for one reload of an HTTP node. */
export function buildRequest(
  def: NodeDef,
  depValues: ReadonlyMap<string, unknown>,
  service: ServiceDef | undefined,
): AxiosRequestConfig {
  const method = def.la.type
  const config: AxiosRequestConfig = {
    url: requestUrl(def, depValues, service),
    method,
    params: requestParams(def, depValues),
    headers: requestHeaders(def, service),
  }
  if (method === 'PUT' || method === 'PATCH' || method === 'POST') config.data = requestBody(def, depValues)
  return config
}
