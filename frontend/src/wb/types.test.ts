/**
 * Compile-time contract of `@/wb`: these lines are checked by `tsc -p tsconfig.app.json` (every
 * `@ts-expect-error` must be an error, every `expectTypeOf` must hold). Nothing here touches a store.
 */
import { describe, expectTypeOf, it } from 'vitest'
import type { ApiError, Card, LoginResult, Match, Profile, SwipeResult } from '@/api/types'
import {
  actions,
  getNodeValue,
  node$,
  refresh,
  run,
  setNode,
  useNode,
  useNodeStatus,
  useNodeValue,
  type HttpNodeName,
  type NodeStatus,
  type WritableNodeName,
} from '@/wb'
import type { Observable } from 'rxjs'

describe('typed surface', () => {
  it('derives names, values, payloads and results from NodeValues / Commands', () => {
    // Type positions only: wrapped in a function that is never called.
    const typeChecks = () => {
      expectTypeOf(run('login', { username: 'a', password: 'b' })).toEqualTypeOf<Promise<LoginResult>>()
      expectTypeOf(run('swipe', { targetId: 'x', action: 'like' })).toEqualTypeOf<Promise<SwipeResult>>()
      expectTypeOf(getNodeValue('myProfile')).toEqualTypeOf<Profile | null | undefined>()
      expectTypeOf(node$('matches')).toEqualTypeOf<Observable<Match[] | null | undefined>>()
      expectTypeOf<ReturnType<typeof useNodeValue<'visibleDeck'>>>().toEqualTypeOf<Card[] | null | undefined>()
      expectTypeOf<ReturnType<typeof useNode<'filterDistance'>>>().toEqualTypeOf<
        [number | null | undefined, (value: number | null) => void]
      >()
      expectTypeOf<ReturnType<typeof useNodeStatus>>().toEqualTypeOf<NodeStatus>()
      expectTypeOf<NodeStatus['error']>().toEqualTypeOf<ApiError | null>()
      expectTypeOf(actions.swipe).returns.toEqualTypeOf<Promise<SwipeResult>>()
      expectTypeOf<'filterAgeMin'>().toExtend<WritableNodeName>()
      expectTypeOf<'loginResult'>().toExtend<HttpNodeName>()

      // @ts-expect-error misspelt node name
      getNodeValue('myProfle')
      // @ts-expect-error read nodes are not writable
      setNode('myProfile', null)
      // @ts-expect-error command payloads go through run()
      setNode('loginPayload', null)
      // @ts-expect-error refresh nonces go through refresh()
      setNode('matchesRefresh', 1)
      // @ts-expect-error wrong value type for the node
      setNode('filterDistance', 'far')
      // @ts-expect-error logout takes no payload
      run('logout', 1)
      // @ts-expect-error login needs its payload
      run('login')
      // @ts-expect-error wrong payload shape
      run('login', { user: 'a' })
      // @ts-expect-error unknown command
      run('logn', {})
      // @ts-expect-error not refreshable in place
      refresh('tagCatalogue')
      // @ts-expect-error a selection node has no request status
      const status: Parameters<typeof useNodeStatus>[0] = 'filterAgeMin'
      return status
    }
    expectTypeOf(typeChecks).toBeFunction()
  })
})
