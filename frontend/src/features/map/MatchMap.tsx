/**
 * The Leaflet map of the viewer's connections: a face per person, a pin for the viewer.
 *
 * Markers are built from DOM nodes, never from HTML strings: usernames and picture URLs come from
 * other users, and Leaflet would insert a string as innerHTML (tooltips and divIcons alike).
 * The map lives outside React: created once, its layers rebuilt when the people change.
 */
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { MAP_TILES_URL } from '@/config'
import type { Spot } from '@/features/location/geo'
import { initialsOf, kmText, safeImageUrl, type PlacedMatch } from './layout'
import s from './MapPage.module.css'

export interface MatchMapHandle {
  /** Brings every face and the viewer's pin into view. */
  fitAll(): void
}

export interface MatchMapProps {
  people: readonly PlacedMatch[]
  /** The viewer's own position (full precision: it is theirs), null when unknown. */
  me: Spot | null
  selectedId: string | null
  onSelect: (userId: string) => void
  /** The connections have loaded (even if there are none): the first view can be framed. */
  ready: boolean
  ref?: Ref<MatchMapHandle>
}

/** Close enough to see the neighbourhood when one person is focused. */
const FOCUS_ZOOM = 14

function faceIcon(person: PlacedMatch, selected: boolean): L.DivIcon {
  const face = document.createElement('span')
  face.className = selected ? `${s.face} ${s.faceSelected}` : s.face
  const url = safeImageUrl(person.profilePictureUrl)
  if (url) {
    const image = document.createElement('img')
    image.src = url
    image.alt = ''
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'
    face.append(image)
  } else {
    face.textContent = initialsOf(person.username)
  }
  return L.divIcon({ className: s.faceIcon, html: face, iconSize: [48, 48], iconAnchor: [24, 24] })
}

function tooltipFor(person: PlacedMatch): HTMLElement {
  const box = document.createElement('span')
  const name = document.createElement('b')
  name.textContent = `@${person.username}`
  box.append(name)
  if (person.km !== null) box.append(document.createTextNode(` · ${kmText(person.km)}`))
  return box
}

const ME_ICON = L.divIcon({ className: s.meIcon, html: '<span></span>', iconSize: [32, 40], iconAnchor: [16, 36] })

export function MatchMap({ people, me, selectedId, onSelect, ready, ref }: MatchMapProps) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const facesRef = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const meRef = useRef<L.Marker | null>(null)
  const onSelectRef = useRef(onSelect)
  /** Fit once the first time there is something to show; after that the user's view is kept. */
  const fitted = useRef(false)

  useEffect(() => {
    onSelectRef.current = onSelect
  })

  const fitAll = () => {
    const map = mapRef.current
    if (!map) return
    const points = people.map((person) => L.latLng(person.at.latitude, person.at.longitude))
    if (me) points.push(L.latLng(me.latitude, me.longitude))
    if (points.length === 0) return
    if (points.length === 1) map.setView(points[0], 12)
    else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: FOCUS_ZOOM })
  }
  const fitAllRef = useRef(fitAll)
  useEffect(() => {
    fitAllRef.current = fitAll
  })
  useImperativeHandle(ref, () => ({ fitAll: () => fitAllRef.current() }), [])

  // The map itself.
  useEffect(() => {
    const element = box.current
    if (!element) return
    const map = L.map(element, { worldCopyJump: true, minZoom: 2, scrollWheelZoom: true }).setView([30, 10], 2)
    L.tileLayer(MAP_TILES_URL, {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    facesRef.current = L.layerGroup().addTo(map)
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(element)
    mapRef.current = map
    const registry = markers.current
    return () => {
      resize.disconnect()
      map.remove()
      mapRef.current = null
      facesRef.current = null
      meRef.current = null
      registry.clear()
    }
  }, [])

  // One face per person, rebuilt when the people change.
  useEffect(() => {
    const layer = facesRef.current
    if (!layer) return
    layer.clearLayers()
    markers.current.clear()
    for (const person of people) {
      const marker = L.marker([person.at.latitude, person.at.longitude], {
        icon: faceIcon(person, false),
        title: `@${person.username}`,
        alt: `@${person.username}`,
        riseOnHover: true,
        keyboard: true,
      })
      marker.bindTooltip(tooltipFor(person), { direction: 'top', offset: [0, -26] })
      // `keyboard: true`: the face is tabbable and Enter fires this click.
      marker.on('click', () => onSelectRef.current(person.userId))
      marker.addTo(layer)
      markers.current.set(person.userId, marker)
    }
  }, [people])

  // The viewer's pin.
  const meLat = me?.latitude ?? null
  const meLon = me?.longitude ?? null
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (meLat === null || meLon === null) {
      meRef.current?.remove()
      meRef.current = null
      return
    }
    if (!meRef.current) {
      meRef.current = L.marker([meLat, meLon], { icon: ME_ICON, title: 'You', alt: 'You', keyboard: false, zIndexOffset: -100 })
        .bindTooltip('You', { direction: 'top', offset: [0, -34] })
        .addTo(map)
    } else {
      meRef.current.setLatLng([meLat, meLon])
    }
  }, [meLat, meLon])

  // First view, once the connections are in: everybody at once.
  useEffect(() => {
    if (fitted.current || !ready || (people.length === 0 && meLat === null)) return
    fitted.current = true
    fitAllRef.current()
  }, [ready, people, meLat])

  // The selected face is highlighted and on top (again after the faces are rebuilt).
  useEffect(() => {
    for (const person of people) {
      const marker = markers.current.get(person.userId)
      if (!marker) continue
      const selected = person.userId === selectedId
      marker.setIcon(faceIcon(person, selected))
      marker.setZIndexOffset(selected ? 1000 : 0)
    }
  }, [selectedId, people])

  // ...and brought into view when the selection changes (not when the list merely refreshes).
  useEffect(() => {
    const map = mapRef.current
    const marker = selectedId ? markers.current.get(selectedId) : undefined
    if (!map || !marker) return
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), FOCUS_ZOOM - 2), { duration: 0.6 })
    marker.openTooltip()
  }, [selectedId])

  return (
    <div
      ref={box}
      className={s.map}
      role="region"
      aria-label="Map of your connections. Each face is a person; press Tab to move between them and Enter to select."
    />
  )
}
