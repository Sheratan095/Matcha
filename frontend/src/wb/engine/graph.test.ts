import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred, FakeServer, nestError } from '../testing/fakeServer'
import type { DepDef, FunctionDef, NodeDef, ServiceDef } from '../types'
import { createGraphEngine } from './graph'
import { buildRequest, serviceBase } from './request'
import type { StoreEngine } from './types'

const API = 'http://api.test'
const services: Record<string, ServiceDef> = {
  api: { target: API, secure: false, authorization: null, headers: { 'X-Svc': 'svc' } },
}

function node(name: string, la: NodeDef['la'], dep: DepDef[] = [], defaultValue?: unknown): NodeDef {
  const def: NodeDef = { name, path: `/${name}`, type: 'SINGLE', dep, la }
  if (defaultValue !== undefined) def.defaultValue = defaultValue
  return def
}
const selection = (name: string, defaultValue?: unknown) => node(name, { type: 'USER_SELECTION' }, [], defaultValue)
const dep = (nodeName: string, parameterName: string, extra: Partial<DepDef> = {}): DepDef => ({
  nodeName,
  parameterName,
  isOptional: false,
  onUpdate: true,
  ...extra,
})

/** Every value a node takes, starting with the one it has when recording starts. */
function record(engine: StoreEngine, name: string): unknown[] {
  const values: unknown[] = []
  engine.getNode(name).subscribe((value) => values.push(value))
  return values
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

let server: FakeServer
let uninstall: () => void
let engine: StoreEngine | null = null
let consoleError: ReturnType<typeof vi.spyOn>

function start(nodes: NodeDef[], functions: FunctionDef[] = []): StoreEngine {
  engine = createGraphEngine({ nodes, services, functions })
  return engine
}

beforeEach(() => {
  server = new FakeServer()
  uninstall = server.install()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  engine?.destroy()
  engine = null
  uninstall()
  consoleError.mockRestore()
})

describe('graph engine: tangle and propagation', () => {
  it('comes alive asynchronously; a value written before ready is reset by the tangle, defaults are applied', async () => {
    const engine = start([selection('a'), selection('b', 7)])
    expect(engine.getNode('a').getValue()).toBeUndefined()
    engine.getNode('a').next(42)
    expect(await engine.ready).toBe(true)
    expect(engine.getNode('a').getValue()).toBeNull()
    expect(engine.getNode('b').getValue()).toBe(7)
  })

  it('recomputes a custom function on each dependency emission, with null first when onUpdate', async () => {
    const engine = start(
      [selection('a'), node('twice', { type: 'CUSTOM_FUNCTION', functionName: 'twice' }, [dep('a', 'value')])],
      [{ name: 'twice', implementation: (value: number) => value * 2 }],
    )
    await engine.ready
    const seen = record(engine, 'twice')
    engine.getNode('a').next(3)
    engine.getNode('a').next(5)
    // null after the tangle: `a` emitted null (USER_SELECTION reload) and the onUpdate dependency
    // propagated it, but the function itself never ran because its required input was null.
    expect(seen).toEqual([null, null, 6, null, 10])
  })

  it('does not flash to null for an onUpdate:false dependency', async () => {
    const engine = start(
      [selection('a'), node('copy', { type: 'CUSTOM_FUNCTION', functionName: 'copy' }, [dep('a', 'v', { onUpdate: false })])],
      [{ name: 'copy', implementation: (v: unknown) => v }],
    )
    await engine.ready
    const seen = record(engine, 'copy')
    engine.getNode('a').next(1)
    engine.getNode('a').next(2)
    expect(seen).toEqual([undefined, 1, 2])
  })

  it('waits for required dependencies only; optional ones are passed as null', async () => {
    const engine = start(
      [
        selection('req'),
        selection('opt'),
        node('both', { type: 'CUSTOM_FUNCTION', functionName: 'both' }, [
          dep('req', 'req', { onUpdate: false }),
          dep('opt', 'opt', { isOptional: true, onUpdate: false }),
        ]),
      ],
      [{ name: 'both', implementation: (req: unknown, opt: unknown) => `${String(req)}/${String(opt)}` }],
    )
    await engine.ready
    expect(engine.getNode('both').getValue()).toBeUndefined()
    engine.getNode('opt').next('o')
    expect(engine.getNode('both').getValue()).toBeUndefined()
    engine.getNode('req').next(0) // 0 counts as present (`!= null`)
    expect(engine.getNode('both').getValue()).toBe('0/o')
    engine.getNode('opt').next(null)
    expect(engine.getNode('both').getValue()).toBe('0/null')
  })

  it('resets a USER_SELECTION node that has dependencies whenever they emit', async () => {
    const engine = start([selection('a'), node('pick', { type: 'USER_SELECTION' }, [dep('a', 'a')])])
    await engine.ready
    engine.getNode('pick').next('chosen')
    engine.getNode('a').next(1)
    expect(engine.getNode('pick').getValue()).toBeNull()
  })

  it('ignores an unknown dependency: the node never loads', async () => {
    const engine = start(
      [node('orphan', { type: 'CUSTOM_FUNCTION', functionName: 'f' }, [dep('missing', 'x', { isOptional: true })])],
      [{ name: 'f', implementation: () => 'ran' }],
    )
    await engine.ready
    expect(engine.getNode('orphan').getValue()).toBeUndefined()
  })

  it('maps custom function arguments by name when every parameter matches, in dep order otherwise', async () => {
    function byName(second: unknown, first: unknown) {
      return [first, second]
    }
    function byOrder(x: unknown, y: unknown) {
      return [x, y]
    }
    const deps = [dep('a', 'first', { onUpdate: false }), dep('b', 'second', { onUpdate: false })]
    const engine = start(
      [
        selection('a', 'A'),
        selection('b', 'B'),
        node('named', { type: 'CUSTOM_FUNCTION', functionName: 'byName' }, deps),
        node('ordered', { type: 'CUSTOM_FUNCTION', functionName: 'byOrder' }, deps),
      ],
      [
        { name: 'byName', implementation: byName },
        { name: 'byOrder', implementation: byOrder },
      ],
    )
    await engine.ready
    expect(engine.getNode('named').getValue()).toEqual(['A', 'B'])
    expect(engine.getNode('ordered').getValue()).toEqual(['A', 'B'])
  })

  it('appends a frozen snapshot when the function declares more parameters than dependencies', async () => {
    let snapshot: unknown
    function withSnapshot(value: unknown, extra: unknown) {
      snapshot = extra
      return value
    }
    const engine = start(
      [selection('a', 1), node('s', { type: 'CUSTOM_FUNCTION', functionName: 'f' }, [dep('a', 'value', { onUpdate: false })])],
      [{ name: 'f', implementation: withSnapshot }],
    )
    await engine.ready
    expect(snapshot).toMatchObject({ node: { name: 's', type: 'SINGLE', path: '/s' }, depValues: { a: 1 }, depValuesByParameter: { value: 1 } })
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it('turns a throwing or unknown custom function into null', async () => {
    const engine = start(
      [
        selection('a', 1),
        node('throws', { type: 'CUSTOM_FUNCTION', functionName: 'boom' }, [dep('a', 'a', { onUpdate: false })]),
        node('unknown', { type: 'CUSTOM_FUNCTION', functionName: 'nope' }, [dep('a', 'a', { onUpdate: false })]),
      ],
      [
        {
          name: 'boom',
          implementation: () => {
            throw new Error('boom')
          },
        },
      ],
    )
    await engine.ready
    expect(engine.getNode('throws').getValue()).toBeNull()
    expect(engine.getNode('unknown').getValue()).toBeNull()
  })

  it('rejects node kinds outside the supported subset at construction', () => {
    expect(() => start([{ ...selection('l'), type: 'LIST' }])).toThrow(/LIST/)
  })

  it('throws on an unknown node name and completes every node on destroy', async () => {
    const engine = start([selection('a')])
    await engine.ready
    expect(() => engine.getNode('nope')).toThrow(/not found/)
    let completed = false
    engine.getNode('a').subscribe({ complete: () => (completed = true) })
    engine.destroy()
    expect(completed).toBe(true)
  })
})

describe('graph engine: HTTP nodes', () => {
  it('fires on dependency emission, nulls first, and stores response.data', async () => {
    server.on('GET', `${API}/users/:id`, (request) => ({ id: request.route.id }))
    const engine = start([
      selection('uid'),
      node('user', { type: 'GET', serviceName: 'api', addr: '/users/{id}' }, [dep('uid', 'id', { type: 'PATH_VARIABLE' })]),
    ])
    await engine.ready
    expect(server.requests).toHaveLength(0)
    const seen = record(engine, 'user')
    engine.getNode('uid').next(9)
    expect(seen).toEqual([null, null])
    await settle()
    expect(seen).toEqual([null, null, { id: '9' }])
    expect(server.sent('GET', `${API}/users/9`)).toHaveLength(1)
  })

  it('sets the node to null when the request fails, and logs the failure', async () => {
    server.on('GET', `${API}/users/:id`, () => nestError(500, 'Failed'))
    const engine = start([
      selection('uid', 1),
      node('user', { type: 'GET', serviceName: 'api', addr: '/users/{id}' }, [
        dep('uid', 'id', { type: 'PATH_VARIABLE', onUpdate: false }),
      ]),
    ])
    await engine.ready
    await settle()
    expect(engine.getNode('user').getValue()).toBeNull()
    expect(consoleError).toHaveBeenCalledWith('Backend call failed for node', 'user', expect.anything())
  })

  it('sends one request per dependency while tangling', async () => {
    server.on('GET', `${API}/users/:id`, () => ({}))
    const engine = start([
      selection('uid', 7),
      selection('page'),
      node('user', { type: 'GET', serviceName: 'api', addr: '/users/{id}' }, [
        dep('uid', 'id', { type: 'PATH_VARIABLE' }),
        dep('page', 'page', { type: 'REQUEST_PARAMETER', isOptional: true }),
      ]),
    ])
    await engine.ready
    expect(server.sent('GET', `${API}/users/7`)).toHaveLength(2)
  })

  it('applies responses in arrival order, with no cancellation', async () => {
    const slow = deferred()
    server.on('GET', `${API}/users/:id`, async (request) => {
      if (request.route.id === '1') await slow.promise
      return { id: request.route.id }
    })
    const engine = start([
      selection('uid'),
      node('user', { type: 'GET', serviceName: 'api', addr: '/users/{id}' }, [dep('uid', 'id', { type: 'PATH_VARIABLE' })]),
    ])
    await engine.ready
    engine.getNode('uid').next(1)
    engine.getNode('uid').next(2)
    await settle()
    expect(engine.getNode('user').getValue()).toEqual({ id: '2' })
    slow.resolve()
    await settle()
    // The stale answer lands last and wins: src/api/http.ts is what prevents this in the app.
    expect(engine.getNode('user').getValue()).toEqual({ id: '1' })
  })
})

describe('request building (mirrors http-service.js)', () => {
  const deps = (...list: [string, unknown][]) => new Map(list)

  it('fills every {placeholder} raw (no encoding) and builds the query from REQUEST_PARAMETERs', () => {
    const def = node('n', { type: 'GET', serviceName: 'api', addr: '/a/{x}/b' }, [
      dep('X', 'x', { type: 'PATH_VARIABLE' }),
      dep('P', 'page', { type: 'REQUEST_PARAMETER' }),
      dep('Q', 'q', { type: 'REQUEST_PARAMETER', isOptional: true }),
    ])
    const config = buildRequest(def, deps(['X', 'two words/x'], ['P', 2], ['Q', null]), services.api)
    expect(config.url).toBe(`${API}/a/two words/x/b`)
    expect(config.method).toBe('GET')
    expect(config.params).toEqual({ page: 2, q: null })
    expect(config.data).toBeUndefined()
  })

  it('uses a single BODY dependency as the body as-is', () => {
    const form = new FormData()
    const def = node('n', { type: 'POST', serviceName: 'api', addr: '/up' }, [dep('F', 'body', { type: 'BODY' })])
    expect(buildRequest(def, deps(['F', form]), services.api).data).toBe(form)
    const obj = { a: 1 }
    expect(buildRequest(def, deps(['F', obj]), services.api).data).toBe(obj)
  })

  it('builds a JSON object from several BODY dependencies with bodyType JSON_OBJECT, {} with none', () => {
    const two = node('n', { type: 'PUT', serviceName: 'api', addr: '/s', bodyType: 'JSON_OBJECT' }, [
      dep('A', 'userId', { type: 'BODY' }),
      dep('B', 'label', { type: 'BODY' }),
    ])
    expect(buildRequest(two, deps(['A', 9], ['B', 'hi']), services.api).data).toEqual({ userId: 9, label: 'hi' })
    const none = node('n', { type: 'POST', serviceName: 'api', addr: '/s', bodyType: 'JSON_OBJECT' }, [dep('N', 'nonce')])
    expect(buildRequest(none, deps(['N', 1]), services.api).data).toEqual({})
  })

  it('defaults to a multipart form of JSON blobs, and sends no body for GET / DELETE', () => {
    const def = node('n', { type: 'PATCH', serviceName: 'api', addr: '/s' }, [dep('A', 'a', { type: 'BODY' }), dep('B', 'b', { type: 'BODY' })])
    const data = buildRequest(def, deps(['A', 1], ['B', 2]), services.api).data
    expect(data).toBeInstanceOf(FormData)
    expect((data as FormData).get('a')).toBeInstanceOf(Blob)
    const del = node('n', { type: 'DELETE', serviceName: 'api', addr: '/x/{id}' }, [dep('I', 'id', { type: 'PATH_VARIABLE' })])
    expect(buildRequest(del, deps(['I', 'abc']), services.api).data).toBeUndefined()
  })

  it('merges service and node headers and adds the service authorization when none is set', () => {
    const service: ServiceDef = { target: API, secure: false, authorization: 'Bearer t', headers: { 'X-Svc': 'svc' } }
    const def = node('n', { type: 'GET', serviceName: 'api', addr: '/h', headers: { 'X-Node': 'node' } })
    expect(buildRequest(def, deps(), service).headers).toEqual({ 'X-Svc': 'svc', 'X-Node': 'node', Authorization: 'Bearer t' })
    const own = node('n', { type: 'GET', serviceName: 'api', addr: '/h', headers: { authorization: 'mine' } })
    expect(buildRequest(own, deps(), service).headers).toEqual({ 'X-Svc': 'svc', authorization: 'mine' })
  })

  it('rewrites the target to https only when the service is secure', () => {
    expect(serviceBase({ target: 'http://a.test', secure: true, authorization: null })).toBe('https://a.test')
    expect(serviceBase({ target: 'a.test', secure: true, authorization: null })).toBe('https://a.test')
    expect(serviceBase({ target: '/__mock', secure: true, authorization: null })).toBe('/__mock')
    expect(serviceBase({ target: 'http://a.test', secure: false, authorization: null })).toBe('http://a.test')
  })
})
