/**
 * The match moment queue against the real state layer: realtime events are injected as if they came
 * from the socket, and the screens' own announcements are made as they make them.
 */
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RealtimeEvent } from '@/api/types'
import { actions, celebrateMatch, clearMatchMoments, dismissMatchMoment, startRealtime } from '@/wb'
import { person } from '@/wb/testing/fakeBackend'
import { flush, startTestStore, type TestStore } from '@/wb/testing/harness'
import { getMatchMoments } from './matchMoments'

let store: TestStore
let source: Subject<RealtimeEvent>
let stopRealtime: () => void

const queued = () => getMatchMoments().map((entry) => entry.userId)
const match = (userId: string): RealtimeEvent => ({ type: 'match', person: person(userId) })
const unmatch = (userId: string, own?: boolean): RealtimeEvent => ({ type: 'unmatch', person: person(userId), own })

beforeEach(async () => {
  store = await startTestStore()
  await actions.bootSession()
  await actions.login({ username: 'testuser', password: '1234' })
  await flush(30)
  source = new Subject<RealtimeEvent>()
  stopRealtime = startRealtime({ events$: source, socket: false })
})

afterEach(async () => {
  // the refreshes the events started land before the store stops
  await flush(40)
  clearMatchMoments()
  stopRealtime()
  store.stop()
})

describe('the match moment', () => {
  it('plays for every match realtime tells of, one after the other', () => {
    source.next(match('ann'))
    source.next(match('bea'))
    expect(queued()).toEqual(['ann', 'bea'])
    expect(getMatchMoments()[0]).toEqual({ userId: 'ann', name: 'ann', photo: 'http://img.test/ann.webp' })

    dismissMatchMoment()
    expect(queued()).toEqual(['bea'])
    dismissMatchMoment()
    expect(queued()).toEqual([])
  })

  it('plays once for a match the screen announced and the backend echoed, in either order', () => {
    // the echo first: the screen's details (a first name, the photo it showed) replace the event's
    source.next(match('ann'))
    celebrateMatch({ userId: 'ann', name: 'Ann', photo: 'ann.webp', theyLikedFirst: true })
    // the screen first: the echo adds nothing
    celebrateMatch({ userId: 'bea', name: 'Bea', photo: null })
    source.next(match('bea'))
    expect(getMatchMoments()).toEqual([
      { userId: 'ann', name: 'Ann', photo: 'ann.webp', theyLikedFirst: true },
      { userId: 'bea', name: 'Bea', photo: null },
    ])
  })

  it('does not play again for a connection already celebrated, even once its moment is gone', () => {
    source.next(match('ann'))
    dismissMatchMoment()
    // a late echo, or the backend's replay of a match this client already showed
    source.next(match('ann'))
    celebrateMatch({ userId: 'ann', name: 'Ann', photo: null })
    expect(queued()).toEqual([])
  })

  it('drops someone whose connection ended while they waited, and plays again if they come back', () => {
    source.next(match('ann'))
    source.next(match('bea'))
    source.next(unmatch('bea'))
    expect(queued()).toEqual(['ann'])

    // your own unlike ends it too (the backend echoes it to you)
    dismissMatchMoment()
    source.next(unmatch('ann', true))
    source.next(match('ann'))
    expect(queued()).toEqual(['ann'])
  })

  it('goes with the user who signs out', async () => {
    source.next(match('ann'))
    await actions.logout()
    await flush(30)
    expect(queued()).toEqual([])
  })
})
