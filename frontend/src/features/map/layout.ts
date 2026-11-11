/** Pure helpers of the match map: where each person goes, and what is safe to put in a marker. */
import type { MapMatch } from '@/api/types'
import { distanceKm, isSpot, type Spot } from '@/features/location/geo'

/** A connection with a position, ready for the map. */
export interface PlacedMatch extends MapMatch {
  latitude: number
  longitude: number
  /** Where the marker is drawn: the position, nudged apart from others on the same grid cell. */
  at: Spot
  /** Kilometres from the viewer, null when the viewer has no position. */
  km: number | null
}

/** How far apart people sharing one ~1 km cell are drawn (degrees of latitude, ~250 m). */
const SPREAD_DEG = 0.0025

function cellKey(spot: Spot): string {
  return `${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`
}

/**
 * Splits the connections into those that can be drawn and those without a position. The backend
 * snaps everyone to a ~1 km grid, so neighbours often share a point exactly: they are spread on a
 * small circle around it (deterministically, by user id) so every face stays clickable. The nudge
 * is display-only; distances use the real (snapped) position. Sorted nearest first.
 */
export function placeMatches(matches: readonly MapMatch[], me: Spot | null): { placed: PlacedMatch[]; unplaced: MapMatch[] } {
  const unplaced: MapMatch[] = []
  const cells = new Map<string, (MapMatch & Spot)[]>()
  for (const match of matches) {
    const spot = { latitude: match.latitude, longitude: match.longitude }
    if (!isSpot(spot)) {
      unplaced.push(match)
      continue
    }
    const key = cellKey(spot)
    const cell = cells.get(key) ?? []
    cell.push({ ...match, ...spot })
    cells.set(key, cell)
  }

  const placed: PlacedMatch[] = []
  for (const cell of cells.values()) {
    cell.sort((a, b) => a.userId.localeCompare(b.userId))
    cell.forEach((match, index) => {
      let at: Spot = { latitude: match.latitude, longitude: match.longitude }
      if (cell.length > 1) {
        const angle = (2 * Math.PI * index) / cell.length
        // A degree of longitude shrinks towards the poles: keep the circle round on screen.
        const squash = Math.max(0.2, Math.cos((match.latitude * Math.PI) / 180))
        at = {
          latitude: match.latitude + SPREAD_DEG * Math.cos(angle),
          longitude: match.longitude + (SPREAD_DEG * Math.sin(angle)) / squash,
        }
      }
      placed.push({ ...match, at, km: me ? distanceKm(me, match) : null })
    })
  }
  placed.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.username.localeCompare(b.username))
  unplaced.sort((a, b) => a.username.localeCompare(b.username))
  return { placed, unplaced }
}

/** "<1 km", "4 km", "1,250 km". Positions are ~1 km-snapped: never more precise than that. */
export function kmText(km: number): string {
  return km < 1 ? '<1 km' : `${Math.round(km).toLocaleString()} km`
}

/** Only http(s) URLs end up in an <img> built outside React (no javascript:, data:, relative tricks). */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

/** One or two letters for a face without a picture. */
export function initialsOf(name: string): string {
  const letters = name
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
  return (letters || '?').slice(0, 2).toUpperCase()
}
