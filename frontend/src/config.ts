/** Build-time configuration. See .env. */

/** Gateway origin. Paths below it are /auth/*, /profile/*, /notification/*. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

/**
 * IP geolocation (no key, CORS open): where the connection comes from, city-level. Used only when the
 * device's position is refused or unavailable. Any service answering `latitude` / `longitude` works.
 */
export const GEOIP_URL: string = (import.meta.env.VITE_GEOIP_URL as string | undefined) ?? 'https://get.geojs.io/v1/ip/geo.json'

/** Nominatim (OpenStreetMap): place names for a position, and place search. 1 request/s at most. */
export const GEOCODER_URL: string =
  (import.meta.env.VITE_GEOCODER_URL as string | undefined) ?? 'https://nominatim.openstreetmap.org'

/** Map tiles (Leaflet URL template). OpenStreetMap's own tiles need the attribution the map shows. */
export const MAP_TILES_URL: string =
  (import.meta.env.VITE_MAP_TILES_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
