import { afterEach, describe, expect, it, vi } from 'vitest'
import { distanceKm, isSpot, networkSpot, parseNetworkSpot, placeLabel, sameSpot, savedSpot, searchPlaces, wrapLongitude } from './geo'
import { locationMode, modeAfterSaving, setLocationMode } from './mode'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('spots', () => {
  it('accepts real coordinates only', () => {
    expect(isSpot({ latitude: 41.89, longitude: 12.51 })).toBe(true)
    expect(isSpot({ latitude: 90, longitude: -180 })).toBe(true)
    expect(isSpot({ latitude: 91, longitude: 0 })).toBe(false)
    expect(isSpot({ latitude: '41.89', longitude: 12.51 })).toBe(false)
    expect(isSpot({ latitude: Number.NaN, longitude: 0 })).toBe(false)
    expect(isSpot(null)).toBe(false)
  })

  it('wraps longitudes from a map that goes round the world', () => {
    expect(wrapLongitude(12.5)).toBe(12.5)
    expect(wrapLongitude(190)).toBe(-170)
    expect(wrapLongitude(-190)).toBe(170)
    expect(wrapLongitude(180)).toBe(180)
    expect(wrapLongitude(-180)).toBe(-180)
    expect(wrapLongitude(372.5)).toBe(12.5)
  })

  it('measures great-circle distances', () => {
    const rome = { latitude: 41.8905, longitude: 12.5127 }
    const paris = { latitude: 48.8566, longitude: 2.3522 }
    expect(distanceKm(rome, paris)).toBeGreaterThan(1090)
    expect(distanceKm(rome, paris)).toBeLessThan(1120)
    expect(distanceKm(rome, rome)).toBe(0)
    expect(sameSpot(rome, { latitude: 41.8908, longitude: 12.5127 })).toBe(true) // ~33 m
    expect(sameSpot(rome, { latitude: 41.8915, longitude: 12.5127 })).toBe(false) // ~110 m
  })

  it('reads the saved spot of a profile, or none', () => {
    expect(savedSpot({ latitude: 41.89, longitude: 12.51 })).toEqual({ latitude: 41.89, longitude: 12.51, source: 'saved' })
    expect(savedSpot({ latitude: null, longitude: null })).toBeNull()
  })
})

describe('the connection', () => {
  it('reads string or number coordinates, and treats 0,0 as unknown', () => {
    expect(parseNetworkSpot({ city: 'Rome', latitude: '41.8905', longitude: '12.5127' })).toEqual({ latitude: 41.8905, longitude: 12.5127 })
    expect(parseNetworkSpot({ success: true, latitude: 41.89, longitude: 12.51 })).toEqual({ latitude: 41.89, longitude: 12.51 })
    expect(parseNetworkSpot({ lat: 48.85, lon: 2.35 })).toEqual({ latitude: 48.85, longitude: 2.35 })
    expect(parseNetworkSpot({ latitude: 0, longitude: 0 })).toBeNull()
    expect(parseNetworkSpot({ latitude: '', longitude: '' })).toBeNull()
    expect(parseNetworkSpot({ error: 'rate limited' })).toBeNull()
    expect(parseNetworkSpot('nope')).toBeNull()
  })

  it('asks without cookies, and gives null instead of failing', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ latitude: '41.8905', longitude: '12.5127' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await networkSpot()).toEqual({ latitude: 41.8905, longitude: 12.5127 })
    expect(fetchMock.mock.calls[0]).toMatchObject([expect.any(String), { credentials: 'omit' }])

    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 429 })))
    expect(await networkSpot()).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await networkSpot()).toBeNull()
  })
})

describe('place names', () => {
  it('names the neighbourhood and the town', () => {
    const rome = { address: { quarter: 'Esquilino', suburb: 'Municipio Roma I', city: 'Roma', country: 'Italia' } }
    expect(placeLabel(rome)).toBe('Esquilino, Roma')
    expect(placeLabel({ address: { suburb: 'Paris', city: 'Paris', country: 'France' } })).toBe('Paris')
    expect(placeLabel({ address: { village: 'Ussel', county: 'Corrèze' } })).toBe('Ussel')
    expect(placeLabel({ address: { country: 'Iceland' } })).toBe('Iceland')
    expect(placeLabel({ display_name: 'Somewhere, Far, Away' })).toBe('Somewhere, Far')
    expect(placeLabel({})).toBeNull()
  })

  it('lists search results with usable coordinates only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { lat: '48.8854619', lon: '2.3391535', display_name: 'Montmartre, Paris, France' },
          { lat: 'x', lon: '2', display_name: 'Broken' },
        ]),
      ),
    )
    expect(await searchPlaces('  Montmartre ')).toEqual([{ latitude: 48.8854619, longitude: 2.3391535, label: 'Montmartre, Paris, France' }])
  })
})

describe('location mode', () => {
  it('is automatic until the user pins a spot by hand, per user', () => {
    expect(locationMode('u1')).toBe('auto')
    setLocationMode('u1', 'manual')
    expect(locationMode('u1')).toBe('manual')
    expect(locationMode('u2')).toBe('auto')
    setLocationMode('u1', 'auto')
    expect(locationMode('u1')).toBe('auto')
  })

  it('follows where the saved spot came from', () => {
    expect(modeAfterSaving('device', 'manual')).toBe('auto')
    expect(modeAfterSaving('network', 'manual')).toBe('auto')
    expect(modeAfterSaving('map', 'auto')).toBe('manual')
    expect(modeAfterSaving('search', 'auto')).toBe('manual')
    expect(modeAfterSaving('saved', 'manual')).toBe('manual')
  })
})
