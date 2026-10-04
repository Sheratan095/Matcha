/** The interest tag catalogue shared by the mock people, the demo accounts and `GET /social/tags`. */
import type { InterestTag } from '@/api/types'
import { uuidFrom } from './ids'

/** ~40 tags; the first ten are the backend's seeded tags (docs/API_CONTRACT.md §7.1). */
export const TAG_CATALOGUE: readonly string[] = [
  'vegan',
  'hiking',
  'photography',
  'travel',
  'reading',
  'gaming',
  'cooking',
  'fitness',
  'music',
  'art',
  'matcha',
  'coffee',
  'yoga',
  'climbing',
  'cycling',
  'running',
  'swimming',
  'surfing',
  'dancing',
  'cinema',
  'anime',
  'theatre',
  'poetry',
  'jazz',
  'techno',
  'vinyl',
  'karaoke',
  'museums',
  'design',
  'fashion',
  'thrifting',
  'gardening',
  'dogs',
  'cats',
  'board-games',
  'chess',
  'astronomy',
  'coding',
  'baking',
  'wine',
  'football',
  'volunteering',
  'languages',
  'ceramics',
  'skateboarding',
]

/** What the profile service does to an interest name: trim + lowercase (a leading '#' is kept). */
export function normaliseInterest(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Lenient form for filters: also drops leading '#'. */
export function normaliseTagFilter(raw: string): string {
  return normaliseInterest(raw).replace(/^#+/, '')
}

/** One id per tag name, like the backend's shared tag table. */
export function tagId(name: string): string {
  return uuidFrom(`tag:${name}`)
}

export function toInterestTags(names: readonly string[]): InterestTag[] {
  return names.map((name) => ({ id: tagId(name), name }))
}
