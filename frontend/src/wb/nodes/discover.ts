/** Discovery: filters, the deck, swipes (mocked service, docs/ARCHITECTURE.md §5.2). */
import type { Card, DiscoverSort, RewindResult, SwipePayload, SwipeResult } from '@/api/types'
import {
  commands,
  derived,
  get,
  input,
  queryParameter,
  selection,
  session,
  trigger,
  type Command,
  type CommandNodes,
  type SpecsFor,
} from './builders'

export const DEFAULT_FILTERS = {
  ageMin: 18,
  ageMax: 45,
  distance: 50,
  sort: 'best' as DiscoverSort,
} as const

export interface DiscoverCommands {
  swipe: Command<SwipePayload, SwipeResult>
  rewind: Command<void, RewindResult>
}

export interface DiscoverNodes extends CommandNodes<DiscoverCommands> {
  filterAgeMin: number
  filterAgeMax: number
  /** Kilometres. */
  filterDistance: number
  filterSort: DiscoverSort
  /** Comma-separated tag names; null for "any". */
  filterTags: string
  discoverRefresh: number
  /** At most 20 cards, already excluding people swiped, matched or blocked. */
  discoverDeck: Card[]
  /** User ids swiped (or blocked) in this session: they leave `visibleDeck` at once. */
  swipedIds: string[]
  /** `discoverDeck` minus `swipedIds`; null while there is no deck. */
  visibleDeck: Card[]
  tagCatalogue: string[]
}

export const discoverNodes = {
  filterAgeMin: selection(DEFAULT_FILTERS.ageMin),
  filterAgeMax: selection(DEFAULT_FILTERS.ageMax),
  filterDistance: selection(DEFAULT_FILTERS.distance),
  filterSort: selection(DEFAULT_FILTERS.sort),
  filterTags: selection(),
  discoverRefresh: selection(),
  // Each filter is a dependency, so each filter write is one request: `actions.setFilters` changes
  // several at once behind a closed gate (it holds `filterAgeMin` at null meanwhile).
  discoverDeck: get('social', '/discover', [
    session(),
    queryParameter('filterAgeMin', 'ageMin'),
    queryParameter('filterAgeMax', 'ageMax'),
    queryParameter('filterDistance', 'distance'),
    queryParameter('filterSort', 'sort'),
    queryParameter('filterTags', 'tags', { optional: true }),
    trigger('discoverRefresh'),
  ]),
  swipedIds: selection([]),
  visibleDeck: derived('visibleDeck', [input('discoverDeck', 'deck'), input('swipedIds', 'swiped')]),
  tagCatalogue: get('social', '/tags', [session()]),
  ...commands<DiscoverCommands>({
    swipe: { method: 'POST', serviceName: 'social', addr: '/swipes', payload: 'body' },
    rewind: { method: 'POST', serviceName: 'social', addr: '/swipes/rewind', payload: 'none' },
  }),
} satisfies SpecsFor<DiscoverNodes>
