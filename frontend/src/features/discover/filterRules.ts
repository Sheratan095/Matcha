/** Ranges, labels and comparisons for the deck filters (the controls' limits, within the backend's). */
import type { DiscoverSort } from '@/api/types'
import { DEFAULT_DISCOVER_FILTERS, FILTER_LIMITS, type DiscoverFilters } from '@/wb'

export const AGE_RANGE = { min: FILTER_LIMITS.age.min, max: 80 } as const
export const DISTANCE_RANGE = { min: 5, max: FILTER_LIMITS.distance.max, step: 5 } as const
export const FAME_RANGE = { min: FILTER_LIMITS.fame.min, max: 90, step: 5 } as const

export const SORT_LABEL: Record<DiscoverSort, string> = {
  best: 'Best',
  distance: 'Nearest',
  age: 'Age',
  fame: 'Fame',
  tags: 'Tags',
}

/** As wide as the controls go (the "widen filters" shortcut of the empty deck). */
export const WIDEST: DiscoverFilters = {
  ageMin: AGE_RANGE.min,
  ageMax: AGE_RANGE.max,
  distance: DISTANCE_RANGE.max,
  fameMin: FAME_RANGE.min,
  sort: DEFAULT_DISCOVER_FILTERS.sort,
  tags: [],
}

export function sameFilters(a: DiscoverFilters, b: DiscoverFilters): boolean {
  return (
    a.ageMin === b.ageMin &&
    a.ageMax === b.ageMax &&
    a.distance === b.distance &&
    a.fameMin === b.fameMin &&
    a.sort === b.sort &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag) => b.tags.includes(tag))
  )
}

/** How many filters differ from the defaults. */
export function changedFilters(filters: DiscoverFilters): number {
  const d = DEFAULT_DISCOVER_FILTERS
  return (
    Number(filters.ageMin !== d.ageMin || filters.ageMax !== d.ageMax) +
    Number(filters.distance !== d.distance) +
    Number(filters.fameMin !== d.fameMin) +
    Number(filters.sort !== d.sort) +
    Number(filters.tags.length > 0)
  )
}

/** True when some filter is narrower than WIDEST (the sort does not narrow anything). */
export function canWiden(filters: DiscoverFilters): boolean {
  return (
    filters.ageMin > WIDEST.ageMin ||
    filters.ageMax < WIDEST.ageMax ||
    filters.distance < WIDEST.distance ||
    filters.fameMin > WIDEST.fameMin ||
    filters.tags.length > 0
  )
}

/** "aged 18–45 within 50 km, fame 40+, into #tea or #jazz" */
export function scopeText(filters: DiscoverFilters): string {
  const fame = filters.fameMin > 0 ? `, fame ${filters.fameMin}+` : ''
  const tags = filters.tags.length > 0 ? `, into ${filters.tags.map((tag) => `#${tag}`).join(' or ')}` : ''
  return `aged ${filters.ageMin}–${filters.ageMax} within ${filters.distance} km${fame}${tags}`
}
