/**
 * The search filters as the deck's filter sheet edits them. The sheet works on plain numbers along
 * the deck's rails (src/features/discover/filterRules.ts); for a search the end of a rail means "no
 * limit", which is a null criterion (the parameter is not sent), so a name search is not confined to
 * the deck's 100 km or 80 years.
 */
import type { Gender, SexualPreference } from '@/api/types'
import { t, type MessageKey } from '@/i18n'
import { AGE_RANGE, DISTANCE_RANGE, FAME_RANGE, type SheetFilters } from '@/features/discover/filterRules'
import { EMPTY_SEARCH, type SearchCriteria } from '@/wb'

/** Criteria -> the sheet's numbers: a null limit is the end of its rail. */
export function toSheetFilters(criteria: SearchCriteria): SheetFilters {
  return {
    ageMin: criteria.ageMin ?? AGE_RANGE.min,
    ageMax: criteria.ageMax ?? AGE_RANGE.max,
    distance: criteria.distance ?? DISTANCE_RANGE.max,
    fameMin: criteria.fameMin ?? FAME_RANGE.min,
    sort: criteria.sort,
    tags: [...criteria.tags],
    genders: [...criteria.genders],
    preferences: [...criteria.preferences],
  }
}

/** The sheet's numbers -> criteria: the end of a rail is no limit. The name is not the sheet's. */
export function fromSheetFilters(filters: SheetFilters): Omit<SearchCriteria, 'q'> {
  return {
    ageMin: filters.ageMin > AGE_RANGE.min ? filters.ageMin : null,
    ageMax: filters.ageMax < AGE_RANGE.max ? filters.ageMax : null,
    distance: filters.distance < DISTANCE_RANGE.max ? filters.distance : null,
    fameMin: filters.fameMin > FAME_RANGE.min ? filters.fameMin : null,
    sort: filters.sort,
    tags: [...filters.tags],
    genders: [...(filters.genders ?? [])],
    preferences: [...(filters.preferences ?? [])],
  }
}

/** What "Reset" in the sheet goes back to: every rail at its open end, anyone. */
export const OPEN_FILTERS: SheetFilters = toSheetFilters(EMPTY_SEARCH)

/** How many filters narrow the search (the sort narrows nothing). */
export function activeFilterCount(criteria: SearchCriteria): number {
  return (
    Number(criteria.ageMin !== null || criteria.ageMax !== null) +
    Number(criteria.distance !== null) +
    Number(criteria.fameMin !== null) +
    Number(criteria.tags.length > 0) +
    Number(criteria.genders.length > 0) +
    Number(criteria.preferences.length > 0)
  )
}

const GENDER_WORD: Record<Gender, MessageKey> = { female: 'search.women', male: 'search.men', other: 'search.otherGenders' }
const INTO_WORD: Record<SexualPreference, MessageKey> = {
  female: 'search.women',
  male: 'search.men',
  both: 'search.menWomen',
  other: 'search.other',
}

/**
 * "women or men · into women · ages 25-40 · within 20 km · fame 40+ · #tea and #jazz"; empty when
 * nothing narrows the search.
 */
export function filterSummary(criteria: SearchCriteria): string {
  const parts: string[] = []
  const { ageMin, ageMax, distance, fameMin, tags, genders, preferences } = criteria
  const or = ` ${t('common.or')} `
  if (genders.length > 0) parts.push(genders.map((gender) => t(GENDER_WORD[gender])).join(or))
  if (preferences.length > 0) parts.push(t('search.into', { list: preferences.map((preference) => t(INTO_WORD[preference])).join(or) }))
  if (ageMin !== null && ageMax !== null) parts.push(t('search.ages', { min: ageMin, max: ageMax }))
  else if (ageMin !== null) parts.push(t('search.agesFrom', { n: ageMin }))
  else if (ageMax !== null) parts.push(t('search.agesUpTo', { n: ageMax }))
  if (distance !== null) parts.push(t('search.within', { km: distance }))
  if (fameMin !== null) parts.push(t('search.fameAtLeast', { n: fameMin }))
  if (tags.length > 0) parts.push(tags.map((tag) => `#${tag}`).join(` ${t('search.and')} `))
  return parts.join(' · ')
}

/** The distance rail's open end reads "Any". */
export const formatDistance = (km: number): string => (km >= DISTANCE_RANGE.max ? t('deck.noLimit') : t('deck.kmValue', { n: km }))

/** The fame rail's open end reads "Any". */
export const formatFame = (fame: number): string => (fame <= FAME_RANGE.min ? t('deck.noLimit') : String(fame))
