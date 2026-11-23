/**
 * Search criteria: the name substring, the deck's filters and who people are (genders, preferences),
 * each nullable or empty (= not sent = no limit). Every request parameter is a selection node gated by `searchActive` (src/wb/nodes/search.ts):
 * `writeSearch` closes the gate, writes what changed and opens it again, so a change of several
 * criteria is one request, and dropping every criterion ends the search.
 */
import {
  GENDERS,
  MAX_SEARCH_QUERY_LENGTH,
  SEXUAL_PREFERENCES,
  type DiscoverSort,
  type Gender,
  type SexualPreference,
} from '@/api/types'
import { t } from '@/i18n'
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
  /** The candidate's gender is any of these; empty for any. */
  genders: Gender[]
  /** The candidate's sexual preference is any of these (an unset one counts as 'both'); empty for any. */
  preferences: SexualPreference[]
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
  genders: [],
  preferences: [],
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
    criteria.tags.length > 0 ||
    criteria.genders.length > 0 ||
    criteria.preferences.length > 0
  )
}

/**
 * The known values among `values`, without duplicates, in the canonical order of `known` (so the
 * same choice always makes the same query value, and comparing two choices is comparing two lists).
 */
export function pickKnown<T extends string>(values: readonly string[], known: readonly T[]): T[] {
  return known.filter((value) => values.includes(value))
}

/** A comma-separated query value -> its known entries. */
function parseList<T extends string>(value: string | null | undefined, known: readonly T[]): T[] {
  return value ? pickKnown(value.split(',').map((item) => item.trim().toLowerCase()), known) : []
}

export function searchCriteriaFrom(values: {
  q: string | null | undefined
  ageMin: number | null | undefined
  ageMax: number | null | undefined
  distance: number | null | undefined
  fameMin: number | null | undefined
  tags: string | null | undefined
  genders: string | null | undefined
  preferences: string | null | undefined
  sort: DiscoverSort | null | undefined
}): SearchCriteria {
  return {
    q: values.q ?? null,
    ageMin: values.ageMin ?? null,
    ageMax: values.ageMax ?? null,
    distance: values.distance ?? null,
    fameMin: values.fameMin ?? null,
    tags: parseTags(values.tags),
    genders: parseList(values.genders, GENDERS),
    preferences: parseList(values.preferences, SEXUAL_PREFERENCES),
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
    genders: getNodeValue('searchGenders'),
    preferences: getNodeValue('searchPreferences'),
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
  if (q !== null && q.length > MAX_SEARCH_QUERY_LENGTH) return t('filters.nameLong', { n: MAX_SEARCH_QUERY_LENGTH })
  if (![ageMin, ageMax, distance, fameMin].every(isWhole)) return t('filters.whole')
  if (ageMin !== null && (ageMin < age.min || ageMin > age.max)) return t('filters.ages', { min: age.min, max: age.max })
  if (ageMax !== null && (ageMax < age.min || ageMax > age.max)) return t('filters.ages', { min: age.min, max: age.max })
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) return t('filters.minAboveMax')
  if (distance !== null && (distance < km.min || distance > km.max)) return t('filters.distance', { min: km.min, max: km.max })
  if (fameMin !== null && (fameMin < fame.min || fameMin > fame.max)) return t('filters.fame', { min: fame.min, max: fame.max })
  if (criteria.genders.some((gender) => !GENDERS.includes(gender))) return t('filters.unknownGender')
  if (criteria.preferences.some((preference) => !SEXUAL_PREFERENCES.includes(preference))) return t('filters.unknownPreference')
  if (!DISCOVER_SORTS.includes(sort)) return t('filters.sort', { sort })
  if (!hasSearchCriteria(criteria)) return t('filters.needCriteria')
  return null
}

/** A list as one comma-separated query value; null (not sent) when empty. */
function listValue(list: readonly string[]): string | null {
  return list.length > 0 ? list.join(',') : null
}

type ParameterNode =
  | 'searchQuery'
  | 'searchAgeMin'
  | 'searchAgeMax'
  | 'searchDistance'
  | 'searchFameMin'
  | 'searchTags'
  | 'searchGenders'
  | 'searchPreferences'

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
  const tags = listValue(normaliseTags(next.tags))
  if (tags !== listValue(current.tags)) writes.push(['searchTags', tags])
  const genders = listValue(pickKnown(next.genders, GENDERS))
  if (genders !== listValue(current.genders)) writes.push(['searchGenders', genders])
  const preferences = listValue(pickKnown(next.preferences, SEXUAL_PREFERENCES))
  if (preferences !== listValue(current.preferences)) writes.push(['searchPreferences', preferences])

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
