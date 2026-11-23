/** Ranges, labels and comparisons for the deck filters (the controls' limits, within the backend's). */
import type { DiscoverSort, Gender, SexualPreference } from '@/api/types'
import { t, type MessageKey } from '@/i18n'
import { DEFAULT_DISCOVER_FILTERS, FILTER_LIMITS, type DiscoverFilters } from '@/wb'

/** What the filter sheet edits: the deck's filters, plus who people are for the search (empty: anyone). */
export interface SheetFilters extends DiscoverFilters {
  genders?: Gender[]
  preferences?: SexualPreference[]
}

function sameSet(a: readonly string[] = [], b: readonly string[] = []): boolean {
  return a.length === b.length && a.every((item) => b.includes(item))
}

export const AGE_RANGE = { min: FILTER_LIMITS.age.min, max: 80 } as const
export const DISTANCE_RANGE = { min: 5, max: FILTER_LIMITS.distance.max, step: 5 } as const
export const FAME_RANGE = { min: FILTER_LIMITS.fame.min, max: 90, step: 5 } as const

/** The catalogue key of each sort's name (print it with `t(SORT_KEY[sort])`). */
export const SORT_KEY: Record<DiscoverSort, MessageKey> = {
  best: 'deck.sortBest',
  distance: 'deck.sortDistance',
  age: 'deck.sortAge',
  fame: 'deck.sortFame',
  tags: 'deck.sortTags',
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

export function sameFilters(a: SheetFilters, b: SheetFilters): boolean {
  return (
    a.ageMin === b.ageMin &&
    a.ageMax === b.ageMax &&
    a.distance === b.distance &&
    a.fameMin === b.fameMin &&
    a.sort === b.sort &&
    sameSet(a.tags, b.tags) &&
    sameSet(a.genders, b.genders) &&
    sameSet(a.preferences, b.preferences)
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

/** "aged 18–45 within 50 km, fame 40+, into #tea or #jazz", in the language the page is in. */
export function scopeText(filters: DiscoverFilters): string {
  const fame = filters.fameMin > 0 ? t('deck.scopeFame', { n: filters.fameMin }) : ''
  const tags =
    filters.tags.length > 0 ? t('deck.scopeTags', { tags: filters.tags.map((tag) => `#${tag}`).join(` ${t('common.or')} `) }) : ''
  return t('deck.scope', { min: filters.ageMin, max: filters.ageMax, km: filters.distance, fame, tags })
}
