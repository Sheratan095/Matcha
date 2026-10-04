/**
 * Static checks on a node graph. wave-binder accepts almost anything silently (an unknown dependency
 * just means the node never loads), so the mistakes that are easy to make are caught here instead:
 * at store start-up and in the unit tests.
 */
import { isHttpMethod, type FunctionDef, type NodeDef, type ServiceDef } from '../types'

export interface GraphInput {
  nodes: NodeDef[]
  services: Record<string, ServiceDef>
  functions: FunctionDef[]
}

/** Every problem found, as human-readable sentences; empty when the graph is sound. */
export function validateGraph({ nodes, services, functions }: GraphInput): string[] {
  const problems: string[] = []
  const byName = new Map<string, NodeDef>()
  const functionsByName = new Map(functions.map((fn) => [fn.name, fn.implementation]))

  for (const node of nodes) {
    if (byName.has(node.name)) problems.push(`"${node.name}" is defined twice (node names are one global namespace)`)
    byName.set(node.name, node)
  }

  for (const node of nodes) {
    const { name, dep, la } = node
    if (node.type !== 'SINGLE' || node.proto || node.protos) {
      problems.push(`"${name}" is not a plain SINGLE node (LIST / COMPLEX / MULTI are outside the supported subset)`)
    }

    const seen = new Set<string>()
    for (const d of dep) {
      if (!byName.has(d.nodeName)) problems.push(`"${name}" depends on "${d.nodeName}", which does not exist`)
      if (d.nodeName === name) problems.push(`"${name}" depends on itself`)
      if (seen.has(d.nodeName)) problems.push(`"${name}" lists "${d.nodeName}" twice (it would subscribe twice)`)
      seen.add(d.nodeName)
      if (d.namingResolvingRule) problems.push(`"${name}" uses namingResolvingRule (LIST only)`)
    }

    if (la.type === 'USER_SELECTION') {
      if (dep.length > 0) {
        problems.push(`"${name}" is a USER_SELECTION node with dependencies: it would be reset to null on each of their emissions`)
      }
      continue
    }

    if (la.type === 'CUSTOM_FUNCTION') {
      const fn = la.functionName ? functionsByName.get(la.functionName) : undefined
      if (!fn) {
        problems.push(`"${name}" calls the unknown function "${la.functionName ?? ''}" (its value would always be null)`)
      } else if (fn.length !== dep.length) {
        problems.push(
          `"${name}": function "${la.functionName}" declares ${fn.length} parameter(s) for ${dep.length} dependencies (more makes the library append a snapshot argument)`,
        )
      }
      continue
    }

    if (isHttpMethod(la.type)) {
      if (!la.serviceName || !services[la.serviceName]) {
        problems.push(`"${name}" uses the unknown service "${la.serviceName ?? ''}"`)
      }
      const addr = la.addr ?? ''
      const placeholders = [...addr.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
      for (const placeholder of placeholders) {
        const sources = dep.filter((d) => d.parameterName === placeholder)
        if (sources.length !== 1 || sources[0].type !== 'PATH_VARIABLE' || sources[0].isOptional) {
          problems.push(`"${name}": {${placeholder}} must be filled by exactly one required PATH_VARIABLE dependency`)
        }
      }
      for (const d of dep) {
        if (d.type === 'PATH_VARIABLE' && !placeholders.includes(d.parameterName)) {
          problems.push(`"${name}": PATH_VARIABLE "${d.parameterName}" has no {${d.parameterName}} in "${addr}"`)
        }
      }
      const sendsBody = la.type === 'POST' || la.type === 'PUT' || la.type === 'PATCH'
      const bodyDeps = dep.filter((d) => d.type === 'BODY')
      if (bodyDeps.length > 0 && !sendsBody) problems.push(`"${name}": ${la.type} requests carry no body`)
      if (sendsBody && bodyDeps.length !== 1 && la.bodyType !== 'JSON_OBJECT') {
        problems.push(`"${name}": without exactly one BODY dependency, set bodyType JSON_OBJECT (the default is an empty multipart form)`)
      }
      if (la.type !== 'GET' && dep.length !== 1) {
        problems.push(`"${name}": a mutation must depend on its payload node only (any other dependency would re-send it)`)
      }
    }
  }

  // The library has no cycle detection: a cycle is an infinite synchronous loop.
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (name: string, trail: string[]): void => {
    if (state.get(name) === 'done') return
    if (state.get(name) === 'visiting') {
      problems.push(`dependency cycle: ${[...trail.slice(trail.indexOf(name)), name].join(' -> ')}`)
      return
    }
    state.set(name, 'visiting')
    for (const d of byName.get(name)?.dep ?? []) if (byName.has(d.nodeName)) visit(d.nodeName, [...trail, name])
    state.set(name, 'done')
  }
  for (const node of nodes) visit(node.name, [])

  return problems
}

export function assertValidGraph(input: GraphInput): void {
  const problems = validateGraph(input)
  if (problems.length > 0) throw new Error(`Invalid node graph:\n- ${problems.join('\n- ')}`)
}
