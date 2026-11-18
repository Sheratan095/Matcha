import { describe, expect, it } from 'vitest'
import { decodeSocketEvent, socketTarget } from './realtime'

describe('decodeSocketEvent: calendar notifications', () => {
  const ann = { userId: 'ann', username: 'ann', profilePictureUrl: null }
  // the backend's EventPayload: the person who acted, then the event
  const payload = { ...ann, eventId: 'ev-1', title: ' Drinks by the river ', startTime: '2026-11-21T19:00:00.000Z' }

  it.each([
    ['event-invite', 'invite'],
    ['event-accept', 'accept'],
    ['event-decline', 'decline'],
    ['event-cancel', 'cancel'],
    ['event-start', 'start'],
  ] as const)('%s becomes a calendar %s', (name, action) => {
    expect(decodeSocketEvent(name, payload)).toEqual({
      type: 'calendar',
      action,
      person: ann,
      event: { id: 'ev-1', title: 'Drinks by the river', startsAt: Date.parse('2026-11-21T19:00:00.000Z') },
    })
  })

  it('keeps an event whose start is not a date, without it', () => {
    expect(decodeSocketEvent('event-invite', { ...payload, startTime: 'soon' })).toMatchObject({ event: { startsAt: null } })
  })

  it('rejects a payload without the person or the event id', () => {
    expect(decodeSocketEvent('event-invite', { ...payload, userId: undefined })).toBeNull()
    expect(decodeSocketEvent('event-invite', { ...payload, eventId: 42 })).toBeNull()
  })

  it('ignores an event name it does not listen to', () => {
    expect(decodeSocketEvent('event-edit', payload)).toBeUndefined()
    expect(decodeSocketEvent('toString', payload)).toBeUndefined()
  })
})

describe('decodeSocketEvent: profile views', () => {
  it('profile-view becomes a view by the person in the payload', () => {
    const ann = { userId: 'ann', username: 'ann', profilePictureUrl: null }
    expect(decodeSocketEvent('profile-view', ann)).toEqual({ type: 'view', person: ann })
    expect(decodeSocketEvent('profile-view', { username: 'ann' })).toBeNull()
  })
})

describe('socketTarget', () => {
  it('connects to the gateway itself when API_URL is an origin', () => {
    expect(socketTarget('http://localhost:3000', 'http://localhost:4000')).toEqual({
      url: 'http://localhost:3000/notification',
      path: '/socket.io',
    })
  })

  it('keeps a path prefix (the Vite proxy) on the socket path, not in the namespace', () => {
    expect(socketTarget('/api', 'http://192.168.1.20:4000')).toEqual({
      url: 'http://192.168.1.20:4000/notification',
      path: '/api/socket.io',
    })
    expect(socketTarget('https://example.test/api/', 'http://localhost:4000')).toEqual({
      url: 'https://example.test/notification',
      path: '/api/socket.io',
    })
  })
})
