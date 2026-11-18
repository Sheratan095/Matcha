/**
 * Picks the user's spot: a map with a draggable pin, "use my location" (the device, falling back to
 * the connection when refused), and place search. Controlled: `value` is the pin, `onChange` moves it.
 * Saving is the caller's job (onboarding step, Me section).
 */
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { MAP_TILES_URL } from '@/config'
import { Button, FieldError, IconPin, IconSearch, Notice, Spinner, TextField } from '@/ui'
import { coordinatesLabel, deviceSpot, networkSpot, placeName, searchPlaces, wrapLongitude, type Place, type PlacedSpot, type Spot, type SpotSource } from './geo'
import s from './LocationPicker.module.css'

export interface LocationPickerProps {
  /** The pin; null shows the world without one. */
  value: PlacedSpot | null
  onChange: (spot: PlacedSpot) => void
  /** With no pin yet, place one from the connection right away (no permission prompt). */
  locateWhenEmpty?: boolean
  /** Where the map opens while there is no pin (e.g. the user's area); the whole world without it. */
  center?: Spot | null
  error?: string
}

const PRECISION: Record<SpotSource, string> = {
  saved: 'Saved',
  device: 'Precise · from this device',
  network: 'Approximate · from your connection',
  map: 'Picked on the map',
  search: 'Picked from search',
}

/** How close the map comes for each kind of spot (a city-level guess stays wider). */
const ZOOM: Record<SpotSource, number | null> = { saved: 13, device: 14, network: 11, map: null, search: 13 }

type Note = 'denied' | 'device-failed' | 'lost' | 'search-empty' | 'search-failed'

const PIN = L.divIcon({ className: s.pin, html: '<span></span>', iconSize: [32, 40], iconAnchor: [16, 36] })

function keyOf(spot: Spot): string {
  return `${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`
}

export function LocationPicker({ value, onChange, locateWhenEmpty, center, error }: LocationPickerProps) {
  const errorId = useId()
  /**
   * Read once, when the map is created: the pin it opens with (a spot picked on the map has no zoom of
   * its own), else `center`, else the world. A later change does not move the view.
   */
  const [start] = useState(() => {
    if (value) return { at: L.latLng(value.latitude, value.longitude), zoom: ZOOM[value.source] ?? 13 }
    if (center) return { at: L.latLng(center.latitude, center.longitude), zoom: 12 }
    return { at: L.latLng(30, 10), zoom: 2 }
  })
  const mapBox = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  /**
   * Arrived without a pin: a city-level guess from the connection, without any prompt. Decided once:
   * after that the connection is only asked when the device fails.
   */
  const [arriving] = useState(() => Boolean(locateWhenEmpty) && value === null)
  /** That arrival lookup; anything the user does first cancels it. */
  const arrivalRef = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState<'device' | 'network' | 'search' | null>(arriving ? 'network' : null)
  const [note, setNote] = useState<Note | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [label, setLabel] = useState<{ key: string; text: string | null } | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  /** Moves the pin (through `onChange`). Any move but the arrival lookup's own cancels that lookup. */
  const move = useCallback((spot: Spot, source: SpotSource) => {
    const arrival = arrivalRef.current
    if (source !== 'network' && arrival && !arrival.signal.aborted) {
      arrival.abort()
      setBusy((current) => (current === 'network' ? null : current))
    }
    onChangeRef.current({ latitude: spot.latitude, longitude: wrapLongitude(spot.longitude), source })
  }, [])

  // The map lives outside React: created once, removed on unmount.
  useEffect(() => {
    const box = mapBox.current
    if (!box) return
    const map = L.map(box, { scrollWheelZoom: false, worldCopyJump: true, minZoom: 2 }).setView(start.at, start.zoom)
    L.tileLayer(MAP_TILES_URL, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => move({ latitude: event.latlng.lat, longitude: event.latlng.lng }, 'map'))
    // A map created in a hidden tab, or resized with the page, must re-measure its box.
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(box)
    mapRef.current = map
    return () => {
      resize.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [move, start])

  // The pin follows `value`; a spot that did not come from the map itself brings the view to it.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    const at = L.latLng(value.latitude, value.longitude)
    if (!markerRef.current) {
      const marker = L.marker(at, { draggable: true, icon: PIN, title: 'Your spot', alt: 'Your spot', keyboard: false }).addTo(map)
      marker.on('dragend', () => {
        const moved = marker.getLatLng()
        move({ latitude: moved.lat, longitude: moved.lng }, 'map')
      })
      markerRef.current = marker
    } else {
      markerRef.current.setLatLng(at)
    }
    const zoom = ZOOM[value.source]
    if (zoom !== null) map.setView(at, zoom)
  }, [value, move])

  useEffect(() => {
    if (!arriving) return
    const controller = new AbortController()
    arrivalRef.current = controller
    void networkSpot(controller.signal).then((spot) => {
      if (controller.signal.aborted) return
      setBusy((current) => (current === 'network' ? null : current))
      if (spot) move(spot, 'network')
      else setNote('lost')
    })
    return () => controller.abort()
  }, [arriving, move])

  // The place name under the pin, once it has settled (keyed on the position, not the object).
  const latitude = value?.latitude ?? null
  const longitude = value?.longitude ?? null
  useEffect(() => {
    if (latitude === null || longitude === null) return
    const spot = { latitude, longitude }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void placeName(spot, controller.signal).then((text) => {
        if (!controller.signal.aborted) setLabel({ key: keyOf(spot), text })
      })
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [latitude, longitude])

  const locateDevice = async () => {
    arrivalRef.current?.abort()
    setBusy('device')
    setNote(null)
    setResults(null)
    const result = await deviceSpot()
    if (result.ok) {
      move(result.spot, 'device')
    } else {
      // Refused or unavailable: the connection still says roughly where.
      const spot = await networkSpot()
      if (spot) {
        move(spot, 'network')
        setNote(result.reason === 'denied' ? 'denied' : 'device-failed')
      } else {
        setNote('lost')
      }
    }
    setBusy(null)
  }

  const search = async () => {
    const text = query.trim()
    if (text.length < 2 || busy === 'search' || busy === 'device') return
    arrivalRef.current?.abort()
    setBusy('search')
    setNote(null)
    try {
      const found = await searchPlaces(text)
      setResults(found)
      if (found.length === 0) setNote('search-empty')
    } catch {
      setResults(null)
      setNote('search-failed')
    } finally {
      setBusy(null)
    }
  }

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    // The picker sits inside the caller's form: Enter searches instead of submitting it.
    if (event.key !== 'Enter') return
    event.preventDefault()
    void search()
  }

  const name = value && label?.key === keyOf(value) ? label.text : null

  return (
    <div className={s.picker}>
      <div className={s.place} aria-live="polite">
        <span className={s.placeIcon} aria-hidden="true">
          <IconPin size={20} filled={value !== null} />
        </span>
        <div className={s.placeText}>
          {value ? (
            <>
              <span className={s.placeName}>{name ? `Near ${name}` : coordinatesLabel(value)}</span>
              <span className={s.precision}>{PRECISION[value.source]}</span>
            </>
          ) : busy === 'network' ? (
            <span className={s.finding}>
              <Spinner size={16} /> Finding you…
            </span>
          ) : (
            <span className={s.placeName}>No spot yet</span>
          )}
        </div>
      </div>

      <div
        ref={mapBox}
        className={s.map}
        data-invalid={error ? '' : undefined}
        aria-label="Map: click or tap to place your spot, drag the pin to move it"
        aria-describedby={error ? errorId : undefined}
      />

      <div className={s.controls}>
        <Button variant="ink" icon={<IconPin size={18} />} loading={busy === 'device'} disabled={busy === 'search'} onClick={() => void locateDevice()}>
          Use my location
        </Button>
        <TextField
          label="Or search a place"
          hideLabel
          placeholder="Search a place"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onSearchKey}
          icon={<IconSearch size={18} />}
          enterKeyHint="search"
          autoComplete="off"
          maxLength={120}
          data-skip-autofocus=""
          fieldClassName={s.search}
          trailing={
            <Button size="sm" variant="paper" loading={busy === 'search'} disabled={query.trim().length < 2} onClick={() => void search()}>
              Search
            </Button>
          }
        />
      </div>

      {results && results.length > 0 ? (
        <ul className={s.results} aria-label="Places found">
          {results.map((place) => (
            <li key={`${place.latitude},${place.longitude}`}>
              <button
                type="button"
                className={s.result}
                onClick={() => {
                  move(place, 'search')
                  setResults(null)
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {note === 'denied' ? (
        <Notice tone="info" title="Location access is off" onDismiss={() => setNote(null)}>
          We placed you roughly from your connection instead. Drag the pin or search if it’s wrong.
        </Notice>
      ) : null}
      {note === 'device-failed' ? (
        <Notice tone="info" title="This device couldn’t say where it is" onDismiss={() => setNote(null)}>
          We placed you roughly from your connection instead. Drag the pin or search if it’s wrong.
        </Notice>
      ) : null}
      {note === 'lost' ? (
        <Notice tone="warning" title="We couldn’t find you" onDismiss={() => setNote(null)}>
          Search a place, or tap the map where you are.
        </Notice>
      ) : null}
      {note === 'search-empty' ? (
        <Notice tone="info" onDismiss={() => setNote(null)}>
          Nothing found for “{query.trim()}”. Try a town or a neighbourhood.
        </Notice>
      ) : null}
      {note === 'search-failed' ? (
        <Notice tone="warning" title="Search is unavailable" onDismiss={() => setNote(null)}>
          Tap the map where you are, or use your location.
        </Notice>
      ) : null}

      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}
