/**
 * Search: `GET /profile/search` on the real profile service. The top bar searches people by name
 * (`q`: a case-insensitive substring of the username, first name, last name or "first last"),
 * narrowed by the deck's filters: age range, distance, minimum fame and interest tags (here a
 * candidate must carry ALL of them), and by who they are: genders and sexual preferences (any of
 * those listed; no orientation matching is applied, unlike the deck).
 *
 * Every parameter node is optional (a null one is not sent) and the request waits behind
 * `searchActive`, a required nonce: while it is null nothing is requested and the results reset.
 * `writeSearch` (src/wb/search.ts) writes the parameters behind the closed gate and opens it last,
 * so a change of several criteria is one request. The sort is applied in the browser by
 * `visibleSearch`.
 */
import type { DeckCard, DiscoverSort } from '@/api/types'
import type { DepDef } from '../types'
import { derived, get, input, queryParameter, selection, session, trigger, type SpecsFor } from './builders'

/** Required and not a request parameter: the gate every search request waits behind. */
const gate: DepDef = { nodeName: 'searchActive', parameterName: 'active', isOptional: false, onUpdate: true }

export interface SearchNodes {
  /** The name substring (`q`), or null for none. */
  searchQuery: string
  searchAgeMin: number
  searchAgeMax: number
  /** Maximum distance in kilometres. */
  searchDistance: number
  /** Minimum fame rating, 0-100. */
  searchFameMin: number
  /** Comma-separated tag names a candidate must all carry; null for any. */
  searchTags: string
  /** Comma-separated genders, a candidate is any of them (`female,other`); null for any. */
  searchGenders: string
  /** Comma-separated sexual preferences, a candidate's is any of them; null for any. */
  searchPreferences: string
  /** Not a request parameter: `visibleSearch` sorts in the browser. */
  searchSort: DiscoverSort
  /** A nonce while a search is in force; null for none (nothing requested, results reset). */
  searchActive: number
  searchRefresh: number
  /** The whole result list (200 at most), nearest first. These cards carry no `likesYou`. */
  searchResults: DeckCard[]
  /** `searchResults` in `searchSort` order; null while there are no results. */
  visibleSearch: DeckCard[]
}

export const searchNodes = {
  searchQuery: selection(),
  searchAgeMin: selection(),
  searchAgeMax: selection(),
  searchDistance: selection(),
  searchFameMin: selection(),
  searchTags: selection(),
  searchGenders: selection(),
  searchPreferences: selection(),
  searchSort: selection('best'),
  searchActive: selection(),
  searchRefresh: selection(),
  searchResults: get('api', '/profile/search', [
    session(),
    gate,
    queryParameter('searchQuery', 'q', { optional: true }),
    queryParameter('searchAgeMin', 'minAge', { optional: true }),
    queryParameter('searchAgeMax', 'maxAge', { optional: true }),
    queryParameter('searchDistance', 'maxDistanceKm', { optional: true }),
    queryParameter('searchFameMin', 'minFame', { optional: true }),
    queryParameter('searchTags', 'tags', { optional: true }),
    queryParameter('searchGenders', 'genders', { optional: true }),
    queryParameter('searchPreferences', 'preferences', { optional: true }),
    trigger('searchRefresh'),
  ]),
  visibleSearch: derived('visibleSearch', [input('searchResults', 'results'), input('searchSort', 'sort')]),
} satisfies SpecsFor<SearchNodes>
