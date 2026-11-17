/**
 * Discovery: filters, the deck, likes and passes — the real profile service (`GET /profile/discover`,
 * `POST /profile/{userId}/like | pass`, `DELETE /profile/{userId}/like`).
 *
 * The backend FILTERS (age, distance, fame, tags) and ranks; the ORDER the user picks is applied in
 * the browser by `visibleDeck`, on the whole list, so changing it sends no request.
 */
import type { DeckCard, DiscoverSort, InterestTag, LikeResult } from '@/api/types'
import {
  commands,
  demand,
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
  fameMin: 0,
  sort: 'best' as DiscoverSort,
} as const

export interface DiscoverCommands {
  /** Payload: the liked user's id. */
  like: Command<string, LikeResult>
  /** Payload: the passed user's id. They sink to the bottom of the deck rather than disappear. */
  pass: Command<string, void>
  /** Payload: the user's id. Takes a like back (undoing a deck like; disconnects a match). */
  unlike: Command<string, void>
}

export interface DiscoverNodes extends CommandNodes<DiscoverCommands> {
  filterAgeMin: number
  filterAgeMax: number
  /** Kilometres (the backend caps it at 100). */
  filterDistance: number
  /** Minimum fame rating, 0-100. */
  filterFameMin: number
  /** Not a request parameter: `visibleDeck` sorts in the browser. */
  filterSort: DiscoverSort
  /** Comma-separated tag names; null for "any". */
  filterTags: string
  discoverRefresh: number
  /** Gate of `discoverDeck`: set once /discover asks for the deck (src/wb/demand.ts). */
  discoverWanted: boolean
  /** The whole filtered list (200 at most), best first; excludes people liked or blocked. Loads on demand. */
  discoverDeck: DeckCard[]
  /** User ids swiped (or blocked) in this session: they leave `visibleDeck` at once. */
  swipedIds: string[]
  /** `discoverDeck` minus `swipedIds`, in `filterSort` order; null while there is no deck. */
  visibleDeck: DeckCard[]
  /** Gate of `interestCatalogue`: set once a tag picker is shown. */
  interestsWanted: boolean
  interestsRefresh: number
  /** `GET /profile/interests`: every tag in use. Loads on demand. */
  interestCatalogue: { interests: InterestTag[] }
  /** Tag names of `interestCatalogue`, sorted; null while not loaded. */
  tagCatalogue: string[]
}

export const discoverNodes = {
  filterAgeMin: selection(DEFAULT_FILTERS.ageMin),
  filterAgeMax: selection(DEFAULT_FILTERS.ageMax),
  filterDistance: selection(DEFAULT_FILTERS.distance),
  filterFameMin: selection(DEFAULT_FILTERS.fameMin),
  filterSort: selection(DEFAULT_FILTERS.sort),
  filterTags: selection(),
  discoverRefresh: selection(),
  discoverWanted: selection(),
  // Each filter is a dependency, so each filter write is one request: `actions.setFilters` changes
  // several at once behind a closed gate (it holds `filterAgeMin` at null meanwhile).
  discoverDeck: get('api', '/profile/discover', [
    session(),
    demand('discoverWanted'),
    queryParameter('filterAgeMin', 'minAge'),
    queryParameter('filterAgeMax', 'maxAge'),
    queryParameter('filterDistance', 'maxDistanceKm'),
    queryParameter('filterFameMin', 'minFame'),
    queryParameter('filterTags', 'tags', { optional: true }),
    trigger('discoverRefresh'),
  ]),
  swipedIds: selection([]),
  visibleDeck: derived('visibleDeck', [
    input('discoverDeck', 'deck'),
    input('swipedIds', 'swiped'),
    input('filterSort', 'sort'),
  ]),
  interestsWanted: selection(),
  interestsRefresh: selection(),
  interestCatalogue: get('api', '/profile/interests', [session(), demand('interestsWanted'), trigger('interestsRefresh')]),
  tagCatalogue: derived('tagCatalogue', [input('interestCatalogue', 'catalogue')]),
  ...commands<DiscoverCommands>({
    like: { method: 'POST', serviceName: 'api', addr: '/profile/{userId}/like', payload: { pathVariable: 'userId' } },
    pass: { method: 'POST', serviceName: 'api', addr: '/profile/{userId}/pass', payload: { pathVariable: 'userId' } },
    unlike: { method: 'DELETE', serviceName: 'api', addr: '/profile/{userId}/like', payload: { pathVariable: 'userId' } },
  }),
} satisfies SpecsFor<DiscoverNodes>
