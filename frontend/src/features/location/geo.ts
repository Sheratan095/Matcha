/**
 * Where the user is, from three sources:
 * - the device (Geolocation API): precise, asks permission the first time;
 * - the connection (IP lookup, `GEOIP_URL`): no permission, city-level, sometimes tens of km off;
 * - place names and search (Nominatim, `GEOCODER_URL`).
 *
 * The backend keeps the raw coordinates and shows others only a distance from a ~1 km-snapped copy,
 * so place names are for the user's own eyes. Third-party calls go through `fetch` without
 * credentials: the app's axios instance sends cookies, which these open-CORS services refuse.
 */
import { GEOCODER_URL, GEOIP_URL } from '@/config'

export interface Spot {
  latitude: number
  longitude: number
}

/** Where a spot came from, which decides what the screen says about its precision. */
export type SpotSource = 'saved' | 'device' | 'network' | 'map' | 'search'

export interface PlacedSpot extends Spot {
  source: SpotSource
}

export interface Place extends Spot {
  label: string
}

export function isSpot(value: unknown): value is Spot {
  if (!value || typeof value !== 'object') return false
  const { latitude, longitude } = value as Record<string, unknown>
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  )
}

/** Brings any longitude back to [-180, 180] (the map wraps around the world). */
export function wrapLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180
  return wrapped === -180 && longitude > 0 ? 180 : wrapped
}

/** '41.905° N, 12.543° E' (the picker's caption, a date's place). */
export function coordinatesLabel(spot: Spot): string {
  const lat = `${Math.abs(spot.latitude).toFixed(3)}° ${spot.latitude >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(spot.longitude).toFixed(3)}° ${spot.longitude >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon}`
}

/** Great-circle distance in km. */
export function distanceKm(a: Spot, b: Spot): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Same place for the app's purposes: closer than `toleranceKm` (default 50 m). */
export function sameSpot(a: Spot, b: Spot, toleranceKm = 0.05): boolean {
  return distanceKm(a, b) < toleranceKm
}

/** The saved position of a profile, or null when none is set. */
export function savedSpot(profile: { latitude: number | null; longitude: number | null }): PlacedSpot | null {
  const spot = { latitude: profile.latitude, longitude: profile.longitude }
  return isSpot(spot) ? { ...spot, source: 'saved' } : null
}

// ---------------------------------------------------------------- the device

export type DeviceFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout'
export type DeviceResult = { ok: true; spot: Spot } | { ok: false; reason: DeviceFailure }

/** The device's position. Asks for permission when the browser has not been told yet. */
export function deviceSpot(timeoutMs = 12_000): Promise<DeviceResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve({ ok: false, reason: 'unsupported' })
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ ok: true, spot: { latitude: position.coords.latitude, longitude: position.coords.longitude } }),
      (error) =>
        resolve({
          ok: false,
          reason: error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable',
        }),
      // Neighbourhood precision is plenty, and a fix from the last 5 minutes will do.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    )
  })
}

export type DevicePermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/** Whether asking for the position would prompt, without asking. */
export async function devicePermission(): Promise<DevicePermission> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------- the connection

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

/** Reads an IP-lookup answer: GeoJS sends strings ("41.89"), others numbers. 0,0 means "unknown". */
export function parseNetworkSpot(raw: unknown): Spot | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const spot = {
    latitude: toNumber(record.latitude ?? record.lat),
    longitude: toNumber(record.longitude ?? record.lon ?? record.lng),
  }
  if (!isSpot(spot) || (spot.latitude === 0 && spot.longitude === 0)) return null
  return spot
}

/** The connection's approximate position (no permission involved), or null when the lookup fails. */
export async function networkSpot(signal?: AbortSignal): Promise<Spot | null> {
  try {
    const response = await fetch(GEOIP_URL, { credentials: 'omit', signal, headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    return parseNetworkSpot(await response.json())
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- place names (Nominatim)

const LOCAL_KEYS = ['neighbourhood', 'quarter', 'suburb', 'city_district', 'borough', 'village', 'hamlet'] as const
const TOWN_KEYS = ['city', 'town', 'village', 'municipality', 'county', 'state'] as const

function firstOf(address: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = address[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** A short name for a Nominatim result: "Esquilino, Roma"; the country when there is nothing finer. */
export function placeLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const address = record.address && typeof record.address === 'object' ? (record.address as Record<string, unknown>) : {}
  const town = firstOf(address, TOWN_KEYS)
  const local = firstOf(address, LOCAL_KEYS)
  const parts = [local, town].filter((part): part is string => part !== null)
  const unique = parts.filter((part, index) => parts.indexOf(part) === index)
  if (unique.length > 0) return unique.join(', ')
  const country = firstOf(address, ['country'])
  if (country) return country
  if (typeof record.display_name === 'string' && record.display_name.trim()) {
    return record.display_name.split(',').slice(0, 2).map((part) => part.trim()).join(', ')
  }
  return null
}

function language(): string {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
}

async function nominatim(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const query = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': language(), ...params })
  const response = await fetch(`${GEOCODER_URL}/${path}?${query}`, { credentials: 'omit', signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Geocoder answered ${response.status}`)
  return response.json()
}

const names = new Map<string, string | null>()

/** The neighbourhood and town around a spot (cached per ~100 m), or null when unknown or unreachable. */
export async function placeName(spot: Spot, signal?: AbortSignal): Promise<string | null> {
  const key = `${spot.latitude.toFixed(3)},${spot.longitude.toFixed(3)}`
  if (names.has(key)) return names.get(key) ?? null
  try {
    const label = placeLabel(await nominatim('reverse', { lat: String(spot.latitude), lon: String(spot.longitude), zoom: '14' }, signal))
    names.set(key, label)
    return label
  } catch {
    return null
  }
}

/** Places matching a free-text query, best first (5 at most). Rejects when the geocoder is unreachable. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const raw = await nominatim('search', { q: query.trim(), limit: '5' }, signal)
  if (!Array.isArray(raw)) return []
  const places: Place[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const spot = { latitude: toNumber(record.lat), longitude: toNumber(record.lon) }
    const label = typeof record.display_name === 'string' ? record.display_name : placeLabel(record)
    if (isSpot(spot) && label) places.push({ ...spot, label })
  }
  return places
}
