/**
 * The top bar's search: people by name, as you type, narrowed by the deck's filters (age range,
 * distance, minimum fame, interests, sort) edited in the deck's own filter sheet (`GET /profile/search`).
 * The results drop down under the top bar, which anchors them; picking one opens the shared profile
 * sheet (that records a profile view, as opening a deck card does). Shown to a complete profile only:
 * the backend answers 403 to anyone without a location.
 *
 * Data: `useSearchCriteria()`, `visibleSearch` (sorted in the browser) + `useNodeStatus('searchResults')`.
 * Flows: `actions.search / clearSearch`. The input is a combobox over a listbox: arrows move, Enter
 * opens, Escape closes then clears, and "/" focuses it from anywhere on the page.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MAX_SEARCH_QUERY_LENGTH, type ApiError, type DeckCard } from '@/api/types'
import { FilterSheet } from '@/features/discover/FilterSheet'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import { cardName, deckPreviewProfile, distanceText } from '@/features/profile/format'
import { Avatar, Button, CountBadge, cx, IconPin, IconSearch, IconSliders, IconX, Spinner } from '@/ui'
import {
  actions,
  EMPTY_SEARCH,
  LOCAL_ERROR,
  toApiError,
  useNodeStatus,
  useNodeValue,
  useSearchCriteria,
  type DiscoverFilters,
} from '@/wb'
import { activeFilterCount, filterSummary, formatDistance, formatFame, fromSheetFilters, OPEN_FILTERS, toSheetFilters } from './searchFilters'
import s from './SearchBar.module.css'

/** Typing pauses this long before a request goes out. */
const DEBOUNCE_MS = 250

const pad = (n: number) => String(n).padStart(2, '0')

/** "@alice · 4 km away · fame 55" */
function detailsOf(card: DeckCard): string {
  const parts = [`@${card.username}`]
  if (card.distanceKm != null) parts.push(`${distanceText(card.distanceKm)} away`)
  parts.push(`fame ${Math.round(card.fameRating)}`)
  return parts.join(' · ')
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
}

export function SearchBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const complete = useNodeValue('profileComplete')
  const criteria = useSearchCriteria()
  const results = useNodeValue('visibleSearch')
  const status = useNodeStatus('searchResults')

  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  /** Index of the highlighted option; -1 for none. */
  const [active, setActive] = useState(-1)
  /** The name whose request was last sent. */
  const [sentFor, setSentFor] = useState('')
  const [failure, setFailure] = useState<{ q: string; error: ApiError } | null>(null)
  const [sheet, setSheet] = useState<ProfileTarget | null>(null)
  /** The last loaded results: kept on screen while the next search loads. */
  const [kept, setKept] = useState<DeckCard[] | null>(null)
  if (results && results !== kept) {
    setKept(results)
    setActive(-1)
  }
  // another page: the list folds away, the text stays
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const panelId = useId()

  const q = text.trim()
  const filterCount = activeFilterCount(criteria)
  const hasAny = q !== '' || filterCount > 0

  // the pause after typing reads the filters in force when it ends, not when it started
  const filterCountRef = useRef(filterCount)
  useLayoutEffect(() => {
    filterCountRef.current = filterCount
  })

  // ---------------------------------------------------------------- the search itself

  /** Sends the name, with the filters in force. A failure shows in the list. */
  const fire = (query: string) => {
    setSentFor(query)
    actions.search({ q: query || null }).then(
      () => setFailure((current) => (current?.q === query ? null : current)),
      (error: unknown) => {
        const apiError = toApiError(error)
        // DROPPED: the criteria changed (or the search ended) while this one loaded
        if (apiError.code !== LOCAL_ERROR.DROPPED) setFailure({ q: query, error: apiError })
      },
    )
  }

  /** From the filter sheet: the new filters with the name in the box. A rejection shows in the sheet. */
  const applyFilters = async (filters: DiscoverFilters) => {
    const next = fromSheetFilters(filters)
    if (!q && activeFilterCount({ ...next, q: null }) === 0) {
      actions.clearSearch()
      return
    }
    await actions.search({ ...next, q: q || null })
    setSentFor(q)
    setFailure(null)
    setOpen(true)
  }

  /** Back to the name alone (or to nothing). */
  const clearFilters = () => {
    if (!q) {
      actions.clearSearch()
      setKept(null)
      setSentFor('')
      setFailure(null)
      setOpen(false)
      return
    }
    actions.search({ ...EMPTY_SEARCH, q, sort: criteria.sort }).then(
      () => setFailure(null),
      (error: unknown) => {
        const apiError = toApiError(error)
        if (apiError.code !== LOCAL_ERROR.DROPPED) setFailure({ q, error: apiError })
      },
    )
  }

  // a pause after typing sends the name; an emptied box searches on the filters alone, or ends it
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        if (q === '' && filterCountRef.current === 0) actions.clearSearch()
        else fire(q)
      },
      q === '' ? 0 : DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
    // (`fire` only closes over state setters, which are stable)
  }, [q])

  // leaving the shell ends the search, filters included
  useEffect(() => () => actions.clearSearch(), [])

  // a click elsewhere folds the list away
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // "/" from anywhere on the page focuses the search (not from a field, not under a dialog)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
      if (isEditable(event.target) || document.querySelector('[data-modal-host]')) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (complete !== true) return null

  // ---------------------------------------------------------------- what the list shows

  const failed = failure?.q === q ? failure.error : null
  const busy = hasAny && !failed && (q !== sentFor || status.status === 'loading')
  const options = kept ?? []
  const showList = open && hasAny
  const noLocation = failed?.status === 403
  const expanded = focused || text !== ''
  const scope = filterSummary(criteria)

  /** The box was emptied: nothing to keep from the last search unless the filters go on. */
  const forget = () => {
    setFailure(null)
    setActive(-1)
    if (filterCountRef.current === 0) {
      setKept(null)
      setSentFor('')
    }
  }

  const clear = () => {
    setText('')
    setOpen(false)
    forget()
    inputRef.current?.focus()
  }

  const pick = (card: DeckCard) => {
    setOpen(false)
    setSheet({ userId: card.userId, source: 'api', preview: deckPreviewProfile(card) })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (index < 0 ? (step > 0 ? 0 : options.length - 1) : (index + step + options.length) % options.length))
    } else if (event.key === 'Enter') {
      if (showList && options.length > 0) {
        event.preventDefault()
        pick(options[active >= 0 ? active : 0])
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      } else if (text) {
        event.preventDefault()
        clear()
      }
    }
  }

  return (
    <div ref={rootRef} className={s.root} data-search-expanded={expanded ? '' : undefined}>
      <form
        role="search"
        className={s.form}
        onSubmit={(event) => {
          // Enter before the pause is over: search now
          event.preventDefault()
          if (q && q !== sentFor) fire(q)
        }}
      >
        <div className={s.box}>
          <span className={s.lead} aria-hidden="true">
            {busy ? <Spinner size={16} label="" /> : <IconSearch size={18} strokeWidth={2.75} />}
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            className={s.input}
            value={text}
            placeholder="Search"
            aria-label="Search people by name"
            aria-expanded={showList}
            aria-controls={showList ? panelId : undefined}
            aria-activedescendant={showList && active >= 0 && options[active] ? `${listId}-${options[active].userId}` : undefined}
            aria-autocomplete="list"
            aria-busy={busy || undefined}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            onChange={(event) => {
              const next = event.currentTarget.value
              setText(next)
              setOpen(next.trim() !== '' || filterCount > 0)
              setActive(-1)
              if (!next.trim()) forget()
            }}
            onFocus={() => {
              setFocused(true)
              if (hasAny) setOpen(true)
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
          />
          {text ? (
            <button type="button" className={s.clear} aria-label="Clear search" onClick={clear}>
              <IconX size={16} strokeWidth={3} />
            </button>
          ) : null}
          <span className={s.divider} aria-hidden="true" />
          <button
            type="button"
            className={s.knob}
            data-active={filterCount > 0 ? '' : undefined}
            aria-label={filterCount > 0 ? `Search filters, ${filterCount} active` : 'Search filters'}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
          >
            <IconSliders size={18} strokeWidth={2.75} />
            <CountBadge count={filterCount} className={s.knobBadge} />
          </button>
        </div>
      </form>

      {showList ? (
        <div id={panelId} className={s.panel}>
          {failed ? (
            <div className={cx(s.state, s.stateStack)} role="alert">
              <p className={s.stateTitle}>{noLocation ? 'Set your location to search' : 'The search did not go through'}</p>
              <p className={s.stateText}>{failed.message}</p>
              {noLocation ? (
                <Button size="sm" variant="ink" icon={<IconPin size={16} />} onClick={() => navigate('/map')}>
                  Open the map
                </Button>
              ) : (
                <Button size="sm" variant="paper" onClick={() => fire(q)}>
                  Try again
                </Button>
              )}
            </div>
          ) : options.length > 0 ? (
            <>
              <div className={s.head} aria-hidden="true">
                <span>
                  {pad(options.length)} {options.length === 1 ? 'person' : 'people'}
                </span>
                <span className={s.headScope}>{scope || 'nearest first'}</span>
              </div>
              <ul
                id={listId}
                role="listbox"
                aria-label={`${options.length} ${options.length === 1 ? 'person' : 'people'} found${scope ? `, ${scope}` : ''}`}
                aria-busy={busy || undefined}
                className={s.list}
              >
                {options.map((card, index) => (
                  <li
                    key={card.userId}
                    id={`${listId}-${card.userId}`}
                    role="option"
                    aria-selected={index === active}
                    className={cx(s.option, index === active && s.optionActive)}
                    // the input keeps the focus (and the list stays open) through the click
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => {
                      if (active !== index) setActive(index)
                    }}
                    onClick={() => pick(card)}
                  >
                    <Avatar src={card.profilePictureUrl} name={cardName(card)} size="sm" decorative />
                    <span className={s.optionMain}>
                      <span className={s.optionTitle}>
                        {cardName(card)}, {card.age}
                      </span>
                      <span className={s.optionSub}>{detailsOf(card)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : busy || kept === null ? (
            <p className={s.state} role="status">
              <Spinner size={16} label="" /> Searching…
            </p>
          ) : (
            <div className={cx(s.state, s.stateStack)} role="status">
              <p className={s.stateText}>
                {q ? (
                  <>
                    Nobody matches “{q}”{filterCount > 0 ? ' with these filters' : ''}.
                  </>
                ) : (
                  'Nobody matches these filters.'
                )}
              </p>
              {filterCount > 0 ? (
                <div className={s.stateActions}>
                  <Button size="sm" variant="paper" onClick={clearFilters}>
                    Clear filters
                  </Button>
                  <Button size="sm" variant="paper" icon={<IconSliders size={16} />} onClick={() => setFiltersOpen(true)}>
                    Change filters
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={toSheetFilters(criteria)}
        apply={applyFilters}
        defaults={OPEN_FILTERS}
        title="Search filters"
        kicker="Narrow the search"
        tagsHint="People who have all of these."
        submitLabel="Search"
        sortLabel="Order the results by"
        formatDistance={formatDistance}
        formatFame={formatFame}
      />

      <ProfileSheet target={sheet} onClose={() => setSheet(null)} />
    </div>
  )
}
