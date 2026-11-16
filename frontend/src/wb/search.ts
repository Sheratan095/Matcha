/**
 * Search criteria: the name substring plus the deck's filters, each nullable (null = not sent = no
 * limit). Every request parameter is a selection node gated by `searchActive` (src/wb/nodes/search.ts):
 * `writeSearch` closes the gate, writes what changed and opens it again, so a change of several
 * criteria is one request, and dropping every criterion ends the search.
 */
import { MAX_SEARCH_QUERY_LENGTH, type DiscoverSort } from '@/api/types'
import { nextNonce } from './commands'
import { DISCOVER_SORTS, FILTER_LIMITS, normaliseTags, parseTags } from './filters'
import type { NodeName } from './nodes'
import { getNodeValue, writeNode } from './store'

export interface SearchCriteria {
  /** Case-insensitive substring of the username, first name, last name or "first last"; null for none. */
  q: string | null
  ageMin: number | null
  ageMax: number | null
  /** Maximum distance in kilometres; null for any. */
  distance: number | null
  /** Minimum fame rating; null for any. */
  fameMin: number | null
  /** Interest names a candidate must ALL carry (lowercase, without '#'); empty for any. */
  tags: string[]
  /** Applied in the browser by `visibleSearch`: not a request parameter. */
  sort: DiscoverSort
}

export const EMPTY_SEARCH: Readonly<SearchCriteria> = Object.freeze({
  q: null,
  ageMin: null,
  ageMax: null,
  distance: null,
  fameMin: null,
  tags: [],
  sort: 'best' as DiscoverSort,
})

/** True when something would be sent: the backend rejects a search with no criterion at all. */
export function hasSearchCriteria(criteria: SearchCriteria): boolean {
  return (
    criteria.q !== null ||
    criteria.ageMin !== null ||
    criteria.ageMax !== null ||
    criteria.distance !== null ||
    criteria.fameMin !== null ||
    criteria.tags.length > 0
  )
}

export function searchCriteriaFrom(values: {
  q: string | null | undefined
  ageMin: number | null | undefined
  ageMax: number | null | undefined
  distance: number | null | undefined
  fameMin: number | null | undefined
  tags: string | null | undefined
  sort: DiscoverSort | null | undefined
}): SearchCriteria {
  return {
    q: values.q ?? null,
    ageMin: values.ageMin ?? null,
    ageMax: values.ageMax ?? null,
    distance: values.distance ?? null,
    fameMin: values.fameMin ?? null,
    tags: parseTags(values.tags),
    sort: values.sort ?? EMPTY_SEARCH.sort,
  }
}

export function currentSearch(): SearchCriteria {
  return searchCriteriaFrom({
    q: getNodeValue('searchQuery'),
    ageMin: getNodeValue('searchAgeMin'),
    ageMax: getNodeValue('searchAgeMax'),
    distance: getNodeValue('searchDistance'),
    fameMin: getNodeValue('searchFameMin'),
    tags: getNodeValue('searchTags'),
    sort: getNodeValue('searchSort'),
  })
}

/** Trimmed; blank becomes null. */
export function normaliseQuery(q: string | null | undefined): string | null {
  const text = q?.trim()
  return text ? text : null
}

const isWhole = (value: number | null) => value === null || Number.isInteger(value)

/** A sentence describing what is wrong, or null. The backend wants whole numbers in these ranges. */
export function searchProblem(criteria: SearchCriteria): string | null {
  const { q, ageMin, ageMax, distance, fameMin, sort } = criteria
  const { age, distance: km, fame } = FILTER_LIMITS
  if (q !== null && q.length > MAX_SEARCH_QUERY_LENGTH) return `A name is ${MAX_SEARCH_QUERY_LENGTH} characters at most.`
  if (![ageMin, ageMax, distance, fameMin].every(isWhole)) return 'Filters must be whole numbers.'
  if (ageMin !== null && (ageMin < age.min || ageMin > age.max)) return `Ages go from ${age.min} to ${age.max}.`
  if (ageMax !== null && (ageMax < age.min || ageMax > age.max)) return `Ages go from ${age.min} to ${age.max}.`
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) return 'The minimum age cannot be above the maximum age.'
  if (distance !== null && (distance < km.min || distance > km.max)) return `The distance must be between ${km.min} and ${km.max} km.`
  if (fameMin !== null && (fameMin < fame.min || fameMin > fame.max)) return `The fame rating goes from ${fame.min} to ${fame.max}.`
  if (!DISCOVER_SORTS.includes(sort)) return `Unknown sort "${sort}".`
  if (!hasSearchCriteria(criteria)) return 'Type a name or pick a filter.'
  return null
}

function tagsValue(tags: readonly string[]): string | null {
  return tags.length > 0 ? tags.join(',') : null
}

type ParameterNode = 'searchQuery' | 'searchAgeMin' | 'searchAgeMax' | 'searchDistance' | 'searchFameMin' | 'searchTags'

/**
 * Makes the nodes describe `next`, with at most one request: the sort is written at once (no
 * request); the parameters are written behind the closed gate, which is then opened. The same
 * criteria again refetch in place (a retry); criteria that send nothing close the gate for good.
 * Returns whether a request was caused.
 */
export function writeSearch(next: SearchCriteria): boolean {
  const current = currentSearch()
  if (next.sort !== current.sort) writeNode('searchSort', next.sort)

  const writes: [name: ParameterNode, value: unknown][] = []
  if (next.q !== current.q) writes.push(['searchQuery', next.q])
  if (next.ageMin !== current.ageMin) writes.push(['searchAgeMin', next.ageMin])
  if (next.ageMax !== current.ageMax) writes.push(['searchAgeMax', next.ageMax])
  if (next.distance !== current.distance) writes.push(['searchDistance', next.distance])
  if (next.fameMin !== current.fameMin) writes.push(['searchFameMin', next.fameMin])
  const tags = tagsValue(normaliseTags(next.tags))
  if (tags !== tagsValue(current.tags)) writes.push(['searchTags', tags])

  const active = getNodeValue('searchActive') != null
  if (!hasSearchCriteria(next)) {
    // nothing to send: the gate closes first, so the parameter writes cause no request
    if (active) writeNode('searchActive', null)
    for (const [name, value] of writes) writeNode(name as NodeName, value)
    return false
  }
  if (writes.length === 0) {
    if (!active) {
      writeNode('searchActive', nextNonce())
      return true
    }
    // only the sort changed: the browser reorders, nothing to fetch
    if (next.sort !== current.sort) return false
    writeNode('searchRefresh', nextNonce())
    return true
  }
  if (active) writeNode('searchActive', null)
  for (const [name, value] of writes) writeNode(name as NodeName, value)
  writeNode('searchActive', nextNonce())
  return true
}
