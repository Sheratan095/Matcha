/**
 * Discover filters: selection nodes, each a dependency of `discoverDeck` except the sort (applied in
 * the browser by `visibleDeck`). Writing them one by one would send one request per write, so several
 * changes are applied behind a closed gate: `filterAgeMin` (a required dependency) is held at `null`
 * while the others change, then written last, which sends one request with the final values.
 */
import type { DiscoverSort } from '@/api/types'
import { DEFAULT_FILTERS } from './nodes'
import { getNodeValue, writeNode } from './store'

export const DISCOVER_SORTS: readonly DiscoverSort[] = ['best', 'distance', 'age', 'fame', 'tags']

/** What GET /profile/discover accepts. */
export const FILTER_LIMITS = {
  age: { min: 18, max: 120 },
  distance: { min: 1, max: 100 },
  fame: { min: 0, max: 100 },
} as const

export interface DiscoverFilters {
  ageMin: number
  ageMax: number
  /** Kilometres. */
  distance: number
  /** Minimum fame rating, 0-100. */
  fameMin: number
  sort: DiscoverSort
  /** Interest names, lowercase, without '#'; empty for "any". */
  tags: string[]
}

export const DEFAULT_DISCOVER_FILTERS: Readonly<DiscoverFilters> = Object.freeze({
  ageMin: DEFAULT_FILTERS.ageMin,
  ageMax: DEFAULT_FILTERS.ageMax,
  distance: DEFAULT_FILTERS.distance,
  fameMin: DEFAULT_FILTERS.fameMin,
  sort: DEFAULT_FILTERS.sort,
  tags: [],
})

/**
 * What an interest may contain, mirroring the backend allow-list (INTEREST_NAME_PATTERN in
 * backend/apps/profile/src/dto/profile/interest.dto.ts; keep the two in step): letters of any
 * alphabet, digits, accents, emoji and their joiners, spaces, and . _ ' + # -
 * Tags are the one piece of text shared by every user (the picker lists everybody's), which is why
 * the backend refuses anything else with a 400 instead of storing it.
 *
 * The emoji joiners (ZWJ, variation selector 16) and the curly apostrophe are written as code
 * points: the first two are invisible, and an invisible character in a regex is a trap.
 * The hyphen stays last in the class so it is a literal one and not a range.
 */
const TAG_EXTRA_CHARS = String.fromCharCode(0x200d, 0xfe0f, 0x2019)
const TAG_FORBIDDEN = new RegExp(String.raw`[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}${TAG_EXTRA_CHARS} _.'+#-]`, 'gu')
/** A tag starts with a letter, a digit or an emoji; anything before that goes (a '#', a dash, a space...). */
const TAG_LEADING_JUNK = /^[^\p{L}\p{N}\p{Extended_Pictographic}]+/u

/**
 * One tag as the backend stores it: Unicode NFC, whitespace folded to single spaces, every character
 * outside the allowed set dropped (so "<b>" becomes "b" and a control character vanishes),
 * no leading '#' or punctuation, lowercase. Empty when nothing usable is left.
 */
function cleanTagName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(TAG_FORBIDDEN, '')
    .replace(TAG_LEADING_JUNK, '')
    .trim()
    .toLowerCase()
}

/**
 * Cleaned (see cleanTagName), no empties, no duplicates (the backend 500s on duplicates). A comma
 * separates tags, as in the `?tags=` filter value.
 */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const raw of tags) {
    for (const part of raw.split(',')) {
      const tag = cleanTagName(part)
      if (tag) seen.add(tag)
    }
  }
  return [...seen]
}

/**
 * What the interests box turns typed text into: the same cleaning as `normaliseTags`, then spaces and
 * commas become dashes ("Rock, jazz" -> "rock-jazz"). Pass it as `TagInput`'s `normalize`, so the chip
 * the user sees is the tag that gets saved, not something the save step quietly rewrites.
 */
export function tagFromInput(raw: string): string {
  return cleanTagName(raw.replace(/[\s,]+/g, ' '))
    .replace(/ /g, '-')
    .replace(/^-+|-+$/g, '')
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
  fameMin: number | null | undefined
  sort: DiscoverSort | null | undefined
  tags: string | null | undefined
}): DiscoverFilters {
  return {
    ageMin: values.ageMin ?? DEFAULT_DISCOVER_FILTERS.ageMin,
    ageMax: values.ageMax ?? DEFAULT_DISCOVER_FILTERS.ageMax,
    distance: values.distance ?? DEFAULT_DISCOVER_FILTERS.distance,
    fameMin: values.fameMin ?? DEFAULT_DISCOVER_FILTERS.fameMin,
    sort: values.sort ?? DEFAULT_DISCOVER_FILTERS.sort,
    tags: parseTags(values.tags),
  }
}

export function currentFilters(): DiscoverFilters {
  return filtersFrom({
    ageMin: getNodeValue('filterAgeMin'),
    ageMax: getNodeValue('filterAgeMax'),
    distance: getNodeValue('filterDistance'),
    fameMin: getNodeValue('filterFameMin'),
    sort: getNodeValue('filterSort'),
    tags: getNodeValue('filterTags'),
  })
}

const isInteger = (value: number) => Number.isInteger(value)

/** A sentence describing what is wrong, or null. The backend wants whole numbers in these ranges. */
export function filtersProblem(filters: DiscoverFilters): string | null {
  const { ageMin, ageMax, distance, fameMin, sort } = filters
  const { age, distance: km, fame } = FILTER_LIMITS
  if (![ageMin, ageMax, distance, fameMin].every(isInteger)) return 'Filters must be whole numbers.'
  if (ageMin < age.min) return `The minimum age is ${age.min}.`
  if (ageMax > age.max) return `The maximum age is ${age.max}.`
  if (ageMin > ageMax) return 'The minimum age cannot be above the maximum age.'
  if (distance < km.min || distance > km.max) return `The distance must be between ${km.min} and ${km.max} km.`
  if (fameMin < fame.min || fameMin > fame.max) return `The fame rating goes from ${fame.min} to ${fame.max}.`
  if (!DISCOVER_SORTS.includes(sort)) return `Unknown sort "${sort}".`
  return null
}

type RequestFilterNode = 'filterAgeMin' | 'filterAgeMax' | 'filterDistance' | 'filterFameMin' | 'filterTags'

/**
 * Writes the filters that differ from the current ones. The sort is written at once (no request);
 * the others cause at most one deck request. Returns whether a request was caused.
 */
export function writeFilters(next: DiscoverFilters): boolean {
  const current = currentFilters()
  if (next.sort !== current.sort) writeNode('filterSort', next.sort)

  const writes: [name: RequestFilterNode, value: unknown][] = []
  if (next.ageMin !== current.ageMin) writes.push(['filterAgeMin', next.ageMin])
  if (next.ageMax !== current.ageMax) writes.push(['filterAgeMax', next.ageMax])
  if (next.distance !== current.distance) writes.push(['filterDistance', next.distance])
  if (next.fameMin !== current.fameMin) writes.push(['filterFameMin', next.fameMin])
  const tags = tagsValue(normaliseTags(next.tags))
  if (tags !== tagsValue(current.tags)) writes.push(['filterTags', tags])

  if (writes.length === 0) return false
  if (writes.length === 1) {
    writeNode(writes[0][0], writes[0][1])
    return true
  }
  writeNode('filterAgeMin', null)
  for (const [name, value] of writes) if (name !== 'filterAgeMin') writeNode(name, value)
  writeNode('filterAgeMin', next.ageMin)
  return true
}
