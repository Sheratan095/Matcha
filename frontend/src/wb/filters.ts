/**
 * Discover filters: five selection nodes, each a dependency of `discoverDeck`. Writing them one by one
 * would send one request per write, so several changes are applied behind a closed gate: `filterAgeMin`
 * (a required dependency) is held at `null` while the others change, then written last, which sends one
 * request with the final values.
 */
import type { DiscoverSort } from '@/api/types'
import { DEFAULT_FILTERS } from './nodes'
import { getNodeValue, writeNode } from './store'

export const DISCOVER_SORTS: readonly DiscoverSort[] = ['best', 'distance', 'fame', 'age']

export interface DiscoverFilters {
  ageMin: number
  ageMax: number
  /** Kilometres. */
  distance: number
  sort: DiscoverSort
  /** Interest names, lowercase, without '#'; empty for "any". */
  tags: string[]
}

export const DEFAULT_DISCOVER_FILTERS: Readonly<DiscoverFilters> = Object.freeze({
  ageMin: DEFAULT_FILTERS.ageMin,
  ageMax: DEFAULT_FILTERS.ageMax,
  distance: DEFAULT_FILTERS.distance,
  sort: DEFAULT_FILTERS.sort,
  tags: [],
})

/** Lowercase, trimmed, without a leading '#', no empties, no duplicates (the backend 500s on duplicates). */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of tags) {
    for (const part of raw.split(',')) {
      const tag = part.trim().replace(/^#+/, '').trim().toLowerCase()
      if (tag) seen.add(tag)
    }
  }
  return [...seen]
}

/** `filterTags` holds the comma-separated query value, or null for "any". */
export function parseTags(value: string | null | undefined): string[] {
  return value ? normaliseTags([value]) : []
}

function tagsValue(tags: readonly string[]): string | null {
  return tags.length > 0 ? tags.join(',') : null
}

export function filtersFrom(values: {
  ageMin: number | null | undefined
  ageMax: number | null | undefined
  distance: number | null | undefined
  sort: DiscoverSort | null | undefined
  tags: string | null | undefined
}): DiscoverFilters {
  return {
    ageMin: values.ageMin ?? DEFAULT_DISCOVER_FILTERS.ageMin,
    ageMax: values.ageMax ?? DEFAULT_DISCOVER_FILTERS.ageMax,
    distance: values.distance ?? DEFAULT_DISCOVER_FILTERS.distance,
    sort: values.sort ?? DEFAULT_DISCOVER_FILTERS.sort,
    tags: parseTags(values.tags),
  }
}

export function currentFilters(): DiscoverFilters {
  return filtersFrom({
    ageMin: getNodeValue('filterAgeMin'),
    ageMax: getNodeValue('filterAgeMax'),
    distance: getNodeValue('filterDistance'),
    sort: getNodeValue('filterSort'),
    tags: getNodeValue('filterTags'),
  })
}

/** A sentence describing what is wrong, or null. */
export function filtersProblem(filters: DiscoverFilters): string | null {
  const { ageMin, ageMax, distance, sort } = filters
  if (![ageMin, ageMax, distance].every(Number.isFinite)) return 'Filters must be numbers.'
  if (ageMin < 18) return 'The minimum age is 18.'
  if (ageMin > ageMax) return 'The minimum age cannot be above the maximum age.'
  if (distance <= 0) return 'The distance must be above 0 km.'
  if (!DISCOVER_SORTS.includes(sort)) return `Unknown sort "${sort}".`
  return null
}

/** Writes the filters that differ from the current ones, causing at most one deck request. */
export function writeFilters(next: DiscoverFilters): void {
  const current = currentFilters()
  const writes: [name: 'filterAgeMin' | 'filterAgeMax' | 'filterDistance' | 'filterSort' | 'filterTags', value: unknown][] = []
  if (next.ageMin !== current.ageMin) writes.push(['filterAgeMin', next.ageMin])
  if (next.ageMax !== current.ageMax) writes.push(['filterAgeMax', next.ageMax])
  if (next.distance !== current.distance) writes.push(['filterDistance', next.distance])
  if (next.sort !== current.sort) writes.push(['filterSort', next.sort])
  const tags = tagsValue(normaliseTags(next.tags))
  if (tags !== tagsValue(current.tags)) writes.push(['filterTags', tags])

  if (writes.length === 0) return
  if (writes.length === 1) {
    writeNode(writes[0][0], writes[0][1])
    return
  }
  writeNode('filterAgeMin', null)
  for (const [name, value] of writes) if (name !== 'filterAgeMin') writeNode(name, value)
  writeNode('filterAgeMin', next.ageMin)
}
