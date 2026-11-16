import { describe, expect, it } from 'vitest'
import { API_URL, SOCIAL_URL } from '@/config'
import { FUNCTIONS } from './functions'
import { NODES } from './nodes'
import { validateGraph } from './nodes/validate'
import { createRegistry } from './registry'
import { SERVICES } from './services'
import type { NodeDef, ServiceDef } from './types'

const registry = createRegistry(NODES, SERVICES)

describe('registry: the app graph', () => {
  it.each([
    ['GET', `${API_URL}/profile/viewers`, 'myViewers'],
    ['GET', `${API_URL}/profile/3f2b8c74-9d1e-4a6f-b0c5-7e81d2a4f963`, 'apiProfile'],
    ['GET', `${API_URL}/profile`, 'myProfile'],
    ['PATCH', `${API_URL}/profile`, 'profileUpdateResult'],
    ['PUT', `${API_URL}/profile/location`, 'locationUpdateResult'],
    ['POST', `${API_URL}/profile/pictures`, 'pictureUploadResult'],
    ['DELETE', `${API_URL}/profile/pictures/p1`, 'pictureDeleteResult'],
    ['PATCH', `${API_URL}/profile/pictures/p1/profile`, 'pictureMainResult'],
    ['GET', `${API_URL}/auth/validate`, 'sessionCheck'],
    ['POST', `${API_URL}/auth/refresh`, 'sessionRefreshResult'],
    ['GET', `${API_URL}/notification/online`, 'onlineCount'],
    ['GET', `${SOCIAL_URL}/matches/m1/messages`, 'chatMessages'],
    ['DELETE', `${SOCIAL_URL}/matches/m1`, 'unmatchResult'],
    ['GET', `${SOCIAL_URL}/matches`, 'matches'],
    ['GET', `${API_URL}/profile/discover`, 'discoverDeck'],
    ['GET', `${API_URL}/profile/search`, 'searchResults'],
    ['GET', `${API_URL}/profile/matches/map`, 'matchesMap'],
    ['GET', `${API_URL}/profile/interests`, 'interestCatalogue'],
    ['POST', `${API_URL}/profile/u1/like`, 'likeResult'],
    ['DELETE', `${API_URL}/profile/u1/like`, 'unlikeResult'],
    ['POST', `${API_URL}/profile/u1/pass`, 'passResult'],
    ['POST', `${API_URL}/profile/u1/block`, 'blockUserResult'],
    ['POST', `${API_URL}/profile/u1/report`, 'reportUserResult'],
    ['POST', `${SOCIAL_URL}/swipes`, 'answerLikeResult'],
    ['GET', `${SOCIAL_URL}/profiles/u1`, 'socialProfile'],
    ['POST', `${SOCIAL_URL}/reset`, 'demoResetResult'],
  ])('%s %s -> %s', (method, url, name) => {
    expect(registry.match(method, url)).toBe(name)
  })

  it('ignores the query string and the method case', () => {
    expect(registry.match('get', `${API_URL}/profile/discover?minAge=18&tags=art`)).toBe('discoverDeck')
  })

  it('does not attribute requests no node sends', () => {
    expect(registry.match('GET', `${SOCIAL_URL}/matches/m1/photos`)).toBeNull()
    expect(registry.match('PUT', `${API_URL}/profile`)).toBeNull()
    expect(registry.match('GET', `${API_URL}/profile/`)).toBeNull() // an empty segment is not an id
    expect(registry.match('GET', 'http://elsewhere.test/profile')).toBeNull()
  })

  it('is valid: no dangling dependency, cycle, ambiguous mutation or bad placeholder', () => {
    expect(validateGraph({ nodes: NODES, services: SERVICES, functions: FUNCTIONS })).toEqual([])
  })
})

describe('registry: specificity', () => {
  const services: Record<string, ServiceDef> = { s: { target: 'http://x.test', secure: false, authorization: null } }
  const get = (name: string, addr: string, method: NodeDef['la']['type'] = 'GET'): NodeDef => ({
    name,
    path: `/${name}`,
    type: 'SINGLE',
    dep: [],
    la: { type: method, serviceName: 's', addr },
  })

  it('prefers a literal segment over a placeholder, left to right, whatever the declaration order', () => {
    const r = createRegistry([get('any', '/a/{x}/{y}'), get('mid', '/a/{x}/c'), get('lit', '/a/b/c'), get('first', '/a/b/{y}')], services)
    expect(r.match('GET', 'http://x.test/a/b/c')).toBe('lit')
    expect(r.match('GET', 'http://x.test/a/b/z')).toBe('first')
    expect(r.match('GET', 'http://x.test/a/q/c')).toBe('mid')
    expect(r.match('GET', 'http://x.test/a/q/z')).toBe('any')
  })

  it('refuses two nodes that would send the same request', () => {
    expect(() => createRegistry([get('one', '/a/{x}'), get('two', '/a/{y}')], services)).toThrow(/both send GET/)
    expect(() => createRegistry([get('one', '/a/{x}'), get('two', '/a/{y}', 'POST')], services)).not.toThrow()
  })
})

describe('graph validation', () => {
  const services: Record<string, ServiceDef> = { s: { target: '', secure: false, authorization: null } }
  it('reports the mistakes the engine would accept silently', () => {
    const nodes: NodeDef[] = [
      { name: 'p', path: '/p', type: 'SINGLE', dep: [{ nodeName: 'ghost', parameterName: 'g', isOptional: false, onUpdate: true }], la: { type: 'USER_SELECTION' } },
      {
        name: 'mut',
        path: '/mut',
        type: 'SINGLE',
        dep: [
          { nodeName: 'p', parameterName: 'a', isOptional: false, onUpdate: true, type: 'BODY' },
          { nodeName: 'p2', parameterName: 'b', isOptional: false, onUpdate: true, type: 'BODY' },
        ],
        la: { type: 'POST', serviceName: 's', addr: '/x/{id}' },
      },
      { name: 'p2', path: '/p2', type: 'SINGLE', dep: [], la: { type: 'USER_SELECTION' } },
      { name: 'f', path: '/f', type: 'SINGLE', dep: [], la: { type: 'CUSTOM_FUNCTION', functionName: 'missing' } },
    ]
    const problems = validateGraph({ nodes, services, functions: [] }).join('\n')
    expect(problems).toMatch(/depends on "ghost"/)
    expect(problems).toMatch(/USER_SELECTION node with dependencies/)
    expect(problems).toMatch(/\{id\} must be filled/)
    expect(problems).toMatch(/set bodyType JSON_OBJECT/)
    expect(problems).toMatch(/must depend on its payload node only/)
    expect(problems).toMatch(/unknown function "missing"/)
  })
})
