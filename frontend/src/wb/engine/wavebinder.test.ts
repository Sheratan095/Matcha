/**
 * The adapter around the real library, checked against a FAKE `wave-binder` module that implements the
 * documented surface (constructor, tangleNodes, waitUntilReady, isReady, getNodeByName, nukeNodes).
 * This verifies the adapter's wiring only; the real library is never executed here (it needs a license).
 */
import { BehaviorSubject } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EngineConfig } from './types'
import { createWaveBinderEngine } from './wavebinder'

const fake = vi.hoisted(() => ({
  imported: 0,
  licenseValid: true,
  instances: [] as FakeWaveBinderShape[],
}))

interface FakeWaveBinderShape {
  args: unknown[]
  calls: string[]
  nodes: (BehaviorSubject<unknown> & { node: { name: string } })[]
  nukeNodes(): void
}

vi.mock('wave-binder', () => {
  fake.imported += 1
  class WaveBinder {
    args: unknown[]
    calls: string[] = []
    nodes: (BehaviorSubject<unknown> & { node: { name: string } })[]
    private ready = false
    private readonly check: Promise<void>
    constructor(...args: [unknown, { name: string }[], unknown, unknown]) {
      this.args = args
      this.nodes = args[1].map((proto) => Object.assign(new BehaviorSubject<unknown>(undefined), { node: proto }))
      this.check = Promise.resolve().then(() => {
        if (fake.licenseValid) this.ready = true
        else this.nukeNodes()
      })
      fake.instances.push(this)
    }
    tangleNodes() {
      this.calls.push('tangleNodes')
    }
    waitUntilReady() {
      this.calls.push('waitUntilReady')
      return this.check
    }
    isReady() {
      return this.ready
    }
    getNodeByName(name: string) {
      return this.nodes.find((node) => node.node.name === name) ?? null
    }
    nukeNodes() {
      this.calls.push('nukeNodes')
      this.ready = false
      this.nodes.forEach((node) => node.complete())
      this.nodes.length = 0
    }
  }
  return { WaveBinder }
})

const config: EngineConfig = {
  nodes: [
    { name: 'a', path: '/a', type: 'SINGLE', dep: [], la: { type: 'USER_SELECTION' } },
    { name: 'b', path: '/b', type: 'SINGLE', dep: [], la: { type: 'GET', serviceName: 'api', addr: '/b' } },
  ],
  services: { api: { target: 'http://api.test', secure: false, authorization: null } },
  functions: [{ name: 'f', implementation: () => 1 }],
}
const license = { payload: {}, payloadRaw: '{}', signature: 'sig' }

afterEach(() => {
  fake.instances.length = 0
  fake.licenseValid = true
  delete (globalThis as { WAVEBINDER_LICENSE_SERVER_URL?: string }).WAVEBINDER_LICENSE_SERVER_URL
})

describe('wavebinder engine adapter (fake library)', () => {
  it('refuses something that is not a license file without loading the library', async () => {
    const engine = createWaveBinderEngine({ hello: 'world' }, config)
    expect(await engine.ready).toBe(false)
    expect(engine.failure).toMatch(/not a WaveBinder license file/)
    expect(fake.imported).toBe(0)
  })

  it('constructs the instance from copies of the definitions, tangles, waits, and exposes the library nodes', async () => {
    const engine = createWaveBinderEngine(license, config, { licenseServerUrl: 'https://license.test' })
    expect(await engine.ready).toBe(true)
    expect((globalThis as { WAVEBINDER_LICENSE_SERVER_URL?: string }).WAVEBINDER_LICENSE_SERVER_URL).toBe('https://license.test')
    const [instance] = fake.instances
    const [givenLicense, protos, services, functions] = instance.args as [unknown, unknown[], Map<string, unknown>, { name: string; implementation: unknown }[]]
    expect(givenLicense).toBe(license)
    // Copies: the library mutates proto objects.
    expect(protos).toEqual(config.nodes)
    expect(protos[0]).not.toBe(config.nodes[0])
    // Services by reference: the library reads them at request time.
    expect(services.get('api')).toBe(config.services.api)
    expect(functions[0].implementation).toBe(config.functions[0].implementation)
    expect(instance.calls).toEqual(['tangleNodes', 'waitUntilReady'])
    expect(engine.getNode('a')).toBe(instance.nodes[0])
    expect(() => engine.getNode('zzz')).toThrow(/not found/)
    expect(engine.failure).toBeNull()
  })

  it('reports a rejected license', async () => {
    fake.licenseValid = false
    const engine = createWaveBinderEngine(license, config)
    expect(await engine.ready).toBe(false)
    expect(engine.failure).toMatch(/rejected the license/)
  })

  it('emits dead$ when the library shuts the nodes down after being ready, keeps the old nodes readable', async () => {
    const engine = createWaveBinderEngine(license, config)
    await engine.ready
    const a = engine.getNode('a')
    a.next(5)
    let died = 0
    engine.dead$.subscribe(() => died++)
    fake.instances[0].nukeNodes() // what a failed heartbeat does
    expect(died).toBe(1)
    expect(engine.failure).toMatch(/heartbeat failed/)
    expect(engine.getNode('a').getValue()).toBe(5)
  })

  it('destroy nukes the instance without reporting a death', async () => {
    const engine = createWaveBinderEngine(license, config)
    await engine.ready
    let died = 0
    engine.dead$.subscribe(() => died++)
    engine.destroy()
    expect(fake.instances[0].calls).toContain('nukeNodes')
    expect(died).toBe(0)
  })
})
